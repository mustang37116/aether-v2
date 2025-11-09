import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir))
    fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: function (_req, _file, cb) { cb(null, uploadDir); },
    filename: function (_req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    }
});
const upload = multer({ storage });
const router = Router();
router.use(requireAuth);
// Upload an attachment for a trade
router.post('/', upload.single('file'), async (req, res) => {
    const { tradeId } = req.body;
    if (!tradeId || !req.file)
        return res.status(400).json({ error: 'missing tradeId or file' });
    const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId: req.userId } });
    if (!trade)
        return res.status(404).json({ error: 'trade not found' });
    const url = `/uploads/${req.file.filename}`;
    const att = await prisma.attachment.create({ data: { tradeId, url } });
    res.status(201).json(att);
});
// List attachments for a trade
router.get('/', async (req, res) => {
    const { tradeId } = req.query;
    if (!tradeId)
        return res.status(400).json({ error: 'tradeId required' });
    const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId: req.userId } });
    if (!trade)
        return res.status(404).json({ error: 'trade not found' });
    const list = await prisma.attachment.findMany({ where: { tradeId }, orderBy: { createdAt: 'desc' } });
    res.json(list);
});
export default router;
