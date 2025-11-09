import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { z } from 'zod';
const router = Router();
router.use(requireAuth);
router.get('/', async (req, res) => {
    const tags = await prisma.tag.findMany({ where: { userId: req.userId } });
    res.json(tags);
});
router.post('/', async (req, res) => {
    const { name } = req.body;
    const tag = await prisma.tag.create({ data: { name, userId: req.userId } });
    res.status(201).json(tag);
});
// Rename a tag
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    // ensure tag belongs to user
    const tag = await prisma.tag.findFirst({ where: { id, userId: req.userId } });
    if (!tag)
        return res.status(404).json({ error: 'not found' });
    const updated = await prisma.tag.update({ where: { id }, data: { name } });
    res.json(updated);
});
// Delete a tag and its relations
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const tag = await prisma.tag.findFirst({ where: { id, userId: req.userId } });
    if (!tag)
        return res.status(404).json({ error: 'not found' });
    await prisma.tradeTag.deleteMany({ where: { tagId: id } });
    await prisma.tag.delete({ where: { id } });
    res.json({ ok: true });
});
// Merge multiple source tags into a target tag
const mergeSchema = z.object({ targetId: z.string().cuid(), sourceIds: z.array(z.string().cuid()).min(1) });
router.post('/merge', async (req, res) => {
    const parsed = mergeSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten() });
    const { targetId, sourceIds } = parsed.data;
    // Ensure all tags belong to user
    const tags = await prisma.tag.findMany({ where: { id: { in: [targetId, ...sourceIds] }, userId: req.userId } });
    const ids = new Set(tags.map(t => t.id));
    if (!ids.has(targetId) || sourceIds.some(id => !ids.has(id)))
        return res.status(403).json({ error: 'tags not owned or not found' });
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
export default router;
