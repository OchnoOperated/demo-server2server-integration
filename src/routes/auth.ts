import express, { type Request, type Response } from 'express';
import { authenticate, isAuthenticated } from '../auth/tokenStore.js';

const router = express.Router();

// ── GET /auth/status ──────────────────────────────────────────────────────────
// Used by the dashboard to check if the server is authenticated

router.get('/auth/status', (_req: Request, res: Response) => {
  res.json({ authenticated: isAuthenticated() });
});

// ── POST /auth/reauthenticate ─────────────────────────────────────────────────
// Manual re-auth trigger (useful if token was invalidated)

router.post('/auth/reauthenticate', async (_req: Request, res: Response) => {
  try {
    await authenticate();
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;