import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
	destination: function (_req, _file, cb) { cb(null, uploadDir); },
	filename: function (_req, file, cb) {
		const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
		const ext = path.extname(file.originalname);
		cb(null, unique + ext);
	}
});
const upload = multer({ storage });

const router = Router();
router.use(requireAuth);

// Upload one or more attachments for a trade
router.post('/', upload.array('file', 20), async (req: AuthRequest, res) => {
	const { tradeId } = req.body as any;
	const files = (req as any).files as Express.Multer.File[] | undefined;
	if (!tradeId || !files || files.length === 0) return res.status(400).json({ error: 'missing tradeId or file' });
	const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId: req.userId } });
	if (!trade) return res.status(404).json({ error: 'trade not found' });
	const created = [] as any[];
	for (const f of files) {
		const url = `/uploads/${f.filename}`;
		const att = await prisma.attachment.create({ data: { tradeId, url } });
		created.push(att);
	}
	res.status(201).json(created);
});

// List attachments for a trade
router.get('/', async (req: AuthRequest, res) => {
	const { tradeId } = req.query as any;
	if (!tradeId) return res.status(400).json({ error: 'tradeId required' });
	const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId: req.userId } });
	if (!trade) return res.status(404).json({ error: 'trade not found' });
	const list = await prisma.attachment.findMany({ where: { tradeId }, orderBy: { createdAt: 'desc' } });
	res.json(list);
});

// Delete an attachment
router.delete('/:id', async (req: AuthRequest, res) => {
	const { id } = req.params as any;
	const att = await prisma.attachment.findFirst({ where: { id }, include: { trade: true } });
	if (!att) return res.status(404).json({ error: 'not found' });
	if (att.trade.userId !== req.userId) return res.status(403).json({ error: 'forbidden' });
	// Attempt to remove file
	try {
		if (att.url && att.url.startsWith('/uploads/')) {
			const filePath = path.join(process.cwd(), att.url);
			if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
		}
	} catch {}
	await prisma.attachment.delete({ where: { id } });
	res.json({ ok: true });
});

export default router;