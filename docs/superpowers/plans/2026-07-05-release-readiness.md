# CampFinder Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship CampFinder to production on Cloudflare's free tier (`*.workers.dev` + `*.pages.dev`) for the owner + friends: password reset (links via server logs — no email provider), invite-gated registration, header-guarded Teenybase Worker, full deploy + seed.

**Architecture:** Stateless HMAC tokens (Web Crypto, no token table — `users.email_verified` already exists in the auth scaffold, so **zero schema changes**). All email/auth work happens in SvelteKit server routes using the service token. A single `tbFetch` wrapper adds the `X-TB-Key` shared-secret header in prod; the Worker rejects requests without it. Deployment interleaves user dashboard actions with agent CLI work.

**Tech Stack:** SvelteKit (Svelte 5 runes only), Teenybase (Workers + D1), Cloudflare Pages/Workers, Vitest.

**User decisions (already made):**
- ~~Buy the cheapest available campfinder-adjacent domain (Cloudflare Registrar).~~ **Superseded 2026-07-07:** no domain — free hosting on `*.workers.dev` / `*.pages.dev` ($0/mo).
- ~~Worker lockdown = Cloudflare Access service tokens.~~ **Superseded 2026-07-07:** lockdown = `X-TB-Key` shared-secret guard in `backend/src/index.ts` (`tbFetch` + ETL already send the header when `TB_SHARED_SECRET` is set).
- **2026-07-07:** No Resend — `RESEND_API_KEY` stays unset in prod. Reset/verify links are console-logged (readable via `wrangler pages deployment tail`); the admin relays them. Email-dependent UI (verify-nag banner, resend buttons) is hidden when email is unconfigured; the forgot-password flow stays.
- One shared invite code (env var).
- Email verification is nag-only; blocks nothing.
- Model tiers: haiku for mechanical tasks, sonnet standard, opus only if very complex. Tasks 11–12 (re-cut) are standard subagent tasks; Tasks 13–16 run in-session with the orchestrator + user.

**Standing rules:** `cd frontend && pnpm check` must report 0 errors / 0 warnings before EVERY commit. `pnpm test` (frontend and/or etl, wherever tests exist for touched code) must pass. Svelte 5 runes only — no `export let`, no `$:`, no `on:click`, no `<slot>`. JSON fields stringified on write to Teenybase. NO compound WHERE (`&&`/`AND`/`||`) in Teenybase queries — single condition + JS filtering.

**Key repo facts for implementers (verified):**
- `users` table columns include `email_verified BOOLEAN NOT NULL DEFAULT 0` and `updated TIMESTAMP` (bumped by trigger on every edit) — see `backend/teenybase.ts` (authFields scaffold).
- Service token (`TB_SERVICE_TOKEN` in `frontend/.env`, matches backend `ADMIN_SERVICE_TOKEN`) bypasses all table rules; admin routes already use it via `frontend/src/lib/server/admin/tb.ts` (`tbHeaders`, `tb()`).
- Rate limiting: `createRateLimiter` in `frontend/src/lib/server/auth/rateLimit.ts`; instances in `limiters.ts`.
- Email validation regex (server + client): `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — it ADMITS double quotes, so any email interpolated into a Teenybase WHERE must be rejected if it contains `"`.
- Env vars: use `$env/dynamic/private` (`import { env } from '$env/dynamic/private'`) for all NEW vars so missing values don't break builds. In Vitest, mock it: `vi.mock('$env/dynamic/private', () => ({ env: { AUTH_TOKEN_SECRET: 'test-secret' } }))`.

---

## Task 1: Live end-to-end test of the merge admin UI

**USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Goal:** Exercise the never-live-tested side-by-side merge UI end-to-end in a real browser against local dev servers, before any new code is written.

**Executor:** Orchestrator (Fable) with Playwright MCP tools, dev servers running (`cd backend && pnpm dev`, `cd frontend && pnpm dev`). Not a subagent task.

**Files:** none created; bugs found become fix commits before Phase 1 starts.

**Acceptance Criteria:**
- [ ] A duplicate pair flagged via ReportDuplicateModal appears in the `/admin` merge queue (signed in as `willis+admin@email.com`).
- [ ] The A|B side-by-side grid renders both facilities' data; master "use all of A/B" toggle flips every field's selection.
- [ ] At least one per-field override applied (e.g. keep B's location, A's everything else); approve succeeds with a success notice — no "failed to update".
- [ ] Post-merge: winner facility shows the chosen field values via `/api/facilities/{id}`; loser facility 404s and its detail panel closes; `merge_suggestions` row is `status='approved'`.
- [ ] Ratings/saves that pointed at the loser now list under the winner (check via sqlite or account page).

**Verify:** Browser walkthrough captured via Playwright snapshots + `sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/<long-hash>.sqlite "SELECT status FROM merge_suggestions ORDER BY created DESC LIMIT 1"` → `approved`.

**Steps:**
- [ ] **Step 1:** Start both dev servers; sign in as a regular user; pick a real near-duplicate pair on the map (any two nearby facilities work for the mechanics); flag via ReportDuplicateModal.
- [ ] **Step 2:** Sign in as admin, open `/admin`, run the A|B grid flow per the criteria above (default approve on a second pair too, to confirm the legacy gap-fill path still works).
- [ ] **Step 3:** Verify all acceptance criteria with captured output. File and fix any bug found (fix commits go on `main` with the standing `pnpm check` rule) before closing.

```json:metadata
{"files": [], "verifyCommand": "manual browser walkthrough + sqlite status check", "acceptanceCriteria": ["duplicate flag reaches admin queue", "A|B grid + master toggle + per-field override work", "approve succeeds with notice", "winner has chosen values; loser 404s", "ratings/saves repointed"], "modelTier": "orchestrator", "userGate": true, "tags": ["user-gate"]}
```

---

## Task 2: ETL non-resurrection check after the real merge

**USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Goal:** Prove a merged-away facility is not resurrected by any ETL pipeline, using the real merge produced by Task 1.

**Executor:** Orchestrator. Requires `etl/.env` (RIDB_API_KEY etc.) which exists locally.

**Files:** none.

**Acceptance Criteria:**
- [ ] Facility count identical before vs after `cd etl && pnpm sync` and `pnpm sync-nps` (run `pnpm discover` too if time allows — it 429s a lot).
- [ ] The loser facility's `ridb_id` does NOT reappear: `sqlite3 <db> "SELECT COUNT(*) FROM facilities WHERE ridb_id='<loser-ridb-id>'"` → `0`.
- [ ] Winner's `merged_ridb_ids` JSON still contains the loser's ridb_id after sync.

**Verify:** `sqlite3 <db> "SELECT COUNT(*) FROM facilities"` before/after each sync → equal counts (± any genuinely new upstream facilities — investigate any delta; a resurrected loser id is a FAIL).

**Steps:**
- [ ] **Step 1:** Record pre-sync count and the loser ridb_id from Task 1.
- [ ] **Step 2:** `cd etl && pnpm sync` then `pnpm sync-nps`; re-run the count + loser-id queries.
- [ ] **Step 3:** Capture outputs into the task close message. Any resurrection → fix `buildRidbIndex`/consumers before closing.

```json:metadata
{"files": [], "verifyCommand": "sqlite3 count before/after pnpm sync + loser ridb_id lookup = 0", "acceptanceCriteria": ["facility count stable across syncs", "loser ridb_id absent", "merged_ridb_ids intact"], "modelTier": "orchestrator", "userGate": true, "tags": ["user-gate"], "requireEvidenceTokens": [["before","pre-sync"], ["after","post-sync"]]}
```

---

## Task 3: Auth token module (stateless HMAC) — TDD

**Goal:** `signToken`/`verifyToken`/`decodeToken` using Web Crypto HMAC-SHA256, with the user's `updated` timestamp mixed into the signature so tokens self-invalidate when the record changes.

**Files:**
- Create: `frontend/src/lib/server/auth/tokens.ts`
- Test: `frontend/src/lib/server/auth/tokens.test.ts`

**Acceptance Criteria:**
- [ ] Round-trip: sign then verify returns the payload (uid, purpose, exp).
- [ ] Rejects: tampered body, tampered signature, wrong purpose, expired token, different `updatedStamp`, malformed token (`null` in every case, never throws).
- [ ] Uses `crypto.subtle` only (Workers-compatible); no `node:crypto` import.
- [ ] `pnpm test` green, `pnpm check` 0/0.

**Verify:** `cd frontend && pnpm test -- tokens` → all pass; `pnpm check` → 0 errors 0 warnings.

**Steps:**

- [ ] **Step 1: Write the failing tests** — `frontend/src/lib/server/auth/tokens.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { AUTH_TOKEN_SECRET: "test-secret" } }));

import { signToken, verifyToken, decodeToken, RESET_TTL_MS } from "./tokens";

const STAMP = "2026-07-05 12:00:00";

describe("auth tokens", () => {
  it("round-trips a valid reset token", async () => {
    const token = await signToken({ uid: "u1", purpose: "reset" }, STAMP, RESET_TTL_MS);
    const payload = await verifyToken(token, "reset", STAMP);
    expect(payload?.uid).toBe("u1");
    expect(payload?.purpose).toBe("reset");
  });

  it("decodeToken reads the uid without verifying", async () => {
    const token = await signToken({ uid: "u1", purpose: "verify" }, STAMP, RESET_TTL_MS);
    expect(decodeToken(token)?.uid).toBe("u1");
  });

  it("rejects wrong purpose", async () => {
    const token = await signToken({ uid: "u1", purpose: "verify" }, STAMP, RESET_TTL_MS);
    expect(await verifyToken(token, "reset", STAMP)).toBeNull();
  });

  it("rejects a stale updated stamp (record changed since issue)", async () => {
    const token = await signToken({ uid: "u1", purpose: "reset" }, STAMP, RESET_TTL_MS);
    expect(await verifyToken(token, "reset", "2026-07-05 12:00:01")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signToken({ uid: "u1", purpose: "reset" }, STAMP, -1000);
    expect(await verifyToken(token, "reset", STAMP)).toBeNull();
  });

  it("rejects tampered payload and garbage", async () => {
    const token = await signToken({ uid: "u1", purpose: "reset" }, STAMP, RESET_TTL_MS);
    const [body, sig] = token.split(".");
    const evil = btoa(JSON.stringify({ uid: "u2", purpose: "reset", exp: Date.now() + 9e6 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyToken(`${evil}.${sig}`, "reset", STAMP)).toBeNull();
    expect(await verifyToken("not-a-token", "reset", STAMP)).toBeNull();
    expect(await verifyToken(`${body}.AAAA`, "reset", STAMP)).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `cd frontend && pnpm test -- tokens` → FAIL (module missing).

- [ ] **Step 3: Implement** — `frontend/src/lib/server/auth/tokens.ts`:

```ts
import { env } from "$env/dynamic/private";

export type TokenPurpose = "reset" | "verify";

export const RESET_TTL_MS = 30 * 60 * 1000; // 30 min
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

export interface TokenPayload {
  uid: string;
  purpose: TokenPurpose;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function importKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

/**
 * The user's `updated` column value is mixed into the signed message (never
 * embedded in the token) so ANY edit to the user record — password change,
 * email verification — invalidates every previously issued token for them.
 */
export async function signToken(
  payloadIn: { uid: string; purpose: TokenPurpose },
  updatedStamp: string,
  ttlMs: number,
): Promise<string> {
  const secret = env.AUTH_TOKEN_SECRET;
  if (!secret) throw new Error("AUTH_TOKEN_SECRET is not set");
  const payload: TokenPayload = { ...payloadIn, exp: Date.now() + ttlMs };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await importKey(secret, "sign");
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${body}.${updatedStamp}`));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** Decode WITHOUT verifying — lets a route learn the uid so it can fetch the user record (whose `updated` value is needed to verify). */
export function decodeToken(token: string): TokenPayload | null {
  const body = token.split(".")[0];
  const bytes = body ? fromB64url(body) : null;
  if (!bytes) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as TokenPayload;
    return typeof payload.uid === "string" && typeof payload.exp === "number" ? payload : null;
  } catch {
    return null;
  }
}

export async function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose,
  updatedStamp: string,
): Promise<TokenPayload | null> {
  const secret = env.AUTH_TOKEN_SECRET;
  if (!secret) return null;
  const [body, sigPart, extra] = token.split(".");
  if (!body || !sigPart || extra !== undefined) return null;
  const sig = fromB64url(sigPart);
  if (!sig) return null;
  const key = await importKey(secret, "verify");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig as unknown as ArrayBuffer,
    enc.encode(`${body}.${updatedStamp}`),
  );
  if (!valid) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  if (payload.purpose !== expectedPurpose) return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}
```

(If `pnpm check` complains about the `sig as unknown as ArrayBuffer` cast, pass `sig.buffer as ArrayBuffer` or copy into a fresh `Uint8Array` — whichever satisfies the installed TS DOM lib — and keep zero warnings.)

- [ ] **Step 4:** `pnpm test -- tokens` → PASS; `pnpm check` → 0/0.
- [ ] **Step 5:** Commit: `git add frontend/src/lib/server/auth/tokens.ts frontend/src/lib/server/auth/tokens.test.ts && git commit -m "feat(auth): stateless HMAC reset/verify tokens"`.

```json:metadata
{"files": ["frontend/src/lib/server/auth/tokens.ts", "frontend/src/lib/server/auth/tokens.test.ts"], "verifyCommand": "cd frontend && pnpm test -- tokens && pnpm check", "acceptanceCriteria": ["round-trip verify", "rejects tamper/expiry/purpose/stale-stamp/garbage", "Web Crypto only", "check 0/0"], "modelTier": "standard"}
```

---

## Task 4: Email module (Resend + console fallback)

**Goal:** `sendEmail` helper calling Resend's REST API, logging to console when `RESEND_API_KEY` is unset (local dev), plus the reset and verify email templates.

**Files:**
- Create: `frontend/src/lib/server/email.ts`

**Acceptance Criteria:**
- [ ] With `RESEND_API_KEY` unset, `sendEmail` logs recipient/subject/link-bearing HTML to console and returns `true` (dev flows fully testable key-free).
- [ ] With key set, POSTs `https://api.resend.com/emails` with Bearer auth; non-ok → logs status+body, returns `false`; never throws.
- [ ] Templates return `{subject, html}`; links built from an `origin` argument (from `url.origin` at the call site), not a hardcoded host.
- [ ] `pnpm check` 0/0.

**Verify:** `cd frontend && pnpm check` → 0/0 (behavior exercised by Task 5/6 routes; no unit test needed for a thin fetch wrapper).

**Steps:**

- [ ] **Step 1: Implement** — `frontend/src/lib/server/email.ts`:

```ts
import { env } from "$env/dynamic/private";

interface EmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send via Resend. Local dev (no RESEND_API_KEY): log instead — the link in
 * the logged HTML is how you complete reset/verify flows locally.
 * Never throws; callers treat email as best-effort.
 */
export async function sendEmail({ to, subject, html }: EmailInput): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM ?? "CampFinder <noreply@localhost>",
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[email] send failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send error:", e);
    return false;
  }
}

const wrap = (body: string) => `
  <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #2d2416;">
    <h2 style="font-weight: 600; border-bottom: 2px solid #4a5d3a; padding-bottom: 8px;">CampFinder</h2>
    ${body}
    <p style="font-size: 12px; color: #8a7d63; margin-top: 24px;">If you didn't request this, you can ignore this email.</p>
  </div>`;

export function resetEmail(origin: string, token: string) {
  const link = `${origin}/reset?token=${encodeURIComponent(token)}`;
  return {
    subject: "Reset your CampFinder password",
    html: wrap(`
      <p>Someone (hopefully you) asked to reset your CampFinder password.</p>
      <p><a href="${link}" style="color: #4a5d3a; font-weight: 600;">Choose a new password</a></p>
      <p style="font-size: 13px;">This link expires in 30 minutes.</p>`),
  };
}

export function verifyEmail(origin: string, token: string) {
  const link = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  return {
    subject: "Verify your CampFinder email",
    html: wrap(`
      <p>Welcome to CampFinder! Confirm this is your email address:</p>
      <p><a href="${link}" style="color: #4a5d3a; font-weight: 600;">Verify my email</a></p>
      <p style="font-size: 13px;">This link expires in 24 hours.</p>`),
  };
}
```

- [ ] **Step 2:** `pnpm check` → 0/0.
- [ ] **Step 3:** Commit: `git commit -am "feat(email): Resend sender with dev console fallback + templates"`.

```json:metadata
{"files": ["frontend/src/lib/server/email.ts"], "verifyCommand": "cd frontend && pnpm check", "acceptanceCriteria": ["console fallback when no key", "Resend POST with key", "never throws", "origin-based links"], "modelTier": "mechanical"}
```

---

## Task 5: Password reset routes (`request-reset` + `reset`)

**Goal:** `POST /api/auth/request-reset` (always-200, emails a reset link) and `POST /api/auth/reset` (validates token, sets new password via service token).

**Files:**
- Create: `frontend/src/routes/api/auth/request-reset/+server.ts`
- Create: `frontend/src/routes/api/auth/reset/+server.ts`
- Create: `frontend/src/lib/server/auth/users.ts` (service-token user lookup/edit helpers)
- Modify: `frontend/src/lib/server/auth/limiters.ts` (add `emailLimiter`)

**Acceptance Criteria:**
- [ ] **SPIKE FIRST (Step 1):** service-token `users/edit/{id}` with `{password, passwordConfirm}` produces a password that works with `login-password` (i.e. Teenybase hashes on edit). If it does NOT, STOP and report to the orchestrator — the fallback approach must be decided, not improvised.
- [ ] `request-reset` returns 200 with identical body whether or not the account exists (no enumeration); sends email only when it exists; rate-limited (5/15min/IP → 429).
- [ ] Emails containing `"` are rejected (400) before any Teenybase WHERE interpolation.
- [ ] `reset` validates the token (purpose `reset`) against the user's current `updated` stamp, enforces the same password rules as register, updates the password, returns 200. Used/expired/tampered token → 400 with a "request a new link" error message.
- [ ] Full local round trip works using the console-logged email link.
- [ ] `pnpm check` 0/0, `pnpm test` green.

**Verify:** `cd frontend && pnpm check && pnpm test` → clean; manual: request reset for a real local account → copy link from server console → POST new password → login with new password succeeds → reusing the same link → 400.

**Steps:**

- [ ] **Step 1: Spike — verify service-token password edit hashes correctly.** With backend running:

```bash
# TOKEN = TB_SERVICE_TOKEN from frontend/.env; USER_ID = any test user's id
curl -s -X POST http://localhost:8787/api/v1/table/users/edit/$USER_ID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"password": "newpass1234", "passwordConfirm": "newpass1234"}'
curl -s -X POST http://localhost:8787/api/v1/table/users/auth/login-password \
  -H 'Content-Type: application/json' \
  -d '{"identity": "<that user email>", "password": "newpass1234"}'
```

Expected: login returns a token (hashing happened on edit). If login fails, STOP — report to orchestrator with both responses.

- [ ] **Step 2: User helpers** — `frontend/src/lib/server/auth/users.ts`:

```ts
import { PUBLIC_TB_URL } from "$env/static/public";
import { TB_SERVICE_TOKEN } from "$env/static/private";

export interface TbUserRecord {
  id: string;
  email: string;
  name?: string;
  updated: string;
  email_verified: boolean | number;
}

const HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
};

/** Caller MUST have rejected emails containing `"` (WHERE interpolation). */
export async function findUserByEmail(email: string): Promise<TbUserRecord | null> {
  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/users/list`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ where: `email == "${email}"`, limit: 1 }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: TbUserRecord[] };
  return data.items?.[0] ?? null;
}

export async function getUserById(id: string): Promise<TbUserRecord | null> {
  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/users/view/${id}`, { headers: HEADERS });
  return res.ok ? ((await res.json()) as TbUserRecord) : null;
}

export async function updateUser(
  id: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/users/edit/${id}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(patch),
  });
  return res.ok;
}
```

(If Task 10 has already landed, use `tbFetch` instead of raw fetch — but task order puts Task 10 after, so raw fetch matching `admin.ts` style is correct here; Task 10 sweeps this file too.)

- [ ] **Step 3: Limiter** — append to `frontend/src/lib/server/auth/limiters.ts`:

```ts
// 5 outbound emails / 15 min per IP (reset + verification requests).
export const emailLimiter = createRateLimiter({
  max: 5,
  windowMs: 15 * 60 * 1000,
});
```

- [ ] **Step 4: request-reset route** — `frontend/src/routes/api/auth/request-reset/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { validateEmail } from "$lib/server/auth/validate";
import { emailLimiter } from "$lib/server/auth/limiters";
import { findUserByEmail } from "$lib/server/auth/users";
import { signToken, RESET_TTL_MS } from "$lib/server/auth/tokens";
import { sendEmail, resetEmail } from "$lib/server/email";

// Identical response whether or not the account exists — no enumeration.
const OK = { ok: true };

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
  if (!emailLimiter.check(getClientAddress()).allowed) {
    return json({ error: "Too many requests, try again later." }, { status: 429 });
  }

  const { email } = (await request.json()) as Record<string, string>;
  if (!validateEmail(email ?? "") || email.includes('"')) {
    return json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (user) {
    const token = await signToken({ uid: user.id, purpose: "reset" }, user.updated, RESET_TTL_MS);
    await sendEmail({ to: user.email, ...resetEmail(url.origin, token) }); // best-effort
  }
  return json(OK);
};
```

- [ ] **Step 5: reset route** — `frontend/src/routes/api/auth/reset/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { validatePassword } from "$lib/server/auth/validate";
import { decodeToken, verifyToken } from "$lib/server/auth/tokens";
import { getUserById, updateUser } from "$lib/server/auth/users";

const BAD_TOKEN = "This link is invalid or has expired. Request a new one.";

export const POST: RequestHandler = async ({ request }) => {
  const { token, password, passwordConfirm } = (await request.json()) as Record<string, string>;

  const pw = validatePassword(password ?? "");
  if (!pw.ok) return json({ error: pw.error }, { status: 400 });
  if (password !== passwordConfirm) {
    return json({ error: "Passwords do not match." }, { status: 400 });
  }

  const decoded = token ? decodeToken(token) : null;
  const user = decoded ? await getUserById(decoded.uid) : null;
  // verify against the CURRENT updated stamp — a consumed token fails here
  // because the password edit below bumps `updated`.
  const payload = user ? await verifyToken(token, "reset", user.updated) : null;
  if (!user || !payload) return json({ error: BAD_TOKEN }, { status: 400 });

  const ok = await updateUser(user.id, { password, passwordConfirm: password });
  if (!ok) return json({ error: "Could not update password. Try again." }, { status: 500 });
  return json({ ok: true });
};
```

- [ ] **Step 6:** Add `AUTH_TOKEN_SECRET=<any long random string>` to `frontend/.env` (note it in the commit message body as a required env var; do not commit `.env`).
- [ ] **Step 7:** Manual round trip per **Verify** above (console link → reset → login with new password → reused link 400).
- [ ] **Step 8:** `pnpm check && pnpm test` → clean. Commit: `feat(auth): password reset via emailed HMAC token`.

```json:metadata
{"files": ["frontend/src/routes/api/auth/request-reset/+server.ts", "frontend/src/routes/api/auth/reset/+server.ts", "frontend/src/lib/server/auth/users.ts", "frontend/src/lib/server/auth/limiters.ts"], "verifyCommand": "cd frontend && pnpm check && pnpm test", "acceptanceCriteria": ["spike: service-token password edit hashes", "always-200 no enumeration", "quote-bearing emails rejected", "token validated vs current updated stamp", "local round trip works"], "modelTier": "standard"}
```

---

## Task 6: Verification routes + invite-gated register

**Goal:** `GET /api/auth/verify`, `POST /api/auth/request-verify`, invite-code check in register, best-effort verification email on signup, and `email_verified` surfaced by `/api/auth/me`.

**Files:**
- Create: `frontend/src/routes/api/auth/verify/+server.ts`
- Create: `frontend/src/routes/api/auth/request-verify/+server.ts`
- Modify: `frontend/src/routes/api/auth/register/+server.ts`
- Modify: `frontend/src/routes/api/auth/me/+server.ts`

**Acceptance Criteria:**
- [ ] Register without/with wrong `inviteCode` → 403 `{error: "Invalid invite code."}`; correct code → account created and a verification email fires best-effort (send failure does NOT fail registration). Fail-closed: if `INVITE_CODE` env is unset, register always 403s (and logs a server error).
- [ ] `GET /api/auth/verify?token=…` with valid token → sets `email_verified: true` via service token → 303 redirect to `/?verified=1`. Already-verified user → `/?verified=1` (idempotent). Bad/expired → `/?verified=0`.
- [ ] `request-verify` requires `locals.user`, rate-limited via `emailLimiter`, re-sends the link.
- [ ] `/api/auth/me` response includes `email_verified: boolean` (display-only, service-token read — same pattern as `role`).
- [ ] `pnpm check` 0/0, `pnpm test` green.

**Verify:** `cd frontend && pnpm check && pnpm test`; manual: register with invite code from `.env` → console-logged verify link → open it → redirected `/?verified=1` → `GET /api/auth/me` shows `email_verified: true`.

**Steps:**

- [ ] **Step 1: verify route** — `frontend/src/routes/api/auth/verify/+server.ts`:

```ts
import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { decodeToken, verifyToken } from "$lib/server/auth/tokens";
import { getUserById, updateUser } from "$lib/server/auth/users";

export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get("token") ?? "";
  const decoded = decodeToken(token);
  const user = decoded ? await getUserById(decoded.uid) : null;

  if (user && (user.email_verified === true || user.email_verified === 1)) {
    throw redirect(303, "/?verified=1"); // idempotent re-click
  }

  const payload = user ? await verifyToken(token, "verify", user.updated) : null;
  if (!user || !payload) throw redirect(303, "/?verified=0");

  const ok = await updateUser(user.id, { email_verified: true });
  throw redirect(303, ok ? "/?verified=1" : "/?verified=0");
};
```

- [ ] **Step 2: request-verify route** — `frontend/src/routes/api/auth/request-verify/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { emailLimiter } from "$lib/server/auth/limiters";
import { getUserById } from "$lib/server/auth/users";
import { signToken, VERIFY_TTL_MS } from "$lib/server/auth/tokens";
import { sendEmail, verifyEmail } from "$lib/server/email";

export const POST: RequestHandler = async ({ locals, url, getClientAddress }) => {
  if (!locals.user) return json({ error: "Sign in first." }, { status: 401 });
  if (!emailLimiter.check(getClientAddress()).allowed) {
    return json({ error: "Too many requests, try again later." }, { status: 429 });
  }
  const user = await getUserById(locals.user.id);
  if (!user) return json({ error: "Account not found." }, { status: 404 });
  if (user.email_verified === true || user.email_verified === 1) return json({ ok: true, already: true });

  const token = await signToken({ uid: user.id, purpose: "verify" }, user.updated, VERIFY_TTL_MS);
  const sent = await sendEmail({ to: user.email, ...verifyEmail(url.origin, token) });
  return sent ? json({ ok: true }) : json({ error: "Could not send email. Try again later." }, { status: 500 });
};
```

- [ ] **Step 3: register route changes** — in `frontend/src/routes/api/auth/register/+server.ts`: destructure `inviteCode` from the body; immediately after the rate-limit check add:

```ts
import { env } from "$env/dynamic/private";
// ...
if (!env.INVITE_CODE) {
  console.error("[register] INVITE_CODE is not configured — refusing all registrations");
  return json({ error: "Invalid invite code." }, { status: 403 });
}
if (inviteCode !== env.INVITE_CODE) {
  return json({ error: "Invalid invite code." }, { status: 403 });
}
```

and after `setSession(...)`, before the final `return`, fire the best-effort verification email:

```ts
import { getUserById } from "$lib/server/auth/users";
import { signToken, VERIFY_TTL_MS } from "$lib/server/auth/tokens";
import { sendEmail, verifyEmail } from "$lib/server/email";
// ...
const record = await getUserById(auth.record.id);
if (record) {
  const token = await signToken({ uid: record.id, purpose: "verify" }, record.updated, VERIFY_TTL_MS);
  await sendEmail({ to: record.email, ...verifyEmail(url.origin, token) }); // best-effort
}
```

(add `url` to the handler's destructured event args). Add `INVITE_CODE=letmecamp` to `frontend/.env` for local dev.

- [ ] **Step 4: me route** — extend to include `email_verified` (reuse the service-token record fetch; keep `getRoleForDisplay`'s never-throws behavior). Modify `frontend/src/routes/api/auth/me/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import { getRoleForDisplay } from "$lib/server/auth/admin";
import { getUserById } from "$lib/server/auth/users";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ user: null });

  const [role, record] = await Promise.all([
    getRoleForDisplay(locals),
    getUserById(locals.user.id).catch(() => null),
  ]);
  const email_verified = record?.email_verified === true || record?.email_verified === 1;
  return json({ user: { ...locals.user, role, email_verified } });
};
```

- [ ] **Step 5:** Manual round trip per **Verify**; then `pnpm check && pnpm test` → clean. Commit: `feat(auth): email verification + invite-gated registration`.

```json:metadata
{"files": ["frontend/src/routes/api/auth/verify/+server.ts", "frontend/src/routes/api/auth/request-verify/+server.ts", "frontend/src/routes/api/auth/register/+server.ts", "frontend/src/routes/api/auth/me/+server.ts"], "verifyCommand": "cd frontend && pnpm check && pnpm test", "acceptanceCriteria": ["invite code fail-closed 403", "verify link sets flag + redirects, idempotent", "request-verify auth'd + rate-limited", "me includes email_verified", "registration email best-effort"], "modelTier": "standard"}
```

---

## Task 7: AuthModal — forgot-password flow + invite code field

**Goal:** Add a `forgot` mode to AuthModal (email form → "check your email" confirmation) and a required invite-code field on the register tab, following the existing blur-validation pattern.

**Files:**
- Modify: `frontend/src/lib/auth/AuthModal.svelte`
- Modify: `frontend/src/lib/auth/authStore.ts` (register signature gains `inviteCode`; add `requestReset`)

**Acceptance Criteria:**
- [ ] Sign-in tab shows a "Forgot password?" link → swaps modal into `forgot` mode: single email field (blur validation), submit posts `/api/auth/request-reset`, then shows "If that address has an account, a reset link is on its way." + back-to-sign-in link. Always shows success (route never reveals existence).
- [ ] Register tab has an "Invite code" text field, required (blur error "Invite code is required."); sent as `inviteCode`; a 403 from the server surfaces its error message.
- [ ] Svelte 5 runes only; matches existing modal styling (reuse `.field`, `.field-error`, `.toggle` classes).
- [ ] `pnpm check` 0/0.

**Verify:** `cd frontend && pnpm check` → 0/0; manual: all three modes reachable and functional against local routes (register with the `.env` invite code succeeds; wrong code shows "Invalid invite code.").

**Steps:**

- [ ] **Step 1:** In `authStore.ts`, add `inviteCode: string` to the register call's JSON body (parameter threaded from the modal), and add:

```ts
async requestReset(email: string): Promise<void> {
  await fetch("/api/auth/request-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  // Intentionally ignore the response body — UI always shows the neutral message.
},
```

(match the store's existing method style — read the file first and mirror it.)

- [ ] **Step 2:** In `AuthModal.svelte`: widen `mode` to `$state<"login" | "register" | "forgot">("login")`; add `inviteCode = $state("")` + `resetSent = $state(false)`; add `inviteCode: false` to `touched`; add deriveds:

```ts
const inviteCodeError = $derived(
  mode === "register" && !inviteCode.trim() ? "Invite code is required." : "",
);
```

include it in `formValid` (and make `passwordError`/`passwordConfirmError` not block `forgot` mode — simplest: `formValid` for `forgot` is just `!emailError`). In `submit()`, branch:

```ts
if (mode === "forgot") {
  await auth.requestReset(email);
  resetSent = true;
  return;
}
```

Add the invite-code input to the register block (copy the display-name `.field` markup, `placeholder="Invite code"`, `autocomplete="off"`); add under the password field in login mode:

```svelte
<button class="toggle" type="button" onclick={() => { mode = "forgot"; error = ""; }}>
  Forgot password?
</button>
```

and a `forgot`-mode body: email field only; after submit `{#if resetSent}` show the neutral confirmation paragraph + a "Back to sign in" toggle button that resets `mode = "login"; resetSent = false`.

- [ ] **Step 3:** Manual check of all three modes + register invite-code happy/sad paths; `pnpm check` → 0/0. Commit: `feat(auth-ui): forgot-password mode + invite code field`.

```json:metadata
{"files": ["frontend/src/lib/auth/AuthModal.svelte", "frontend/src/lib/auth/authStore.ts"], "verifyCommand": "cd frontend && pnpm check", "acceptanceCriteria": ["forgot mode with neutral confirmation", "invite code required on register with blur validation", "403 error surfaced", "runes only"], "modelTier": "standard"}
```

---

## Task 8: `/reset` page

**Goal:** Page that consumes the emailed reset link: new password + confirm form, posts `/api/auth/reset`, success → prompt to sign in; invalid token → "request a new link" path.

**Files:**
- Create: `frontend/src/routes/reset/+page.svelte`

**Acceptance Criteria:**
- [ ] Reads `token` from `$page.url` query (Svelte 5: `import { page } from '$app/state'`; `page.url.searchParams.get('token')`).
- [ ] Password + confirm fields with the AuthModal blur-validation pattern (≥8 chars, match).
- [ ] Success state: "Password updated." + a button that navigates home (`goto('/')`) — user signs in via the nav's existing Sign-in.
- [ ] Error from the API (400 used/expired) rendered with a link back to `/` (where the forgot-password flow lives).
- [ ] Styled to the design language (paper card, pine accents — reuse AuthModal's visual vocabulary); runes only; `pnpm check` 0/0.

**Verify:** `cd frontend && pnpm check` → 0/0; manual: full reset round trip via console-logged link; reused link shows the expired-error state.

**Steps:**

- [ ] **Step 1:** Create `frontend/src/routes/reset/+page.svelte`:

```svelte
<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";

  const token = $derived(page.url.searchParams.get("token") ?? "");

  let password = $state("");
  let passwordConfirm = $state("");
  let touched = $state({ password: false, passwordConfirm: false });
  let submitting = $state(false);
  let done = $state(false);
  let error = $state("");

  const passwordError = $derived(
    !password ? "Password is required." : password.length < 8 ? "Password must be at least 8 characters." : "",
  );
  const passwordConfirmError = $derived(
    passwordConfirm !== password ? "Passwords do not match." : "",
  );
  const formValid = $derived(!passwordError && !passwordConfirmError);

  function touch(field: keyof typeof touched) {
    touched = { ...touched, [field]: true };
  }

  async function submit() {
    error = "";
    touched = { password: true, passwordConfirm: true };
    if (!formValid) return;
    submitting = true;
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, passwordConfirm }),
      });
      if (res.ok) done = true;
      else error = ((await res.json()) as { error?: string }).error ?? "Something went wrong.";
    } finally {
      submitting = false;
    }
  }
</script>

<div class="wrap">
  <div class="card">
    <span class="eyebrow">Trail marker</span>
    <h1>Reset your password</h1>

    {#if done}
      <p>Password updated. Sign in with your new password from the map page.</p>
      <button class="primary" onclick={() => goto("/")}>Back to the map</button>
    {:else if !token}
      <p class="error" role="alert">This reset link is missing its token. Use the "Forgot password?" link on the sign-in form to request a new one.</p>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <div class="field">
          <input type="password" bind:value={password} onblur={() => touch("password")}
            placeholder="New password" autocomplete="new-password"
            class:invalid={touched.password && passwordError} aria-invalid={touched.password && !!passwordError} />
          {#if touched.password && passwordError}<p class="field-error">{passwordError}</p>
          {:else}<p class="field-hint">At least 8 characters.</p>{/if}
        </div>
        <div class="field">
          <input type="password" bind:value={passwordConfirm} onblur={() => touch("passwordConfirm")}
            placeholder="Confirm new password" autocomplete="new-password"
            class:invalid={touched.passwordConfirm && passwordConfirmError} aria-invalid={touched.passwordConfirm && !!passwordConfirmError} />
          {#if touched.passwordConfirm && passwordConfirmError}<p class="field-error">{passwordConfirmError}</p>{/if}
        </div>
        {#if error}<p class="error" role="alert">{error} <a href="/">Request a new link</a></p>{/if}
        <button class="primary" type="submit" disabled={submitting}>
          {submitting ? "Please wait…" : "Set new password"}
        </button>
      </form>
    {/if}
  </div>
</div>
```

Copy the `.wrap`/`.card`/`.field`/`.field-error`/`.field-hint`/`.primary`/`.error`/`.eyebrow` styles from AuthModal's `<style>` block, adapted to a full-page centered card (grid place-items center, `min-height: 100dvh`, paper background). Keep the pine-spine `::before` accent.

- [ ] **Step 2:** Manual round trip + reused-link error; `pnpm check` → 0/0. Commit: `feat(auth-ui): /reset page`.

```json:metadata
{"files": ["frontend/src/routes/reset/+page.svelte"], "verifyCommand": "cd frontend && pnpm check", "acceptanceCriteria": ["token from query", "blur validation", "success + expired states", "design-language styling", "runes only"], "modelTier": "standard"}
```

---

## Task 9: Verify-nag banner + account-page resend

**Goal:** Dismissible per-session banner for signed-in unverified users with a "resend email" action, plus verified-status + resend on the account page; handle `/?verified=1|0` redirect feedback.

**Files:**
- Create: `frontend/src/lib/auth/VerifyBanner.svelte`
- Modify: `frontend/src/routes/+layout.svelte` (render banner under the nav)
- Modify: `frontend/src/lib/auth/authStore.ts` (store `email_verified` from `/api/auth/me`; add `requestVerify()` posting `/api/auth/request-verify`)
- Modify: `frontend/src/routes/account/+page.svelte` (verified badge or resend button)

**Acceptance Criteria:**
- [ ] Signed-in + unverified → banner: "Verify your email — check your inbox or [resend the link] · [dismiss]". Dismiss hides it for the session (module-level `$state` or `sessionStorage`). Verified or signed-out → no banner.
- [ ] Resend calls `/api/auth/request-verify`; success → "Sent — check your inbox."; 429 surfaces "Too many requests…".
- [ ] Landing on `/?verified=1` shows a brief success notice (in the banner slot); `/?verified=0` shows "That verification link didn't work — request a new one."
- [ ] Account page shows "Email verified ✓" or a resend button.
- [ ] Design-language styling; runes only; `pnpm check` 0/0.

**Verify:** `cd frontend && pnpm check` → 0/0; manual: unverified user sees banner, resend works (console email), clicking the verify link lands on `/?verified=1` with the success notice and the banner is gone after the store refreshes.

**Steps:**

- [ ] **Step 1:** Read `authStore.ts` and mirror its state shape to add `email_verified` (populated wherever the store ingests `/api/auth/me`), plus:

```ts
async requestVerify(): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/auth/request-verify", { method: "POST" });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: body.error ?? "Could not send email." };
},
```

- [ ] **Step 2:** `VerifyBanner.svelte` — a slim full-width strip (paper background, rust/amber left border per design language) with the three states (nag / sent / verified-redirect notice). Read `page.url.searchParams.get('verified')` for redirect feedback; use the auth store for user + `email_verified`; `let dismissed = $state(sessionStorage.getItem('verify-dismissed') === '1')` guarded for SSR (`typeof sessionStorage !== 'undefined'` in an `$effect` or browser check from `$app/environment`).
- [ ] **Step 3:** Render `<VerifyBanner />` in `routes/+layout.svelte` directly below the nav component.
- [ ] **Step 4:** Account page: show verified state; if unverified, resend button reusing `auth.requestVerify()`.
- [ ] **Step 5:** Manual pass per **Verify**; `pnpm check` → 0/0. Commit: `feat(auth-ui): email-verification nag banner + account resend`.

```json:metadata
{"files": ["frontend/src/lib/auth/VerifyBanner.svelte", "frontend/src/routes/+layout.svelte", "frontend/src/lib/auth/authStore.ts", "frontend/src/routes/account/+page.svelte"], "verifyCommand": "cd frontend && pnpm check", "acceptanceCriteria": ["banner only when signed-in + unverified", "session dismiss", "resend with feedback", "?verified redirect notices", "account page status"], "modelTier": "standard"}
```

---

## Task 10: `tbFetch` wrapper + sweep all server Teenybase calls + ETL Access headers

**Goal:** One wrapper that all server-side Teenybase fetches go through, adding Cloudflare Access service-token headers when configured (prod) and behaving identically to today when not (dev). ETL gets the same optional headers.

**Files:**
- Create: `frontend/src/lib/server/tbFetch.ts`
- Modify (sweep — find every one with `grep -rln "PUBLIC_TB_URL" frontend/src`): `lib/server/auth/admin.ts`, `lib/server/auth/tbAuth.ts`, `lib/server/auth/users.ts`, `lib/server/admin/tb.ts`, `routes/compare/+page.server.ts`, `routes/account/+page.server.ts`, `routes/api/{facilities,saved,suggestions,duplicates}/+server.ts`, `routes/api/alerts/[id]/+server.ts`, `routes/api/ratings/[facilityId]/+server.ts`, admin API routes, and any others the grep finds.
- Modify: `etl/src/teenybase.ts`

**Acceptance Criteria:**
- [ ] `tbFetch(path, init?)` prefixes the base URL (`env.TB_URL || PUBLIC_TB_URL`) and injects `CF-Access-Client-Id`/`CF-Access-Client-Secret` headers iff both `TB_ACCESS_CLIENT_ID` and `TB_ACCESS_CLIENT_SECRET` env vars are set, preserving any caller headers.
- [ ] `grep -rn "PUBLIC_TB_URL" frontend/src --include='*.ts' --include='*.svelte' | grep -v tbFetch | grep -v '.test.'` → no hits (every runtime call goes through the wrapper; test-file mocks may remain).
- [ ] ETL: `Teenybase` client in `etl/src/teenybase.ts` adds the same two headers when `TB_ACCESS_CLIENT_ID/SECRET` are present in `etl/.env`.
- [ ] Zero behavior change locally: `pnpm check` 0/0, `cd frontend && pnpm test` green, `cd etl && pnpm test` → 108+ passing, app works against local backend (map search, login, detail panel).

**Verify:** `cd frontend && pnpm check && pnpm test && cd ../etl && pnpm test` → all green; the grep in the AC returns nothing; manual smoke of map search + login locally.

**Steps:**

- [ ] **Step 1:** Create `frontend/src/lib/server/tbFetch.ts`:

```ts
import { env } from "$env/dynamic/private";
import { PUBLIC_TB_URL } from "$env/static/public";

// Prefer the private TB_URL (prod); fall back to the legacy public var (dev).
const BASE = () => env.TB_URL || PUBLIC_TB_URL;

/** Path is everything after the host, e.g. "/api/v1/table/facilities/list". */
export function tbFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (env.TB_ACCESS_CLIENT_ID && env.TB_ACCESS_CLIENT_SECRET) {
    headers.set("CF-Access-Client-Id", env.TB_ACCESS_CLIENT_ID);
    headers.set("CF-Access-Client-Secret", env.TB_ACCESS_CLIENT_SECRET);
  }
  return fetch(`${BASE()}${path}`, { ...init, headers });
}
```

- [ ] **Step 2:** Mechanical sweep: every `fetch(\`${PUBLIC_TB_URL}/api/v1/...\`, opts)` becomes `tbFetch("/api/v1/...", opts)`. In `lib/server/admin/tb.ts`, keep `tbHeaders` (service token) but route the request through `tbFetch`; change `tb()` to return the path only. Preserve each file's existing error handling exactly. Update any test mocks that stub `$env/static/public` to also stub `$env/dynamic/private` (`{ env: {} }`).
- [ ] **Step 3:** ETL — in `etl/src/teenybase.ts`'s private `headers` getter, append:

```ts
...(process.env.TB_ACCESS_CLIENT_ID && process.env.TB_ACCESS_CLIENT_SECRET
  ? {
      "CF-Access-Client-Id": process.env.TB_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": process.env.TB_ACCESS_CLIENT_SECRET,
    }
  : {}),
```

- [ ] **Step 4:** Run the full verify battery + manual smoke. Commit: `refactor(server): route all Teenybase calls through tbFetch (CF Access ready)`.

```json:metadata
{"files": ["frontend/src/lib/server/tbFetch.ts", "etl/src/teenybase.ts"], "verifyCommand": "cd frontend && pnpm check && pnpm test && cd ../etl && pnpm test; grep -rn PUBLIC_TB_URL frontend/src --include='*.ts' --include='*.svelte' | grep -v tbFetch | grep -v '.test.'", "acceptanceCriteria": ["wrapper with conditional Access headers", "grep-clean sweep", "ETL headers", "zero local behavior change, all tests green"], "modelTier": "standard"}
```

---

## Task 11: Worker header guard (`X-TB-Key`) — prod lockdown without a domain

> **Re-cut 2026-07-07:** replaces the old "Cloudflare account setup — domain, Resend, Zero Trust" task. Decision: no domain, no Resend, no Cloudflare Access — free `*.workers.dev` + `*.pages.dev` hosting with a shared-secret header guard.

**Goal:** `backend/src/index.ts` rejects every request whose `X-TB-Key` header doesn't match the `TB_SHARED_SECRET` env var — active only when the secret is set (prod), zero behavior change when unset (local dev).

**Files:**
- Modify: `backend/src/index.ts`

**Why this works with zero other changes (verified):** `frontend/src/lib/server/tbFetch.ts:10-12` and `etl/src/teenybase.ts:15-16` already send `X-TB-Key: $TB_SHARED_SECRET` whenever that env var is set. No browser code ever calls the Worker directly — every call is proxied through SvelteKit server routes.

**Acceptance Criteria:**
- [ ] `TB_SHARED_SECRET` unset → behavior identical to today (curl `POST /api/v1/table/facilities/list` without any header → 200).
- [ ] `TB_SHARED_SECRET` set → request without the header, or with a wrong value → 403 JSON `{"error":"Forbidden"}`; correct header → 200. Applies to ALL paths, including `/api/v1/table/users/auth/sign-up` and `/api/v1/pocket/` (Pocket UI being locked in prod is intended; prod admin access is `wrangler d1 execute`).
- [ ] Frontend works locally end-to-end with the secret set on both sides (map search + login), proving `tbFetch` sends the header.
- [ ] Dev env files restored afterward (secret removed from `backend/.dev.vars` and `frontend/.env` — local stays unguarded).
- [ ] `cd frontend && pnpm check` 0/0 (nothing frontend changed, but run it anyway per standing rules).

**Verify:** curl triple below (no-secret 200 → guarded 403 → header 200) with output captured.

**Steps:**

- [ ] **Step 1: Implement the guard** — rewrite `backend/src/index.ts` to:

```ts
import {
  $Database,
  $Env,
  OpenApiExtension,
  PocketUIExtension,
  D1Adapter,
  teenyHono,
} from "teenybase/worker";
import config from "virtual:teenybase";

type Env = $Env & { Bindings: CloudflareBindings };
type Bindings = CloudflareBindings & { TB_SHARED_SECRET?: string };

const app = teenyHono<Env>(async (c) => {
  const db = new $Database(c, config, new D1Adapter(c.env.PRIMARY_DB));
  db.extensions.push(new OpenApiExtension(db, true), new PocketUIExtension(db));
  return db;
});

// Constant-time comparison (length still leaks; fine for a shared-secret header).
function keyMatches(provided: string | null, expected: string): boolean {
  if (provided === null || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// When TB_SHARED_SECRET is set (prod), every request must carry a matching
// X-TB-Key header. tbFetch (frontend server routes) and the ETL client already
// send it. Unset (local dev) => guard is inert.
export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext): Response | Promise<Response> {
    const secret = env.TB_SHARED_SECRET;
    if (secret && !keyMatches(request.headers.get("X-TB-Key"), secret)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return app.fetch(request, env, ctx);
  },
};
```

(Wrapping `app.fetch` instead of `app.use()` middleware is deliberate: `teenyHono` registers its routes internally, so Hono middleware ordering can't be trusted; the export-level wrapper runs unconditionally before anything Teenybase does.)

- [ ] **Step 2: Baseline check (guard inert).** With `cd backend && pnpm dev` running and NO `TB_SHARED_SECRET` in `.dev.vars`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8787/api/v1/table/facilities/list \
  -H 'Content-Type: application/json' -d '{"limit":1}'
```

Expected: `200`.

- [ ] **Step 3: Guarded check.** Add `TB_SHARED_SECRET=devguardtest123` to `backend/.dev.vars`, restart the backend dev server, then:

```bash
# no header -> 403
curl -s -w '\n%{http_code}\n' -X POST http://localhost:8787/api/v1/table/facilities/list \
  -H 'Content-Type: application/json' -d '{"limit":1}'
# wrong header -> 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8787/api/v1/table/facilities/list \
  -H 'X-TB-Key: wrong' -H 'Content-Type: application/json' -d '{"limit":1}'
# correct header -> 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8787/api/v1/table/facilities/list \
  -H 'X-TB-Key: devguardtest123' -H 'Content-Type: application/json' -d '{"limit":1}'
```

Expected: `{"error":"Forbidden"}` + `403`, then `403`, then `200`.

- [ ] **Step 4: Frontend passthrough check.** Add `TB_SHARED_SECRET=devguardtest123` to `frontend/.env`, restart the frontend dev server, hit `curl "http://localhost:5173/api/facilities?north=41&south=38&east=-104&west=-107"` → 200 with facilities JSON (proves tbFetch injects the header).

- [ ] **Step 5: Restore dev state.** Remove `TB_SHARED_SECRET` from BOTH `backend/.dev.vars` and `frontend/.env`; restart both servers; re-run Step 2 curl → 200.

- [ ] **Step 6:** `cd frontend && pnpm check` → 0/0. Commit:

```bash
git add backend/src/index.ts
git commit -m "feat(backend): X-TB-Key shared-secret guard for prod lockdown"
```

```json:metadata
{"files": ["backend/src/index.ts"], "verifyCommand": "curl triple: unset->200, guarded no/wrong header->403, correct header->200; frontend proxy 200 with secret set both sides", "acceptanceCriteria": ["guard inert when TB_SHARED_SECRET unset", "403 on missing/wrong X-TB-Key for all paths incl. sign-up and pocket UI", "200 with correct header", "frontend works via tbFetch with secret set", "dev env files restored"], "modelTier": "standard"}
```

---

## Task 12: Hide email-dependent UI when email sending is unconfigured

> **Re-cut 2026-07-07 (new task):** prod ships without `RESEND_API_KEY`, so the verify-nag banner and resend buttons would nag forever about emails that can never arrive. Hide them when email is off. The forgot-password flow STAYS — its links are console-logged and readable via `wrangler pages deployment tail`, so it still works with the admin as mail carrier.

**Goal:** `/api/auth/me` exposes `email_enabled` (= `RESEND_API_KEY` is set); `VerifyBanner` and the account page's resend UI render only when it's `true`.

**Files:**
- Modify: `frontend/src/routes/api/auth/me/+server.ts`
- Modify: `frontend/src/lib/auth/authStore.ts` (AuthUser type)
- Modify: `frontend/src/lib/auth/VerifyBanner.svelte`
- Modify: `frontend/src/routes/account/+page.svelte`

**Acceptance Criteria:**
- [ ] `/api/auth/me` (signed in) includes `email_enabled: boolean` reflecting `env.RESEND_API_KEY` presence.
- [ ] Email disabled (local default): signed-in unverified user sees NO nag banner; account page shows no resend button (but still shows "Email verified ✓" when verified).
- [ ] Email "enabled" (set `RESEND_API_KEY=dummy` in `frontend/.env`, restart): banner and resend button reappear for an unverified user.
- [ ] `/?verified=1` and `/?verified=0` redirect notices still render regardless (verify links from logs remain usable).
- [ ] Svelte 5 runes only; `pnpm check` 0/0; `pnpm test` green.

**Verify:** `cd frontend && pnpm check && pnpm test` → clean; manual banner/account checks in both env states.

**Steps:**

- [ ] **Step 1: me route** — `frontend/src/routes/api/auth/me/+server.ts`:

```ts
import { json } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { getRoleForDisplay } from '$lib/server/auth/admin'
import { getUserById } from '$lib/server/auth/users'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ user: null })

  const [role, record] = await Promise.all([
    getRoleForDisplay(locals),
    getUserById(locals.user.id).catch(() => null),
  ])
  const email_verified = record?.email_verified === true || record?.email_verified === 1
  // Mirrors the sendEmail() console-fallback condition in $lib/server/email.ts.
  const email_enabled = !!env.RESEND_API_KEY
  return json({ user: { ...locals.user, role, email_verified, email_enabled } })
}
```

- [ ] **Step 2: Sweep for sibling user-shape producers.** Run `grep -rn "email_verified" frontend/src --include='*.ts' --include='*.svelte' | grep -v '.test.'`. If any OTHER server-side code builds the client user object (e.g. a `+layout.server.ts` load), add the same `email_enabled` field there. If only the me route and consumers show up, move on.

- [ ] **Step 3: AuthUser type** — in `frontend/src/lib/auth/authStore.ts` add to the interface:

```ts
  email_enabled?: boolean
```

- [ ] **Step 4: VerifyBanner** — in `frontend/src/lib/auth/VerifyBanner.svelte`, change only the `visible` derived (the nag now also requires email to be enabled; `?verified=1|0` link-redirect notices are unaffected):

```ts
  let visible = $derived(
    !dismissed &&
      (kind !== "nag" ||
        ($currentUser != null &&
          $currentUser.email_verified !== true &&
          $currentUser.email_enabled === true)),
  );
```

(`email_enabled === true` is deliberately strict: while the store hydrates and the field is `undefined`, the banner stays hidden — no flash.)

- [ ] **Step 5: Account page** — in `frontend/src/routes/account/+page.svelte`, gate the unverified branch (currently `{#if $currentUser?.email_verified} … {:else if verifyState === "sent"} …`) so everything after the verified badge only renders when email is enabled:

```svelte
      {#if $currentUser?.email_verified}
        <span class="verified">Email verified ✓</span>
      {:else if $currentUser?.email_enabled}
        {#if verifyState === "sent"}
          <span class="verify-msg">Sent — check your inbox.</span>
        {:else if verifyState === "error"}
          <span class="verify-msg error">{verifyError}</span>
        {:else}
          <button
            class="link resend"
            onclick={resendVerification}
            disabled={verifyState === "sending"}
          >
            {verifyState === "sending" ? "Sending…" : "Resend verification email"}
          </button>
        {/if}
      {/if}
```

(Match the file's actual current markup when editing — read it first; the shape above reflects lines ~72-85 today.)

- [ ] **Step 6: Manual pass.** Default env (no `RESEND_API_KEY`): sign in as an unverified user → no banner, account page has no resend UI. Then add `RESEND_API_KEY=dummy` to `frontend/.env`, restart, refresh → banner + resend button back. Remove the dummy key afterward.

- [ ] **Step 7:** If a me-route test exists that snapshots the response shape, update its env mock (`vi.mock('$env/dynamic/private', …)`) and expectations. `pnpm check && pnpm test` → clean. Commit:

```bash
git add -A frontend/src
git commit -m "feat(auth-ui): hide verification UI when email sending unconfigured"
```

```json:metadata
{"files": ["frontend/src/routes/api/auth/me/+server.ts", "frontend/src/lib/auth/authStore.ts", "frontend/src/lib/auth/VerifyBanner.svelte", "frontend/src/routes/account/+page.svelte"], "verifyCommand": "cd frontend && pnpm check && pnpm test", "acceptanceCriteria": ["me includes email_enabled", "banner + account resend hidden when email off", "reappear with RESEND_API_KEY set", "?verified notices unaffected", "runes only, check 0/0, tests green"], "modelTier": "standard"}
```

---

## Task 13: Prod secrets worksheet + wrangler auth (USER + orchestrator)

> **Re-cut 2026-07-07:** replaces domain purchase / Resend verification / Zero Trust setup. Nothing to buy, no dashboards beyond Cloudflare itself.

**Goal:** All prod secret values generated and recorded locally (never in git); `wrangler` authenticated against the user's Cloudflare account.

**Executor:** Orchestrator + user in-session (not a subagent).

**Files:** none in repo (values live in local env files + a private worksheet).

**Acceptance Criteria:**
- [ ] `wrangler whoami` succeeds (user runs `wrangler login` if not).
- [ ] Fresh secrets generated (`openssl rand -base64 32` each): `TB_SHARED_SECRET`, `AUTH_TOKEN_SECRET`, `JWT_SECRET`, `ADMIN_SERVICE_TOKEN` (= Pages `TB_SERVICE_TOKEN`), plus a new memorable `INVITE_CODE` (not `letmecamp`) and Pocket UI passwords.
- [ ] Env-var worksheet complete (names recorded, values held by user):
  - **Pages project env:** `TB_URL=https://backend.<subdomain>.workers.dev`, `PUBLIC_TB_URL` (same value), `TB_SERVICE_TOKEN`, `TB_SHARED_SECRET`, `AUTH_TOKEN_SECRET`, `INVITE_CODE`. **Deliberately UNSET:** `RESEND_API_KEY`, `EMAIL_FROM`, `TB_ACCESS_CLIENT_ID/SECRET` (email stays console-logged; no Access).
  - **Worker secrets** (`backend/.prod.vars` / `wrangler secret put`): `JWT_SECRET`, `ADMIN_SERVICE_TOKEN`, `TB_SHARED_SECRET`, `APP_URL=https://<pages-project>.pages.dev`, `POCKET_UI_*_PASSWORD`s.
  - **`etl/.env` (prod runs):** `TB_API_URL=https://backend.<subdomain>.workers.dev`, `TB_SERVICE_TOKEN`, `TB_SHARED_SECRET`.

**Verify:** `wrangler whoami` output captured; worksheet reviewed together with every name filled.

**Steps:**
- [ ] **Step 1:** `wrangler whoami`; if unauthenticated, user runs `wrangler login` (suggest typing `! wrangler login` in the prompt so the OAuth flow runs interactively).
- [ ] **Step 2:** Generate the secrets above; fill the worksheet; confirm the workers.dev subdomain (`wrangler whoami` shows the account; subdomain visible in dashboard → Workers & Pages).

```json:metadata
{"files": [], "verifyCommand": "wrangler whoami; worksheet complete", "acceptanceCriteria": ["wrangler authenticated", "fresh secrets generated", "worksheet complete with RESEND/Access vars deliberately unset"], "modelTier": "orchestrator"}
```

---

## Task 14: Deploy backend + frontend to Cloudflare free tier (orchestrator + user)

**Goal:** Teenybase Worker live at `https://backend.<subdomain>.workers.dev` with prod D1 migrated and the `X-TB-Key` guard enforcing; SvelteKit app live at `https://<project>.pages.dev`.

**Executor:** Orchestrator drives `wrangler`/`pnpm`; user handles any dashboard-only steps. Expect Teenybase pre-alpha friction — debug rather than improvise architecture changes.

**Files:**
- Modify: `backend/wrangler.jsonc` only if the deploy requires it (prod D1 `database_id` after auto-create).

**Acceptance Criteria:**
- [ ] `cd backend && pnpm deploy` (or the Teenybase-documented `npx teeny` equivalent — check `backend/package.json` scripts first) succeeds; Worker reachable on its workers.dev URL.
- [ ] All migrations applied to prod D1: `wrangler d1 migrations list backend-db --remote` shows none pending (0001–0012; there is no 0013). Spot-check remotely: `saved_campgrounds` unique index + `merge_suggestions` SET NULL FKs exist.
- [ ] Worker secrets set (Task 13 worksheet), including `TB_SHARED_SECRET`, BEFORE any data exists.
- [ ] Guard proven live: `curl -X POST https://backend.<subdomain>.workers.dev/api/v1/table/facilities/list -d '{"limit":1}'` without `X-TB-Key` → 403; with the correct header → 200.
- [ ] Pages project created (root `frontend/`, adapter-cloudflare already configured), all worksheet env vars set, deploy succeeds, `https://<project>.pages.dev` renders the map with tiles.

**Verify:** blocked/allowed curl pair against the live Worker + the Pages URL rendering the map.

**Steps:**
- [ ] **Step 1:** Read `backend/package.json` deploy script; deploy the Worker (D1 `TEENY_AUTO_CREATE` should create/bind `backend-db` remotely; if it emits a concrete `database_id` into `wrangler.jsonc`, commit that change).
- [ ] **Step 2:** Apply migrations remotely (`pnpm migrate` with the remote flag Teenybase supports, else `wrangler d1 migrations apply backend-db --remote`).
- [ ] **Step 3:** Set all Worker secrets; re-deploy if required; run the guard curl pair — 403 without header MUST be confirmed before Task 15 seeds anything.
- [ ] **Step 4:** Create the Pages project (git integration or `wrangler pages deploy` — user's choice; direct upload is fine for a friends-only app), set env vars, deploy, load the site.

```json:metadata
{"files": ["backend/wrangler.jsonc"], "verifyCommand": "curl workers.dev without X-TB-Key -> 403, with header -> 200; https://<project>.pages.dev renders the map", "acceptanceCriteria": ["worker deployed on workers.dev", "prod migrations applied (none pending)", "guard enforced before data exists", "Pages live with env vars"], "modelTier": "orchestrator"}
```

---

## Task 15: Seed production data + promote admin (orchestrator)

**Goal:** Prod D1 holds the ~588 facilities; the owner's account exists and is admin.

**Executor:** Orchestrator, local terminal, `etl/.env` pointed at prod.

**Files:** none (env-file edits only, not committed).

**Acceptance Criteria:**
- [ ] `cd etl && pnpm sync && pnpm sync-nps` (and `pnpm discover` — tolerate 429s, rerun if needed) complete against the workers.dev URL with `TB_SHARED_SECRET` set; prod facility count ≈ local (~588).
- [ ] NO `testview@example.com` or other throwaway accounts in prod.
- [ ] Owner registers through the live site (with the prod invite code); then promote: `wrangler d1 execute backend-db --remote --command "UPDATE users SET role='admin' WHERE email='<owner-email>'"`; sign out/in; Admin link appears and `/admin` loads.

**Verify:** `wrangler d1 execute backend-db --remote --command "SELECT COUNT(*) FROM facilities"` ≈ 588; `SELECT email, role FROM users WHERE role IS NOT NULL` → exactly the owner.

**Steps:**
- [ ] **Step 1:** Point `etl/.env` at prod (worksheet values incl. `TB_SHARED_SECRET`); run the three syncs; watch for 403s on the first batch (means the header isn't reaching the Worker).
- [ ] **Step 2:** Register the owner account on the live site; promote via d1 execute; verify Admin access.

```json:metadata
{"files": [], "verifyCommand": "wrangler d1 execute backend-db --remote --command 'SELECT COUNT(*) FROM facilities'", "acceptanceCriteria": ["~588 facilities in prod", "no throwaway accounts", "owner is sole admin and /admin works"], "modelTier": "orchestrator"}
```

---

## Task 16: Post-deploy smoke checklist

**USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Goal:** Every user-facing flow proven working in production, and the Worker proven locked, before telling friends.

**Executor:** Orchestrator + user together on the live site.

**Files:** none; update `docs/handoff.md` with deployment state + any discovered prod limitations at the end.

**Acceptance Criteria (each captured with output/screenshot):**
- [ ] Direct `POST https://backend.<subdomain>.workers.dev/api/v1/table/users/auth/sign-up` (no `X-TB-Key`) with a `"role":"admin"` payload → 403 from the guard, never reaches Teenybase.
- [ ] Register with invite code → works; wrong code → "Invalid invite code."
- [ ] Password-reset round trip WITHOUT real email: trigger "Forgot password?" on the live site, read the reset link from the Pages function logs (`wrangler pages deployment tail --project-name <project>`), complete the reset; old password dead, new one works.
- [ ] Verification UI correctly absent: signed-in unverified user sees no nag banner and no account-page resend button (Task 12 behavior, `RESEND_API_KEY` unset in prod).
- [ ] Map search, save, rate, suggest-edit, report-duplicate each work once; admin approves one edit from the queue.
- [ ] Detail-panel alerts scrape: either alerts load, or the graceful-failure message shows — if fs.usda.gov blocks Cloudflare IPs, record it in `docs/handoff.md` as a known prod limitation.
- [ ] `docs/handoff.md` updated: deployment status, env-var worksheet location, smoke results.

**Verify:** All checklist items captured; handoff committed: `git add docs/handoff.md && git commit -m "docs(handoff): production deployment + smoke results"`.

```json:metadata
{"files": ["docs/handoff.md"], "verifyCommand": "manual prod walkthrough with captured outputs", "acceptanceCriteria": ["worker sign-up with role payload blocked 403 without X-TB-Key", "invite gate works", "reset round trip via Pages log link", "verify banner + resend absent in prod", "core flows + one admin approval work", "alerts scrape status recorded", "handoff updated"], "modelTier": "orchestrator", "userGate": true, "tags": ["user-gate"]}
```

---

## Dependency graph

- Task 2 ← Task 1 (needs the real merge)
- Tasks 3, 4 ← Task 2 (Phase 0 gates before new code)
- Task 5 ← 3, 4 · Task 6 ← 3, 4, 5 (shares `users.ts`)
- Tasks 7, 8, 9 ← 5, 6 (UI needs routes; run sequentially — 7 → 8 → 9 — to avoid authStore conflicts)
- Task 10 ← 9 (sweep runs after all Phase 1 files exist)
- Tasks 11, 12 ← 10 (both subagent-able; independent of each other — may run in parallel or in either order; 11 is backend-only, 12 is frontend-only)
- Task 13: independent, any time (user-paced)
- Task 14 ← 11, 12, 13 · Task 15 ← 14 · Task 16 ← 15
