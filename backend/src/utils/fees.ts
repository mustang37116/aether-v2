import { prisma } from '../prisma.js';

type FeeMode = 'PER_CONTRACT_DOLLAR' | 'PER_CONTRACT_PERCENT';

function isFutures(trade: any): boolean {
  // Prefer assetClass flag
  if (trade?.assetClass === 'FUTURE') return true;
  const sym = String(trade?.symbol || '').toUpperCase();
  return /\.CME$|=F$/.test(sym);
}

function isMicroSymbol(symbol?: string): boolean {
  const s = (symbol || '').toUpperCase();
  // Heuristic: micro CME contracts commonly start with 'M' (MES, MNQ, MYM, M2K)
  return /^M[A-Z0-9]/.test(s);
}

function sumSizes(fills: any[], type: 'ENTRY'|'EXIT'): number {
  return fills.filter(f=>f.type===type).reduce((a,f)=>a + Number(f.size||0), 0);
}

export async function computeFeesForTrade(trade: any, account: any, preloaded?: { tickerFeeMap?: Map<string, any>; accountFeeMap?: Map<string, any> }) : Promise<number> {
  const fills = trade.tradeFills || [];
  const symbol = String(trade.symbol);
  // 1) TickerFee override
  let tf: any | null = null;
  if (preloaded?.tickerFeeMap && preloaded.tickerFeeMap.has(symbol)) tf = preloaded.tickerFeeMap.get(symbol);
  else tf = await (prisma as any).tickerFee?.findFirst?.({ where: { accountId: trade.accountId, symbol } }) ?? null;
  if (tf) {
    const mode = String(tf.mode) as FeeMode;
    const val = Number(tf.value);
    if (mode === 'PER_CONTRACT_DOLLAR') {
      if (isFutures(trade)) {
        // Round-trip per realized contract for futures
        let realizedQty = 0;
        if (fills.length) {
          const qE = sumSizes(fills, 'ENTRY');
          const qX = sumSizes(fills, 'EXIT');
          realizedQty = Math.min(qE, qX);
        } else {
          const baseQty = Number(trade.size||0) || 0;
          realizedQty = trade.exitPrice != null ? baseQty : 0;
        }
        return Number((val * realizedQty).toFixed(6));
      } else {
        // Non-futures: per side per share/contract
  let total = 0;
  if (fills.length) total = val * fills.reduce((a:number,f:any)=>a+Number(f.size||0),0);
        else total = val * (Number(trade.size||0)||0) * (trade.exitPrice != null ? 2 : 1);
        return Number(total.toFixed(6));
      }
    } else {
      // Percent of notional on each side
      const pct = val / 100;
      if (fills.length) {
        const sum = fills.reduce((s:number,f:any)=> s + Number(f.price)*Number(f.size)*pct, 0);
        return Number(sum.toFixed(6));
      } else {
        const qty = Number(trade.size||0)||0;
        const entry = Number(trade.entryPrice||0);
        const exit = trade.exitPrice != null ? Number(trade.exitPrice) : null;
        const sum = (entry * qty * pct) + (exit != null ? (exit * qty * pct) : 0);
        return Number(sum.toFixed(6));
      }
    }
  }

  // 2) Futures defaults (round-trip per contract)
  if (isFutures(trade)) {
    const micro = isMicroSymbol(symbol);
    const microDefault = account?.defaultFeePerMicroContract != null ? Number(account.defaultFeePerMicroContract) : null;
    const miniDefault = account?.defaultFeePerMiniContract != null ? Number(account.defaultFeePerMiniContract) : null;
    const per = micro ? microDefault : miniDefault;
    if (per != null) {
      let realizedQty = 0;
      if (fills.length) {
        const qE = sumSizes(fills, 'ENTRY');
        const qX = sumSizes(fills, 'EXIT');
        realizedQty = Math.min(qE, qX);
      } else {
        const baseQty = Number(trade.size||0) || 0;
        realizedQty = trade.exitPrice != null ? baseQty : 0;
      }
      return Number((Number(per) * realizedQty).toFixed(6));
    }
  }

  // 3) AccountFee matrix (fallback)
  let af: any | null = null;
  if (preloaded?.accountFeeMap && preloaded.accountFeeMap.has(trade.assetClass)) af = preloaded.accountFeeMap.get(trade.assetClass);
  else af = await (prisma as any).accountFee?.findFirst?.({ where: { accountId: trade.accountId, assetClass: trade.assetClass } }) ?? null;
  if (af) {
    const mode = String(af.mode) as FeeMode;
    const val = Number(af.value);
    if (mode === 'PER_CONTRACT_DOLLAR') {
      let total = 0;
      if (fills.length) total = val * fills.reduce((a:number,f:any)=>a+Number(f.size||0),0);
      else total = val * (Number(trade.size||0)||0) * (trade.exitPrice != null ? 2 : 1);
      return Number(total.toFixed(6));
    } else {
      const pct = val / 100;
      if (fills.length) {
        const sum = fills.reduce((s:number,f:any)=> s + Number(f.price)*Number(f.size)*pct, 0);
        return Number(sum.toFixed(6));
      } else {
        const qty = Number(trade.size||0)||0;
        const entry = Number(trade.entryPrice||0);
        const exit = trade.exitPrice != null ? Number(trade.exitPrice) : null;
        const sum = (entry * qty * pct) + (exit != null ? (exit * qty * pct) : 0);
        return Number(sum.toFixed(6));
      }
    }
  }

  // 4) No rule => keep existing fees or zero
  return Number(Number(trade.fees || 0).toFixed(6));
}

export async function recalcAccountFees(accountId: string): Promise<{ updated: number }>{
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { updated: 0 };
  const [trades, tickerFees, accountFees] = await Promise.all([
    prisma.trade.findMany({ where: { accountId }, include: { tradeFills: true } }),
    (prisma as any).tickerFee?.findMany?.({ where: { accountId } }) ?? [],
    (prisma as any).accountFee?.findMany?.({ where: { accountId } }) ?? [],
  ]);
  const tfMap = new Map<string, any>(); for (const t of tickerFees) tfMap.set(t.symbol, t);
  const afMap = new Map<string, any>(); for (const a of accountFees) afMap.set(a.assetClass, a);
  let updated = 0;
  for (const t of trades) {
    const newFees = await computeFeesForTrade(t as any, account as any, { tickerFeeMap: tfMap, accountFeeMap: afMap });
    const curr = Number((t as any).fees || 0);
    if (Math.abs(newFees - curr) > 1e-9) {
      await prisma.trade.update({ where: { id: t.id }, data: { fees: newFees } });
      updated++;
    }
  }
  return { updated };
}
