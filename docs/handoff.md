# CampFinder — Session Handoff

## What this is

CampFinder is a map-first web app for discovering Colorado campgrounds. See `CLAUDE.md` for stack, commands, architectural decisions, and Teenybase quirks. See `docs/design-language.md` ("Folded Field Map") before any UI work.

## Current status (2026-07-07): DEPLOYED TO PRODUCTION 🎉

The release-readiness plan (`docs/superpowers/plans/2026-07-05-release-readiness.md`) is **complete — all 16 tasks done**, branch merged to `main`. `main` is live and auto-deploys.

- **Frontend:** https://camp-finder.pages.dev — Cloudflare Pages, **git-integrated: every push to `main` auto-builds and deploys** (root dir `frontend`, `pnpm build`, output `.svelte-kit/cloudflare`).
- **Backend:** https://backend.misty-cell-863d.workers.dev — Teenybase Worker + prod D1 `backend-db`. Deploys are manual: `cd backend && pnpm deploy` (needs `.prod.vars`).
- **Lockdown:** `X-TB-Key` header guard live and verified (403 on all paths incl. Pocket UI without the secret; prod Pocket UI is intentionally unreachable — admin data access is `wrangler d1 execute backend-db --remote`).
- **Free tier throughout:** no domain, no Resend, no CF Access. `RESEND_API_KEY`/`EMAIL_FROM`/`TB_ACCESS_*` deliberately unset in prod.
- **Data:** ~540 facilities seeded (271 RIDB, ~250 fs.usda.gov, 21 NPS). ~50 fs.usda.gov stragglers remain (429s) — rerun `cd etl && pnpm discover` with prod `.env` values to top up; dedupe makes reruns safe.
- **Accounts:** `knox.wp@gmail.com` is the sole user and sole admin. Invite code: `fcfscamp` (Pages env var `INVITE_CODE`; changing it only affects new registrations).

### Secrets

All prod secrets live in the owner's private worksheet (generated 2026-07-07, never in git) + `backend/.prod.vars` (gitignored). Pages env vars: `TB_URL`/`PUBLIC_TB_URL` (worker URL), `TB_SERVICE_TOKEN`, `TB_SHARED_SECRET`, `AUTH_TOKEN_SECRET`, `INVITE_CODE`. Worker secrets: `JWT_SECRET(_USERS)`, `ADMIN_JWT_SECRET`, `ADMIN_SERVICE_TOKEN`, `TB_SHARED_SECRET`, `APP_URL`, `POCKET_UI_*_PASSWORD`.

### Smoke results (2026-07-07, all captured)

- Direct Worker sign-up with `role:"admin"` payload, no `X-TB-Key` → 403 from guard ✓
- Wrong invite code → 403 "Invalid invite code." ✓
- Password-reset round trip via link read from `wrangler pages deployment tail` ✓ (old password dead, new works)
- Verify banner + account resend correctly ABSENT (`email_enabled:false`) ✓
- Map search / save / rate / suggest-edit / report-duplicate / admin approval ✓
- Alerts scrape from prod ✓

### Prod bugs found & fixed during smoke

- **`Buffer` broke sessions on Pages** (`2e91c43`): `decodeJwtPayload` used Node `Buffer`, unavailable on Pages functions without `nodejs_compat`. Every request's JWT decode threw → silent refresh per request → parallel requests ("Search this area") raced refresh-token rotation → loser cleared session cookies. Fixed with `atob`/`TextDecoder`. **Lesson: Pages functions are not Node — web APIs only in `frontend/src/lib/server` and routes.**
- Teenybase deploy quirks: `teeny deploy --remote` keeps its own migration ledger (`_db_migrations`) and settings (`$settings` in `_ddb_internal_kv`) **inside D1** — applying migrations via plain `wrangler d1 migrations apply` satisfies wrangler but leaves Teenybase reporting "Table not found". A crashed teeny deploy required dropping the empty tables and letting teeny redo it end-to-end. Also: teeny's API settings sync is blocked by the X-TB-Key guard — temporarily `wrangler secret delete TB_SHARED_SECRET`, deploy, re-run `pnpm secrets-upload`.

### Known limitations / follow-ups

- **Reset links are admin-delivered:** with no email sending, "Forgot password?" logs the link to Pages logs; the admin reads it via `cd frontend && npx wrangler pages deployment tail --project-name camp-finder` and hands it to the user. Possible improvement: an admin-only `/admin` surface that regenerates a user's reset link (must NEVER be shown to the unauthenticated requester — that's account takeover).
- **/reset page is left-aligned** instead of centered — cosmetic bug, unfixed.
- fs.usda.gov rate-limits the scraper (HTTP 429); multi-pass `pnpm discover` with 10–15 min cooldowns converges.

### Wishlist: expand suggest-an-edit fields (owner request, 2026-07-07)

Users should additionally be able to suggest edits for:
1. **Site counts** — total sites and FCFS site count (`fcfs_total`/`reservable_total`; note the derived `is_fully_fcfs`/`is_partial_fcfs` flags must be recomputed on approval).
2. **Campground location** — coordinates. Typing lat/lng works, but drag/place a pin on a map would be much better; needs a richer edit UI than the current field-patch form (map picker in the suggest-edit modal).
3. **Closed status** — whether the campground is closed (`is_closed`; drives the red marker).

## How to run locally

```bash
cd backend && pnpm dev    # :8787 — Pocket UI /api/v1/pocket/, Swagger /api/v1/doc/ui
cd frontend && pnpm dev   # :5173
cd etl && pnpm sync       # RIDB; pnpm discover (fs.usda.gov); pnpm sync-nps (NPS)
cd backend && pnpm generate && pnpm migrate   # after schema changes
```

Tests: `frontend pnpm check` (0/0 before every commit) + `pnpm test` (40); `etl pnpm test` (108).

**Teenybase regenerated `backend/migrations/` as a squashed 0000–0006 set during the prod deploy** (gitignored; old 0001–0012 history is gone — local dev DB predates the squash and is fine).

## Env files

- **`backend/.dev.vars`** — `APP_URL`, `JWT_SECRET(_USERS)`, `ADMIN_JWT_SECRET`, `ADMIN_SERVICE_TOKEN`, `POCKET_UI_*_PASSWORD`
- **`backend/.prod.vars`** — same names with prod values + `TB_SHARED_SECRET` (uploaded via `pnpm secrets-upload`)
- **`frontend/.env`** — `PUBLIC_TB_URL=http://localhost:8787`, `TB_SERVICE_TOKEN`, `AUTH_TOKEN_SECRET`, `INVITE_CODE=letmecamp` (local)
- **`etl/.env`** — `RIDB_API_KEY`, `NPS_API_KEY`, `TB_API_URL`, `TB_SERVICE_TOKEN`; add `TB_SHARED_SECRET` + worker URL for prod runs

## Accounts & data notes

- Local admin: `willis+admin@email.com`; local test user `testview@example.com` / `password123`. Prod has NO test accounts.
- Local promote via sqlite: `sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/<long-hash>.sqlite "UPDATE users SET role='admin' WHERE email='<you>'"`. Prod promote: `cd backend && npx wrangler d1 execute backend-db --remote --command "UPDATE users SET role='admin' WHERE email='<you>'"`.
- All ETL sources dedupe by name + ~1km proximity and respect `merged_ridb_ids`.

## Useful checks

```bash
# prod facility count
cd backend && npx wrangler d1 execute backend-db --remote --command "SELECT COUNT(*) FROM facilities"
# prod bbox search through the live frontend
curl "https://camp-finder.pages.dev/api/facilities?north=41&south=38&east=-104&west=-107"
# guard sanity: expect 403
curl -X POST https://backend.misty-cell-863d.workers.dev/api/v1/table/facilities/list -d '{"limit":1}'
```
