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
	// SPA fallback: return index.html for non-API GET requests
	app.get('*', (req, res, next) => {
		if (req.path.startsWith('/auth') ||
				req.path.startsWith('/accounts') ||
				req.path.startsWith('/trades') ||
				req.path.startsWith('/tags') ||
				req.path.startsWith('/analytics') ||
				req.path.startsWith('/transactions') ||
				req.path.startsWith('/settings') ||
				req.path.startsWith('/strategies') ||
				req.path.startsWith('/csv') ||
				req.path.startsWith('/backup') ||
				req.path.startsWith('/attachments') ||
				req.path.startsWith('/marketdata') ||
				req.path.startsWith('/health')) {
			return next();
		}
		const indexFile = path.join(frontendRoot, 'index.html');
		if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
		return next();
	});
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRouter);
app.use('/accounts', accountRouter);
app.use('/trades', tradeRouter);
app.use('/tags', tagRouter);
app.use('/analytics', analyticsRouter);
app.use('/transactions', transactionsRouter);
app.use('/settings', settingsRouter);
app.use('/strategies', strategiesRouter);
app.use('/csv', csvRouter);
app.use('/backup', backupRouter);
app.use('/attachments', attachmentsRouter);
app.use('/marketdata', marketdataRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend listening on ${port}`));
