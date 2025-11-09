import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import JSZip from 'jszip';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();
router.use(requireAuth);

// Import zip of CSVs; upsert basic entities. Assumes referential integrity (accounts before trades/transactions)
router.post('/import', upload.single('file'), async (req: AuthRequest, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'file required' });
  try {
    const zip = await JSZip.loadAsync(file.buffer as any);
    const readCsv = async (name: string) => {
      const f = zip.file(name); if (!f) return [] as any[];
      const text = await f.async('string');
      const [headerLine, ...lines] = text.split(/\r?\n/).filter(l=>l.trim().length);
      if (!headerLine) return [];
      const headers = headerLine.split(',');
      const parseLine = (line: string) => {
        const cells: string[] = [];
        let cur = ''; let inQ = false;
        for (let i=0;i<line.length;i++) {
          const ch = line[i];
          if (inQ) {
            if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
            if (ch === '"') { inQ = false; continue; }
            cur += ch;
          } else {
            if (ch === '"') { inQ = true; continue; }
            if (ch === ',') { cells.push(cur); cur=''; continue; }
            cur += ch;
          }
        }
        cells.push(cur);
        const obj: any = {};
        headers.forEach((h, idx) => obj[h] = cells[idx] ?? '');
        return obj;
      };
      return lines.map(parseLine);
    };

    const accounts = await readCsv('accounts.csv');
    for (const a of accounts) {
      if (!a.id || !a.name) continue;
    await (prisma as any).account.upsert({ where: { id: a.id }, update: { name: a.name, currency: a.currency || 'USD', defaultFeePerMiniContract: a.defaultFeePerMiniContract ? Number(a.defaultFeePerMiniContract) : null, defaultFeePerMicroContract: a.defaultFeePerMicroContract ? Number(a.defaultFeePerMicroContract) : null }, create: { id: a.id, name: a.name, currency: a.currency || 'USD', userId: req.userId!, defaultFeePerMiniContract: a.defaultFeePerMiniContract ? Number(a.defaultFeePerMiniContract) : undefined, defaultFeePerMicroContract: a.defaultFeePerMicroContract ? Number(a.defaultFeePerMicroContract) : undefined } });
    }

    const accountFees = await readCsv('accountFees.csv');
    for (const f of accountFees) {
      if (!f.accountId || !f.assetClass) continue;
      await (prisma as any).accountFee?.upsert?.({ where: { accountId_assetClass: { accountId: f.accountId, assetClass: f.assetClass } }, update: { mode: f.mode, value: Number(f.value || 0) }, create: { accountId: f.accountId, assetClass: f.assetClass, mode: f.mode, value: Number(f.value || 0) } });
    }

    const trades = await readCsv('trades.csv');
    for (const t of trades) {
      if (!t.id || !t.accountId || !t.symbol) continue;
  await (prisma as any).trade.upsert({ where: { id: t.id }, update: { accountId: t.accountId, symbol: t.symbol, assetClass: t.assetClass || 'STOCK', size: Number(t.size || 0), entryPrice: Number(t.entryPrice || 0), entryTime: t.entryTime ? new Date(t.entryTime) : new Date(), exitPrice: t.exitPrice ? Number(t.exitPrice) : null, exitTime: t.exitTime ? new Date(t.exitTime) : null, fees: t.fees ? Number(t.fees) : null, stopPrice: t.stopPrice ? Number(t.stopPrice) : null, targetPrice: t.targetPrice ? Number(t.targetPrice) : null, strategy: t.strategy || null, notes: t.notes || null, confidence: t.confidence ? Number(t.confidence) : null }, create: { id: t.id, userId: req.userId!, accountId: t.accountId, symbol: t.symbol, assetClass: t.assetClass || 'STOCK', size: Number(t.size || 0), entryPrice: Number(t.entryPrice || 0), entryTime: t.entryTime ? new Date(t.entryTime) : new Date(), exitPrice: t.exitPrice ? Number(t.exitPrice) : null, exitTime: t.exitTime ? new Date(t.exitTime) : null, fees: t.fees ? Number(t.fees) : null, stopPrice: t.stopPrice ? Number(t.stopPrice) : null, targetPrice: t.targetPrice ? Number(t.targetPrice) : null, strategy: t.strategy || null, notes: t.notes || null, confidence: t.confidence ? Number(t.confidence) : null } });
    }

    const transactions = await readCsv('transactions.csv');
    for (const tx of transactions) {
      if (!tx.id || !tx.accountId || !tx.type || !tx.amount) continue;
    await (prisma as any).transaction.upsert({ where: { id: tx.id }, update: { accountId: tx.accountId, type: tx.type as any, amount: Number(tx.amount), currency: tx.currency || 'USD', createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date() }, create: { id: tx.id, accountId: tx.accountId, type: tx.type as any, amount: Number(tx.amount), currency: tx.currency || 'USD', createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date() } });
    }

    const tags = await readCsv('tags.csv');
    for (const tg of tags) {
      if (!tg.id || !tg.name) continue;
    await (prisma as any).tag.upsert({ where: { id: tg.id }, update: { name: tg.name }, create: { id: tg.id, userId: req.userId!, name: tg.name } });
    }

    const settingsRows = await readCsv('settings.csv');
    for (const s of settingsRows) {
      if (!s.id) continue;
    await (prisma as any).userSettings.upsert({ where: { id: s.id }, update: { favoriteAccountId: s.favoriteAccountId || null, defaultChartInterval: s.defaultChartInterval || null, defaultChartWindowDays: s.defaultChartWindowDays ? Number(s.defaultChartWindowDays) : null }, create: { id: s.id, userId: req.userId!, favoriteAccountId: s.favoriteAccountId || null, defaultChartInterval: s.defaultChartInterval || null, defaultChartWindowDays: s.defaultChartWindowDays ? Number(s.defaultChartWindowDays) : null } });
    }

    res.json({ imported: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'import failed', detail: e.message });
  }
});

export default router;
