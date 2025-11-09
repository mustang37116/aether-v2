import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
// List strategies (with basic counts)
router.get('/', async (req, res) => {
    const list = await prisma.strategy.findMany({
        where: { userId: req.userId },
        include: { _count: { select: { trades: true, tags: true } } },
        orderBy: { name: 'asc' }
    });
    res.json(list);
});
// Create a strategy
router.post('/', async (req, res) => {
    const { name, description } = req.body || {};
    if (!name || String(name).trim().length < 2)
        return res.status(400).json({ error: 'name is required' });
    const strategy = await prisma.strategy.create({ data: { userId: req.userId, name: String(name).trim(), description: description || null } });
    res.status(201).json(strategy);
});
// Get a single strategy with items and tags
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const s = await prisma.strategy.findFirst({ where: { id, userId: req.userId }, include: { tags: true } });
    if (!s)
        return res.status(404).json({ error: 'strategy not found' });
    res.json(s);
});
// Update a strategy
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, active } = req.body || {};
    const existing = await prisma.strategy.findFirst({ where: { id, userId: req.userId } });
    if (!existing)
        return res.status(404).json({ error: 'strategy not found' });
    const updated = await prisma.strategy.update({ where: { id }, data: { name, description, active } });
    res.json(updated);
});
// Delete a strategy (detaches from trades)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.strategy.findFirst({ where: { id, userId: req.userId } });
    if (!existing)
        return res.status(404).json({ error: 'strategy not found' });
    await prisma.trade.updateMany({ where: { strategyId: id, userId: req.userId }, data: { strategyId: null } });
    await prisma.strategy.delete({ where: { id } });
    res.json({ ok: true });
});
// Checklist item CRUD removed (playbook deprecated)
// Strategy tags CRUD (separate from trade tags)
router.post('/:id/tags', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body || {};
    if (!name)
        return res.status(400).json({ error: 'name required' });
    const s = await prisma.strategy.findFirst({ where: { id, userId: req.userId } });
    if (!s)
        return res.status(404).json({ error: 'strategy not found' });
    const tag = await prisma.strategyTag.create({ data: { strategyId: id, name: String(name).trim() } });
    res.status(201).json(tag);
});
router.delete('/:id/tags/:tagId', async (req, res) => {
    const { id, tagId } = req.params;
    const s = await prisma.strategy.findFirst({ where: { id, userId: req.userId, tags: { some: { id: tagId } } } });
    if (!s)
        return res.status(404).json({ error: 'strategy or tag not found' });
    await prisma.strategyTag.delete({ where: { id: tagId } });
    res.json({ ok: true });
});
export default router;
