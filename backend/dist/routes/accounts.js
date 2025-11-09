import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
router.get('/', async (req, res) => {
    // For now, AccountFee model may not yet be exposed by generated client if migration not re-generated.
    // Return accounts only; fee editing will use dedicated route after client regen.
    const accounts = await prisma.account.findMany({ where: { userId: req.userId } });
    res.json(accounts);
});
// Single account fetch (includes basic fields; fees fetched via /:id/fees)
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
    if (!account)
        return res.status(404).json({ error: 'account not found' });
    res.json(account);
});
router.post('/', async (req, res) => {
    const { name, currency, defaultFeePerMiniContract, defaultFeePerMicroContract } = req.body;
    const data = { name, currency: currency || 'USD', userId: req.userId };
    if (defaultFeePerMiniContract != null)
        data.defaultFeePerMiniContract = defaultFeePerMiniContract;
    if (defaultFeePerMicroContract != null)
        data.defaultFeePerMicroContract = defaultFeePerMicroContract;
    const account = await prisma.account.create({ data });
    res.status(201).json(account);
});
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, currency, defaultFeePerMiniContract, defaultFeePerMicroContract } = req.body;
    const existing = await prisma.account.findFirst({ where: { id, userId: req.userId } });
    if (!existing)
        return res.status(404).json({ error: 'account not found' });
    const data = {};
    if (name !== undefined)
        data.name = name;
    if (currency !== undefined)
        data.currency = currency;
    if (defaultFeePerMiniContract !== undefined)
        data.defaultFeePerMiniContract = defaultFeePerMiniContract;
    if (defaultFeePerMicroContract !== undefined)
        data.defaultFeePerMicroContract = defaultFeePerMicroContract;
    const updated = await prisma.account.update({ where: { id }, data });
    res.json(updated);
});
// Delete an account and cascade its data
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.account.findFirst({ where: { id, userId: req.userId } });
    if (!existing)
        return res.status(404).json({ error: 'account not found' });
    // Delete related entities
    await prisma.tradeTag.deleteMany({ where: { trade: { accountId: id } } });
    await prisma.trade.deleteMany({ where: { accountId: id } });
    await prisma.transaction.deleteMany({ where: { accountId: id } });
    try {
        await prisma.accountFee.deleteMany({ where: { accountId: id } });
    }
    catch { }
    await prisma.account.delete({ where: { id } });
    res.json({ ok: true });
});
// Per-asset-class fee APIs (using any-casts to avoid type lag during client regeneration)
router.get('/:id/fees', async (req, res) => {
    const { id } = req.params;
    const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
    if (!account)
        return res.status(404).json({ error: 'account not found' });
    const rows = await prisma.accountFee.findMany({ where: { accountId: id } });
    res.json({ fees: rows });
});
router.put('/:id/fees', async (req, res) => {
    const { id } = req.params;
    const { fees } = req.body; // [{ assetClass, mode, value }]
    const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
    if (!account)
        return res.status(404).json({ error: 'account not found' });
    if (!Array.isArray(fees))
        return res.status(400).json({ error: 'fees array required' });
    for (const f of fees) {
        if (!f.assetClass || !f.mode || f.value == null)
            continue;
        await prisma.accountFee.upsert({
            where: { accountId_assetClass: { accountId: id, assetClass: f.assetClass } },
            update: { mode: f.mode, value: f.value },
            create: { accountId: id, assetClass: f.assetClass, mode: f.mode, value: f.value }
        });
    }
    const rows = await prisma.accountFee.findMany({ where: { accountId: id } });
    res.json({ fees: rows });
});
export default router;
