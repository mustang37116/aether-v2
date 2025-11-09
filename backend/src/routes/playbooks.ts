import { Router, Response } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ---- Playbooks ----
router.get('/', async (req: AuthRequest, res: Response) => {
  const list = await (prisma as any).playbook.findMany({
    where: { userId: req.userId },
    include: { _count: { select: { setups: true } } },
    orderBy: { name: 'asc' }
  } as any);
  res.json(list);
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, description } = (req as any).body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'name is required' });
  const pb = await (prisma as any).playbook.create({ data: { userId: req.userId!, name: String(name).trim(), description: description || null } });
  res.status(201).json(pb);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const pb = await (prisma as any).playbook.findFirst({ where: { id, userId: req.userId }, include: { setups: { include: { checklistItems: { orderBy: { order: 'asc' } }, strategy: true }, orderBy: { name: 'asc' } } } } as any);
  if (!pb) return res.status(404).json({ error: 'playbook not found' });
  // shape response as { playbook, setups } for easier client consumption
  res.json({ playbook: { id: pb.id, name: pb.name, description: pb.description, active: pb.active }, setups: pb.setups });
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const { name, description, active } = (req as any).body || {};
  const existing = await (prisma as any).playbook.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'playbook not found' });
  const updated = await (prisma as any).playbook.update({ where: { id }, data: { name, description, active } });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const existing = await (prisma as any).playbook.findFirst({ where: { id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: 'playbook not found' });
  // Delete setups (and their checklist items) under this playbook first to satisfy FK constraints
  const setups = await (prisma as any).setup.findMany({ where: { playbookId: id, userId: req.userId } });
  for (const s of setups) {
    await (prisma as any).setupChecklistItem.deleteMany({ where: { setupId: s.id } });
  }
  await (prisma as any).setup.deleteMany({ where: { playbookId: id, userId: req.userId } });
  await (prisma as any).playbook.delete({ where: { id } });
  res.json({ ok: true });
});

// ---- Setups ----
router.post('/:playbookId/setups', async (req: AuthRequest, res: Response) => {
  const { playbookId } = (req as any).params;
  const { name, description, strategyId } = (req as any).body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'name is required' });
  const playbook = await (prisma as any).playbook.findFirst({ where: { id: playbookId, userId: req.userId } });
  if (!playbook) return res.status(404).json({ error: 'playbook not found' });
  const setup = await (prisma as any).setup.create({ data: { userId: req.userId!, playbookId, name: String(name).trim(), description: description || null, strategyId: strategyId || null } });
  res.status(201).json(setup);
});

router.patch('/setups/:setupId', async (req: AuthRequest, res: Response) => {
  const { setupId } = (req as any).params;
  const { name, description, strategyId } = (req as any).body || {};
  const setup = await (prisma as any).setup.findFirst({ where: { id: setupId, userId: req.userId } });
  if (!setup) return res.status(404).json({ error: 'setup not found' });
  const updated = await (prisma as any).setup.update({ where: { id: setupId }, data: { name, description, strategyId: strategyId || null } });
  res.json(updated);
});

router.delete('/setups/:setupId', async (req: AuthRequest, res: Response) => {
  const { setupId } = (req as any).params;
  const setup = await (prisma as any).setup.findFirst({ where: { id: setupId, userId: req.userId } });
  if (!setup) return res.status(404).json({ error: 'setup not found' });
  await (prisma as any).setupChecklistItem.deleteMany({ where: { setupId } });
  await (prisma as any).setup.delete({ where: { id: setupId } });
  res.json({ ok: true });
});

// Checklist items for a setup
router.post('/setups/:setupId/items', async (req: AuthRequest, res: Response) => {
  const { setupId } = (req as any).params;
  const { text, required } = (req as any).body || {};
  if (!text || String(text).trim().length < 2) return res.status(400).json({ error: 'text is required' });
  const setup = await (prisma as any).setup.findFirst({ where: { id: setupId, userId: req.userId } });
  if (!setup) return res.status(404).json({ error: 'setup not found' });
  const maxOrder = await (prisma as any).setupChecklistItem.aggregate({ where: { setupId }, _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;
  const item = await (prisma as any).setupChecklistItem.create({ data: { setupId, text: String(text).trim(), required: !!required, order } });
  res.status(201).json(item);
});

router.patch('/setup-items/:itemId', async (req: AuthRequest, res: Response) => {
  const { itemId } = (req as any).params;
  const { text, required, order } = (req as any).body || {};
  const item = await (prisma as any).setupChecklistItem.findFirst({ where: { id: itemId, setup: { userId: req.userId } } } as any);
  if (!item) return res.status(404).json({ error: 'item not found' });
  const updated = await (prisma as any).setupChecklistItem.update({ where: { id: itemId }, data: { text, required, order } });
  res.json(updated);
});

router.delete('/setup-items/:itemId', async (req: AuthRequest, res: Response) => {
  const { itemId } = (req as any).params;
  const item = await (prisma as any).setupChecklistItem.findFirst({ where: { id: itemId, setup: { userId: req.userId } } } as any);
  if (!item) return res.status(404).json({ error: 'item not found' });
  await (prisma as any).setupChecklistItem.delete({ where: { id: itemId } });
  res.json({ ok: true });
});

export default router;
