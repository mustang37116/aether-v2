import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Get current user settings
router.get('/', async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  const settings = await prisma.userSettings.findUnique({ where: { userId: req.userId! } });
  res.json({ baseCurrency: user?.baseCurrency || 'USD', settings });
});

// Update settings (baseCurrency and optional favoriteAccountId/defaultTagId)
router.put('/', async (req: AuthRequest, res) => {
  const { baseCurrency, favoriteAccountId, defaultTagId, defaultChartInterval, defaultChartWindowDays } = req.body as any;
  if (baseCurrency) {
    await prisma.user.update({ where: { id: req.userId! }, data: { baseCurrency } });
  }
  const settings = await prisma.userSettings.upsert({
    where: { userId: req.userId! },
    update: ({
      favoriteAccountId: favoriteAccountId ?? undefined,
      defaultTagId: defaultTagId ?? undefined,
      defaultChartInterval: defaultChartInterval ?? undefined,
      defaultChartWindowDays: defaultChartWindowDays ?? undefined,
    } as any),
    create: ({
      userId: req.userId!,
      favoriteAccountId: favoriteAccountId ?? null,
      defaultTagId: defaultTagId ?? null,
      defaultChartInterval: defaultChartInterval ?? null,
      defaultChartWindowDays: defaultChartWindowDays ?? null,
    } as any),
  });
  res.json({ ok: true, baseCurrency: baseCurrency || (await prisma.user.findUnique({ where: { id: req.userId! } }))?.baseCurrency, settings });
});

export default router;
