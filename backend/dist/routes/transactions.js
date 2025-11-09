import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { z } from 'zod';
const router = Router();
router.use(requireAuth);
const TxSchema = z.object({
    accountId: z.string().cuid(),
    type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
    amount: z.number().positive(),
    currency: z.string().min(3),
    createdAt: z.string().datetime().optional(),
});
// Create a deposit or withdrawal
router.post('/', async (req, res) => {
    const parse = TxSchema.safeParse(req.body);
    if (!parse.success)
        return res.status(400).json({ error: parse.error.flatten() });
    const { accountId, type, amount, currency, createdAt } = parse.data;
    // Verify account belongs to user
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
    if (!account)
        return res.status(404).json({ error: 'account not found' });
    const tx = await prisma.transaction.create({
        data: {
            accountId,
            type,
            amount,
            currency,
            createdAt: createdAt ? new Date(createdAt) : undefined,
        }
    });
    res.status(201).json(tx);
});
// List transactions (optionally by account)
router.get('/', async (req, res) => {
    const { accountId } = req.query;
    const where = { account: { userId: req.userId } };
    if (accountId)
        where.accountId = accountId;
    const list = await prisma.transaction.findMany({ where, orderBy: { createdAt: 'asc' } });
    res.json(list);
});
// Delete a single transaction
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.transaction.findFirst({ where: { id, account: { userId: req.userId } } });
    if (!existing)
        return res.status(404).json({ error: 'transaction not found' });
    await prisma.transaction.delete({ where: { id } });
    res.json({ ok: true });
});
export default router;
