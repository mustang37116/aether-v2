import { Router, Response } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  const tags = await prisma.tag.findMany({ where: { userId: req.userId } });
  res.json(tags);
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, type, color, description, parentTagId } = (req as any).body || {};
  if (!name || String(name).trim().length < 1) return res.status(400).json({ error: 'name required' });
  // Ensure parent (if provided) belongs to user
  if (parentTagId) {
    const parent = await prisma.tag.findFirst({ where: { id: parentTagId, userId: req.userId } });
    if (!parent) return res.status(400).json({ error: 'invalid parentTagId' });
  }
  const data: any = { name: String(name).trim(), userId: req.userId! };
  if (type) data.type = type;
  if (color) data.color = String(color);
  if (description) data.description = String(description);
  if (parentTagId) data.parentTagId = parentTagId;
  const tag = await prisma.tag.create({ data });
  res.status(201).json(tag);
});

// Update a tag (rename and metadata)
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const { name, type, color, description, parentTagId, archivedAt } = (req as any).body || {};
  // ensure tag belongs to user
  const tag = await prisma.tag.findFirst({ where: { id, userId: req.userId } });
  if (!tag) return res.status(404).json({ error: 'not found' });
  if (parentTagId) {
    const parent = await prisma.tag.findFirst({ where: { id: parentTagId, userId: req.userId } });
    if (!parent) return res.status(400).json({ error: 'invalid parentTagId' });
  }
  const data: any = {};
  if (name !== undefined) data.name = String(name).trim();
  if (type !== undefined) data.type = type;
  if (color !== undefined) data.color = color;
  if (description !== undefined) data.description = description;
  if (parentTagId !== undefined) data.parentTagId = parentTagId || null;
  if (archivedAt !== undefined) data.archivedAt = archivedAt ? new Date(archivedAt) : null;
  const updated = await prisma.tag.update({ where: { id }, data });
  res.json(updated);
});

// Delete a tag and its relations
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const { id } = (req as any).params;
  const tag = await prisma.tag.findFirst({ where: { id, userId: req.userId } });
  if (!tag) return res.status(404).json({ error: 'not found' });
  await prisma.tradeTag.deleteMany({ where: { tagId: id } });
  await prisma.tag.delete({ where: { id } });
  res.json({ ok: true });
});

// Merge multiple source tags into a target tag
const mergeSchema = z.object({ targetId: z.string().cuid(), sourceIds: z.array(z.string().cuid()).min(1) });
router.post('/merge', async (req: AuthRequest, res: Response) => {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { targetId, sourceIds } = parsed.data;
  // Ensure all tags belong to user
  const tags = await prisma.tag.findMany({ where: { id: { in: [targetId, ...sourceIds] }, userId: req.userId } });
  const ids = new Set(tags.map(t=>t.id));
  if (!ids.has(targetId) || sourceIds.some(id=>!ids.has(id))) return res.status(403).json({ error: 'tags not owned or not found' });

  // Move relations
  const rels = await prisma.tradeTag.findMany({ where: { tagId: { in: sourceIds } } });
  const data = rels.map(r => ({ tradeId: r.tradeId, tagId: targetId }));
  if (data.length) {
    await prisma.tradeTag.createMany({ data, skipDuplicates: true });
  }
  // Delete old relations and tags
  await prisma.tradeTag.deleteMany({ where: { tagId: { in: sourceIds } } });
  await prisma.tag.deleteMany({ where: { id: { in: sourceIds } } });
  res.json({ ok: true });
});

// Hierarchical tree of tags for the user
router.get('/tree', async (req: AuthRequest, res: Response) => {
  const rows: any[] = await prisma.tag.findMany({ where: { userId: req.userId }, orderBy: { name: 'asc' } });
  const map = new Map<string, any>();
  rows.forEach(r => map.set(r.id, { ...r, children: [] as any[] }));
  const roots: any[] = [];
  for (const r of rows) {
    const node = map.get(r.id);
    if (r.parentTagId && map.has(r.parentTagId)) {
      map.get(r.parentTagId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  res.json(roots);
});

export default router;
