# TikTok OAuth Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a production-grade TikTok Shop seller OAuth foundation online so the Partner Center Redirect URL is valid, tokens can later be exchanged securely, and the single seller connection can be persisted without exposing secrets.

**Architecture:** Use two public Supabase Edge Functions with `verify_jwt = false`: a callback endpoint that TikTok can redirect to and a start/status endpoint for the operator flow. Business secrets remain in Supabase Function Secrets. Seller tokens are encrypted server-side with AES-GCM before persistence. OAuth state is one-time, hashed, expiring, and stored in Postgres. The GitHub repository remains public and contains no secret values.

**Tech Stack:** Supabase Edge Functions (Deno 2.x), TypeScript, `@supabase/supabase-js` pinned version, PostgreSQL, Web Crypto AES-GCM/SHA-256, GitHub Actions, Node 22 contract tests.

**Spec:** `docs/superpowers/specs/2026-09-11-itufarna-tiktok-finance-design.md`

## Global Constraints

- One seller initially; enforce a single active connection row.
- Market initially Brazil.
- Same Supabase project already used by the business.
- Source code isolated in `osvaldosereia/ITUFARNA`.
- No Make.
- Never commit `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, seller access/refresh tokens, Supabase secret/service keys, real bank data, or production payloads containing personal data.
- OAuth callback URL: `https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/tiktok-shop-oauth-callback`.
- Token API: `https://auth.tiktok-shops.com/api/v2/token/get` with `grant_type=authorized_code`.
- Refresh API: `https://auth.tiktok-shops.com/api/v2/token/refresh` with `grant_type=refresh_token`.
- Seller token must have `user_type = 0`.
- Get Authorized Shops: `GET https://open-api.tiktokglobalshop.com/authorization/202309/shops` with `x-tts-access-token`.
- Required initial scopes: `seller.authorization.info`; finance features later require `seller.finance.info`.
- New code must use Supabase secret API keys from `SUPABASE_SECRET_KEYS` when available, with legacy service role only as an explicit compatibility fallback.
- All public-schema tables created by this project must have RLS enabled and no `anon`/`authenticated` CRUD policies.
- Edge Functions that are public third-party callbacks use `verify_jwt = false` and enforce their own validation.

---

### Task 1: Repository bootstrap and security guardrails

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `deno.json`
- Create: `supabase/config.toml`
- Create: `scripts/test-no-secrets.mjs`
- Create: `.github/workflows/test.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: the approved design spec.
- Produces: a Deno/Node project skeleton, function config, CI, and secret-scan contract used by every later task.

- [ ] **Step 1: Write the failing secret-scan test**

```js
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const banned = [
  /TTP_[A-Za-z0-9_-]{12,}/,
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^<\s]/,
  /TIKTOK_SHOP_APP_SECRET\s*=\s*[^<\s]/,
];
const allowed = new Set(['.git']);
function walk(dir='.') {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if (allowed.has(entry.name) || entry.name==='node_modules') return [];
    const p=path.join(dir,entry.name);
    return entry.isDirectory()?walk(p):[p];
  });
}
for (const file of walk()) {
  const text=fs.readFileSync(file,'utf8');
  for (const pattern of banned) assert.doesNotMatch(text,pattern,`secret pattern in ${file}`);
}
console.log('no-secrets ok');
```

- [ ] **Step 2: Run test to verify it initially fails because project guardrails do not yet exist**

Run: `node scripts/test-no-secrets.mjs`

Expected: FAIL because `scripts/test-no-secrets.mjs` does not yet exist.

- [ ] **Step 3: Add bootstrap files**

`.gitignore` must include:

```gitignore
.env
.env.*
!.env.example
supabase/.temp/
.DS_Store
node_modules/
coverage/
```

`.env.example` contains names only:

```dotenv
TIKTOK_SHOP_APP_KEY=<set-in-supabase-secrets>
TIKTOK_SHOP_APP_SECRET=<set-in-supabase-secrets>
TIKTOK_TOKEN_ENCRYPTION_KEY_B64=<32-byte-key-base64>
TIKTOK_SELLER_AUTHORIZATION_URL=<partner-center-copy-authorization-link>
```

`deno.json`:

```json
{
  "compilerOptions": { "strict": true },
  "tasks": { "check": "deno check supabase/functions/**/*.ts" }
}
```

`supabase/config.toml`:

```toml
project_id = "ssbesxgaijknwsjbsbcz"

[functions.tiktok-shop-oauth-callback]
verify_jwt = false

[functions.tiktok-shop-oauth-start]
verify_jwt = false
```

CI must install Node 22 + Deno 2.x and run `node scripts/test-no-secrets.mjs` plus `deno task check`.

- [ ] **Step 4: Run the secret-scan test**

Run: `node scripts/test-no-secrets.mjs`

Expected: PASS with `no-secrets ok`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore .env.example deno.json supabase/config.toml scripts/test-no-secrets.mjs .github/workflows/test.yml README.md
git commit -m "chore: bootstrap ITUFARNA OAuth project"
```

---

### Task 2: OAuth persistence schema

**Files:**
- Create: `supabase/migrations/20260911_tiktok_oauth_foundation.sql`
- Create: `scripts/test-oauth-schema.mjs`

**Interfaces:**
- Consumes: server-side Supabase secret key.
- Produces: `public.tiktok_connections` and `public.tiktok_oauth_states` with RLS, singleton connection enforcement, hashed one-time states, and encrypted-token storage fields.

- [ ] **Step 1: Write the failing schema contract**

The test must assert the migration contains:

```js
for (const pattern of [
  /create table if not exists public\.tiktok_connections/i,
  /singleton_key/i,
  /access_token_ciphertext/i,
  /refresh_token_ciphertext/i,
  /granted_scopes/i,
  /create table if not exists public\.tiktok_oauth_states/i,
  /state_hash/i,
  /expires_at/i,
  /used_at/i,
  /enable row level security/i,
  /revoke all on table public\.tiktok_connections from anon, authenticated/i,
  /revoke all on table public\.tiktok_oauth_states from anon, authenticated/i,
]) assert.match(sql, pattern);
```

- [ ] **Step 2: Run it and confirm RED**

Run: `node scripts/test-oauth-schema.mjs`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the migration**

Core shape:

```sql
create table if not exists public.tiktok_connections (
  id uuid primary key default gen_random_uuid(),
  singleton_key text not null default 'primary' unique check (singleton_key = 'primary'),
  open_id text,
  user_type smallint check (user_type is null or user_type = 0),
  shop_id text,
  shop_cipher text,
  shop_name text,
  region text,
  granted_scopes text[] not null default '{}',
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','active','reauthorization_required','revoked','error')),
  authorized_at timestamptz,
  last_refresh_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tiktok_oauth_states (
  state_hash text primary key,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

alter table public.tiktok_connections enable row level security;
alter table public.tiktok_oauth_states enable row level security;
revoke all on table public.tiktok_connections from anon, authenticated;
revoke all on table public.tiktok_oauth_states from anon, authenticated;
grant all on table public.tiktok_connections to service_role;
grant all on table public.tiktok_oauth_states to service_role;
```

Add an index on `tiktok_oauth_states(expires_at)` and cleanup-safe comments. Do not create public policies.

- [ ] **Step 4: Verify GREEN**

Run: `node scripts/test-oauth-schema.mjs`

Expected: PASS.

- [ ] **Step 5: Validate migration in Supabase before applying**

Execute the SQL wrapped in `BEGIN; ... ROLLBACK;` against the real project. Expected: no SQL error and no persisted schema change.

- [ ] **Step 6: Apply migration officially**

Use Supabase migration tooling so the production project records the change in migration history.

- [ ] **Step 7: Run Supabase security advisor**

Expected: no new RLS/public-access finding attributable to `tiktok_connections` or `tiktok_oauth_states`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260911_tiktok_oauth_foundation.sql scripts/test-oauth-schema.mjs
git commit -m "feat: add secure TikTok OAuth persistence"
```

---

### Task 3: Shared crypto, token and TikTok client primitives

**Files:**
- Create: `supabase/functions/_shared/env.ts`
- Create: `supabase/functions/_shared/crypto.ts`
- Create: `supabase/functions/_shared/tiktok-auth.ts`
- Create: `scripts/test-tiktok-shared.mjs`

**Interfaces:**
- Consumes: `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_TOKEN_ENCRYPTION_KEY_B64` from `Deno.env`.
- Produces:
  - `getSupabaseAdmin(): SupabaseClient`
  - `sha256Hex(value:string): Promise<string>`
  - `encryptSecret(plaintext:string): Promise<string>`
  - `decryptSecret(ciphertext:string): Promise<string>`
  - `exchangeAuthCode(authCode:string): Promise<TikTokTokenData>`
  - `refreshSellerToken(refreshToken:string): Promise<TikTokTokenData>`
  - `getAuthorizedShops(accessToken:string): Promise<TikTokShop[]>`

- [ ] **Step 1: Write failing contract tests**

Assert source contains pinned `@supabase/supabase-js`, AES-GCM, random IV, SHA-256, the official token URLs, `grant_type=authorized_code`, `grant_type=refresh_token`, `user_type`, and `/authorization/202309/shops`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-tiktok-shared.mjs`

Expected: FAIL because shared modules do not exist.

- [ ] **Step 3: Implement environment access**

Use `SUPABASE_SECRET_KEYS` first:

```ts
export function getAdminKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('supabase_secret_missing');
}
```

Never return secret values in errors.

- [ ] **Step 4: Implement AES-GCM token encryption**

Ciphertext format: `v1.<iv-base64url>.<ciphertext-base64url>`. The encryption key must decode to exactly 32 bytes. Use a new 12-byte random IV for every encryption operation.

- [ ] **Step 5: Implement TikTok auth calls**

Token exchange uses GET query parameters against `https://auth.tiktok-shops.com/api/v2/token/get`. Reject nonzero TikTok `code`, missing tokens, and `user_type !== 0`. Refresh performs the same validations. Authorized shops call the signed Open API client; if the signing helper is not yet implemented in this task, expose a narrow signer function in this module using the official HMAC-SHA256 algorithm and exact request path.

- [ ] **Step 6: Run contract + Deno compile checks**

Run:

```bash
node scripts/test-tiktok-shared.mjs
deno check supabase/functions/_shared/*.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared scripts/test-tiktok-shared.mjs
git commit -m "feat: add secure TikTok auth primitives"
```

---

### Task 4: Public OAuth callback endpoint

**Files:**
- Create: `supabase/functions/tiktok-shop-oauth-callback/index.ts`
- Create: `scripts/test-oauth-callback.mjs`

**Interfaces:**
- Consumes: query parameters `code` and `state`; shared auth/crypto helpers; OAuth state and connection tables.
- Produces: HTTPS redirect endpoint at `/functions/v1/tiktok-shop-oauth-callback`.

- [ ] **Step 1: Write failing callback contract**

Required assertions:

```js
assert.match(code,/req\.method\s*!==\s*['"]GET['"]/);
assert.match(code,/state/i);
assert.match(code,/state_hash/i);
assert.match(code,/used_at/i);
assert.match(code,/exchangeAuthCode/i);
assert.match(code,/user_type/i);
assert.match(code,/getAuthorizedShops/i);
assert.match(code,/encryptSecret/i);
assert.doesNotMatch(code,/access_token\s*:/i);
assert.doesNotMatch(code,/refresh_token\s*:/i);
```

- [ ] **Step 2: Run RED**

Run: `node scripts/test-oauth-callback.mjs`

Expected: FAIL because function does not exist.

- [ ] **Step 3: Implement safe health behavior**

`GET` with no `code` and no OAuth error returns HTTP 200 HTML/text: `ITUFARNA TikTok Shop OAuth callback ready`. This makes the Redirect URL safe to register before app credentials exist.

- [ ] **Step 4: Implement real callback behavior**

When `code` is present:

1. require `state`;
2. hash state with SHA-256;
3. read exactly one unused state row whose `expires_at > now()`;
4. atomically mark it `used_at` before token persistence;
5. exchange `code` for tokens;
6. require `user_type = 0`;
7. persist `granted_scopes`;
8. require `seller.authorization.info` before continuing;
9. call Get Authorized Shops;
10. require exactly one active shop for this first version;
11. encrypt both tokens;
12. upsert singleton connection with shop ID/cipher/name/region, expiry timestamps and status `active`;
13. return a success page that contains no token, secret, full payload or sensitive identifiers.

OAuth-denied responses must return a non-secret explanatory page and must not create/update a connection.

- [ ] **Step 5: Run GREEN and compile**

```bash
node scripts/test-oauth-callback.mjs
deno check supabase/functions/tiktok-shop-oauth-callback/index.ts
```

Expected: PASS.

- [ ] **Step 6: Deploy callback with `verify_jwt=false`**

Expected deployed URL:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/tiktok-shop-oauth-callback`

- [ ] **Step 7: Verify live health without OAuth credentials**

Invoke the deployed function with HTTP GET and no query string. Expected HTTP 200 and the exact readiness message. This verification is required before telling the user to paste the URL into Partner Center.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/tiktok-shop-oauth-callback scripts/test-oauth-callback.mjs
git commit -m "feat: add TikTok seller OAuth callback"
```

---

### Task 5: OAuth start/state endpoint

**Files:**
- Create: `supabase/functions/tiktok-shop-oauth-start/index.ts`
- Create: `scripts/test-oauth-start.mjs`

**Interfaces:**
- Consumes: `TIKTOK_SELLER_AUTHORIZATION_URL` and Postgres state table.
- Produces: a short-lived single-use seller authorization URL containing a cryptographically random `state`.

- [ ] **Step 1: Write failing contract**

Require random state generation, SHA-256 persistence, 10-minute expiry, raw state never persisted, and authorization URL construction that preserves existing TikTok Partner Center query parameters while adding/replacing only `state`.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-oauth-start.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement**

Generate 32 random bytes, encode base64url, persist only the SHA-256 hash with `expires_at = now() + 10 minutes`, and return/redirect to the configured Partner Center authorization URL with `state=<raw-state>`.

If `TIKTOK_SELLER_AUTHORIZATION_URL` is not configured yet, return HTTP 503 with code `seller_authorization_url_not_configured`; never fabricate an authorization URL.

- [ ] **Step 4: Run GREEN + compile**

```bash
node scripts/test-oauth-start.mjs
deno check supabase/functions/tiktok-shop-oauth-start/index.ts
```

Expected: PASS.

- [ ] **Step 5: Deploy**

Deploy with `verify_jwt=false`. This endpoint is not linked publicly from the UI until the seller authorization link has been saved as a Function Secret.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/tiktok-shop-oauth-start scripts/test-oauth-start.mjs
git commit -m "feat: add TikTok OAuth state starter"
```

---

### Task 6: Production verification and operator handoff

**Files:**
- Modify: `README.md`
- Create: `docs/operations/tiktok-partner-center-setup.md`

**Interfaces:**
- Consumes: deployed callback/start functions, current Supabase secrets and TikTok Partner Center app.
- Produces: deterministic operator steps for registering Redirect URL and completing the first seller authorization.

- [ ] **Step 1: Verify deployed functions list**

Confirm both functions are ACTIVE and callback has `verify_jwt=false`.

- [ ] **Step 2: Verify database security**

Check RLS is enabled and `anon`/`authenticated` have no table privileges/policies on the two OAuth tables.

- [ ] **Step 3: Run security + performance advisors**

Record only findings introduced by ITUFARNA; do not claim unrelated legacy findings are fixed.

- [ ] **Step 4: Verify callback live health again**

Expected HTTP 200 before handing the URL to the user.

- [ ] **Step 5: Document manual secret step**

The user must obtain App Key/App Secret from TikTok Partner Center and place them in Supabase Edge Function Secrets. Required names:

```text
TIKTOK_SHOP_APP_KEY
TIKTOK_SHOP_APP_SECRET
TIKTOK_TOKEN_ENCRYPTION_KEY_B64
TIKTOK_SELLER_AUTHORIZATION_URL
```

The encryption key must be generated as 32 random bytes and base64 encoded. Never ask the user to paste App Secret into public GitHub issues, source files, screenshots, or chat unless a secure secret-input tool is available.

- [ ] **Step 6: Commit docs**

```bash
git add README.md docs/operations/tiktok-partner-center-setup.md
git commit -m "docs: add TikTok Partner Center setup runbook"
```

- [ ] **Step 7: Open PR and verify CI**

PR title: `TikTok Shop OAuth bootstrap`.

Required green checks:

- no-secrets contract;
- OAuth schema contract;
- shared TikTok auth contract;
- callback contract;
- start endpoint contract;
- Deno compile check.

Only after these pass, merge to `main`.
