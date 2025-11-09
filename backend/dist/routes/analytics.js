import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { convertAmount } from '../utils/fx.js';
const router = Router();
router.use(requireAuth);
router.get('/summary', async (req, res) => {
    const trades = await prisma.trade.findMany({ where: { userId: req.userId } });
    const total = trades.length;
    const wins = trades.filter(t => t.exitPrice && t.exitPrice > t.entryPrice).length; // naive win def
    const winRate = total ? wins / total : 0;
    const holdTimes = trades.filter(t => t.exitTime).map(t => (new Date(t.exitTime).getTime() - t.entryTime.getTime()) / 1000); // seconds
    const avgHoldSeconds = holdTimes.length ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0;
    res.json({ total, wins, winRate, avgHoldSeconds });
});
// Generic helper to build grouped analytics
async function grouped(req, groupBy) {
    const { accountId, start, end } = req.query;
    const timeFilter = {};
    if (start)
        timeFilter.gte = new Date(start);
    if (end)
        timeFilter.lte = new Date(end);
    const where = { userId: req.userId };
    if (accountId)
        where.accountId = accountId;
    if (Object.keys(timeFilter).length)
        where.entryTime = timeFilter; // using entry as baseline; could extend to exitTime
    const trades = await prisma.trade.findMany({ where, include: { tradeTags: { include: { tag: true } }, account: true } });
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const base = user?.baseCurrency || 'USD';
    const map = new Map();
    for (const t of trades) {
        // Determine grouping keys (tag may have multiple entries)
        const pnlRaw = t.exitPrice ? (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size) - Number(t.fees || 0) : 0;
        const pnlConv = t.exitPrice ? (await convertAmount(t.exitTime || t.entryTime, pnlRaw, t.account.currency, base)).amount : 0;
        const riskReward = t.stopPrice && t.targetPrice ? (Number(t.targetPrice) - Number(t.entryPrice)) / (Number(t.entryPrice) - Number(t.stopPrice) || 1) : null;
        const addRow = (key) => {
            if (!map.has(key))
                map.set(key, { key, trades: 0, wins: 0, pnl: 0, avgR: 0 });
            const r = map.get(key);
            r.trades += 1;
            if (t.exitPrice && t.exitPrice > t.entryPrice)
                r.wins += 1;
            r.pnl += pnlConv;
            if (riskReward && riskReward > 0)
                r.avgR += riskReward; // accumulate; will divide later
        };
        if (groupBy === 'assetClass')
            addRow(t.assetClass);
        else if (groupBy === 'strategy')
            addRow(t.strategy || '(none)');
        else if (groupBy === 'tag') {
            if (t.tradeTags.length === 0)
                addRow('(none)');
            for (const tt of t.tradeTags)
                addRow(tt.tag.name);
        }
    }
    const rows = Array.from(map.values()).map(r => ({
        key: r.key,
        trades: r.trades,
        wins: r.wins,
        winRate: r.trades ? r.wins / r.trades : 0,
        pnl: r.pnl,
        avgR: r.avgR && r.trades ? r.avgR / r.trades : 0,
    })).sort((a, b) => b.trades - a.trades);
    return { rows, currency: base };
}
router.get('/byAssetClass', async (req, res) => {
    res.json(await grouped(req, 'assetClass'));
});
router.get('/byStrategy', async (req, res) => {
    res.json(await grouped(req, 'strategy'));
});
router.get('/byTag', async (req, res) => {
    res.json(await grouped(req, 'tag'));
});
// Equity curve combining transactions and realized trade PnL, optionally filtered by account
router.get('/equity', async (req, res) => {
    const { accountId } = req.query;
    const tradeWhere = { userId: req.userId };
    const txWhere = { account: { userId: req.userId } };
    if (accountId) {
        tradeWhere.accountId = accountId;
        txWhere.accountId = accountId;
    }
    const [trades, transactions, user] = await Promise.all([
        prisma.trade.findMany({ where: tradeWhere, include: { account: true } }),
        prisma.transaction.findMany({ where: txWhere }),
        prisma.user.findUnique({ where: { id: req.userId } })
    ]);
    const base = user?.baseCurrency || 'USD';
    const events = [];
    for (const tx of transactions) {
        const conv = await convertAmount(tx.createdAt, Number(tx.amount), tx.currency, base);
        events.push({ time: tx.createdAt, delta: conv.amount });
    }
    for (const t of trades) {
        if (t.exitPrice) {
            const pnl = (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size) - Number(t.fees || 0);
            const conv = await convertAmount(t.exitTime || t.entryTime, pnl, t.account.currency, base);
            events.push({ time: t.exitTime || t.entryTime, delta: conv.amount });
        }
    }
    events.sort((a, b) => a.time.getTime() - b.time.getTime());
    let cum = 0;
    const curve = events.map(e => { cum += e.delta; return { time: e.time, cumulative: cum }; });
    res.json({ curve, currency: base });
});
// Calendar heatmap of daily PnL (realized PnL + deposits/withdrawals as separate line item)
router.get('/calendar', async (req, res) => {
    const { accountId } = req.query;
    const tradeWhere = { userId: req.userId };
    const txWhere = { account: { userId: req.userId } };
    if (accountId) {
        tradeWhere.accountId = accountId;
        txWhere.accountId = accountId;
    }
    const [trades, transactions, user] = await Promise.all([
        prisma.trade.findMany({ where: tradeWhere, include: { account: true } }),
        prisma.transaction.findMany({ where: txWhere }),
        prisma.user.findUnique({ where: { id: req.userId } })
    ]);
    const base = user?.baseCurrency || 'USD';
    const map = new Map();
    const add = (d, key, val) => {
        const day = d.toISOString().slice(0, 10);
        if (!map.has(day))
            map.set(day, { date: day, pnl: 0, deposits: 0, withdrawals: 0 });
        const obj = map.get(day);
        obj[key] += val;
    };
    for (const t of trades) {
        if (t.exitPrice) {
            const pnl = (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size) - Number(t.fees || 0);
            const conv = await convertAmount(t.exitTime || t.entryTime, pnl, t.account.currency, base);
            add(t.exitTime || t.entryTime, 'pnl', conv.amount);
        }
    }
    for (const tx of transactions) {
        const amt = Number(tx.amount);
        const conv = await convertAmount(tx.createdAt, amt, tx.currency, base);
        if (tx.type === 'DEPOSIT')
            add(tx.createdAt, 'deposits', conv.amount);
        else
            add(tx.createdAt, 'withdrawals', -conv.amount);
    }
    const days = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    res.json({ days, currency: base });
});
export default router;
