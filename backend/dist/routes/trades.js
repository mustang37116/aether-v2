import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { calcRiskRewardR } from '../utils/risk.js';
const router = Router();
router.use(requireAuth);
async function resolveAssetClassAndSymbol(input) {
    const raw = (input || '').trim();
    const fallback = () => {
        // Heuristics when search fails
        if (/=F$/i.test(raw))
            return { assetClass: 'FUTURE' };
        if (/=X$/i.test(raw))
            return { assetClass: 'FOREX' };
        if (/-USD$/i.test(raw) || /-USDT$/i.test(raw) || /^[A-Z]{2,5}-[A-Z]{2,5}$/i.test(raw))
            return { assetClass: 'CRYPTO' };
        return { assetClass: 'STOCK' };
    };
    try {
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(raw)}&quotesCount=6&newsCount=0`;
        const r = await fetch(url);
        if (!r.ok)
            return fallback();
        const data = await r.json();
        const quotes = data?.quotes || [];
        if (!quotes.length)
            return fallback();
        const U = (s) => (s || '').toUpperCase();
        const exact = quotes.find(q => U(q.symbol) === U(raw));
        const pick = exact || quotes[0];
        const qt = (pick?.quoteType || '').toUpperCase();
        let assetClass = 'STOCK';
        if (qt === 'FUTURE')
            assetClass = 'FUTURE';
        else if (qt === 'OPTION')
            assetClass = 'OPTION';
        else if (qt === 'CRYPTOCURRENCY')
            assetClass = 'CRYPTO';
        else if (qt === 'CURRENCY' || qt === 'FX')
            assetClass = 'FOREX';
        else
            assetClass = 'STOCK';
        return { assetClass, symbol: pick?.symbol };
    }
    catch {
        return fallback();
    }
}
router.get('/', async (req, res) => {
    const { accountId, start, end, limit, skip, includeDeleted } = req.query;
    const where = { userId: req.userId };
    if (!includeDeleted)
        where.deletedAt = null;
    if (accountId)
        where.accountId = accountId;
    if (start || end) {
        where.entryTime = {};
        if (start)
            where.entryTime.gte = new Date(start);
        if (end)
            where.entryTime.lte = new Date(end);
    }
    const take = limit ? Math.min(Number(limit), 200) : undefined;
    const trades = await prisma.trade.findMany({ where, include: { tradeTags: { include: { tag: true } } }, orderBy: { entryTime: 'desc' }, take, skip: skip ? Number(skip) : undefined });
    const enriched = trades.map(t => {
        const metrics = t.stopPrice && t.targetPrice ? calcRiskRewardR(Number(t.entryPrice), Number(t.stopPrice), Number(t.targetPrice), Number(t.size)) : null;
        const holdTimeSeconds = t.exitTime ? (new Date(t.exitTime).getTime() - t.entryTime.getTime()) / 1000 : null;
        const pnl = t.exitPrice ? (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size) - Number(t.fees || 0) : null;
        const tags = t.tradeTags?.map(tt => ({ id: tt.tag.id, name: tt.tag.name })) || [];
        return { ...t, metrics, holdTimeSeconds, pnl, tags };
    });
    res.json(enriched);
});
// List deleted trades (recent first)
router.get('/deleted', async (req, res) => {
    const trades = await prisma.trade.findMany({ where: { userId: req.userId, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' }, take: 500 });
    res.json(trades.map(t => ({ id: t.id, symbol: t.symbol, deletedAt: t.deletedAt, size: t.size, entryPrice: t.entryPrice, entryTime: t.entryTime })));
});
// Update/exit a trade
router.put('/:id/exit', async (req, res) => {
    const { id } = req.params;
    const { exitPrice, exitTime, fees } = req.body;
    const existing = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
    if (!existing)
        return res.status(404).json({ error: 'trade not found' });
    const updated = await prisma.trade.update({ where: { id }, data: { exitPrice, exitTime: exitTime ? new Date(exitTime) : new Date(), fees } });
    const pnl = updated.exitPrice ? (Number(updated.exitPrice) - Number(updated.entryPrice)) * Number(updated.size) - Number(updated.fees || 0) : null;
    const holdTimeSeconds = updated.exitTime ? (new Date(updated.exitTime).getTime() - updated.entryTime.getTime()) / 1000 : null;
    res.json({ trade: updated, pnl, holdTimeSeconds });
});
router.post('/', async (req, res) => {
    const { accountId, symbol, assetClass, size, entryPrice, entryTime, stopPrice, targetPrice, setupMode, strategy, notes, confidence, tags, exitPrice, exitTime } = req.body;
    // Derive assetClass if not provided
    const derived = await resolveAssetClassAndSymbol(symbol);
    const finalAssetClass = assetClass || derived.assetClass;
    const trade = await prisma.trade.create({ data: { accountId, userId: req.userId, symbol, assetClass: finalAssetClass, size, entryPrice, entryTime: new Date(entryTime), stopPrice, targetPrice, setupMode: !!setupMode, strategy: strategy || null, notes: notes || null, confidence: typeof confidence === 'number' ? confidence : null, exitPrice: exitPrice ?? null, exitTime: exitTime ? new Date(exitTime) : null } });
    // Handle tags: list of tag names
    if (Array.isArray(tags) && tags.length) {
        for (const name of tags) {
            const tag = await prisma.tag.upsert({ where: { userId_name: { userId: req.userId, name } }, update: {}, create: { userId: req.userId, name } });
            await prisma.tradeTag.create({ data: { tradeId: trade.id, tagId: tag.id } });
        }
    }
    let metrics = {};
    if (stopPrice && targetPrice) {
        metrics = calcRiskRewardR(Number(entryPrice), Number(stopPrice), Number(targetPrice), Number(size));
    }
    res.status(201).json({ trade, metrics });
});
// Soft delete a trade
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
    if (!existing)
        return res.status(404).json({ error: 'trade not found' });
    if (existing.deletedAt)
        return res.json({ ok: true });
    await prisma.trade.update({ where: { id }, data: { deletedAt: new Date() } });
    res.json({ ok: true });
});
// Restore a soft deleted trade
router.post('/:id/restore', async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
    if (!existing)
        return res.status(404).json({ error: 'trade not found' });
    if (!existing.deletedAt)
        return res.json({ ok: true });
    await prisma.trade.update({ where: { id }, data: { deletedAt: null } });
    res.json({ ok: true });
});
// Update simple fields on a trade
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { symbol, assetClass, size, entryPrice, entryTime, exitPrice, exitTime, fees, stopPrice, targetPrice, strategy, notes, confidence, setupMode, } = req.body;
    const existing = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
    if (!existing)
        return res.status(404).json({ error: 'trade not found' });
    const data = {};
    if (symbol !== undefined)
        data.symbol = symbol;
    if (assetClass !== undefined)
        data.assetClass = assetClass;
    // If symbol changed and assetClass not explicitly provided, derive a new assetClass
    if (symbol !== undefined && assetClass === undefined) {
        const d = await resolveAssetClassAndSymbol(symbol);
        data.assetClass = d.assetClass;
    }
    if (size !== undefined)
        data.size = size;
    if (entryPrice !== undefined)
        data.entryPrice = entryPrice;
    if (entryTime !== undefined)
        data.entryTime = entryTime ? new Date(entryTime) : existing.entryTime;
    if (exitPrice !== undefined)
        data.exitPrice = exitPrice === null ? null : exitPrice;
    if (exitTime !== undefined)
        data.exitTime = exitTime ? new Date(exitTime) : null;
    if (fees !== undefined)
        data.fees = fees === null ? null : fees;
    if (stopPrice !== undefined)
        data.stopPrice = stopPrice === null ? null : stopPrice;
    if (targetPrice !== undefined)
        data.targetPrice = targetPrice === null ? null : targetPrice;
    if (strategy !== undefined)
        data.strategy = strategy;
    if (notes !== undefined)
        data.notes = notes;
    if (typeof confidence === 'number')
        data.confidence = confidence;
    if (typeof setupMode === 'boolean')
        data.setupMode = setupMode;
    const updated = await prisma.trade.update({ where: { id }, data });
    res.json(updated);
});
// Add or remove tags on a trade
router.post('/:id/tags', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
    if (!trade)
        return res.status(404).json({ error: 'trade not found' });
    const tag = await prisma.tag.upsert({ where: { userId_name: { userId: req.userId, name } }, update: {}, create: { userId: req.userId, name } });
    const link = await prisma.tradeTag.upsert({ where: { tradeId_tagId: { tradeId: id, tagId: tag.id } }, update: {}, create: { tradeId: id, tagId: tag.id } });
    res.status(201).json(link);
});
router.delete('/:id/tags/:tagId', async (req, res) => {
    const { id, tagId } = req.params;
    const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
    if (!trade)
        return res.status(404).json({ error: 'trade not found' });
    await prisma.tradeTag.deleteMany({ where: { tradeId: id, tagId } });
    res.json({ ok: true });
});
export default router;
