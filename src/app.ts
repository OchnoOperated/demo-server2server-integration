import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type Request, type Response } from 'express';

import { requireAuth } from './auth/middleware.js';
import authRouter from './routes/auth.js';
import proxyRouter from './routes/proxy.js';
import webhookRouter from './routes/webhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES = path.join(__dirname, 'pages');
const PUBLIC = path.join(__dirname, 'public');

const app = express();

app.use(express.json());
app.use(express.static(PUBLIC));

// ── Auth status routes (no auth guard) ───────────────────────────────────────
app.use('/', authRouter);

// ── Webhook receiver (called by Ochno servers) ────────────────────────────────
app.use('/webhook', webhookRouter);

// ── Protected API proxy ───────────────────────────────────────────────────────
app.use('/api', requireAuth, proxyRouter);

// ── Dashboard (only page — no login needed since auth is server-side) ────────
app.get('/', requireAuth, (_req: Request, res: Response) => {
  res.sendFile(path.join(PAGES, 'dashboard.html'));
});

export default app;