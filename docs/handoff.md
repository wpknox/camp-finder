# CampFinder — Session Handoff

## What this is

CampFinder is a map-first web app for discovering Colorado campgrounds. See `CLAUDE.md` for stack, commands, architectural decisions, and Teenybase quirks. See `docs/design-language.md` ("Folded Field Map") before any UI work.

## Current status (2026-07-06)

~588 facilities seeded locally. All product features are built and live-verified: map/search/filters, detail panel, compare, auth (httpOnly cookies), saved, ratings/reviews, admin moderation (crowdsourced edits + duplicate merges), **password reset via emailed HMAC tokens, email verification (nag-only), invite-gated registration**.

Active branch: **`feat/release-readiness`** — NOT merged; PR to `main` planned after deployment. `main` is the pre-release-readiness state.

Plan being executed: `docs/superpowers/plans/2026-07-05-release-readiness.md` (+ `.tasks.json`). **Tasks 1–10 done. Tasks 11–14 (deployment) pending, blocked on one user decision (below).** Resume: `/superpowers-extended-cc:executing-plans docs/superpowers/plans/2026-07-05-release-readiness.md`.

## What's next

### FIRST — open decision blocking Tasks 11–14
Key discovery: `backend/src/index.ts` is our own Hono app wrapping Teenybase, so a ~10-line middleware rejecting requests without an `X-TB-Key` header locks the Worker down **without Cloudflare Access and without a domain** — `*.pages.dev` + `*.workers.dev` hosting at $0/mo. `tbFetch` and the ETL already send that header when `TB_SHARED_SECRET` is set.

A domain (~$10/yr, Cloudflare Registrar) is only genuinely needed for **Resend reset/verification emails to arbitrary recipients** + a nicer URL. (Fly.io / Raspberry Pi were evaluated and rejected: Teenybase needs the Workers runtime; a named CF Tunnel needs a domain anyway; capacity needs are trivial — 1 vCPU / 256–512 MB covers 20 concurrent users.)

**User must choose:** (a) buy a cheap domain → real emails; or (b) no domain → header guard + `workers.dev`, prod password resets done by admin via `wrangler d1 execute`. Either way, **re-cut plan Tasks 11–12** to the chosen mechanism (header-guard middleware replaces the Cloudflare Access steps currently written in the plan).

### Then — remaining plan tasks
- Task 11: account setup (domain/Resend/secrets — shape depends on the decision)
- Task 12: deploy backend (Worker + prod D1, migrations 0001–0012 — there is no 0013) and frontend (Pages; adapter-cloudflare already configured)
- Task 13: seed prod via local ETL runs; register owner on live site; promote admin via `wrangler d1 execute backend-db --remote --command "UPDATE users SET role='admin' WHERE email='<you>'"`
- Task 14: post-deploy smoke checklist (user gate) — must confirm the Worker rejects a direct `sign-up` carrying a `role` payload, and check whether fs.usda.gov alert scraping works from Cloudflare IPs (graceful failure exists if not)
- Then: PR `feat/release-readiness` → `main`

### Deployment security notes
- Teenybase register mass-assigns `role` (and `email_verified`, whose `noUpdate` we stripped) — mitigated entirely by the Worker guard; runtime is safe regardless (`requireAdmin` re-verifies server-side; the register proxy controls its outbound body).
- `ratings.listRule` privacy is moot once the Worker is guarded.

## This session's implementation facts (needed to work on the branch)

- **Tokens** (`frontend/src/lib/server/auth/tokens.ts`): stateless HMAC-SHA256 (Web Crypto); the user's `updated` column is mixed into the signature, so any record edit invalidates outstanding tokens (used reset links die automatically). Reset TTL 30 min, verify 24 h. Secret: `AUTH_TOKEN_SECRET`.
- **Email** (`frontend/src/lib/server/email.ts`): Resend REST via fetch; **no `RESEND_API_KEY` ⇒ emails console-logged** — dev flow is copy-the-link-from-the-terminal.
- **Routes**: `request-reset` (always-200, enumeration-safe, `emailLimiter` 5/15min, rejects `"`-bearing emails before WHERE interpolation), `reset`, `verify` (303 → `/?verified=1|0`, idempotent), `request-verify`. Register requires `inviteCode` == `INVITE_CODE` env, **fail-closed**; `/api/auth/me` returns `email_verified`.
- **Verified quirk**: service-token `users/edit` password writes ARE hashed correctly by Teenybase (spiked + proven). But `authFields.email_verified` shipped `noUpdate: true`, enforced even for the service token — fixed by mapping `usersFields` in `backend/teenybase.ts` (JS-level flag, no migration).
- **`tbFetch`** (`frontend/src/lib/server/tbFetch.ts`): ALL server-side Teenybase calls go through it (16 files + `etl/src/teenybase.ts`). Prefers private `TB_URL` over `PUBLIC_TB_URL`; adds `X-TB-Key` / CF-Access headers only when env vars set. `lib/server/**` imports it relatively (`../tbFetch`) because vitest doesn't resolve `$lib` for runtime imports; route files use `$lib/server/tbFetch`.
- **Overlay portal** (`frontend/src/lib/ui/portal.ts`): the detail panel's inline `transform` makes it the containing block for `position: fixed` children, so modals portal to `<body>` (ReviewsModal, AuthModal, ConfirmDialog). Use it for any future overlay opened from inside the panel.
- UI state: AuthModal has `login | register | forgot` modes + invite-code field; `/reset` page; `VerifyBanner` under nav (session dismiss via `cf-verify-dismissed`); account page shows verified status/resend.

## How to run locally

```bash
cd backend && pnpm dev    # :8787 — Pocket UI /api/v1/pocket/, Swagger /api/v1/doc/ui
cd frontend && pnpm dev   # :5173
cd etl && pnpm sync       # RIDB (needs etl/.env); pnpm discover (fs.usda.gov); pnpm sync-nps (NPS)
cd backend && pnpm generate && pnpm migrate   # after schema changes
```

Tests: `frontend pnpm check` (must be 0/0 before every commit) + `pnpm test` (40); `etl pnpm test` (108).

## Env files

- **`backend/.dev.vars`** — `APP_URL`, `JWT_SECRET`, `ADMIN_SERVICE_TOKEN`, `POCKET_UI_*_PASSWORD`
- **`frontend/.env`** — `PUBLIC_TB_URL=http://localhost:8787`, `TB_SERVICE_TOKEN` (= `ADMIN_SERVICE_TOKEN`), `AUTH_TOKEN_SECRET`, `INVITE_CODE=letmecamp`. Prod-only (all optional; unset locally): `TB_URL`, `TB_SHARED_SECRET`, `TB_ACCESS_CLIENT_ID/SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`
- **`etl/.env`** — `RIDB_API_KEY`, `TB_API_URL`, `TB_SERVICE_TOKEN`; optional `TB_SHARED_SECRET`, `TB_ACCESS_CLIENT_ID/SECRET`

## Accounts & data notes

- Admins: `willis+admin@email.com` (local). Promote via sqlite:
  `sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/<long-hash>.sqlite "UPDATE users SET role='admin' WHERE email='<you>'"` (use the long-hash file, not `metadata.sqlite`). Sign out/in afterwards for the Admin link.
- Test user: `testview@example.com` / `password123` (has a save + 4★ review on "Aspen Glade Campground" from gate testing — harmless).
- Data sources: RIDB `pnpm sync` (numeric ridb_id, ~271), fs.usda.gov `pnpm discover` (`fs-*`, ~300, expect 429s), NPS `pnpm sync-nps` (`nps-*`, 22). All dedupe by name + ~1km proximity and respect `merged_ridb_ids` (non-resurrection proven 2026-07-06).

## Useful checks

```bash
# facility count / merged records
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite \
  "SELECT COUNT(*) FROM facilities"
# bbox search through the frontend proxy
curl "http://localhost:5173/api/facilities?north=41&south=38&east=-104&west=-107"
```
