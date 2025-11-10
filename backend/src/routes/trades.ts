import { Router, Response } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { calcRiskRewardR } from '../utils/risk.js';
import { computeDirectionalPnl } from '../utils/pnl.js';

const router = Router();
router.use(requireAuth);

// --- Fees helpers (auto-calc based on account settings) ---
function isFuturesSymbol(sym?: string){ return !!sym && /=F$/i.test(sym.trim()); }
function isMicroFuturesSymbol(sym?: string){ const s = (sym||'').trim().toUpperCase(); return isFuturesSymbol(s) && s.startsWith('M'); }
// Lightweight Yahoo name cache to detect Micro vs (E-)Mini from first word of ticker name
const yahooNameCache = new Map<string, { at: number; isMicro: boolean }>();
async function detectMicroViaYahoo(symbol: string): Promise<boolean | null> {
  try {
    const U = (x:string)=> (x||'').toUpperCase();
    const key = U(symbol);
    const now = Date.now();
    const cached = yahooNameCache.get(key);
    if (cached && (now - cached.at) < 24*60*60*1000) return cached.isMicro;
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=6&newsCount=0`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const quotes: any[] = data?.quotes || [];
    if (!quotes.length) return null;
    const exact = quotes.find(q => U(q.symbol) === U(symbol)) || quotes[0];
    const name = U(exact?.shortname || exact?.longname || exact?.longName || exact?.name || '');
    if (!name) return null;
    const first = name.split(/\s+/)[0];
    const isMicro = first === 'MICRO';
    yahooNameCache.set(key, { at: now, isMicro });
    return isMicro;
  } catch { return null; }
}
async function pickFuturesDefaultPerContract(account: any, trade: any): Promise<number | null> {
  if (!isFuturesSymbol(trade?.symbol)) return null;
  const mini = (account as any)?.defaultFeePerMiniContract;
  const micro = (account as any)?.defaultFeePerMicroContract;
  if (mini == null && micro == null) return null;
  // Try symbol-based detection first
  let microLike: boolean | null = isMicroFuturesSymbol(trade?.symbol);
  if (microLike === false && trade?.symbol) {
    // Symbols like ES=F (mini) won't start with M; that's fine. If still null, try Yahoo name.
  }
  if (microLike === null || microLike === undefined) {
    microLike = await detectMicroViaYahoo(trade.symbol);
  }
  if (microLike === true && micro != null) return Number(micro);
  if (microLike === false && mini != null) return Number(mini);
  // Fallback: whichever is configured
  if (micro != null) return Number(micro);
  if (mini != null) return Number(mini);
  return null;
}
async function recalcAndUpdateFees(tradeId: string){
  const t = await prisma.trade.findFirst({ where: { id: tradeId }, include: { account: true, tradeFills: true } as any });
  if (!t) return;
  const fills = (t as any).tradeFills || [];
  // Load per-asset-class fee rule (AccountFee) if any
  let rule: { mode: 'PER_CONTRACT_DOLLAR'|'PER_CONTRACT_PERCENT'; value: number } | null = null;
  try {
    const af = await (prisma as any).accountFee.findFirst({ where: { accountId: t.accountId, assetClass: t.assetClass } });
    if (af) rule = { mode: af.mode, value: Number(af.value) };
  } catch {}

  let totalFees = 0;
  // Prefer explicit mini/micro defaults for FUTURE if present
  // Determine futures per-contract fee regardless of stored assetClass, relying on symbol/yahoo when needed
  const futPer = await pickFuturesDefaultPerContract(t.account, t);
  if (futPer != null) {
    // Treat futures default fee as round-trip per contract
    if (fills.length){
      const qtyEntry = fills.filter((f:any)=> f.type==='ENTRY').reduce((s:number,f:any)=> s + Number(f.size||0), 0);
      const qtyExit  = fills.filter((f:any)=> f.type==='EXIT').reduce((s:number,f:any)=> s + Number(f.size||0), 0);
      const realizedQty = Math.min(qtyEntry, qtyExit);
      totalFees = futPer * realizedQty;
    } else {
      const baseQty = Number(t.size||0) || 0;
      const realizedQty = t.exitPrice != null ? baseQty : 0;
      totalFees = futPer * realizedQty;
    }
  } else if (rule) {
    if (rule.mode === 'PER_CONTRACT_DOLLAR') {
      // Flat fee per unit per side
      const per = rule.value;
      if (fills.length) {
        const sidesQty = fills.reduce((s:number,f:any)=> s + Number(f.size||0), 0);
        totalFees = per * sidesQty;
      } else {
        const baseQty = Number(t.size||0) || 0;
        const sides = t.exitPrice ? 2 : 1;
        totalFees = per * baseQty * sides;
      }
    } else {
      // Percentage of notional (price*size) per side
      const pct = rule.value / 100;
      if (fills.length) {
        totalFees = fills.reduce((s:number,f:any)=> s + (Number(f.price)*Number(f.size) * pct), 0);
      } else {
        const baseQty = Number(t.size||0) || 0;
        const entry = Number(t.entryPrice||0);
        const exit = t.exitPrice != null ? Number(t.exitPrice) : null;
        totalFees = (entry * baseQty * pct) + (exit != null ? (exit * baseQty * pct) : 0);
      }
    }
  } else {
    // No rules configured and no futures defaults -> do nothing
    return;
  }

  await prisma.trade.update({ where: { id: tradeId }, data: { fees: Number(totalFees.toFixed(6)) } });
}

async function resolveAssetClassAndSymbol(input: string): Promise<{ assetClass: 'STOCK'|'OPTION'|'FUTURE'|'FOREX'|'CRYPTO'; symbol?: string }>{
  const raw = (input || '').trim();
  const fallback = () => {
    // Heuristics when search fails
    if (/=F$/i.test(raw)) return { assetClass: 'FUTURE' as const };
    if (/=X$/i.test(raw)) return { assetClass: 'FOREX' as const };
    if (/-USD$/i.test(raw) || /-USDT$/i.test(raw) || /^[A-Z]{2,5}-[A-Z]{2,5}$/i.test(raw)) return { assetClass: 'CRYPTO' as const };
    return { assetClass: 'STOCK' as const };
  };
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(raw)}&quotesCount=6&newsCount=0`;
    const r = await fetch(url);
    if (!r.ok) return fallback();
    const data = await r.json();
    const quotes: any[] = data?.quotes || [];
    if (!quotes.length) return fallback();
    const U = (s: string) => (s || '').toUpperCase();
    const exact = quotes.find(q => U(q.symbol) === U(raw));
    const pick = exact || quotes[0];
    const qt = (pick?.quoteType || '').toUpperCase();
    let assetClass: 'STOCK'|'OPTION'|'FUTURE'|'FOREX'|'CRYPTO' = 'STOCK';
    if (qt === 'FUTURE') assetClass = 'FUTURE';
    else if (qt === 'OPTION') assetClass = 'OPTION';
    else if (qt === 'CRYPTOCURRENCY') assetClass = 'CRYPTO';
    else if (qt === 'CURRENCY' || qt === 'FX') assetClass = 'FOREX';
    else assetClass = 'STOCK';
    return { assetClass, symbol: pick?.symbol };
  } catch {
    return fallback();
  }
}

router.get('/', async (req: AuthRequest, res: Response) => {
  const { accountId, start, end, limit, skip, includeDeleted, strategyId } = (req as any).query as { accountId?: string; start?: string; end?: string; limit?: string; skip?: string; includeDeleted?: string; strategyId?: string };
  const where: any = { userId: req.userId };
  if (!includeDeleted) where.deletedAt = null;
  if (accountId) where.accountId = accountId;
  if (strategyId) where.strategyId = strategyId;
  if (start || end) {
    where.entryTime = {};
    if (start) where.entryTime.gte = new Date(start);
    if (end) where.entryTime.lte = new Date(end);
  }
  const take = limit ? Math.min(Number(limit), 200) : undefined;
  // NOTE: setupRef removed from schema; ensure we don't attempt to include it.
  const trades = await prisma.trade.findMany({ where, include: { tradeTags: { include: { tag: true } }, attachments: true, tradeFills: true, strategyRef: true } as any, orderBy: { entryTime: 'desc' }, take, skip: skip ? Number(skip) : undefined });
  const enriched = trades.map((t: any) => {
    // Compute metrics direction-aware; if fills exist prefer avg ENTRY price + total ENTRY size.
    let metrics: any = null;
    const tags = (t.tradeTags?.map((tt: any) => ({ id: tt.tag.id, name: tt.tag.name })) || []);
    const attachments = t.attachments || [];
    // If fills exist, compute realized PnL and hold time from fills using average price method
    const fills = t.tradeFills || [];
    let pnl: number | null = null;
    let holdTimeSeconds: number | null = null;
    if (Array.isArray(fills) && fills.length > 0) {
      const sorted = [...fills].sort((a,b)=> new Date(a.time).getTime() - new Date(b.time).getTime());
      const entryFills = sorted.filter(f=> f.type === 'ENTRY');
      const exitFills = sorted.filter(f=> f.type === 'EXIT');
      const sum = (arr: any[], key: string) => arr.reduce((s, x)=> s + Number(x[key]), 0);
      const qtyEntry = sum(entryFills, 'size');
      const qtyExit = sum(exitFills, 'size');
      const avgPrice = (arr: any[]) => {
        const total = arr.reduce((s, x)=> s + Number(x.price) * Number(x.size), 0);
        const qty = sum(arr, 'size');
        return qty === 0 ? null : total / qty;
      };
      const avgEntry = avgPrice(entryFills);
      const avgExit = avgPrice(exitFills);
      const closedQty = Math.min(qtyEntry, qtyExit);
      if (closedQty > 0 && avgEntry != null && avgExit != null) {
        pnl = computeDirectionalPnl(avgEntry, avgExit, closedQty, t.direction, t.symbol, Number(t.fees || 0));
      } else {
        pnl = null;
      }
  const firstEntry = entryFills[0]?.time ? new Date(entryFills[0].time).getTime() : new Date(t.entryTime).getTime();
  const lastExit = exitFills.length ? new Date(exitFills[exitFills.length-1].time).getTime() : (t.exitTime ? new Date(t.exitTime).getTime() : null);
      holdTimeSeconds = lastExit && firstEntry ? (lastExit - firstEntry) / 1000 : null;
      if (t.stopPrice && t.targetPrice && avgEntry != null && qtyEntry > 0) {
        metrics = calcRiskRewardR(Number(avgEntry), Number(t.stopPrice), Number(t.targetPrice), Number(qtyEntry), t.direction || 'LONG');
      }
    } else {
      holdTimeSeconds = t.exitTime ? (new Date(t.exitTime).getTime() - t.entryTime.getTime()) / 1000 : null;
  pnl = t.exitPrice ? computeDirectionalPnl(Number(t.entryPrice), Number(t.exitPrice), Number(t.size), t.direction, t.symbol, Number(t.fees || 0)) : null;
      if (t.stopPrice && t.targetPrice) {
        metrics = calcRiskRewardR(Number(t.entryPrice), Number(t.stopPrice), Number(t.targetPrice), Number(t.size), t.direction || 'LONG');
      }
    }
    // Include strategy metadata if present without overwriting legacy string field
    const strategyMeta = (t as any).strategyRef ? { id: (t as any).strategyRef.id, name: (t as any).strategyRef.name } : null;
    return { ...t, metrics, holdTimeSeconds, pnl, tags, attachments, strategyMeta };
  });
  res.json(enriched);
});

// Fetch a single trade (enriched) by id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  // setupRef relation no longer exists
  const t: any = await prisma.trade.findFirst({ where: { id, userId: req.userId }, include: { tradeTags: { include: { tag: true } }, attachments: true, tradeFills: true } as any });
  if (!t) return res.status(404).json({ error: 'trade not found' });
  let metrics: any = null;
  const tags = (t.tradeTags?.map((tt: any) => ({ id: tt.tag.id, name: tt.tag.name })) || []);
  const attachments = t.attachments || [];
  const fills = t.tradeFills || [];
  let pnl: number | null = null;
  let holdTimeSeconds: number | null = null;
  if (Array.isArray(fills) && fills.length > 0) {
    const sorted = [...fills].sort((a,b)=> new Date(a.time).getTime() - new Date(b.time).getTime());
    const entryFills = sorted.filter((f:any)=> f.type === 'ENTRY');
    const exitFills = sorted.filter((f:any)=> f.type === 'EXIT');
    const sum = (arr: any[], key: string) => arr.reduce((s, x)=> s + Number(x[key]), 0);
    const qtyEntry = sum(entryFills, 'size');
    const qtyExit = sum(exitFills, 'size');
    const avgPrice = (arr: any[]) => {
      const total = arr.reduce((s, x)=> s + Number(x.price) * Number(x.size), 0);
      const qty = sum(arr, 'size');
      return qty === 0 ? null : total / qty;
    };
    const avgEntry = avgPrice(entryFills);
    const avgExit = avgPrice(exitFills);
    const closedQty = Math.min(qtyEntry, qtyExit);
    if (closedQty > 0 && avgEntry != null && avgExit != null) {
      pnl = computeDirectionalPnl(avgEntry, avgExit, closedQty, t.direction, t.symbol, Number(t.fees || 0));
    } else {
      pnl = null;
    }
    const firstEntry = entryFills[0]?.time ? new Date(entryFills[0].time).getTime() : new Date(t.entryTime).getTime();
    const lastExit = exitFills.length ? new Date(exitFills[exitFills.length-1].time).getTime() : (t.exitTime ? new Date(t.exitTime).getTime() : null);
    holdTimeSeconds = lastExit && firstEntry ? (lastExit - firstEntry) / 1000 : null;
    if (t.stopPrice && t.targetPrice && avgEntry != null && qtyEntry > 0) {
      metrics = calcRiskRewardR(Number(avgEntry), Number(t.stopPrice), Number(t.targetPrice), Number(qtyEntry), t.direction || 'LONG');
    }
  } else {
    holdTimeSeconds = t.exitTime ? (new Date(t.exitTime).getTime() - t.entryTime.getTime()) / 1000 : null;
  pnl = t.exitPrice ? computeDirectionalPnl(Number(t.entryPrice), Number(t.exitPrice), Number(t.size), t.direction, t.symbol, Number(t.fees || 0)) : null;
    if (t.stopPrice && t.targetPrice) {
      metrics = calcRiskRewardR(Number(t.entryPrice), Number(t.stopPrice), Number(t.targetPrice), Number(t.size), t.direction || 'LONG');
    }
  }
  return res.json({ ...t, metrics, holdTimeSeconds, pnl, tags, attachments });
});

// List deleted trades (recent first)
router.get('/deleted', async (req: AuthRequest, res: Response) => {
  const trades = await prisma.trade.findMany({ where: { userId: req.userId, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' }, take: 500 });
  res.json(trades.map(t => ({ id: t.id, symbol: t.symbol, deletedAt: t.deletedAt, size: t.size, entryPrice: t.entryPrice, entryTime: t.entryTime })));
});

// Update/exit a trade
router.put('/:id/exit', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const { exitPrice, exitTime, fees } = (req as any).body;
  const existing = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'trade not found' });
  const updated = await prisma.trade.update({ where: { id }, data: { exitPrice, exitTime: exitTime ? new Date(exitTime) : new Date(), fees } });
  const pnl = updated.exitPrice ? computeDirectionalPnl(Number(updated.entryPrice), Number(updated.exitPrice), Number(updated.size), updated.direction, updated.symbol, Number(updated.fees || 0)) : null;
  const holdTimeSeconds = updated.exitTime ? (new Date(updated.exitTime).getTime() - updated.entryTime.getTime()) / 1000 : null;
  res.json({ trade: updated, pnl, holdTimeSeconds });
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { accountId, symbol, assetClass, direction, size, entryPrice, entryTime, stopPrice, targetPrice, strategy, strategyId, strategies, notes, confidence, tags, exitPrice, exitTime, fills, fees } = (req as any).body;
  // Derive assetClass if not provided
  const derived = await resolveAssetClassAndSymbol(symbol);
  const finalAssetClass = assetClass || derived.assetClass;
  // Derive base fields from first ENTRY fill if not provided
  let baseSize = size;
  let baseEntryPrice = entryPrice;
  let baseEntryTime = entryTime;
  const arr = Array.isArray(fills) ? fills : [];
  const firstEntry = arr.find((f:any)=> f && f.type === 'ENTRY');
  if ((!baseSize || !baseEntryPrice || !baseEntryTime) && firstEntry) {
    if (!baseSize) baseSize = firstEntry.size;
    if (!baseEntryPrice) baseEntryPrice = firstEntry.price;
    if (!baseEntryTime) baseEntryTime = firstEntry.time || new Date().toISOString();
  }
  const trade = await prisma.trade.create({ data: { accountId, userId: req.userId!, symbol, assetClass: finalAssetClass as any, direction: direction || null, size: baseSize, entryPrice: baseEntryPrice, entryTime: new Date(baseEntryTime), stopPrice, targetPrice, strategy: strategy || null, strategyId: strategyId || null, notes: notes || null, confidence: typeof confidence === 'number' ? confidence : null, exitPrice: exitPrice ?? null, exitTime: exitTime ? new Date(exitTime) : null, fees: fees != null ? Number(fees) : null } as any });
  // Multi-strategy associations
  if (Array.isArray(strategies) && strategies.length) {
    for (const s of strategies) {
      if (!s || !s.strategyId) continue;
      try {
        await (prisma as any).tradeStrategy.create({ data: { tradeId: trade.id, strategyId: s.strategyId, weight: s.weight != null ? Number(s.weight) : null } });
      } catch {/* ignore duplicate or invalid */}
    }
  }
  // Handle tags: list of tag names
  if (Array.isArray(tags) && tags.length) {
    for (const name of tags) {
      const tag = await prisma.tag.upsert({ where: { userId_name: { userId: req.userId!, name } }, update: {}, create: { userId: req.userId!, name } });
      await prisma.tradeTag.create({ data: { tradeId: trade.id, tagId: tag.id } });
    }
  }
  // Optional initial fills
  if (Array.isArray(fills) && fills.length) {
    for (const f of fills) {
      if (!f || !f.type || f.price == null || f.size == null) continue;
      await (prisma as any).tradeFill.create({ data: { tradeId: trade.id, type: f.type, price: f.price, size: f.size, time: f.time ? new Date(f.time) : new Date(baseEntryTime) } });
    }
  }
  // Auto-calc fees if not explicitly provided
  if (fees == null) await recalcAndUpdateFees(trade.id);
  let metrics: any = {};
  if (stopPrice && targetPrice) {
    const effectiveEntry = (baseEntryPrice ?? entryPrice);
    const effectiveSize = (baseSize ?? size);
    if (effectiveEntry != null && effectiveSize != null) {
      metrics = calcRiskRewardR(Number(effectiveEntry), Number(stopPrice), Number(targetPrice), Number(effectiveSize), direction || 'LONG');
    }
  }
  res.status(201).json({ trade, metrics });
});

// Soft delete a trade
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const existing = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'trade not found' });
  if (existing.deletedAt) return res.json({ ok: true });
  await prisma.trade.update({ where: { id }, data: { deletedAt: new Date() } });
  res.json({ ok: true });
});

// Restore a soft deleted trade
router.post('/:id/restore', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const existing = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'trade not found' });
  if (!existing.deletedAt) return res.json({ ok: true });
  await prisma.trade.update({ where: { id }, data: { deletedAt: null } });
  res.json({ ok: true });
});

// Update simple fields on a trade
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const {
    symbol,
  assetClass,
    direction,
    size,
    entryPrice,
    entryTime,
    exitPrice,
    exitTime,
    fees,
    stopPrice,
    targetPrice,
  strategy,
  strategyId,
  strategies,
    notes,
    confidence,
  } = (req as any).body;
  const existing = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'trade not found' });
  const data: any = {};
  if (symbol !== undefined) data.symbol = symbol;
  if (assetClass !== undefined) data.assetClass = assetClass;
  // If symbol changed and assetClass not explicitly provided, derive a new assetClass
  if (symbol !== undefined && assetClass === undefined) {
    const d = await resolveAssetClassAndSymbol(symbol);
    data.assetClass = d.assetClass as any;
  }
  if (direction !== undefined) (data as any).direction = direction;
  if (size !== undefined) data.size = size;
  if (entryPrice !== undefined) data.entryPrice = entryPrice;
  if (entryTime !== undefined) data.entryTime = entryTime ? new Date(entryTime) : existing.entryTime;
  if (exitPrice !== undefined) data.exitPrice = exitPrice === null ? null : exitPrice;
  if (exitTime !== undefined) data.exitTime = exitTime ? new Date(exitTime) : null;
  if (fees !== undefined) data.fees = fees === null ? null : fees;
  if (stopPrice !== undefined) data.stopPrice = stopPrice === null ? null : stopPrice;
  if (targetPrice !== undefined) data.targetPrice = targetPrice === null ? null : targetPrice;
  if (strategy !== undefined) data.strategy = strategy;
  if (strategyId !== undefined) data.strategyId = strategyId === null ? null : strategyId;
  if (notes !== undefined) data.notes = notes;
  if (typeof confidence === 'number') data.confidence = confidence;
  // setupMode removed

  const updated = await prisma.trade.update({ where: { id }, data });
  // Update multi strategies if provided
  if (strategies !== undefined) {
    // Replace current set
    await (prisma as any).tradeStrategy.deleteMany({ where: { tradeId: id } });
    if (Array.isArray(strategies)) {
      for (const s of strategies) {
        if (!s || !s.strategyId) continue;
        await (prisma as any).tradeStrategy.create({ data: { tradeId: id, strategyId: s.strategyId, weight: s.weight != null ? Number(s.weight) : null } });
      }
    }
  }
  // If fees not explicitly set, but symbol/size/exit changed, recompute fees from fills
  if (fees === undefined && (symbol !== undefined || size !== undefined || exitPrice !== undefined || exitTime !== undefined)) {
    await recalcAndUpdateFees(id);
  }
  res.json(updated);
});

// Fills: list by trade
router.get('/:id/fills', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  const fills = await (prisma as any).tradeFill.findMany({ where: { tradeId: id }, orderBy: { time: 'asc' } });
  res.json(fills);
});

// Trade strategies listing
router.get('/:id/strategies', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  const links = await (prisma as any).tradeStrategy.findMany({ where: { tradeId: id }, include: { strategy: true } });
  res.json(links.map((l:any)=> ({ id: l.id, strategyId: l.strategyId, name: l.strategy?.name, weight: l.weight })));
});

// Add a single strategy link
router.post('/:id/strategies', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const { strategyId, weight } = (req as any).body || {};
  const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  const strat = await (prisma as any).strategy.findFirst({ where: { id: strategyId, userId: req.userId } });
  if (!strat) return res.status(404).json({ error: 'strategy not found' });
  const link = await (prisma as any).tradeStrategy.upsert({ where: { tradeId_strategyId: { tradeId: id, strategyId } }, update: { weight: weight != null ? Number(weight) : null }, create: { tradeId: id, strategyId, weight: weight != null ? Number(weight) : null } });
  res.status(201).json(link);
});

// Remove a strategy link
router.delete('/:id/strategies/:strategyId', async (req: AuthRequest, res: Response) => {
  const { id, strategyId } = (req as any).params;
  const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  await (prisma as any).tradeStrategy.deleteMany({ where: { tradeId: id, strategyId } });
  res.json({ ok: true });
});

// Add fills (single or batch)
router.post('/:id/fills', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  const body = (req as any).body;
  const items = Array.isArray(body) ? body : [body];
  const created: any[] = [];
  for (const f of items) {
    if (!f || !f.type || f.price == null || f.size == null) continue;
    const row = await (prisma as any).tradeFill.create({ data: { tradeId: id, type: f.type, price: f.price, size: f.size, time: f.time ? new Date(f.time) : new Date() } });
    created.push(row);
  }
  await recalcAndUpdateFees(id);
  res.status(201).json(created);
});

// Update a fill
router.patch('/fills/:fillId', async (req: AuthRequest, res: Response) => {
  const { fillId } = (req as any).params;
  const fill = await (prisma as any).tradeFill.findFirst({ where: { id: fillId, trade: { userId: req.userId } } });
  if (!fill) return res.status(404).json({ error: 'fill not found' });
  const { type, price, size, time } = (req as any).body;
  const updated = await (prisma as any).tradeFill.update({ where: { id: fillId }, data: { type, price, size, time: time ? new Date(time) : undefined } });
  await recalcAndUpdateFees(updated.tradeId);
  res.json(updated);
});

// Delete a fill
router.delete('/fills/:fillId', async (req: AuthRequest, res: Response) => {
  const { fillId } = (req as any).params;
  const fill = await (prisma as any).tradeFill.findFirst({ where: { id: fillId, trade: { userId: req.userId } } });
  if (!fill) return res.status(404).json({ error: 'fill not found' });
  await (prisma as any).tradeFill.delete({ where: { id: fillId } });
  await recalcAndUpdateFees(fill.tradeId);
  res.json({ ok: true });
});

// --- Diagnostic endpoint to trace futures fee determination ---
router.get('/:id/fees-debug', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId }, include: { account: true, tradeFills: true } as any });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  const fills:any[] = (trade as any).tradeFills || [];
  const qtyEntry = fills.filter(f=> f.type==='ENTRY').reduce((s,f)=> s + Number(f.size||0),0);
  const qtyExit = fills.filter(f=> f.type==='EXIT').reduce((s,f)=> s + Number(f.size||0),0);
  const realizedQty = Math.min(qtyEntry, qtyExit);
  const symbol = trade.symbol;
  const microHeuristic = isMicroFuturesSymbol(symbol);
  let yahooMicro: boolean | null = null;
  // Only attempt Yahoo if futures pattern
  if (isFuturesSymbol(symbol)) {
    yahooMicro = await detectMicroViaYahoo(symbol);
  }
  const miniDefault = (trade.account as any)?.defaultFeePerMiniContract != null ? Number((trade.account as any).defaultFeePerMiniContract) : null;
  const microDefault = (trade.account as any)?.defaultFeePerMicroContract != null ? Number((trade.account as any).defaultFeePerMicroContract) : null;
  const accountFeeRule = await (prisma as any).accountFee.findFirst({ where: { accountId: trade.accountId, assetClass: trade.assetClass } }).catch(()=>null);
  // Re-run selection logic (mirrors pickFuturesDefaultPerContract precedence)
  let chosenPerContract: number | null = null;
  if (isFuturesSymbol(symbol) && (miniDefault != null || microDefault != null)) {
    let microLike: boolean | null = microHeuristic;
    if (microLike === null || microLike === undefined) microLike = yahooMicro;
    if (microLike === true && microDefault != null) chosenPerContract = microDefault;
    else if (microLike === false && miniDefault != null) chosenPerContract = miniDefault;
    else if (microDefault != null) chosenPerContract = microDefault;
    else if (miniDefault != null) chosenPerContract = miniDefault;
  }
  let expectedFees: number | null = null;
  if (chosenPerContract != null) {
    expectedFees = chosenPerContract * realizedQty;
  } else if (accountFeeRule) {
    const ruleMode = accountFeeRule.mode;
    const ruleValue = Number(accountFeeRule.value);
    if (ruleMode === 'PER_CONTRACT_DOLLAR') {
      expectedFees = ruleValue * fills.reduce((s,f)=> s + Number(f.size||0),0);
    } else {
      const pct = ruleValue / 100;
      expectedFees = fills.reduce((s,f)=> s + Number(f.price)*Number(f.size)*pct, 0);
    }
  }
  res.json({
    symbol,
    assetClass: trade.assetClass,
    microHeuristic,
    yahooMicro,
    miniDefault,
    microDefault,
    chosenPerContract,
    qtyEntry,
    qtyExit,
    realizedQty,
    accountFeeRule: accountFeeRule ? { mode: accountFeeRule.mode, value: Number(accountFeeRule.value) } : null,
    expectedFees,
    storedFees: trade.fees != null ? Number(trade.fees) : null,
  });
});

// Add or remove tags on a trade
router.post('/:id/tags', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const { name } = (req as any).body as { name: string };
  const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  const tag = await prisma.tag.upsert({ where: { userId_name: { userId: req.userId!, name } }, update: {}, create: { userId: req.userId!, name } });
  const link = await prisma.tradeTag.upsert({ where: { tradeId_tagId: { tradeId: id, tagId: tag.id } }, update: {}, create: { tradeId: id, tagId: tag.id } });
  res.status(201).json(link);
});

router.delete('/:id/tags/:tagId', async (req: AuthRequest, res: Response) => {
  const { id, tagId } = (req as any).params;
  const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  await prisma.tradeTag.deleteMany({ where: { tradeId: id, tagId } });
  res.json({ ok: true });
});

export default router;
