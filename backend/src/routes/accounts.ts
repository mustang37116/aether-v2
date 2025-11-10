import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { recalcAccountFees } from '../utils/fees.js';

const router = Router();
router.use(requireAuth);

// Local helpers mirroring trades route for fee recalculation
function isFuturesSymbol(sym?: string){ return !!sym && /=F$/i.test(sym.trim()); }
function isMicroFuturesSymbol(sym?: string){ const s = (sym||'').trim().toUpperCase(); return isFuturesSymbol(s) && s.startsWith('M'); }
function perContractFeeFor(account: any, trade: any){
  if (!isFuturesSymbol(trade?.symbol)) return null;
  const isMicro = isMicroFuturesSymbol(trade?.symbol);
  const mini = (account as any)?.defaultFeePerMiniContract;
  const micro = (account as any)?.defaultFeePerMicroContract;
  if (isMicro && micro != null) return Number(micro);
  if (!isMicro && mini != null) return Number(mini);
  return null;
}
async function recalcFeesForAccount(accountId: string){
  const trades:any[] = await prisma.trade.findMany({ where: { accountId }, include: { account: true, tradeFills: true } as any });
  for (const t of trades){
    const fills = (t as any).tradeFills || [];
    // Prefer futures defaults when present
    let totalFees = 0;
    const futPer = perContractFeeFor(t.account, t);
    if (futPer != null){
      // Futures defaults represent round-trip per contract
      if (fills.length) {
        const qtyEntry = fills.filter((f:any)=> f.type==='ENTRY').reduce((s:number,f:any)=> s + Number(f.size||0), 0);
        const qtyExit  = fills.filter((f:any)=> f.type==='EXIT').reduce((s:number,f:any)=> s + Number(f.size||0), 0);
        const realizedQty = Math.min(qtyEntry, qtyExit);
        totalFees = futPer * realizedQty;
      } else {
        const baseQty = Number(t.size||0) || 0;
        const realizedQty = t.exitPrice != null ? baseQty : 0;
        totalFees = futPer * realizedQty;
      }
      await prisma.trade.update({ where: { id: t.id }, data: { fees: Number(totalFees.toFixed(6)) } });
      continue;
    }
    // Otherwise use AccountFee matrix for this assetClass if exists
    try {
      const af = await (prisma as any).accountFee.findFirst({ where: { accountId, assetClass: t.assetClass } });
      if (af){
        if (af.mode === 'PER_CONTRACT_DOLLAR'){
          const per = Number(af.value);
          if (fills.length) totalFees = per * fills.reduce((s:number,f:any)=> s + Number(f.size||0), 0);
          else totalFees = per * (Number(t.size||0)||0) * (t.exitPrice ? 2 : 1);
        } else {
          const pct = Number(af.value) / 100;
          if (fills.length) totalFees = fills.reduce((s:number,f:any)=> s + (Number(f.price)*Number(f.size)*pct), 0);
          else {
            const baseQty = Number(t.size||0)||0;
            const entry = Number(t.entryPrice||0);
            const exit = t.exitPrice != null ? Number(t.exitPrice) : null;
            totalFees = (entry * baseQty * pct) + (exit != null ? (exit * baseQty * pct) : 0);
          }
        }
        await prisma.trade.update({ where: { id: t.id }, data: { fees: Number(totalFees.toFixed(6)) } });
      }
    } catch { /* ignore */ }
  }
}

router.get('/', async (req: AuthRequest, res: Response) => {
  // For now, AccountFee model may not yet be exposed by generated client if migration not re-generated.
  // Return accounts only; fee editing will use dedicated route after client regen.
  const accounts = await prisma.account.findMany({ where: { userId: req.userId } });
  res.json(accounts);
});

// Single account fetch (includes basic fields; fees fetched via /:id/fees)
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
  if (!account) return res.status(404).json({ error: 'account not found' });
  res.json(account);
});

// List per-symbol ticker fee overrides plus discovered symbols
router.get('/:id/ticker-fees', async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
  if (!account) return res.status(404).json({ error: 'Not found' });
  const overrides = await (prisma as any).tickerFee.findMany({ where: { accountId: id } });
  // Discover unique symbols from trades for convenience
  const symbols = await prisma.trade.findMany({ where: { accountId: id }, select: { symbol: true }, distinct: ['symbol'] });
  res.json({ overrides, symbols: symbols.map(s => s.symbol) });
});

// Bulk upsert/delete ticker fee overrides
router.put('/:id/ticker-fees', async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
  if (!account) return res.status(404).json({ error: 'Not found' });
  const { fees } = req.body as { fees: { symbol: string; mode: 'PER_CONTRACT_DOLLAR' | 'PER_CONTRACT_PERCENT'; value: number | null }[] };
  if (!Array.isArray(fees)) return res.status(400).json({ error: 'fees array required' });
  const results: any[] = [];
  for (const f of fees) {
    if (!f.symbol) continue;
    if (f.value === null || f.value === undefined || isNaN(f.value)) {
      // delete override
      await (prisma as any).tickerFee.deleteMany({ where: { accountId: id, symbol: f.symbol } });
      results.push({ symbol: f.symbol, deleted: true });
      continue;
    }
    const data = { accountId: id, symbol: f.symbol, mode: f.mode, value: f.value };
    const existing = await (prisma as any).tickerFee.findFirst({ where: { accountId: id, symbol: f.symbol } });
    if (existing) {
      const updated = await (prisma as any).tickerFee.update({ where: { id: existing.id }, data: { mode: f.mode, value: f.value } });
      results.push(updated);
    } else {
      const created = await (prisma as any).tickerFee.create({ data });
      results.push(created);
    }
  }
  res.json({ updated: results.length, results });
});

// Trigger a full fees recomputation for an account
router.post('/:id/recalc-fees', async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
  if (!account) return res.status(404).json({ error: 'Not found' });
  const result = await recalcAccountFees(id);
  res.json(result);
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, currency, defaultFeePerMiniContract, defaultFeePerMicroContract } = req.body as any;
  const data: any = { name, currency: currency || 'USD', userId: req.userId! };
  if (defaultFeePerMiniContract != null) data.defaultFeePerMiniContract = defaultFeePerMiniContract;
  if (defaultFeePerMicroContract != null) data.defaultFeePerMicroContract = defaultFeePerMicroContract;
  const account = await prisma.account.create({ data });
  res.status(201).json(account);
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const { name, currency, defaultFeePerMiniContract, defaultFeePerMicroContract } = req.body as any;
  const existing = await prisma.account.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'account not found' });
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (currency !== undefined) data.currency = currency;
  if (defaultFeePerMiniContract !== undefined) data.defaultFeePerMiniContract = defaultFeePerMiniContract;
  if (defaultFeePerMicroContract !== undefined) data.defaultFeePerMicroContract = defaultFeePerMicroContract;
  const updated = await prisma.account.update({ where: { id }, data });
  // Recalc fees on all trades for this account when defaults change
  if (defaultFeePerMiniContract !== undefined || defaultFeePerMicroContract !== undefined){
    await recalcAccountFees(id);
  }
  res.json(updated);
});

// Delete an account and cascade its data
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const existing = await prisma.account.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'account not found' });
  try {
    await prisma.$transaction(async(tx)=> {
      // Delete in dependency order to satisfy FK constraints
      // 1. Trade fills & attachments
      await tx.tradeFill.deleteMany({ where: { trade: { accountId: id } } });
      await tx.attachment.deleteMany({ where: { trade: { accountId: id } } });
      // 2. Trade tags
      await tx.tradeTag.deleteMany({ where: { trade: { accountId: id } } });
      // 3. Trades
      await tx.trade.deleteMany({ where: { accountId: id } });
      // 4. Transactions
      await tx.transaction.deleteMany({ where: { accountId: id } });
      // 5. Account fees (optional model)
      try { await (tx as any).accountFee.deleteMany({ where: { accountId: id } }); } catch {}
      // 6. Account
      await tx.account.delete({ where: { id } });
    });
    res.json({ ok: true });
  } catch (e:any) {
    console.error(e);
    res.status(500).json({ error: 'delete failed', detail: e.message });
  }
});

// Per-asset-class fee APIs (using any-casts to avoid type lag during client regeneration)
router.get('/:id/fees', async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
  if (!account) return res.status(404).json({ error: 'account not found' });
  const rows = await (prisma as any).accountFee.findMany({ where: { accountId: id } });
  res.json({ fees: rows });
});

router.put('/:id/fees', async (req: AuthRequest, res: Response) => {
  const { id } = req.params as any;
  const { fees } = req.body as any; // [{ assetClass, mode, value }]
  const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
  if (!account) return res.status(404).json({ error: 'account not found' });
  if (!Array.isArray(fees)) return res.status(400).json({ error: 'fees array required' });
  for (const f of fees) {
    if (!f.assetClass || !f.mode || f.value == null) continue;
    await (prisma as any).accountFee.upsert({
      where: { accountId_assetClass: { accountId: id, assetClass: f.assetClass } },
      update: { mode: f.mode, value: f.value },
      create: { accountId: id, assetClass: f.assetClass, mode: f.mode, value: f.value }
    });
  }
  const rows = await (prisma as any).accountFee.findMany({ where: { accountId: id } });
  // Recalc fees on all trades for this account when matrix changes
  await recalcAccountFees(id);
  res.json({ fees: rows });
});

export default router;
