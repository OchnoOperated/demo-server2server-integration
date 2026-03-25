/**
 * tokenStore — server-to-server (client_credentials)
 *
 * No user login, no refresh tokens, no PKCE.
 * Just authenticate with client_id + client_secret whenever needed.
 * Token is kept in memory only — no file persistence needed since we can
 * always re-authenticate from env vars.
 */

interface TokenCache {
  access_token: string;
  expires_at: number; // unix ms
}

let cached: TokenCache | null = null;
let inflightRequest: Promise<string> | null = null;

const BASE = () => process.env.OCHNO_BASE_URL ?? '';
const SCOPES = 'sub accounts:read accounts:write hubs:read hubs:write';

// ── Authenticate ──────────────────────────────────────────────────────────────

async function fetchNewToken(): Promise<string> {
  console.log('[tokenStore] Token URL:', `${BASE()}/identity/oauth/v2/token`);
  const res = await fetch(`${BASE()}/identity/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.CLIENT_ID ?? '',
      client_secret: process.env.CLIENT_SECRET ?? '',
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Authentication failed (${res.status}): ${body}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const token = data.access_token as string;
  const rawExpiry = data.expires_in ?? data.access_expires_in;
  const expiresIn = rawExpiry
  ? typeof rawExpiry === 'number'
    ? rawExpiry                                    // already seconds
    : (new Date(rawExpiry as string).getTime() - Date.now()) / 1000  // Date string → seconds from now
  : 3600;
  cached = {
    access_token: token,
    // Subtract 60s buffer so we refresh before actual expiry
    expires_at: Date.now() + (expiresIn - 60) * 1000,
  };

  console.log('[tokenStore] Authenticated via client_credentials');
  return token;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getAccessToken — returns a valid access token, re-authenticating if expired.
 * Deduplicates concurrent calls so we never fire two auth requests at once.
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cached && Date.now() < cached.expires_at) {
    return cached.access_token;
  }

  // Deduplicate concurrent requests
  if (!inflightRequest) {
    inflightRequest = fetchNewToken().finally(() => {
      inflightRequest = null;
    });
  }

  return inflightRequest;
}

/**
 * authenticate — explicitly fetch a new token (called on startup).
 */
export async function authenticate(): Promise<void> {
  await getAccessToken();
}

/**
 * isAuthenticated — returns true if we have a non-expired token in cache.
 */
export function isAuthenticated(): boolean {
  return Boolean(cached && Date.now() < cached.expires_at);
}