import express, { type Request, type Response } from 'express';
import { getAccessToken } from '../auth/tokenStore.js';

const router = express.Router();

const BASE = () => process.env.OCHNO_BASE_URL ?? '';

// ── Generic proxy helper ──────────────────────────────────────────────────────

async function proxyRequest(req: Request, res: Response, upstreamPath: string): Promise<void> {
  // getAccessToken() re-authenticates automatically if token is expired
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    res.status(503).json({ error: 'Failed to obtain access token', details: String(err) });
    return;
  }

  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const url = `${BASE()}${upstreamPath}${qs}`;
  console.log(`[proxy] ${req.method} ${url}`);

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(req.method !== 'GET' && req.body ? { body: JSON.stringify(req.body) } : {}),
    });

    const contentType = upstream.headers.get('content-type') ?? '';
    console.log(`[proxy] ← ${upstream.status} ${url}`);
    res.status(upstream.status);

    if (contentType.includes('application/json')) {
      res.json(await upstream.json());
    } else {
      res.send(await upstream.text());
    }
  } catch (err) {
    console.error(`[proxy] Error proxying ${url}:`, err);
    res.status(502).json({ error: 'Upstream request failed' });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Account
router.get('/accounts', (req, res) => proxyRequest(req, res, '/api/accounts/v1'));
router.get('/accounts/groups', (req, res) => proxyRequest(req, res, '/api/accounts/v1/groups'));

// Hubs
router.get('/hubs', (req, res) => proxyRequest(req, res, '/api/hubs/v1'));
router.get('/hubs/:hubId', (req, res) => proxyRequest(req, res, `/api/hubs/v1/${req.params.hubId}`));
router.put('/hubs/:hubId/config', (req, res) => proxyRequest(req, res, `/api/hubs/v1/${req.params.hubId}/config`));
router.put('/hubs/:hubId/state', (req, res) => proxyRequest(req, res, `/api/hubs/v1/${req.params.hubId}/state`));

// Spaces
router.get('/spaces', (req, res) => proxyRequest(req, res, '/api/spaces/v1'));

export default router;