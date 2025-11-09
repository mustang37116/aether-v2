import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './prisma.js';
import authRouter from './routes/auth.js';
import accountRouter from './routes/accounts.js';
import tradeRouter from './routes/trades.js';
import tagRouter from './routes/tags.js';
import analyticsRouter from './routes/analytics.js';
import transactionsRouter from './routes/transactions.js';
import settingsRouter from './routes/settings.js';
import strategiesRouter from './routes/strategies.js';
import csvRouter from './routes/csv.js';
import backupRouter from './routes/backup.js';
import attachmentsRouter from './routes/attachments.js';
import marketdataRouter from './routes/marketdata.js';
import path from 'path';
import fs from 'fs';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
// Serve built frontend (SPA) from /public copied during Docker build
const frontendRoot = path.join(process.cwd(), 'public');
if (fs.existsSync(frontendRoot)) {
	app.use(express.static(frontendRoot));
	// SPA fallback: for GET requests not targeting /api, /uploads or /health, serve index.html
	app.get('*', (req, res, next) => {
		if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/health')) {
			return next();
		}
		const indexFile = path.join(frontendRoot, 'index.html');
		if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
		return next();
	});
}

// Health: include DB connectivity and basic counts
app.get('/health', async (_req, res) => {
	try {
		const [users, accounts, trades] = await Promise.all([
			prisma.user.count(),
			prisma.account.count(),
			prisma.trade.count(),
		]);
		res.json({ status: 'ok', db: { users, accounts, trades } });
	} catch (e: any) {
		res.status(503).json({ status: 'degraded', error: e?.message || String(e) });
	}
});
// Mount API under /api to avoid clashing with SPA routes
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountRouter);
app.use('/api/trades', tradeRouter);
app.use('/api/tags', tagRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/strategies', strategiesRouter);
app.use('/api/csv', csvRouter);
app.use('/api/backup', backupRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/marketdata', marketdataRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend listening on ${port}`));
