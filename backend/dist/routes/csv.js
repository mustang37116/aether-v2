import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
function toCsv(rows, headers) {
    const esc = (v) => {
        if (v === null || v === undefined)
            return '';
        const s = String(v);
        if (/[",\n]/.test(s))
            return '"' + s.replace(/"/g, '""') + '"';
        return s;
    };
    const head = headers.join(',');
    const lines = rows.map(r => headers.map(h => esc(r[h])).join(','));
    return [head, ...lines].join('\n');
}
router.get('/trades', async (req, res) => {
    const { accountId } = req.query;
    const where = { userId: req.userId };
    if (accountId)
        where.accountId = accountId;
    const trades = await prisma.trade.findMany({
        where,
        include: { account: true, tradeTags: { include: { tag: true } } },
        orderBy: { entryTime: 'asc' }
    });
    const rows = trades.map(t => {
        const pnl = t.exitPrice ? (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size) - Number(t.fees || 0) : null;
        const tags = t.tradeTags.map(tt => tt.tag.name).join('|');
        return {
            id: t.id,
            symbol: t.symbol,
            assetClass: t.assetClass,
            strategy: t.strategy || '',
            account: t.account.name,
            accountCurrency: t.account.currency,
            size: t.size,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice ?? '',
            entryTime: t.entryTime.toISOString(),
            exitTime: t.exitTime ? t.exitTime.toISOString() : '',
            stopPrice: t.stopPrice ?? '',
            targetPrice: t.targetPrice ?? '',
            fees: t.fees ?? '',
            pnl: pnl ?? '',
            notes: t.notes || '',
            confidence: t.confidence ?? '',
            setupMode: t.setupMode ? 'true' : 'false',
            tags,
        };
    });
    const headers = ['id', 'symbol', 'assetClass', 'strategy', 'account', 'accountCurrency', 'size', 'entryPrice', 'exitPrice', 'entryTime', 'exitTime', 'stopPrice', 'targetPrice', 'fees', 'pnl', 'notes', 'confidence', 'setupMode', 'tags'];
    const csv = toCsv(rows, headers);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
    res.send(csv);
});
router.get('/transactions', async (req, res) => {
    const { accountId } = req.query;
    const where = { account: { userId: req.userId } };
    if (accountId)
        where.accountId = accountId;
    const txs = await prisma.transaction.findMany({
        where,
        include: { account: true },
        orderBy: { createdAt: 'asc' }
    });
    const rows = txs.map(tx => ({
        id: tx.id,
        account: tx.account.name,
        accountCurrency: tx.account.currency,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        createdAt: tx.createdAt.toISOString(),
    }));
    const headers = ['id', 'account', 'accountCurrency', 'type', 'amount', 'currency', 'createdAt'];
    const csv = toCsv(rows, headers);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csv);
});
// Utility: parse CSV (simple, handles quoted commas and quotes)
function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (!lines.length)
        return { headers: [], rows: [] };
    const headers = lines[0].split(',');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const cells = [];
        let cur = '';
        let inQ = false;
        for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            if (inQ) {
                if (ch === '"' && line[j + 1] === '"') {
                    cur += '"';
                    j++;
                    continue;
                }
                if (ch === '"') {
                    inQ = false;
                    continue;
                }
                cur += ch;
            }
            else {
                if (ch === '"') {
                    inQ = true;
                    continue;
                }
                if (ch === ',') {
                    cells.push(cur);
                    cur = '';
                    continue;
                }
                cur += ch;
            }
        }
        cells.push(cur);
        const obj = {};
        headers.forEach((h, idx) => obj[h] = cells[idx] ?? '');
        rows.push(obj);
    }
    return { headers, rows };
}
// Import trades CSV for a single account
router.post('/trades/import', upload.single('file'), async (req, res) => {
    const { accountId } = req.body;
    if (!accountId)
        return res.status(400).json({ error: 'accountId required' });
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
    if (!account)
        return res.status(404).json({ error: 'account not found' });
    if (!req.file)
        return res.status(400).json({ error: 'file required' });
    try {
        const text = req.file.buffer.toString('utf8');
        const { headers, rows } = parseCsv(text);
        if (!headers.length)
            return res.status(400).json({ error: 'empty csv' });
        let imported = 0;
        let updated = 0;
        for (const r of rows) {
            const symbol = r.symbol || r.Symbol || r.ticker;
            if (!symbol)
                continue;
            const size = Number(r.size || r.Size || 0);
            const entryPrice = Number(r.entryPrice || r.EntryPrice || r.entry || 0);
            if (!size || !entryPrice)
                continue;
            const id = r.id || undefined;
            const data = {
                userId: req.userId,
                accountId,
                symbol,
                assetClass: (r.assetClass || 'STOCK'),
                size,
                entryPrice,
                entryTime: r.entryTime ? new Date(r.entryTime) : new Date(),
                exitPrice: r.exitPrice ? Number(r.exitPrice) : null,
                exitTime: r.exitTime ? new Date(r.exitTime) : null,
                fees: r.fees ? Number(r.fees) : null,
                stopPrice: r.stopPrice ? Number(r.stopPrice) : null,
                targetPrice: r.targetPrice ? Number(r.targetPrice) : null,
                strategy: r.strategy || null,
                notes: r.notes || null,
                confidence: r.confidence ? Number(r.confidence) : null,
                setupMode: r.setupMode === 'true' || r.setupMode === '1'
            };
            if (id) {
                await prisma.trade.upsert({ where: { id }, update: data, create: { id, ...data } });
                updated++;
            }
            else {
                await prisma.trade.create({ data });
                imported++;
            }
        }
        res.json({ imported, updated });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'import failed', detail: e.message });
    }
});
// Import transactions CSV for a single account
router.post('/transactions/import', upload.single('file'), async (req, res) => {
    const { accountId } = req.body;
    if (!accountId)
        return res.status(400).json({ error: 'accountId required' });
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
    if (!account)
        return res.status(404).json({ error: 'account not found' });
    if (!req.file)
        return res.status(400).json({ error: 'file required' });
    try {
        const text = req.file.buffer.toString('utf8');
        const { headers, rows } = parseCsv(text);
        if (!headers.length)
            return res.status(400).json({ error: 'empty csv' });
        let imported = 0;
        let updated = 0;
        for (const r of rows) {
            const type = (r.type || r.Type);
            const amount = Number(r.amount || r.Amount || 0);
            if (!type || !amount)
                continue;
            const id = r.id || undefined;
            const data = {
                accountId,
                type,
                amount,
                currency: r.currency || account.currency || 'USD',
                createdAt: r.createdAt ? new Date(r.createdAt) : new Date()
            };
            if (id) {
                await prisma.transaction.upsert({ where: { id }, update: data, create: { id, ...data } });
                updated++;
            }
            else {
                await prisma.transaction.create({ data });
                imported++;
            }
        }
        res.json({ imported, updated });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'import failed', detail: e.message });
    }
});
export default router;
// Combined zip export for an account (trades + transactions + fees)
import JSZip from 'jszip';
router.get('/account-bundle', async (req, res) => {
    const { accountId } = req.query;
    if (!accountId)
        return res.status(400).json({ error: 'accountId required' });
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
    if (!account)
        return res.status(404).json({ error: 'account not found' });
    // Reuse existing logic
    const trades = await prisma.trade.findMany({ where: { userId: req.userId, accountId }, include: { tradeTags: { include: { tag: true } } }, orderBy: { entryTime: 'asc' } });
    const txs = await prisma.transaction.findMany({ where: { accountId, account: { userId: req.userId } }, orderBy: { createdAt: 'asc' } });
    const fees = await prisma.accountFee?.findMany ? await prisma.accountFee.findMany({ where: { accountId } }) : [];
    const tradeRows = trades.map(t => ({ id: t.id, symbol: t.symbol, assetClass: t.assetClass, size: t.size, entryPrice: t.entryPrice, exitPrice: t.exitPrice ?? '', entryTime: t.entryTime.toISOString(), exitTime: t.exitTime ? t.exitTime.toISOString() : '', fees: t.fees ?? '', notes: t.notes || '' }));
    const tradeCsv = toCsv(tradeRows, ['id', 'symbol', 'assetClass', 'size', 'entryPrice', 'exitPrice', 'entryTime', 'exitTime', 'fees', 'notes']);
    const txRows = txs.map(tx => ({ id: tx.id, type: tx.type, amount: tx.amount, currency: tx.currency, createdAt: tx.createdAt.toISOString() }));
    const txCsv = toCsv(txRows, ['id', 'type', 'amount', 'currency', 'createdAt']);
    const feeRows = fees.map((f) => ({ assetClass: f.assetClass, mode: f.mode, value: f.value }));
    const feeCsv = toCsv(feeRows, ['assetClass', 'mode', 'value']);
    const zip = new JSZip();
    zip.file('trades.csv', tradeCsv);
    zip.file('transactions.csv', txCsv);
    zip.file('fees.csv', feeCsv);
    const content = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="account-${account.name}-bundle.zip"`);
    res.send(content);
});
// Full user backup export
router.get('/backup', async (req, res) => {
    const [accounts, trades, transactions, tags, settings, fees] = await Promise.all([
        prisma.account.findMany({ where: { userId: req.userId } }),
        prisma.trade.findMany({ where: { userId: req.userId } }),
        prisma.transaction.findMany({ where: { account: { userId: req.userId } } }),
        prisma.tag.findMany({ where: { userId: req.userId } }),
        prisma.userSettings.findMany({ where: { userId: req.userId } }),
        prisma.accountFee?.findMany ? prisma.accountFee.findMany({ where: { account: { userId: req.userId } } }) : [],
    ]);
    const zip = new JSZip();
    zip.file('accounts.csv', toCsv(accounts, ['id', 'name', 'currency', 'defaultFeePerMiniContract', 'defaultFeePerMicroContract', 'createdAt', 'updatedAt']));
    zip.file('trades.csv', toCsv(trades, ['id', 'accountId', 'symbol', 'assetClass', 'size', 'entryPrice', 'entryTime', 'exitPrice', 'exitTime', 'fees', 'stopPrice', 'targetPrice', 'strategy', 'notes', 'confidence', 'setupMode', 'createdAt', 'updatedAt']));
    zip.file('transactions.csv', toCsv(transactions, ['id', 'accountId', 'type', 'amount', 'currency', 'createdAt', 'updatedAt']));
    zip.file('tags.csv', toCsv(tags, ['id', 'name', 'createdAt', 'updatedAt']));
    zip.file('settings.csv', toCsv(settings, ['id', 'userId', 'favoriteAccountId', 'defaultChartInterval', 'defaultChartWindowDays', 'createdAt', 'updatedAt']));
    zip.file('accountFees.csv', toCsv(fees, ['accountId', 'assetClass', 'mode', 'value']));
    const content = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="backup.zip"');
    res.send(content);
});
