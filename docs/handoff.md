# CampFinder — Session Handoff

## What this is

CampFinder is a map-first web app for discovering Colorado campgrounds. See `CLAUDE.md` for stack, commands, architectural decisions, and Teenybase quirks. See `docs/design-language.md` ("Folded Field Map") before any UI work.

## Current status (2026-07-06)

~588 facilities seeded locally. All product features are built and live-verified: map/search/filters, detail panel, compare, auth (httpOnly cookies), saved, ratings/reviews, admin moderation (crowdsourced edits + duplicate merges), **password reset via emailed HMAC tokens, email verification (nag-only), invite-gated registration**.

Active branch: **`feat/release-readiness`** — NOT merged; PR to `main` planned after deployment. `main` is the pre-release-readiness state.

Plan being executed: `docs/superpowers/plans/2026-07-05-release-readiness.md` (+ `.tasks.json`). **Tasks 1–10 done. Tasks 11–14 (deployment) pending, blocked on one user decision (below).** Resume: `/superpowers-extended-cc:executing-plans docs/superpowers/plans/2026-07-05-release-readiness.md`.

## What's next

### DECISION MADE (2026-07-07): free tier, no domain, no Resend
Worker lockdown = `X-TB-Key` header guard; hosting on `*.workers.dev` + `*.pages.dev` ($0/mo); reset links read from Pages logs (`wrangler pages deployment tail`) by the admin; email UI hidden when `RESEND_API_KEY` unset. User also declined CI/CD (manual wrangler deploys). Plan re-cut accordingly, commit `73d03be` — Tasks 11–14 became Tasks 11–16 (`.tasks.json` ids 15–20).

### Resume point (session ended 2026-07-07 mid-execution)
Was about to dispatch parallel implementer subagents (subagent-driven-development skill) for the two code tasks — **neither has been started, no code written**:
- **Task 11** (id 15): `X-TB-Key` guard in `backend/src/index.ts` — full code in plan doc (wrap `app.fetch`, NOT Hono middleware).
- **Task 12** (id 16): hide verify banner + account resend when `email_enabled` false; `/api/auth/me` gains `email_enabled` — full code in plan doc.

Then in-session with user: Task 13 secrets worksheet + `wrangler whoami`, Task 14 deploy, Task 15 seed + admin promote, Task 16 smoke gate (reset via log link; verify UI absent), then PR to `main`.

Resume: `/superpowers-extended-cc:subagent-driven-development docs/superpowers/plans/2026-07-05-release-readiness.md`

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
