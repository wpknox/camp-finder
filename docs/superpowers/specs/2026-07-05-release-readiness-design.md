# CampFinder Release Readiness — Design

**Date:** 2026-07-05
**Goal:** Get CampFinder deployed on Cloudflare so the owner and a few friends can use it, with working password recovery, email verification, invite-gated registration, and a Teenybase Worker that is not publicly abusable.

**Execution model:** Implementation is done by cheaper subagents (Sonnet/Opus) following the implementation plan; Fable orchestrates and reviews. Standing rule from prior sessions: `pnpm check` must be 0 errors / 0 warnings before every commit; Svelte 5 runes only.

---

## Scope

| In scope | Out of scope |
|---|---|
| Live verification of merge UI + ETL non-resurrection | User notifications for moderation outcomes (logged in handoff) |
| Password reset via email (Resend) | Per-person invite codes / invite admin UI |
| Email verification (nag-only, blocks nothing) | Blocking unverified users from any feature |
| Invite-code-gated registration | ETL cron / scheduled prod syncs (manual re-runs are fine) |
| Production deployment: Pages + Workers + D1, locked-down Worker, custom domain, prod seeding | Any new user-facing features |

Decisions already made with the user:

- **Domain:** buy the cheapest available domain close to "campfinder" (Cloudflare Registrar, at-cost). Candidates checked at purchase time.
- **Worker lockdown:** Cloudflare Access (Zero Trust) service token in front of the Teenybase Worker.
- **Invite code:** one shared code in an env var.
- **Email verification:** included now, but purely a nag — nothing is gated on it.

---

## Section 1 — Password reset, email verification, invite code

### Email sending

- **Provider:** Resend free tier (3k emails/month), called with plain `fetch` from SvelteKit server routes — no SDK dependency.
- **Sender:** `noreply@<domain>`. Requires the domain verified in Resend (SPF/DKIM records added in Cloudflare DNS — one-time manual step, user does this with exact instructions from the plan).
- **Dev behavior:** if `RESEND_API_KEY` is unset, log the email (including the link) to the console instead of sending. This keeps local dev and agent testing key-free.
- One small server module `frontend/src/lib/server/email.ts`: `sendEmail({to, subject, html})` plus the two templates (reset, verify). Plain, lightly styled HTML consistent with the app's tone; no images/fonts (email clients + Folded Field Map textures don't mix).

### Tokens — stateless HMAC, no new table

Token = base64url payload `{uid, purpose: 'reset' | 'verify', exp}` + HMAC-SHA256 signature over the payload **concatenated with the user's current `updated_at`**, keyed by a new `AUTH_TOKEN_SECRET` env var.

- Reset tokens expire in **30 minutes**; verify tokens in **24 hours**.
- A used reset token self-invalidates: consuming it changes the password, Teenybase bumps `updated_at`, and the signature no longer matches. No token table, no cleanup job, no replay within the window after use.
- Verification via Web Crypto (`crypto.subtle`) so it runs on Workers — **not** Node's `crypto` module.
- Sign/verify lives in `frontend/src/lib/server/auth/tokens.ts`, built TDD (tamper, expiry, wrong purpose, stale `updated_at` cases).

### Schema change (the only one)

- ~~`users.email_verified` — integer/boolean, default 0. Migration `0013` via `pnpm generate && pnpm migrate`.~~ **Correction (plan-writing research):** `email_verified BOOLEAN NOT NULL DEFAULT 0` already exists — Teenybase's `authFields` scaffold ships it. **No migration needed; zero schema changes.**
- Set to 1 only by the verify route using `TB_SERVICE_TOKEN`. Never writable by the user (register proxy controls its outbound body, same pattern as `role`).
- **Registration order note:** Teenybase register mass-assigns fields, so the register proxy must continue to send only the allowlisted fields; `email_verified` must not be accepted from the client.

### Routes (all SvelteKit server-side; Teenybase writes via service token)

| Route | Behavior |
|---|---|
| `POST /api/auth/request-reset` | Body `{email}`. **Always 200** (no account enumeration). If the account exists, email a link to `/reset?token=…`. Rate-limited. |
| `POST /api/auth/reset` | Body `{token, password}`. Validate token (purpose `reset`), update password via service token, return 200. Client then routes to sign-in. |
| `GET /api/auth/verify?token=…` | Validate token (purpose `verify`), set `email_verified = 1`, redirect to `/` with a success indicator. Invalid/expired → redirect with an error indicator. |
| `POST /api/auth/request-verify` | Authenticated (from `locals.user`). Re-sends the verification email. Rate-limited. |
| `POST /api/auth/register` (existing) | Gains: (1) required `inviteCode` field compared against `INVITE_CODE` env — mismatch → 403 before anything else; (2) best-effort verification email after successful registration (send failure never fails registration). |

Rate limiting reuses `createRateLimiter` from `lib/server/auth/rateLimit.ts` (new limiter for email-sending routes, e.g. 5 sends / 15 min per IP). Known limitation: the in-memory limiter is per-isolate on Workers, so it's soft protection in prod — acceptable at friends scale, noted for the future.

### UI

- **AuthModal:** "Forgot password?" link on the sign-in tab → inline email form → "check your email" confirmation. Register tab gains a required "Invite code" field. All new fields use the existing per-field blur-validation pattern.
- **`/reset` page:** new-password + confirm form; posts to `/api/auth/reset`; success routes user to sign in. Handles invalid/expired token with a "request a new link" path.
- **Verify nag:** dismissible banner (per-session dismissal is fine) shown to signed-in users with `email_verified = 0`, with a "resend email" action. Also a resend button + verified status on the account page. `/api/auth/me` surfaces `email_verified` the same display-only way it surfaces `role`.
- All new UI follows `docs/design-language.md`.

---

## Section 2 — Worker lockdown + deployment

### Lockdown: Cloudflare Access service token

The browser never calls the Teenybase Worker (verified: every `PUBLIC_TB_URL` use is in server-only code). So:

- Worker gets a hostname on the new domain, e.g. `tb.<domain>`.
- A Cloudflare Zero Trust **Access application** covers `tb.<domain>` with a **service-token-only** policy: any request without valid `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers is rejected at the edge before reaching the Worker.
- This closes both handoff deployment blockers: register mass-assignment of `role` is unreachable from outside, and `ratings` authorship privacy is moot.
- Two service tokens: one for the SvelteKit frontend, one for the ETL (separately revocable).

### Code change: central `tbFetch` wrapper

Today `PUBLIC_TB_URL` fetches are scattered across ~12 server files. Introduce `frontend/src/lib/server/tbFetch.ts`:

- `tbFetch(path, init?)` — prefixes the Teenybase base URL and, **when `TB_ACCESS_CLIENT_ID`/`TB_ACCESS_CLIENT_SECRET` env vars are present**, adds the Access headers. Locally those vars are unset and behavior is identical to today.
- Mechanically refactor all server-side Teenybase fetches to use it. No behavior change locally; `pnpm check` + existing tests must stay green.
- ETL (`etl/src/teenybase.ts`) gets the same optional-header treatment driven by `etl/.env`.
- `PUBLIC_TB_URL` should become a private env var (`TB_URL`) in the process — nothing about it needs to be public, and private is the correct signal. Keep a fallback read of the old name so local `.env` files keep working.

### Deployment steps

Split into **agent work** (code/config in repo) and **user actions** (dashboard/CLI steps the plan spells out exactly — agents cannot click the Cloudflare dashboard, and account-level actions like buying the domain are the user's).

**User actions (with exact instructions in the plan):**
1. Buy domain via Cloudflare Registrar (agent supplies a checked shortlist of available cheap `campfinder`-adjacent names first).
2. Create Resend account, add + verify the domain (DNS records land in Cloudflare DNS), create `RESEND_API_KEY`.
3. Zero Trust: create the Access application for `tb.<domain>` + two service tokens.
4. `wrangler login` (once) so agents can drive `wrangler`/`pnpm deploy` from the terminal with the user's account.
5. Set production secrets: backend `.prod.vars` (fresh `JWT_SECRET`, fresh `ADMIN_SERVICE_TOKEN`, Pocket UI passwords) and Pages env vars (`TB_URL`, `TB_SERVICE_TOKEN`, `AUTH_TOKEN_SECRET`, `INVITE_CODE`, `RESEND_API_KEY`, `TB_ACCESS_CLIENT_ID/SECRET`). `RIDB_API_KEY` stays ETL-only — verified the frontend never calls RIDB directly.

**Agent/CLI work:**
1. Backend: `pnpm deploy` (Teenybase → Workers + D1), attach `tb.<domain>` route, run migrations against **prod** D1 (`pnpm generate && pnpm migrate` with prod target — migrations 0008–0013 are all currently local-only).
2. Frontend: Cloudflare Pages project wired to the repo (`adapter-cloudflare` is already configured), custom domain `<domain>`.
3. Seed prod: run ETL locally against prod (`pnpm sync`, `pnpm discover`, `pnpm sync-nps`) with the ETL Access token. Do **not** create the throwaway `testview@example.com` account in prod.
4. Promote the admin in prod via `wrangler d1 execute backend-db --remote --command "UPDATE users SET role='admin' WHERE email='…'"` (the local sqlite3 trick doesn't apply to prod).

### Post-deploy smoke checklist

- Direct request to `tb.<domain>` without Access headers → blocked (403 from Access). Specifically confirm `users/register` with a `role` field is unreachable.
- Register with invite code → works; without → 403.
- Full password-reset round trip with a real email.
- Verification email round trip; nag banner clears.
- Detail panel alerts scrape works from Cloudflare's IPs (**known risk:** fs.usda.gov may block cloud IPs; the UI already fails gracefully, but check early — if blocked, alerts become a documented prod limitation for now).
- Map search, save, rate, suggest-edit, admin queue each exercised once in prod.

---

## Section 3 — Pre-deploy verification (do first)

These come **before** any new code, since they gate trusting the moderation feature in prod:

1. **Live browser test of the side-by-side merge UI** (never exercised end-to-end): flag a real duplicate pair, open `/admin`, use the A|B field grid including a per-field override, approve, confirm merged result + repointed ratings/saves + closed detail panel on the merged-away facility. Playwright MCP tools or manual with dev servers up.
2. **ETL non-resurrection after that real merge:** run `pnpm sync` and `pnpm sync-nps`; facility count unchanged, no resurrected pin, `merged_ridb_ids` respected.

Any bug found here is fixed before the release work starts.

---

## Build order

1. **Phase 0 — verification:** merge-UI live test + ETL non-resurrection (Section 3).
2. **Phase 1 — auth/email features, local:** tokens module (TDD) → email module → routes (reset, verify, invite gate) → UI (AuthModal, `/reset`, nag banner). Fully testable locally with console-logged emails.
3. **Phase 2 — lockdown refactor, local:** `tbFetch` wrapper + mechanical refactor + ETL headers. Behavior-neutral locally.
4. **Phase 3 — deployment:** interleaved user actions + agent CLI work as above, ending with the smoke checklist.

Phases 1 and 2 are independent and could be parallelized across subagents (separate files), but sequential is fine.

## Error handling & testing summary

- Token module: TDD (tamper/expiry/purpose/stale-stamp).
- Email send failures: never fail the parent operation (register still succeeds; request-reset still returns 200); log server-side.
- Reset/verify with bad tokens: explicit user-facing error states with a re-request path.
- `pnpm check` 0/0 and `pnpm test` (frontend + etl) green before every commit.
- Existing tests must not regress during the `tbFetch` refactor.

## Risks / open items

- **fs.usda.gov scraping from Cloudflare IPs** may be blocked — smoke-test early; graceful degradation already exists.
- **Teenybase pre-alpha** (`pnpm deploy` path lightly documented) — expect some friction deploying the Worker; budget for it.
- **In-memory rate limiting is per-isolate on Workers** — soft protection only; fine at friends scale.
- **Domain availability/price** unknown until purchase time — shortlist step handles it.
