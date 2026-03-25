# Ochno Server-to-Server API PoC

A proof-of-concept showcasing the [Ochno Open API](https://operated.ochno.com) using **OAuth2 client_credentials** — server-to-server integration that authenticates directly with a client ID and secret, with no user login required.

Built with Node.js, TypeScript, and Express.

---

## What's different from the Delegated PoC

| | Delegated | Server-to-Server |
|---|---|---|
| **Auth flow** | OAuth2 PKCE, user logs in | `client_credentials`, no user |
| **Token storage** | `.tokens.json` + refresh | In-memory, re-auth on expiry |
| **Login page** | Yes | No — server authenticates on startup |
| **User info** | `/identity/oauth/v2/userinfo` | Not applicable |
| **On startup** | Try silent refresh | Authenticate immediately, exit if fails |

---

## Project structure

```
src/
├── index.ts              # Entry point — authenticates on startup, then boots server
├── app.ts                # Express app
├── auth/
│   ├── tokenStore.ts     # client_credentials auth, in-memory token with auto re-auth
│   └── middleware.ts     # requireAuth — 503 if not authenticated
├── routes/
│   ├── auth.ts           # GET /auth/status  POST /auth/reauthenticate
│   ├── proxy.ts          # GET /api/* → proxies to Ochno with Bearer token
│   └── webhook.ts        # POST /webhook → emits socket.io events to browser
├── pages/
│   └── dashboard.html    # Main dashboard
└── public/
    ├── css/styles.css
    └── js/
        ├── dashboard.js
        └── socket.js
```

---

## Setup

### 1. Register a server-to-server OAuth2 app on Ochno Operated

In your Ochno Operated account, create an OAuth2 application with:

- **Grant type:** `client_credentials`
- **Required scopes:** `sub accounts:read accounts:write hubs:read hubs:write`
- No redirect URI needed

### 2. Configure environment

```bash
cp .env.example .env
```

```env
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here
PORT=3000
OCHNO_BASE_URL=https://operated.ochno.com

# Optional
WEBHOOK_BASE_URL=
```

### 3. Run

```bash
npm install
npm run dev
```

The server authenticates immediately on startup. If `CLIENT_ID` or `CLIENT_SECRET` are wrong the process exits with an error — no silent failures.

---

## Token lifecycle

- On startup: fetch token via `client_credentials`
- Token cached in memory with expiry timestamp (60s buffer)
- Every proxied API call calls `getAccessToken()` which auto re-authenticates if expired
- Concurrent re-auth requests are deduplicated — only one token fetch fires at a time
- No file storage needed — credentials are always available in env vars

---

## Webhooks (optional)

Same as the delegated PoC — set `WEBHOOK_BASE_URL` to your ngrok URL. The subscription is created on startup and deleted on graceful shutdown (`SIGINT`/`SIGTERM`).

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with `tsx` — hot reload |
| `npm run build` | Compile TypeScript + copy static assets |
| `npm start` | Clean build + run |