import { Router, Response } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// List strategies (with basic counts)
router.get('/', async (req: AuthRequest, res: Response) => {
  const list = await (prisma as any).strategy.findMany({
    where: { userId: req.userId },
    include: { _count: { select: { checklistItems: true, trades: true, tags: true } } },
    orderBy: { name: 'asc' }
  } as any);
  res.json(list);
});

// Create a strategy
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, description } = (req as any).body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'name is required' });
  const strategy = await (prisma as any).strategy.create({ data: { userId: req.userId!, name: String(name).trim(), description: description || null } });
  res.status(201).json(strategy);
});

// Get a single strategy with items and tags
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const s = await (prisma as any).strategy.findFirst({ where: { id, userId: req.userId }, include: { checklistItems: { orderBy: { order: 'asc' } }, tags: true } } as any);
  if (!s) return res.status(404).json({ error: 'strategy not found' });
  res.json(s);
});

// Update a strategy
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const { name, description, active } = (req as any).body || {};
  const existing = await (prisma as any).strategy.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'strategy not found' });
  const updated = await (prisma as any).strategy.update({ where: { id }, data: { name, description, active } });
  res.json(updated);
});

// Delete a strategy (detaches from trades)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const existing = await (prisma as any).strategy.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'strategy not found' });
  await (prisma as any).trade.updateMany({ where: { strategyId: id, userId: req.userId }, data: { strategyId: null } });
  await (prisma as any).strategy.delete({ where: { id } });
  res.json({ ok: true });
});

// Checklist item CRUD
router.post('/:id/items', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const { text, required } = (req as any).body || {};
  if (!text || String(text).trim().length < 2) return res.status(400).json({ error: 'text is required' });
  const strategy = await (prisma as any).strategy.findFirst({ where: { id, userId: req.userId } });
  if (!strategy) return res.status(404).json({ error: 'strategy not found' });
  const maxOrder = await (prisma as any).strategyChecklistItem.aggregate({ where: { strategyId: id }, _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;
  const item = await (prisma as any).strategyChecklistItem.create({ data: { strategyId: id, text: String(text).trim(), required: !!required, order } });
  res.status(201).json(item);
});

router.patch('/items/:itemId', async (req: AuthRequest, res: Response) => {
  const { itemId } = (req as any).params;
  const { text, required, order } = (req as any).body || {};
  const item = await (prisma as any).strategyChecklistItem.findFirst({ where: { id: itemId, strategy: { userId: req.userId } } } as any);
  if (!item) return res.status(404).json({ error: 'item not found' });
  const updated = await (prisma as any).strategyChecklistItem.update({ where: { id: itemId }, data: { text, required, order } });
  res.json(updated);
});

router.delete('/items/:itemId', async (req: AuthRequest, res: Response) => {
  const { itemId } = (req as any).params;
  const item = await (prisma as any).strategyChecklistItem.findFirst({ where: { id: itemId, strategy: { userId: req.userId } } } as any);
  if (!item) return res.status(404).json({ error: 'item not found' });
  await (prisma as any).strategyChecklistItem.delete({ where: { id: itemId } });
  res.json({ ok: true });
});

// Strategy tags CRUD (separate from trade tags)
router.post('/:id/tags', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const { name } = (req as any).body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const s = await (prisma as any).strategy.findFirst({ where: { id, userId: req.userId } });
  if (!s) return res.status(404).json({ error: 'strategy not found' });
  const tag = await (prisma as any).strategyTag.create({ data: { strategyId: id, name: String(name).trim() } });
  res.status(201).json(tag);
});

router.delete('/:id/tags/:tagId', async (req: AuthRequest, res: Response) => {
  const { id, tagId } = (req as any).params;
  const s = await (prisma as any).strategy.findFirst({ where: { id, userId: req.userId, tags: { some: { id: tagId } } } } as any);
  if (!s) return res.status(404).json({ error: 'strategy or tag not found' });
  await (prisma as any).strategyTag.delete({ where: { id: tagId } });
  res.json({ ok: true });
});

export default router;
