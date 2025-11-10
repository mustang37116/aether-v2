import { Router } from 'express';
import { prisma } from '../prisma.js';
import { computeDirectionalPnl } from '../utils/pnl.js';
import { createHash } from 'crypto';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';

const router = Router();
router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function toCsv(rows: any[], headers: string[]) {
	const esc = (v: any) => {
		if (v === null || v === undefined) return '';
		const s = String(v);
		if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
		return s;
	};
	const head = headers.join(',');
	const lines = rows.map(r => headers.map(h => esc(r[h])).join(','));
	return [head, ...lines].join('\n');
}

router.get('/trades', async (req: AuthRequest, res) => {
	const { accountId } = req.query as { accountId?: string };
	const where: any = { userId: req.userId };
	if (accountId) where.accountId = accountId;
	const trades = await prisma.trade.findMany({
		where,
		include: { account: true, tradeTags: { include: { tag: true } } },
		orderBy: { entryTime: 'asc' }
	});
	const rows = trades.map(t => {
		const dir: any = (t as any).direction || 'LONG';
		const sym: any = (t as any).symbol;
		const feesNum = Number((t as any).fees || 0);
		const pnl = t.exitPrice ? computeDirectionalPnl(Number(t.entryPrice), Number(t.exitPrice), Number(t.size), dir, sym, feesNum) : null;
		const tags = t.tradeTags.map(tt => tt.tag.name).join('|');
		return {
			id: t.id,
			symbol: t.symbol,
			assetClass: t.assetClass,
			strategy: t.strategy || '',
			account: t.account.name,
			accountCurrency: t.account.currency,
			size: t.size,
			entryPrice: t.entryPrice,
			exitPrice: t.exitPrice ?? '',
			entryTime: t.entryTime.toISOString(),
			exitTime: t.exitTime ? t.exitTime.toISOString() : '',
			stopPrice: t.stopPrice ?? '',
			targetPrice: t.targetPrice ?? '',
			fees: t.fees ?? '',
			pnl: pnl ?? '',
			notes: t.notes || '',
			confidence: t.confidence ?? '',
			tags,
		};
	});
	const headers = ['id','symbol','assetClass','strategy','account','accountCurrency','size','entryPrice','exitPrice','entryTime','exitTime','stopPrice','targetPrice','fees','pnl','notes','confidence','tags'];
	const csv = toCsv(rows, headers);
	res.setHeader('Content-Type', 'text/csv');
	res.setHeader('Content-Disposition', 'attachment; filename="trades.csv"');
	res.send(csv);
});

router.get('/transactions', async (req: AuthRequest, res) => {
	const { accountId } = req.query as { accountId?: string };
	const where: any = { account: { userId: req.userId } };
	if (accountId) where.accountId = accountId;
	const txs = await prisma.transaction.findMany({
		where,
		include: { account: true },
		orderBy: { createdAt: 'asc' }
	});
	const rows = txs.map(tx => ({
		id: tx.id,
		account: tx.account.name,
		accountCurrency: tx.account.currency,
		type: tx.type,
		amount: tx.amount,
		currency: tx.currency,
		createdAt: tx.createdAt.toISOString(),
	}));
	const headers = ['id','account','accountCurrency','type','amount','currency','createdAt'];
	const csv = toCsv(rows, headers);
	res.setHeader('Content-Type', 'text/csv');
	res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
	res.send(csv);
});

// Utility: parse CSV (simple, handles quoted commas and quotes)
function parseCsv(text: string): { headers: string[]; rows: Record<string,string>[] } {
	const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
	if (!lines.length) return { headers: [], rows: [] };
	const headers = lines[0].split(',');
	const rows: Record<string,string>[] = [];
	for (let i=1;i<lines.length;i++) {
		const line = lines[i];
		const cells: string[] = []; let cur=''; let inQ=false;
		for (let j=0;j<line.length;j++) {
			const ch = line[j];
			if (inQ) {
				if (ch==='"' && line[j+1]==='"') { cur+='"'; j++; continue; }
				if (ch==='"') { inQ=false; continue; }
				cur+=ch;
			} else {
				if (ch==='"') { inQ=true; continue; }
				if (ch===',') { cells.push(cur); cur=''; continue; }
				cur+=ch;
			}
		}
		cells.push(cur);
		const obj: Record<string,string> = {};
		headers.forEach((h,idx)=> obj[h] = cells[idx] ?? '');
		rows.push(obj);
	}
	return { headers, rows };
}

// Import trades CSV for a single account
router.post('/trades/import', upload.single('file'), async (req: AuthRequest, res) => {
	const { accountId } = req.body as { accountId?: string };
	if (!accountId) return res.status(400).json({ error: 'accountId required' });
	const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
	if (!account) return res.status(404).json({ error: 'account not found' });
	if (!req.file) return res.status(400).json({ error: 'file required' });
	try {
		const text = req.file.buffer.toString('utf8');
		const { headers, rows } = parseCsv(text);
		if (!headers.length) return res.status(400).json({ error: 'empty csv' });
		let imported = 0; let updated = 0;
		for (const r of rows) {
			const symbol = r.symbol || r.Symbol || r.ticker;
			if (!symbol) continue;
			const size = Number(r.size || r.Size || 0);
			const entryPrice = Number(r.entryPrice || r.EntryPrice || r.entry || 0);
			if (!size || !entryPrice) continue;
			const id = r.id || undefined;
			const data: any = {
				userId: req.userId,
				accountId,
				symbol,
				assetClass: (r.assetClass || 'STOCK') as any,
				size,
				entryPrice,
				entryTime: r.entryTime ? new Date(r.entryTime) : new Date(),
				exitPrice: r.exitPrice ? Number(r.exitPrice) : null,
				exitTime: r.exitTime ? new Date(r.exitTime) : null,
				fees: r.fees ? Number(r.fees) : null,
				stopPrice: r.stopPrice ? Number(r.stopPrice) : null,
				targetPrice: r.targetPrice ? Number(r.targetPrice) : null,
				strategy: r.strategy || null,
				notes: r.notes || null,
				confidence: r.confidence ? Number(r.confidence) : null
			};
			if (id) {
				await (prisma as any).trade.upsert({ where: { id }, update: data, create: { id, ...data } });
				updated++;
			} else {
				await (prisma as any).trade.create({ data });
				imported++;
			}
		}
		res.json({ imported, updated });
	} catch (e: any) {
		console.error(e);
		res.status(500).json({ error: 'import failed', detail: e.message });
	}
});

// Import Topstep trades CSV for a single account (special column mapping)
router.post('/topstep/import', upload.single('file'), async (req: AuthRequest, res) => {
	const { accountId } = req.body as { accountId?: string };
	if (!accountId) return res.status(400).json({ error: 'accountId required' });
	const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
	if (!account) return res.status(404).json({ error: 'account not found' });
	if (!req.file) return res.status(400).json({ error: 'file required' });

	// 11/06/2025 19:25:01 -07:00 -> 2025-11-06T19:25:01-07:00
	const parseTopstepDate = (s?: string): Date | null => {
		if (!s) return null;
		const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{2}:\d{2})$/);
		if (!m) {
			// Fallback: try native Date
			const d = new Date(s);
			return isNaN(d.getTime()) ? null : d;
		}
		const [, mm, dd, yyyy, HH, MM, SS, offset] = m;
		const iso = `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}${offset}`;
		const d = new Date(iso);
		return isNaN(d.getTime()) ? null : d;
	};

	const toNum = (v: any): number | null => {
		if (v === undefined || v === null || v === '') return null;
		const n = Number(v);
		return isNaN(n) ? null : n;
	};

	// Normalize Topstep futures contract to Yahoo Finance convention.
	// Examples: MESZ5 (Topstep) with entry year 2025 -> MESZ25.CME
	// Pattern: <ROOT><MONTH><ONE_DIGIT_YEAR>. If year digit matches entryTime year % 10 use that year.
	// Adds '.CME' suffix for CME futures. If already ends with .CME or contains '=' (continuous) leave unchanged.
	const normalizeYahooSymbol = (raw: string, entryTime: Date | null): { symbol: string; changed: boolean } => {
		if (!raw) return { symbol: raw, changed: false };
		if (/\.CME$/.test(raw) || /=F$/.test(raw)) return { symbol: raw, changed: false }; // Already Yahoo style
		const m = raw.match(/^([A-Z0-9]+)([FGHJKMNQUVXZ])(\d)$/); // root + month code + single digit year
		if (!m) return { symbol: raw, changed: false };
		const [, root, monthCode, yearDigitStr] = m;
		const yearDigit = parseInt(yearDigitStr, 10);
		let yearTwo: string;
		if (entryTime) {
			const y = entryTime.getFullYear();
			if (y % 10 === yearDigit) {
				// Use full year from entryTime (e.g. 2025 -> '25')
				yearTwo = String(y).slice(-2);
			} else {
				// Reconstruct within same decade
				const decadeStart = Math.floor(y / 10) * 10; // 2020
				let candidate = decadeStart + yearDigit; // 2020 + 5 = 2025
				// If candidate < y - 5 assume next decade (handles imports from prior year end crossing)
				if (candidate < y - 5) candidate += 10;
				yearTwo = String(candidate).slice(-2);
			}
		} else {
			// Fallback: assume current year context
			const y = new Date().getFullYear();
			const decadeStart = Math.floor(y / 10) * 10;
			const candidate = decadeStart + yearDigit;
			yearTwo = String(candidate).slice(-2);
		}
		const yahoo = `${root}${monthCode}${yearTwo}.CME`;
		return { symbol: yahoo, changed: yahoo !== raw };
	};

	try {
		const text = req.file.buffer.toString('utf8');
		const { rows } = parseCsv(text);
		let imported = 0; let updated = 0; let skipped = 0; let duplicates = 0; let fillsCreated = 0;
		for (const r of rows) {
			// Map Topstep columns
			const topId = (r.Id || r.id || '').toString().trim();
			const symbol = (r.ContractName || r.symbol || '').trim();
			const entryTime = parseTopstepDate(r.EnteredAt || r.entryTime || r.EntryTime);
			const exitTime = parseTopstepDate(r.ExitedAt || r.exitTime || r.ExitTime);
			const entryPrice = toNum(r.EntryPrice ?? r.entryPrice);
			const exitPrice = toNum(r.ExitPrice ?? r.exitPrice);
			const size = toNum(r.Size ?? r.size);
			const type = (r.Type || r.type || '').toString().toUpperCase(); // LONG/SHORT strings
			const feesCol = toNum(r.Fees ?? r.fees) || 0;
			const commCol = toNum(r.Commissions ?? r.commissions) || 0;
			const fees = feesCol + commCol || null;

			if (!symbol || !entryPrice || !size || !entryTime) { skipped++; continue; }

			const direction: 'LONG' | 'SHORT' | null = type.includes('LONG') ? 'LONG' : type.includes('SHORT') ? 'SHORT' : null;
			const { symbol: yahooSymbol } = normalizeYahooSymbol(symbol, entryTime);
			// Build a stable id: prefer Topstep Id; else derive from key fields to dedupe re-imports
			const derivedKey = !topId && entryTime && entryPrice != null && size != null
				? createHash('sha1').update([
					'v1', String(accountId), yahooSymbol, String(entryPrice), String(size), entryTime.toISOString(), direction || ''
				].join('|')).digest('hex').slice(0, 16)
				: null;
			const id = topId ? `topstep_${accountId}_${topId}` : (derivedKey ? `topstep_${accountId}_${derivedKey}` : undefined);
			if (id) {
				// Only import new trades: skip if already present
				const exists = await prisma.trade.findFirst({ where: { id } });
				if (exists) { duplicates++; continue; }
			}
			const data: any = {
				userId: req.userId,
				accountId,
				symbol: yahooSymbol,
				assetClass: 'FUTURE',
				size,
				entryPrice,
				entryTime,
				exitPrice: exitPrice ?? null,
				exitTime: exitTime ?? null,
				fees,
				direction,
				notes: null
			};

							if (id) {
								const trade = await (prisma as any).trade.create({ data: { id, ...data } });
								imported++;
								// Create ENTRY fill
								try {
									await (prisma as any).tradeFill.create({ data: { tradeId: trade.id, type: 'ENTRY', price: entryPrice, size, time: entryTime } });
									fillsCreated++;
									if (exitPrice != null && exitTime) {
										await (prisma as any).tradeFill.create({ data: { tradeId: trade.id, type: 'EXIT', price: exitPrice, size, time: exitTime } });
										fillsCreated++;
									}
								} catch {}
							} else {
								const trade = await (prisma as any).trade.create({ data });
								imported++;
								try {
									await (prisma as any).tradeFill.create({ data: { tradeId: trade.id, type: 'ENTRY', price: entryPrice, size, time: entryTime } });
									fillsCreated++;
									if (exitPrice != null && exitTime) {
										await (prisma as any).tradeFill.create({ data: { tradeId: trade.id, type: 'EXIT', price: exitPrice, size, time: exitTime } });
										fillsCreated++;
									}
								} catch {}
							}
		}
						res.json({ imported, updated, skipped: skipped + duplicates, fillsCreated });
	} catch (e: any) {
		console.error(e);
		res.status(500).json({ error: 'topstep import failed', detail: e.message });
	}
});

// Import transactions CSV for a single account
router.post('/transactions/import', upload.single('file'), async (req: AuthRequest, res) => {
	const { accountId } = req.body as { accountId?: string };
	if (!accountId) return res.status(400).json({ error: 'accountId required' });
	const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
	if (!account) return res.status(404).json({ error: 'account not found' });
	if (!req.file) return res.status(400).json({ error: 'file required' });
	try {
		const text = req.file.buffer.toString('utf8');
		const { headers, rows } = parseCsv(text);
		if (!headers.length) return res.status(400).json({ error: 'empty csv' });
		let imported = 0; let updated = 0;
		for (const r of rows) {
			const type = (r.type || r.Type) as any;
			const amount = Number(r.amount || r.Amount || 0);
			if (!type || !amount) continue;
			const id = r.id || undefined;
			const data: any = {
				accountId,
				type,
				amount,
				currency: r.currency || account.currency || 'USD',
				createdAt: r.createdAt ? new Date(r.createdAt) : new Date()
			};
			if (id) {
				await (prisma as any).transaction.upsert({ where: { id }, update: data, create: { id, ...data } });
				updated++;
			} else {
				await (prisma as any).transaction.create({ data });
				imported++;
			}
		}
		res.json({ imported, updated });
	} catch (e: any) {
		console.error(e);
		res.status(500).json({ error: 'import failed', detail: e.message });
	}
});

export default router;
// Combined zip export for an account (trades + transactions + fees)
import JSZip from 'jszip';
router.get('/account-bundle', async (req: AuthRequest, res) => {
	const { accountId } = req.query as { accountId?: string };
	if (!accountId) return res.status(400).json({ error: 'accountId required' });
	const account = await prisma.account.findFirst({ where: { id: accountId, userId: req.userId } });
	if (!account) return res.status(404).json({ error: 'account not found' });
	// Reuse existing logic
	const trades = await prisma.trade.findMany({ where: { userId: req.userId, accountId }, include: { tradeTags: { include: { tag: true } } }, orderBy: { entryTime: 'asc' } });
	const txs = await prisma.transaction.findMany({ where: { accountId, account: { userId: req.userId } }, orderBy: { createdAt: 'asc' } });
	const fees = await (prisma as any).accountFee?.findMany ? await (prisma as any).accountFee.findMany({ where: { accountId } }) : [];
	const tradeRows = trades.map(t => ({ id: t.id, symbol: t.symbol, assetClass: t.assetClass, size: t.size, entryPrice: t.entryPrice, exitPrice: t.exitPrice ?? '', entryTime: t.entryTime.toISOString(), exitTime: t.exitTime ? t.exitTime.toISOString() : '', fees: t.fees ?? '', notes: t.notes || '' }));
	const tradeCsv = toCsv(tradeRows, ['id','symbol','assetClass','size','entryPrice','exitPrice','entryTime','exitTime','fees','notes']);
	const txRows = txs.map(tx => ({ id: tx.id, type: tx.type, amount: tx.amount, currency: tx.currency, createdAt: tx.createdAt.toISOString() }));
	const txCsv = toCsv(txRows, ['id','type','amount','currency','createdAt']);
	const feeRows = fees.map((f: any) => ({ assetClass: f.assetClass, mode: f.mode, value: f.value }));
	const feeCsv = toCsv(feeRows, ['assetClass','mode','value']);
	const zip = new JSZip();
	zip.file('trades.csv', tradeCsv);
	zip.file('transactions.csv', txCsv);
	zip.file('fees.csv', feeCsv);
	const content = await zip.generateAsync({ type: 'nodebuffer' });
	res.setHeader('Content-Type', 'application/zip');
	res.setHeader('Content-Disposition', `attachment; filename="account-${account.name}-bundle.zip"`);
	res.send(content);
});

// Full user backup export
router.get('/backup', async (req: AuthRequest, res) => {
	const [accounts, trades, transactions, tags, settings, fees] = await Promise.all([
		prisma.account.findMany({ where: { userId: req.userId } }),
		prisma.trade.findMany({ where: { userId: req.userId } }),
		prisma.transaction.findMany({ where: { account: { userId: req.userId } } }),
		prisma.tag.findMany({ where: { userId: req.userId } }),
		prisma.userSettings.findMany({ where: { userId: req.userId } }),
		(prisma as any).accountFee?.findMany ? (prisma as any).accountFee.findMany({ where: { account: { userId: req.userId } } }) : [],
	]);
	const zip = new JSZip();
	zip.file('accounts.csv', toCsv(accounts, ['id','name','currency','defaultFeePerMiniContract','defaultFeePerMicroContract','createdAt','updatedAt']));
	zip.file('trades.csv', toCsv(trades, ['id','accountId','symbol','assetClass','size','entryPrice','entryTime','exitPrice','exitTime','fees','stopPrice','targetPrice','strategy','notes','confidence','createdAt','updatedAt']));
	zip.file('transactions.csv', toCsv(transactions, ['id','accountId','type','amount','currency','createdAt','updatedAt']));
	zip.file('tags.csv', toCsv(tags, ['id','name','createdAt','updatedAt']));
	zip.file('settings.csv', toCsv(settings, ['id','userId','favoriteAccountId','defaultChartInterval','defaultChartWindowDays','createdAt','updatedAt']));
	zip.file('accountFees.csv', toCsv(fees, ['accountId','assetClass','mode','value']));
	const content = await zip.generateAsync({ type: 'nodebuffer' });
	res.setHeader('Content-Type', 'application/zip');
	res.setHeader('Content-Disposition', 'attachment; filename="backup.zip"');
	res.send(content);
});