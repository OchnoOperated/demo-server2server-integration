import express, { type Request, type Response } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { getAccessToken } from '../auth/tokenStore.js';

const router = express.Router();

const BASE = () => process.env.OCHNO_BASE_URL ?? '';
const WEBHOOK_BASE = () => process.env.WEBHOOK_BASE_URL ?? '';
const webhooksEnabled = () => Boolean(WEBHOOK_BASE());

// socket.io instance is injected after server starts (see index.ts)
let io: SocketServer | null = null;
export function setSocketServer(server: SocketServer): void {
  io = server;
}

// Track the active subscription id so we can delete on shutdown
let activeSubscriptionId: string | null = null;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

// ── Subscription keepalive ────────────────────────────────────────────────────

async function patchSubscription(): Promise<void> {
  if (!activeSubscriptionId) return;
  try {
    const token = await getAccessToken();
    const res = await fetch(`${BASE()}/subscriptions/v1/${activeSubscriptionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      console.log('[webhook] Subscription extended:', activeSubscriptionId);
    } else {
      console.warn('[webhook] Failed to extend subscription:', res.status);
    }
  } catch (err) {
    console.warn('[webhook] Keepalive error:', err);
  }
}

function startKeepalive(): void {
  stopKeepalive();
  keepaliveInterval = setInterval(patchSubscription, 100 * 60 * 1000);
  console.log('[webhook] Keepalive started (every 100 min)');
}

function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

// ── Manage subscription lifecycle ─────────────────────────────────────────────

export async function manageSubscription(action: 'create' | 'delete'): Promise<void> {
  if (!webhooksEnabled()) return;

  try {
    const token = await getAccessToken();

    if (action === 'delete') {
      if (!activeSubscriptionId) return;
      await fetch(`${BASE()}/subscriptions/v1/${activeSubscriptionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('[webhook] Subscription deleted:', activeSubscriptionId);
      activeSubscriptionId = null;
      stopKeepalive();
      return;
    }

    // create
    const res = await fetch(`${BASE()}/subscriptions/v1/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        event: ['hub:state:change', 'hub:config:change', 'hub:con:change', 'hub:charging', 'hub:temp'],
        webhookUrl: `${WEBHOOK_BASE()}/webhook`,
        verificationToken: 'ochno-poc',
      }),
    });

    if (!res.ok) {
      console.warn('[webhook] Subscription creation failed:', res.status, await res.text());
      return;
    }

    const data = await res.json() as { id: string };
    activeSubscriptionId = data.id;
    console.log('[webhook] Subscription created:', activeSubscriptionId);
    startKeepalive();
  } catch (err) {
    console.warn('[webhook] Failed to manage subscription:', err);
  }
}

// ── POST /webhook  (Ochno → this server) ─────────────────────────────────────
// express.text({ type: '*/*' }) handles Ochno's non-standard Content-Type header

router.post('/', express.text({ type: '*/*' }), (req: Request, res: Response) => {
  res.status(200).send();

  try {
    const event = JSON.parse(req.body as string) as Record<string, unknown>;
    console.log('[webhook] Received event:', event.event, '— hub:', event.hubId ?? event.serialNumber);
    io?.emit('hub:event', event);
  } catch {
    console.warn('[webhook] Failed to parse body:', req.body);
  }
});

// ── GET /webhook/status  (browser checks on load) ─────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    enabled: webhooksEnabled(),
    subscriptionId: activeSubscriptionId,
  });
});

export default router;