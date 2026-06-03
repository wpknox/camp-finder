# Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CampFinder's broken/insecure auth with an httpOnly-cookie session model: a guest can browse; a user can register, log in, stay logged in across the 1-hour token expiry (silent refresh), see an `/account` page, and sign out — with the session token never exposed to client JavaScript.

**Architecture:** The browser never holds a token. SvelteKit server routes (`/api/auth/*`) proxy Teenybase auth and set two httpOnly cookies (`cf_access`, `cf_refresh`). `hooks.server.ts` reads `cf_access` on every request, decodes the JWT for identity + expiry, and silently refreshes via Teenybase `/refresh-token` when the access token is expired. Pages read `event.locals.user`.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes, `adapter-cloudflare`), Vitest (added in Task 1), Teenybase REST auth API.

**Companion spec:** `docs/superpowers/specs/2026-06-02-auth-ratings-design.md`

**Backend auth contracts (verified against the running backend):**
- `POST {PUBLIC_TB_URL}/api/v1/table/users/auth/sign-up` body `{username, name, email, password, passwordConfirm}` → `{token, refresh_token, record}`
- `POST .../auth/login-password` body `{identity, password}` (identity = email **or** username) → `{token, refresh_token, record}`
- `POST .../auth/refresh-token` header `Authorization: Bearer <access>` + body `{refresh_token}` → `{token, refresh_token, record}` (refresh token rotates)
- `POST .../auth/logout` header `Authorization: Bearer <access>` + body `{}` → `{success:true}`
- Access JWT payload claims: `{ id, user, sub, sid, verified, iat, exp, iss }` where `id` = user record id, `user` = username, `sub` = email.
- `username` must match `^[a-zA-Z][a-zA-Z0-9_]*$`, ≤32 chars, unique.

**Cookie model:** Both cookies use a 30-day **cookie** lifetime so the (now-stale) access token is still sent to `/refresh-token` after the JWT's 1-hour `exp`. Token *validity* is judged by the JWT `exp` claim, not the cookie lifetime. Cookie options: `{ httpOnly: true, secure: !dev, sameSite: 'lax', path: '/' }`.

**`locals.user` shape:** `{ id: string; username: string; email: string } | null` (display `name` is not in the JWT; the `/account` page fetches it separately).

---

### Task 1: Add Vitest to the frontend

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/lib/server/__tests__/smoke.test.ts`

- [ ] **Step 1: Install Vitest as a dev dependency**

Run (from repo root):
```bash
cd frontend && pnpm add -D vitest@^2.0.0
```

- [ ] **Step 2: Add a `test` script to `frontend/package.json`**

In the `"scripts"` block, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `frontend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 4: Create a smoke test `frontend/src/lib/server/__tests__/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd frontend && pnpm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/vitest.config.ts frontend/src/lib/server/__tests__/smoke.test.ts ../pnpm-lock.yaml
git commit -m "test(frontend): add vitest for server-side unit tests"
```
(If the root lockfile path differs, just `git add` the lockfile that actually changed.)

---

### Task 2: Input validators

**Files:**
- Create: `frontend/src/lib/server/auth/validate.ts`
- Test: `frontend/src/lib/server/auth/validate.test.ts`

- [ ] **Step 1: Write the failing test `validate.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { validateEmail, validatePassword } from './validate'

describe('validateEmail', () => {
  it('accepts a normal email', () => {
    expect(validateEmail('alex@example.com')).toBe(true)
  })
  it('rejects missing @ or domain', () => {
    expect(validateEmail('alex')).toBe(false)
    expect(validateEmail('alex@')).toBe(false)
    expect(validateEmail('alex@example')).toBe(false)
    expect(validateEmail('')).toBe(false)
  })
})

describe('validatePassword', () => {
  it('accepts 8+ chars', () => {
    expect(validatePassword('hunter22')).toEqual({ ok: true })
  })
  it('rejects shorter than 8', () => {
    const r = validatePassword('short')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/8/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/lib/server/auth/validate.test.ts`
Expected: FAIL — cannot find module `./validate`.

- [ ] **Step 3: Implement `validate.ts`**

```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

export function validatePassword(password: string): { ok: boolean; error?: string } {
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && pnpm test src/lib/server/auth/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/auth/validate.ts frontend/src/lib/server/auth/validate.test.ts
git commit -m "feat(auth): email + password validators"
```

---

### Task 3: Username derivation

**Files:**
- Create: `frontend/src/lib/server/auth/username.ts`
- Test: `frontend/src/lib/server/auth/username.test.ts`

Teenybase requires `username` to match `^[a-zA-Z][a-zA-Z0-9_]*$`, ≤32 chars, and be unique. The user never sees it; we derive it from the email local-part (falling back to the display name), then append a random suffix for uniqueness. The suffix generator is injectable so tests are deterministic.

- [ ] **Step 1: Write the failing test `username.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { deriveUsername } from './username'

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/

describe('deriveUsername', () => {
  it('derives from email local-part and matches the charset rule', () => {
    const u = deriveUsername('Alex.Smith@example.com', 'Alex', () => 'a3f9')
    expect(u).toBe('alexsmith_a3f9')
    expect(USERNAME_RE.test(u)).toBe(true)
  })
  it('falls back to display name when local-part has no letters/digits', () => {
    const u = deriveUsername('___@example.com', 'Trail Boss', () => 'b2c1')
    expect(u).toBe('trailboss_b2c1')
    expect(USERNAME_RE.test(u)).toBe(true)
  })
  it('prefixes a letter when the base would start with a digit', () => {
    const u = deriveUsername('123@example.com', '42', () => 'zz')
    expect(USERNAME_RE.test(u)).toBe(true)
    expect(u.startsWith('u')).toBe(true)
  })
  it('never exceeds 32 chars', () => {
    const u = deriveUsername('a'.repeat(60) + '@example.com', 'x', () => 'beef')
    expect(u.length).toBeLessThanOrEqual(32)
    expect(USERNAME_RE.test(u)).toBe(true)
    expect(u.endsWith('_beef')).toBe(true)
  })
  it('always produces a valid username for arbitrary unicode input', () => {
    const u = deriveUsername('日本語@example.com', '日本語', () => 'c0de')
    expect(USERNAME_RE.test(u)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/lib/server/auth/username.test.ts`
Expected: FAIL — cannot find module `./username`.

- [ ] **Step 3: Implement `username.ts`**

```ts
/** Default random suffix: 4 lowercase-hex-ish chars. */
function defaultSuffix(): string {
  return Math.random().toString(36).slice(2, 6)
}

/**
 * Derive a Teenybase-legal username (^[a-zA-Z][a-zA-Z0-9_]*$, <=32) that the
 * user never sees. Built from the email local-part, falling back to the display
 * name, with a random suffix appended for uniqueness.
 */
export function deriveUsername(
  email: string,
  name: string,
  suffixFn: () => string = defaultSuffix,
): string {
  const localPart = email.split('@')[0] ?? ''
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

  let base = clean(localPart)
  if (!base) base = clean(name)
  if (!base) base = 'user'
  if (!/^[a-z]/.test(base)) base = 'u' + base

  const suffix = suffixFn().toLowerCase().replace(/[^a-z0-9]/g, '') || 'x'
  const maxBase = 32 - (suffix.length + 1) // +1 for the underscore
  base = base.slice(0, maxBase)

  return `${base}_${suffix}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && pnpm test src/lib/server/auth/username.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/auth/username.ts frontend/src/lib/server/auth/username.test.ts
git commit -m "feat(auth): derive teenybase-legal hidden username"
```

---

### Task 4: In-memory rate limiter

**Files:**
- Create: `frontend/src/lib/server/auth/rateLimit.ts`
- Test: `frontend/src/lib/server/auth/rateLimit.test.ts`

In-memory sliding window. Fine for single-instance dev; production on Workers should swap in KV/Durable Object (noted as out-of-scope follow-up in the spec). `now()` is injectable for deterministic tests.

- [ ] **Step 1: Write the failing test `rateLimit.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { createRateLimiter } from './rateLimit'

describe('createRateLimiter', () => {
  it('allows up to max within the window, then blocks', () => {
    let t = 1000
    const rl = createRateLimiter({ max: 3, windowMs: 10_000, now: () => t })
    expect(rl.check('ip1').allowed).toBe(true)
    expect(rl.check('ip1').allowed).toBe(true)
    expect(rl.check('ip1').allowed).toBe(true)
    const blocked = rl.check('ip1')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })

  it('tracks keys independently', () => {
    let t = 0
    const rl = createRateLimiter({ max: 1, windowMs: 1000, now: () => t })
    expect(rl.check('a').allowed).toBe(true)
    expect(rl.check('b').allowed).toBe(true)
    expect(rl.check('a').allowed).toBe(false)
  })

  it('frees up after the window passes', () => {
    let t = 0
    const rl = createRateLimiter({ max: 1, windowMs: 1000, now: () => t })
    expect(rl.check('a').allowed).toBe(true)
    expect(rl.check('a').allowed).toBe(false)
    t = 1001
    expect(rl.check('a').allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/lib/server/auth/rateLimit.test.ts`
Expected: FAIL — cannot find module `./rateLimit`.

- [ ] **Step 3: Implement `rateLimit.ts`**

```ts
interface RateLimiterOptions {
  max: number
  windowMs: number
  now?: () => number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterMs?: number
}

export function createRateLimiter({ max, windowMs, now = Date.now }: RateLimiterOptions) {
  const hits = new Map<string, number[]>()

  return {
    check(key: string): RateLimitResult {
      const t = now()
      const cutoff = t - windowMs
      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff)

      if (recent.length >= max) {
        const retryAfterMs = recent[0] + windowMs - t
        hits.set(key, recent)
        return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) }
      }

      recent.push(t)
      hits.set(key, recent)
      return { allowed: true }
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && pnpm test src/lib/server/auth/rateLimit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/auth/rateLimit.ts frontend/src/lib/server/auth/rateLimit.test.ts
git commit -m "feat(auth): in-memory sliding-window rate limiter"
```

---

### Task 5: JWT payload decode

**Files:**
- Create: `frontend/src/lib/server/auth/jwt.ts`
- Test: `frontend/src/lib/server/auth/jwt.test.ts`

We decode (not verify) the access JWT to read identity + `exp`. Verification is unnecessary because the token came from our own httpOnly cookie, and Teenybase re-validates the Bearer on every privileged write.

- [ ] **Step 1: Write the failing test `jwt.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { decodeJwtPayload, isExpired } from './jwt'

// Build a fake JWT: header.payload.signature (only payload matters here).
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`
}

describe('decodeJwtPayload', () => {
  it('extracts id, user, sub, exp', () => {
    const tok = makeJwt({ id: 'abc', user: 'alex_a3f9', sub: 'a@b.com', exp: 1780457209 })
    const p = decodeJwtPayload(tok)
    expect(p).toEqual({ id: 'abc', user: 'alex_a3f9', sub: 'a@b.com', exp: 1780457209 })
  })
  it('returns null on malformed token', () => {
    expect(decodeJwtPayload('garbage')).toBeNull()
    expect(decodeJwtPayload('')).toBeNull()
  })
})

describe('isExpired', () => {
  it('true when exp is in the past', () => {
    expect(isExpired({ exp: 1000 } as any, () => 2000_000)).toBe(true)
  })
  it('false when exp is comfortably in the future', () => {
    expect(isExpired({ exp: 5000 } as any, () => 1000_000 / 1000)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test src/lib/server/auth/jwt.test.ts`
Expected: FAIL — cannot find module `./jwt`.

- [ ] **Step 3: Implement `jwt.ts`**

```ts
export interface JwtPayload {
  id: string
  user: string
  sub: string
  exp: number
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (!json || typeof json.id !== 'string' || typeof json.exp !== 'number') return null
    return { id: json.id, user: json.user, sub: json.sub, exp: json.exp }
  } catch {
    return null
  }
}

/** exp is in seconds (JWT standard). `nowSeconds` returns current epoch seconds. */
export function isExpired(
  payload: JwtPayload,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  skewSeconds = 30,
): boolean {
  return payload.exp <= nowSeconds() + skewSeconds
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && pnpm test src/lib/server/auth/jwt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/auth/jwt.ts frontend/src/lib/server/auth/jwt.test.ts
git commit -m "feat(auth): decode access JWT payload for identity + expiry"
```

---

### Task 6: Teenybase auth client + cookie/session helpers

**Files:**
- Create: `frontend/src/lib/server/auth/tbAuth.ts`
- Create: `frontend/src/lib/server/auth/session.ts`

No new tests here — these are thin I/O wrappers exercised by the route and hook tasks. `tbAuth.ts` wraps the four verified endpoints; `session.ts` centralizes cookie names + options.

- [ ] **Step 1: Create `tbAuth.ts`**

```ts
import { PUBLIC_TB_URL } from '$env/static/public'

const AUTH = `${PUBLIC_TB_URL}/api/v1/table/users/auth`

export interface TbAuthResult {
  token: string
  refresh_token: string
  record: { id: string; username: string; email: string; name?: string }
}

async function call(path: string, body: unknown, bearer?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  return fetch(`${AUTH}/${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
}

export async function tbSignUp(input: {
  username: string; name: string; email: string; password: string
}): Promise<{ ok: boolean; status: number }> {
  const res = await call('sign-up', { ...input, passwordConfirm: input.password })
  return { ok: res.ok, status: res.status }
}

export async function tbLogin(identity: string, password: string): Promise<TbAuthResult | null> {
  const res = await call('login-password', { identity, password })
  if (!res.ok) return null
  return res.json()
}

export async function tbRefresh(accessToken: string, refreshToken: string): Promise<TbAuthResult | null> {
  const res = await call('refresh-token', { refresh_token: refreshToken }, accessToken)
  if (!res.ok) return null
  return res.json()
}

export async function tbLogout(accessToken: string): Promise<void> {
  try {
    await call('logout', {}, accessToken)
  } catch {
    // best-effort; cookies are cleared regardless
  }
}
```

- [ ] **Step 2: Create `session.ts`**

```ts
import { dev } from '$app/environment'
import type { Cookies } from '@sveltejs/kit'

export const ACCESS_COOKIE = 'cf_access'
export const REFRESH_COOKIE = 'cf_refresh'

// 30-day COOKIE lifetime so the (stale) access token is still sent to
// /refresh-token after the JWT's 1-hour exp. Token validity is judged by the
// JWT exp claim, not the cookie lifetime.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function opts() {
  return {
    httpOnly: true,
    secure: !dev,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  }
}

export function setSession(cookies: Cookies, accessToken: string, refreshToken: string): void {
  cookies.set(ACCESS_COOKIE, accessToken, opts())
  cookies.set(REFRESH_COOKIE, refreshToken, opts())
}

export function clearSession(cookies: Cookies): void {
  cookies.delete(ACCESS_COOKIE, { path: '/' })
  cookies.delete(REFRESH_COOKIE, { path: '/' })
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors (note: `$env/static/public` requires `PUBLIC_TB_URL` to be set in `frontend/.env`; it already is per the handoff).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/server/auth/tbAuth.ts frontend/src/lib/server/auth/session.ts
git commit -m "feat(auth): teenybase auth client + httpOnly cookie helpers"
```

---

### Task 7: `hooks.server.ts` — populate `locals.user`, silent refresh

**Files:**
- Create: `frontend/src/hooks.server.ts`
- Modify: `frontend/src/app.d.ts`

- [ ] **Step 1: Declare `locals.user` in `app.d.ts`**

Replace the `App.Locals` interface (inside `declare global { namespace App { ... } }`) with:
```ts
interface Locals {
  user: { id: string; username: string; email: string } | null
}
```
(If `app.d.ts` only has the default empty `interface Locals {}`, replace that line.)

- [ ] **Step 2: Create `hooks.server.ts`**

```ts
import type { Handle } from '@sveltejs/kit'
import { ACCESS_COOKIE, REFRESH_COOKIE, setSession, clearSession } from '$lib/server/auth/session'
import { decodeJwtPayload, isExpired } from '$lib/server/auth/jwt'
import { tbRefresh } from '$lib/server/auth/tbAuth'

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null

  const access = event.cookies.get(ACCESS_COOKIE)
  const refresh = event.cookies.get(REFRESH_COOKIE)

  if (access) {
    const payload = decodeJwtPayload(access)

    if (payload && !isExpired(payload)) {
      event.locals.user = { id: payload.id, username: payload.user, email: payload.sub }
    } else if (refresh) {
      // Access token expired (or unreadable) — try silent refresh.
      const refreshed = await tbRefresh(access, refresh)
      if (refreshed) {
        setSession(event.cookies, refreshed.token, refreshed.refresh_token)
        event.locals.user = {
          id: refreshed.record.id,
          username: refreshed.record.username,
          email: refreshed.record.email,
        }
      } else {
        clearSession(event.cookies)
      }
    }
  }

  return resolve(event)
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Verify silent refresh manually (optional but recommended)**

Temporarily set `jwtTokenDuration: 60` in `backend/teenybase.ts`, then `cd backend && pnpm generate && pnpm migrate`. Log in (after Task 9/11 exist) — wait 90s, reload — you should stay logged in (new `cf_access` issued). **Revert `jwtTokenDuration` back to `3600` and migrate again** when done. If refresh fails with an expired access token, that's the one unverified contract assumption — capture the error and adjust (e.g. Teenybase may need the refresh token elsewhere); do not silently leave it broken.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks.server.ts frontend/src/app.d.ts
git commit -m "feat(auth): server hook reads cookie + silent refresh into locals.user"
```

---

### Task 8: `/api/auth/register` + `/api/auth/login` routes

**Files:**
- Create: `frontend/src/routes/api/auth/register/+server.ts`
- Create: `frontend/src/routes/api/auth/login/+server.ts`
- Create: `frontend/src/lib/server/auth/limiters.ts`

- [ ] **Step 1: Create shared limiters `limiters.ts`**

```ts
import { createRateLimiter } from './rateLimit'

// 10 attempts / 15 min per IP, shared across login + register.
export const authLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 })
```

- [ ] **Step 2: Create `register/+server.ts`**

```ts
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { validateEmail, validatePassword } from '$lib/server/auth/validate'
import { deriveUsername } from '$lib/server/auth/username'
import { tbSignUp, tbLogin } from '$lib/server/auth/tbAuth'
import { setSession } from '$lib/server/auth/session'
import { authLimiter } from '$lib/server/auth/limiters'

const GENERIC = 'Could not create account. Please try again.'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  if (!authLimiter.check(getClientAddress()).allowed) {
    return json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 })
  }

  const { email, name, password, passwordConfirm } = (await request.json()) as Record<string, string>

  if (!validateEmail(email ?? '')) return json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (!name?.trim()) return json({ error: 'Display name is required.' }, { status: 400 })
  const pw = validatePassword(password ?? '')
  if (!pw.ok) return json({ error: pw.error }, { status: 400 })
  if (password !== passwordConfirm) return json({ error: 'Passwords do not match.' }, { status: 400 })

  const username = deriveUsername(email, name)
  const created = await tbSignUp({ username, name: name.trim(), email, password })
  if (!created.ok) return json({ error: GENERIC }, { status: 400 })

  const auth = await tbLogin(email, password)
  if (!auth) return json({ error: GENERIC }, { status: 400 })

  setSession(cookies, auth.token, auth.refresh_token)
  return json({ user: { id: auth.record.id, username: auth.record.username, email: auth.record.email } }, { status: 201 })
}
```

- [ ] **Step 3: Create `login/+server.ts`**

```ts
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { tbLogin } from '$lib/server/auth/tbAuth'
import { setSession } from '$lib/server/auth/session'
import { authLimiter } from '$lib/server/auth/limiters'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  if (!authLimiter.check(getClientAddress()).allowed) {
    return json({ error: 'Too many attempts, try again in a few minutes.' }, { status: 429 })
  }

  const { email, password } = (await request.json()) as Record<string, string>
  const auth = await tbLogin(email ?? '', password ?? '')
  if (!auth) return json({ error: 'Invalid email or password.' }, { status: 401 })

  setSession(cookies, auth.token, auth.refresh_token)
  return json({ user: { id: auth.record.id, username: auth.record.username, email: auth.record.email } })
}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Verify with curl (backend + frontend dev servers running)**

```bash
# register
curl -i -c /tmp/cf_cookies.txt http://localhost:5173/api/auth/register -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"plan-test@example.com","name":"Plan Test","password":"hunter22","passwordConfirm":"hunter22"}'
```
Expected: `201`, a `Set-Cookie: cf_access=...; HttpOnly` and `cf_refresh=...; HttpOnly`, body `{"user":{...}}`. Then delete the test user via the service token (see handoff curl examples) to keep the DB clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/api/auth/register/+server.ts frontend/src/routes/api/auth/login/+server.ts frontend/src/lib/server/auth/limiters.ts
git commit -m "feat(auth): register + login proxy routes with httpOnly cookies"
```

---

### Task 9: `/api/auth/logout` + `/api/auth/me` + `+layout.server.ts`

**Files:**
- Create: `frontend/src/routes/api/auth/logout/+server.ts`
- Create: `frontend/src/routes/api/auth/me/+server.ts`
- Create: `frontend/src/routes/+layout.server.ts`

- [ ] **Step 1: Create `logout/+server.ts`**

```ts
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { ACCESS_COOKIE, clearSession } from '$lib/server/auth/session'
import { tbLogout } from '$lib/server/auth/tbAuth'

export const POST: RequestHandler = async ({ cookies }) => {
  const access = cookies.get(ACCESS_COOKIE)
  if (access) await tbLogout(access)
  clearSession(cookies)
  return json({ ok: true })
}
```

- [ ] **Step 2: Create `me/+server.ts`**

```ts
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
  return json({ user: locals.user })
}
```

- [ ] **Step 3: Create `+layout.server.ts`**

```ts
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals }) => {
  return { user: locals.user }
}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/api/auth/logout/+server.ts frontend/src/routes/api/auth/me/+server.ts frontend/src/routes/+layout.server.ts
git commit -m "feat(auth): logout + me routes; expose user via layout load"
```

---

### Task 10: Rewrite `authStore` (no token in client)

**Files:**
- Modify (rewrite): `frontend/src/lib/auth/authStore.ts`

The store no longer holds a token or calls Teenybase directly. It holds the user object and calls the SvelteKit `/api/auth/*` routes with `credentials: 'include'`. It is hydrated from layout data via `setUser`.

- [ ] **Step 1: Replace `authStore.ts` entirely**

```ts
import { writable, derived } from 'svelte/store'

export interface AuthUser { id: string; username: string; email: string }

function createAuthStore() {
  const { subscribe, set } = writable<AuthUser | null>(null)

  async function post(path: string, body: Record<string, string>) {
    const res = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Authentication failed')
    return data
  }

  return {
    subscribe,
    /** Hydrate from +layout data (called in +layout.svelte). */
    setUser(user: AuthUser | null) { set(user) },
    async login(email: string, password: string) {
      const data = await post('login', { email, password })
      set(data.user ?? null)
    },
    async register(email: string, name: string, password: string, passwordConfirm: string) {
      const data = await post('register', { email, name, password, passwordConfirm })
      set(data.user ?? null)
    },
    async logout() {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      set(null)
    },
  }
}

export const auth = createAuthStore()
export const isLoggedIn = derived(auth, ($u) => $u != null)
export const currentUser = derived(auth, ($u) => $u)
```

- [ ] **Step 2: Type-check (expect errors in callers — fixed in Tasks 11, 14, 15)**

Run: `cd frontend && pnpm check`
Expected: errors in `AuthModal.svelte`, `RatingsSection.svelte`, `SaveButton.svelte` (they use the old `$auth.model` / `$auth.token` / `auth.getToken`). These are rewritten in Task 11 (AuthModal), Task 14 (SaveButton), and Task 15 (RatingsSection). Note the count; proceed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/auth/authStore.ts
git commit -m "feat(auth): rewrite authStore to cookie-backed user (no client token)"
```

---

### Task 11: Rework `AuthModal` (email + display name + password + confirm)

**Files:**
- Modify (rewrite): `frontend/src/lib/auth/AuthModal.svelte`

- [ ] **Step 1: Replace `AuthModal.svelte` script + markup**

```svelte
<script lang="ts">
  import { auth } from "./authStore";

  let { onclose, onsuccess }: { onclose?: () => void; onsuccess?: () => void } = $props();

  let mode: "login" | "register" = $state("login");
  let email = $state("");
  let name = $state("");
  let password = $state("");
  let passwordConfirm = $state("");
  let error = $state("");
  let submitting = $state(false);

  async function submit() {
    error = "";
    if (mode === "register") {
      if (!name.trim()) { error = "Display name is required."; return; }
      if (password.length < 8) { error = "Password must be at least 8 characters."; return; }
      if (password !== passwordConfirm) { error = "Passwords do not match."; return; }
    }
    submitting = true;
    try {
      if (mode === "login") await auth.login(email, password);
      else await auth.register(email, name, password, passwordConfirm);
      onsuccess?.();
      onclose?.();
    } catch (e: any) {
      error = e?.message ?? "Authentication failed";
    } finally {
      submitting = false;
    }
  }
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onclose?.(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose?.(); }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
    <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>

    <input type="email" bind:value={email} placeholder="Email" autocomplete="email" />
    {#if mode === "register"}
      <input type="text" bind:value={name} placeholder="Display name" autocomplete="name" />
    {/if}
    <input type="password" bind:value={password} placeholder="Password" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} />
    {#if mode === "register"}
      <input type="password" bind:value={passwordConfirm} placeholder="Confirm password" autocomplete="new-password" />
    {/if}

    {#if error}<p class="error">{error}</p>{/if}

    <button class="primary" onclick={submit} disabled={submitting}>
      {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
    </button>

    <button class="toggle" onclick={() => { mode = mode === "login" ? "register" : "login"; error = ""; }}>
      {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
    </button>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 3000; display: grid; place-items: center; padding: 1rem; }
  .modal { background: white; border-radius: 12px; padding: 2rem; width: min(380px, 100%); display: flex; flex-direction: column; gap: 0.75rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  input { border: 1px solid #d1d5db; border-radius: 8px; padding: 0.6rem 0.85rem; font-size: 0.95rem; }
  .primary { background: #16a34a; color: white; border: none; border-radius: 8px; padding: 0.65rem; cursor: pointer; font-size: 0.95rem; font-weight: 600; }
  .primary:disabled { opacity: 0.6; cursor: default; }
  .toggle { background: none; border: none; color: #6b7280; font-weight: 400; font-size: 0.875rem; padding: 0; cursor: pointer; }
  .error { color: #dc2626; font-size: 0.85rem; margin: 0; }
</style>
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && pnpm check`
Expected: AuthModal errors gone. Remaining errors only in `RatingsSection.svelte` / `SaveButton.svelte` (Plan 2). Note the count.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/auth/AuthModal.svelte
git commit -m "feat(auth): AuthModal collects email + display name + confirm, with validation"
```

---

### Task 12: Top nav with Sign-in / Account menu

**Files:**
- Modify: `frontend/src/routes/+layout.svelte`
- Create: `frontend/src/lib/auth/AccountMenu.svelte`

- [ ] **Step 1: Create `AccountMenu.svelte`**

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth, currentUser } from "./authStore";

  let open = $state(false);

  async function signOut() {
    open = false;
    await auth.logout();
    await goto("/");
  }
</script>

<div class="account">
  <button class="trigger" onclick={() => (open = !open)} aria-expanded={open}>
    Account ▾
  </button>
  {#if open}
    <div class="menu" role="menu">
      <div class="who">{$currentUser?.email}</div>
      <a href="/account" role="menuitem" onclick={() => (open = false)}>My account</a>
      <button role="menuitem" onclick={signOut}>Sign out</button>
    </div>
  {/if}
</div>

<style>
  .account { position: relative; }
  .trigger { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.35rem 0.75rem; cursor: pointer; font-size: 0.85rem; }
  .menu { position: absolute; right: 0; top: calc(100% + 4px); background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); display: flex; flex-direction: column; min-width: 180px; z-index: 3500; overflow: hidden; }
  .who { padding: 0.5rem 0.75rem; font-size: 0.75rem; color: #6b7280; border-bottom: 1px solid #f3f4f6; overflow: hidden; text-overflow: ellipsis; }
  .menu a, .menu button { text-align: left; background: none; border: none; padding: 0.55rem 0.75rem; font-size: 0.875rem; cursor: pointer; color: #111827; text-decoration: none; }
  .menu a:hover, .menu button:hover { background: #f9fafb; }
</style>
```

- [ ] **Step 2: Rewrite `+layout.svelte` to add the nav + hydrate auth**

```svelte
<script lang="ts">
  import '../app.css'
  import { auth, isLoggedIn } from '$lib/auth/authStore'
  import AccountMenu from '$lib/auth/AccountMenu.svelte'
  import AuthModal from '$lib/auth/AuthModal.svelte'

  let { children, data } = $props()
  let showAuth = $state(false)

  // Hydrate the client auth store from server layout data on every load.
  $effect(() => { auth.setUser(data.user) })
</script>

<nav class="topnav">
  <a class="brand" href="/">🏕 CampFinder</a>
  {#if $isLoggedIn}
    <AccountMenu />
  {:else}
    <button class="signin" onclick={() => (showAuth = true)}>Sign in</button>
  {/if}
</nav>

<div class="app-shell">
  {@render children()}
</div>

{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} />
{/if}

<style>
  :global(body) { margin: 0; font-family: system-ui, sans-serif; }
  .topnav { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; border-bottom: 1px solid #e5e7eb; background: white; height: 48px; box-sizing: border-box; }
  .brand { font-weight: 700; font-size: 1rem; color: #166534; text-decoration: none; }
  .signin { background: #16a34a; color: white; border: none; border-radius: 8px; padding: 0.35rem 0.9rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
  /* App shell now sits below the 48px nav. */
  .app-shell { display: flex; height: calc(100dvh - 48px); overflow: hidden; }
  @media (max-width: 640px) {
    .topnav { padding: 0.5rem 0.75rem; }
    .brand { font-size: 0.9rem; }
  }
</style>
```

Note: the app shell height changed from `100dvh` to `calc(100dvh - 48px)` to make room for the nav. Verify the map still fills the area.

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: no new errors from these files.

- [ ] **Step 4: Verify in browser (Playwright or manual)**

Both dev servers running. Load `http://localhost:5173`:
1. Guest sees "Sign in" in the nav; map fills the area below the nav.
2. Click "Sign in" → modal; register a user → modal closes, nav shows "Account ▾".
3. Account ▾ → shows email + "My account" + "Sign out".
4. Confirm in DevTools → Application → Cookies: `cf_access` and `cf_refresh` are present and **HttpOnly**; `document.cookie` in the console does NOT include them.
5. Sign out → nav returns to "Sign in".
Delete the test user via the service token afterward.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/+layout.svelte frontend/src/lib/auth/AccountMenu.svelte
git commit -m "feat(auth): top nav with sign-in + account menu, hydrate from layout"
```

---

### Task 13: `/account` page shell (guarded)

**Files:**
- Create: `frontend/src/routes/account/+page.server.ts`
- Create: `frontend/src/routes/account/+page.svelte`

This is the account shell: guard + display name + email + sign out. Saved-campgrounds and reviews sections are added in **Plan 2** — here they're rendered as labeled "coming soon" placeholders so the page is coherent on its own.

- [ ] **Step 1: Create `+page.server.ts` (guard + fetch display name)**

```ts
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { PUBLIC_TB_URL } from '$env/static/public'
import { ACCESS_COOKIE } from '$lib/server/auth/session'

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user) throw redirect(303, '/')

  // The display name isn't in the JWT; fetch the user's own record.
  let name = ''
  const token = cookies.get(ACCESS_COOKIE)
  if (token) {
    const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/users/view/${locals.user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const rec = (await res.json()) as { name?: string }
      name = rec.name ?? ''
    }
  }

  return { account: { ...locals.user, name } }
}
```

Note: confirm the read endpoint shape — the verified pattern is `GET /api/v1/table/users/view/:id` (present in the API doc) guarded by `viewRule: auth.uid == id`. If `view/:id` returns a wrapper (e.g. `{ item: {...} }`), unwrap accordingly; adjust the `rec.name` access during the verify step.

- [ ] **Step 2: Create `+page.svelte`**

```svelte
<script lang="ts">
  import { auth } from "$lib/auth/authStore";
  import { goto } from "$app/navigation";

  let { data } = $props();

  async function signOut() {
    await auth.logout();
    await goto("/");
  }
</script>

<main class="account-page">
  <header>
    <h1>My Account</h1>
    <button class="signout" onclick={signOut}>Sign out</button>
  </header>

  <section class="profile">
    <div><span class="label">Display name</span><span>{data.account.name || "—"}</span></div>
    <div><span class="label">Email</span><span>{data.account.email}</span></div>
  </section>

  <section class="placeholder">
    <h2>Saved campgrounds</h2>
    <p class="muted">Your saved campgrounds will appear here.</p>
  </section>

  <section class="placeholder">
    <h2>My reviews</h2>
    <p class="muted">Reviews you've written will appear here.</p>
  </section>
</main>

<style>
  .account-page { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; width: 100%; overflow-y: auto; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { font-size: 1.4rem; margin: 0; }
  .signout { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.85rem; cursor: pointer; font-size: 0.85rem; }
  .profile { margin: 1.25rem 0 2rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .profile > div { display: flex; gap: 1rem; }
  .label { width: 120px; color: #6b7280; font-size: 0.875rem; }
  .placeholder h2 { font-size: 1rem; margin: 1.5rem 0 0.4rem; }
  .muted { color: #9ca3af; font-size: 0.9rem; margin: 0; }
</style>
```

Note: `/account` renders inside the layout's `.app-shell` (a flex row). Since this page is a single column, that's fine — it will sit beside nothing and scroll. If it looks cramped, that's acceptable for the shell; Plan 2 doesn't change the container.

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Verify**

- Logged out: visiting `http://localhost:5173/account` redirects to `/`.
- Logged in: shows display name + email + the two placeholder sections; "Sign out" works.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/account/+page.server.ts frontend/src/routes/account/+page.svelte
git commit -m "feat(auth): guarded /account page shell with profile + sign out"
```

---

### Task 14: `/api/saved` proxy + rework `SaveButton`

**Files:**
- Create: `frontend/src/routes/api/saved/+server.ts`
- Modify (rewrite): `frontend/src/lib/saved/SaveButton.svelte`

The save feature must keep working after the authStore change. Move it behind a cookie-based server proxy: identity from `locals.user`, Bearer from the cookie, `user_id` never trusted from the client. This also fixes the broken compound-`&&` WHERE (we list the user's own saves — scoped by their token — and filter by `facility_id` in the route).

- [ ] **Step 1: Create `api/saved/+server.ts`**

```ts
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { PUBLIC_TB_URL } from '$env/static/public'
import { ACCESS_COOKIE } from '$lib/server/auth/session'

const TB = `${PUBLIC_TB_URL}/api/v1/table/saved_campgrounds`

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

/** GET /api/saved            → all of the user's saves
 *  GET /api/saved?facilityId= → { saved, id } for one facility */
export const GET: RequestHandler = async ({ locals, cookies, url }) => {
  if (!locals.user) return json({ error: 'Unauthenticated' }, { status: 401 })
  const token = cookies.get(ACCESS_COOKIE)!
  const res = await fetch(`${TB}/list`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ where: `user_id == '${locals.user.id}'`, limit: 1000 }),
  })
  const data = (await res.json()) as { items?: Array<{ id: string; facility_id: string; personal_notes?: string }> }
  const items = data.items ?? []
  const facilityId = url.searchParams.get('facilityId')
  if (facilityId) {
    const match = items.find((i) => i.facility_id === facilityId)
    return json({ saved: !!match, id: match?.id ?? null })
  }
  return json(items)
}

export const POST: RequestHandler = async ({ locals, cookies, request }) => {
  if (!locals.user) return json({ error: 'Unauthenticated' }, { status: 401 })
  const token = cookies.get(ACCESS_COOKIE)!
  const { facility_id, personal_notes } = (await request.json()) as Record<string, string>
  if (!facility_id) return json({ error: 'facility_id required' }, { status: 400 })
  const res = await fetch(`${TB}/insert`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ values: { user_id: locals.user.id, facility_id, personal_notes: personal_notes ?? '' } }),
  })
  const data = await res.json()
  return json(data, { status: res.ok ? 201 : res.status })
}

export const DELETE: RequestHandler = async ({ locals, cookies, request }) => {
  if (!locals.user) return json({ error: 'Unauthenticated' }, { status: 401 })
  const token = cookies.get(ACCESS_COOKIE)!
  const { id } = (await request.json()) as Record<string, string>
  if (!id) return json({ error: 'id required' }, { status: 400 })
  // saved_campgrounds deleteRule (auth.uid == user_id) ensures users only delete their own.
  const res = await fetch(`${TB}/delete`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ where: `id == '${id}'` }),
  })
  return json({ ok: res.ok }, { status: res.ok ? 200 : res.status })
}
```

- [ ] **Step 2: Rewrite `SaveButton.svelte`**

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { isLoggedIn } from "$lib/auth/authStore";
  import AuthModal from "$lib/auth/AuthModal.svelte";

  let { facilityId }: { facilityId: string } = $props();

  let saved = $state(false);
  let savedRecordId: string | null = $state(null);
  let showAuth = $state(false);
  let busy = $state(false);

  async function refresh() {
    if (!$isLoggedIn) { saved = false; savedRecordId = null; return; }
    const res = await fetch(`/api/saved?facilityId=${encodeURIComponent(facilityId)}`, { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { saved: boolean; id: string | null };
    saved = data.saved;
    savedRecordId = data.id;
  }

  onMount(refresh);
  // Re-check whenever login state flips (e.g. after signing in via the modal).
  $effect(() => { void $isLoggedIn; refresh(); });

  async function toggle() {
    if (!$isLoggedIn) { showAuth = true; return; }
    busy = true;
    try {
      if (saved && savedRecordId) {
        await fetch("/api/saved", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: savedRecordId }),
        });
        saved = false; savedRecordId = null;
      } else {
        const rec = (await fetch("/api/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ facility_id: facilityId }),
        }).then((r) => r.json())) as { id?: string };
        saved = true; savedRecordId = rec.id ?? null;
      }
    } finally {
      busy = false;
    }
  }
</script>

<button class="save-btn" class:saved onclick={toggle} disabled={busy}>
  {saved ? "★ Saved" : "☆ Save"}
</button>

{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} onsuccess={refresh} />
{/if}

<style>
  .save-btn { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 0.4rem 0.85rem; cursor: pointer; font-size: 0.85rem; }
  .save-btn.saved { background: #fef9c3; border-color: #fbbf24; }
  .save-btn:disabled { opacity: 0.6; cursor: default; }
</style>
```

Note: the un-save **confirmation dialog** is added in Plan 2 (ConfirmDialog). Here, un-save is immediate.

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: `SaveButton.svelte` errors gone; only `RatingsSection.svelte` errors remain (fixed in Task 15).

- [ ] **Step 4: Verify (both servers running, logged in)**

Open a campground detail panel → click Save → button shows "★ Saved"; reload → still saved. Click again → "☆ Save". Logged out → clicking Save opens the auth modal. Confirm via the `saved_campgrounds` table (handoff curl) that a row was created/removed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/api/saved/+server.ts frontend/src/lib/saved/SaveButton.svelte
git commit -m "feat(auth): cookie-based /api/saved proxy + SaveButton rework"
```

---

### Task 15: Cookie-based `/api/ratings` rework + `RatingsSection` compile-fix

**Files:**
- Modify (rewrite): `frontend/src/routes/api/ratings/[facilityId]/+server.ts`
- Modify: `frontend/src/lib/detail/RatingsSection.svelte`

The review write path must work with cookie auth and no client-supplied `user_id`. POST becomes an **upsert** (one review per user per facility): list the facility's reviews (public read), find the caller's existing row, then edit it or insert a new one — `user_id` from `locals.user.id`. Add DELETE for a user's own review. The `RatingsSection` change here is a **minimal compile-fix** keeping its current inline UI; Plan 2 replaces this component with the compact summary + reviews modal.

- [ ] **Step 1: Rewrite `api/ratings/[facilityId]/+server.ts`**

```ts
import { json } from '@sveltejs/kit'
import { PUBLIC_TB_URL } from '$env/static/public'
import { ACCESS_COOKIE } from '$lib/server/auth/session'
import type { RequestHandler } from './$types'

const TB = `${PUBLIC_TB_URL}/api/v1/table/ratings`

interface RatingRow { id: string; user_id: string; facility_id: string; score: number; notes: string; visited_at: string }

async function listForFacility(facilityId: string): Promise<RatingRow[]> {
  const res = await fetch(`${TB}/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `facility_id == '${facilityId}'`, order: 'created desc', limit: 200 }),
  })
  const data = (await res.json()) as { items?: RatingRow[] }
  return data.items ?? []
}

// Public read — anyone (incl. guests) can read reviews.
export const GET: RequestHandler = async ({ params }) => {
  return json(await listForFacility(params.facilityId))
}

// Authenticated upsert — one review per (user, facility).
export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
  if (!locals.user) return json({ error: 'Unauthenticated' }, { status: 401 })
  const token = cookies.get(ACCESS_COOKIE)!
  const { score, notes, visited_at } = (await request.json()) as Record<string, unknown>
  const n = Number(score)
  if (!n || n < 1 || n > 5) return json({ error: 'Score must be 1–5' }, { status: 400 })

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const existing = (await listForFacility(params.facilityId)).find((r) => r.user_id === locals.user!.id)
  const values = {
    facility_id: params.facilityId,
    user_id: locals.user.id,
    score: n,
    notes: (notes as string) ?? '',
    visited_at: (visited_at as string) ?? '',
  }

  const res = existing
    ? await fetch(`${TB}/edit/${existing.id}`, { method: 'POST', headers, body: JSON.stringify(values) })
    : await fetch(`${TB}/insert`, { method: 'POST', headers, body: JSON.stringify({ values }) })

  const data = await res.json()
  return json(data, { status: res.ok ? (existing ? 200 : 201) : res.status })
}

// Delete the caller's own review for this facility.
export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
  if (!locals.user) return json({ error: 'Unauthenticated' }, { status: 401 })
  const token = cookies.get(ACCESS_COOKIE)!
  const mine = (await listForFacility(params.facilityId)).find((r) => r.user_id === locals.user!.id)
  if (!mine) return json({ ok: true })
  const res = await fetch(`${TB}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ where: `id == '${mine.id}'` }),
  })
  return json({ ok: res.ok }, { status: res.ok ? 200 : res.status })
}
```

- [ ] **Step 2: Minimal compile-fix to `RatingsSection.svelte`**

In the `<script>`: remove `import { auth }` usage of `model`/`token`. Replace the import line and the `submit` function:

Replace:
```ts
  import { auth } from "$lib/auth/authStore";
```
with:
```ts
  import { isLoggedIn } from "$lib/auth/authStore";
```

Replace the `submit` function body with:
```ts
  async function submit() {
    if (!$isLoggedIn) { showAuth = true; return; }
    if (score < 1 || score > 5) return;
    submitting = true;
    await fetch(`/api/ratings/${facilityId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ score, notes, visited_at }),
    });
    score = 0;
    notes = "";
    visited_at = "";
    await loadRatings();
    submitting = false;
  }
```

In the markup, replace the two `$auth.model` references in the submit button label with `$isLoggedIn`:
```svelte
    <button class="submit-btn" onclick={submit} disabled={submitting || score === 0}>
      {$isLoggedIn ? (submitting ? "Submitting…" : "Submit review") : "Sign in to review"}
    </button>
```

And pass `onsuccess` to the AuthModal so a review can resume after login:
```svelte
{#if showAuth}
  <AuthModal onclose={() => (showAuth = false)} onsuccess={() => { showAuth = false; }} />
{/if}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm check`
Expected: **0 errors, 0 warnings** (all old-store references are gone).

- [ ] **Step 4: Verify (both servers running)**

- Logged in: open a campground → leave a review → it appears; submit again with a different score → still **one** review by you, updated (upsert). 
- Logged out: the form's button reads "Sign in to review" and opens the modal.
- Guest can still see existing reviews (GET is public).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/api/ratings/[facilityId]/+server.ts frontend/src/lib/detail/RatingsSection.svelte
git commit -m "feat(auth): cookie-based ratings upsert/delete proxy + RatingsSection fix"
```

---

### Task 16: End-to-end verification of the auth foundation

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `cd frontend && pnpm test`
Expected: all pass (validate, username, rateLimit, jwt, smoke).

- [ ] **Step 2: Type-check the whole app**

Run: `cd frontend && pnpm check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Playwright E2E happy path (both servers running)**

Using the Playwright MCP tools (as with the search UX verification):
1. Navigate to `http://localhost:5173`; confirm "Sign in" in nav.
2. Open modal → register `e2e-<timestamp>@example.com` / display name / password.
3. Confirm nav shows "Account ▾"; `evaluate` that `document.cookie` does **not** contain `cf_access`/`cf_refresh`.
4. Open a campground detail panel → Save → confirm "★ Saved"; leave a review → confirm it appears; submit a second review with a different score → confirm still **one** review by you (updated).
5. Navigate to `/account`; confirm email shows.
6. Sign out; confirm nav reverts and `/account` now redirects to `/`.
7. As a guest, open the same campground → confirm the review is still readable (public GET) but the review button reads "Sign in to review" and Save opens the modal.
8. Log back in with the same credentials; confirm success.

- [ ] **Step 4: Clean up the E2E test user**

Delete the created user via the service token (handoff curl example: `POST /api/v1/table/users/delete` with `where: username == '...'`), and remove any test review/save rows it created. Verify `users` count is back to its prior value.

- [ ] **Step 5: Update handoff doc**

In `docs/handoff.md`, under the auth section, note: auth is now httpOnly-cookie based (no client token); registration fixed (sends username+name); `/account` page added; save + review writes proxied server-side (user_id derived from cookie). Commit:
```bash
git add docs/handoff.md
git commit -m "docs: record auth foundation completion in handoff"
```

---

## Self-review notes (for the implementer)

- **Spec coverage (this plan):** httpOnly cookie + proxy (Tasks 6–9, 14, 15), silent refresh (Task 7), modal login + /account shell (Tasks 11–13), pragmatic hardening — password rules/email format/generic errors/rate limit (Tasks 2, 4, 8), broken-registration fix (Tasks 3, 8), and wiring the existing save + review writes through the cookie model so nothing breaks (Tasks 14, 15 — `user_id` derived server-side, review upsert).
- **Deferred to Plan 2 (`2026-06-02-account-features.md`):** `ratings(user_id, facility_id)` unique constraint + `createRule` tightening, `ConfirmDialog`, `RatingsSection` → compact summary, `ReviewsModal`, `/account` saved-campgrounds + my-reviews sections (with confirm dialogs). Plan 2 is purely additive and never leaves the app non-compiling.
- **Boundary note:** the save/review *write paths* live in Plan 1 (coupled to the authStore rewrite); Plan 2 is the UX layer on top.
- **Known assumption to verify (Task 7 Step 4):** that Teenybase `/refresh-token` accepts an *expired* access token in the Authorization header. Verified only with a *valid* token during planning.
- **`name` not in JWT:** intentional — `locals.user` is `{id, username, email}`; `/account` fetches `name` separately (Task 13).
- **Upsert without the DB constraint:** Task 15's upsert works by find-then-edit/insert; the `(user_id, facility_id)` unique constraint added in Plan 2 is defense-in-depth on top of it.
