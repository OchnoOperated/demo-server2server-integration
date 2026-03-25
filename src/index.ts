import dotenv from 'dotenv';
dotenv.config();

import http from 'node:http';
import { Server as SocketServer } from 'socket.io';

import app from './app.js';
import { authenticate } from './auth/tokenStore.js';
import { manageSubscription, setSocketServer } from './routes/webhook.js';

const PORT = Number(process.env.PORT) || 3000;

// ── Authenticate on startup ───────────────────────────────────────────────────
try {
  await authenticate();
  console.log('[startup] Authentication successful');

  // Create webhook subscription if configured
  await manageSubscription('create');
} catch (err) {
  console.error('[startup] Authentication failed:', err);
  console.error('[startup] Check CLIENT_ID and CLIENT_SECRET in your .env file');
  process.exit(1);
}

// ── HTTP + socket.io ──────────────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new SocketServer(httpServer, {
  cors: { origin: `http://localhost:${PORT}` },
});

setSocketServer(io);

io.on('connection', (socket) => {
  console.log('[socket.io] Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('[socket.io] Client disconnected:', socket.id);
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  console.log('\n[shutdown] Cleaning up...');
  await manageSubscription('delete');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGUSR2', shutdown); // nodemon restart

// ── Listen ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  const webhooksEnabled = Boolean(process.env.WEBHOOK_BASE_URL);
  console.log(`\n  Ochno S2S API PoC`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  URL:       http://localhost:${PORT}`);
  console.log(`  Auth:      client_credentials (no user login required)`);
  console.log(`  Webhooks:  ${webhooksEnabled ? `enabled (${process.env.WEBHOOK_BASE_URL}/webhook)` : 'disabled (set WEBHOOK_BASE_URL to enable)'}`);
  console.log(`  ─────────────────────────────────────────\n`);
});