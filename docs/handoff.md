# CampFinder — Session Handoff

## What this is

CampFinder is a map-first web app for discovering Colorado campgrounds. See `CLAUDE.md` for stack, commands, architectural decisions, and Teenybase quirks. See `docs/design-language.md` ("Folded Field Map") before any UI work.

## Current status (2026-07-07): DEPLOYED TO PRODUCTION 🎉

The release-readiness plan (`docs/superpowers/plans/2026-07-05-release-readiness.md`) is **complete — all 16 tasks done**, branch merged to `main`. `main` is live and auto-deploys.

- **Frontend:** https://camp-finder.pages.dev — Cloudflare Pages, **git-integrated: every push to `main` auto-builds and deploys** (root dir `frontend`, `pnpm build`, output `.svelte-kit/cloudflare`).
- **Backend:** https://backend.misty-cell-863d.workers.dev — Teenybase Worker + prod D1 `backend-db`. Deploys are manual: `cd backend && pnpm deploy` (needs `.prod.vars`).
- **Lockdown:** `X-TB-Key` header guard live and verified (403 on all paths incl. Pocket UI without the secret; prod Pocket UI is intentionally unreachable — admin data access is `wrangler d1 execute backend-db --remote`).
- **Free tier throughout:** no domain, no Resend, no CF Access. `RESEND_API_KEY`/`EMAIL_FROM`/`TB_ACCESS_*` deliberately unset in prod.
- **Data:** 649 facilities (2026-07-08 grid-sweep resync: 353 RIDB-sourced, rest fs.usda.gov/NPS; 102 RIDB ids absorbed into scraped rows via `merged_ridb_ids`). ~50 fs.usda.gov stragglers remain (429s) — rerun `cd etl && pnpm discover` with prod `.env` values to top up; dedupe makes reruns safe.
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

### Session 2026-07-08 — ETL grid-sweep redesign + prod resync

The old RIDB sync (`state=CO&activity=CAMPING`) silently missed ~80 real campgrounds: RIDB's `state` filter matches the facility *address record* and `activity` its ACTIVITY list — both empty for many real campgrounds (e.g. ROSY LANE 232157). Redesigned in `etl/`:

- **Grid sweep** (`forests.ts`): lat/lng radius queries over the CO bbox (RIDB clamps `radius` to ~25mi), dedupe by FacilityID, filter to bbox coords.
- **Junk filter**: `facilitytype=Campground` includes trailheads/day-use/a cemetery; skip facilities with zero *overnight* campsites (only when the campsite fetch succeeded).
- **Cross-source dedupe** (`dedupe.ts`, shared by sync/discover/sync-nps): canonicalized names (strips parens, " - District" suffixes, "Campground") + ~1km proximity. New RIDB ids matching existing `fs-*`/`nps-*` rows are absorbed into `merged_ridb_ids` (enriched, not duplicated).
- **Update-clobber protection** (`teenybase.ts` UpsertOptions): re-syncs no longer reset `is_closed` or wipe fees/fs_url/description another source populated.
- **Retry/backoff** in RidbClient for 429/5xx.
- Prod resync ran clean: 1001 candidates → 694 junk-skipped → 307 campgrounds upserted, 102 absorbed, 566→649 facilities. Tests: 127 ETL (was 108).

**Leftover:** pre-existing duplicate pairs from the old weak name-match (e.g. RIDB "Lodgepole (Taylor River…)" + `fs-gmug-lodgepole-campground-gunnison-rd`, ditto Lottis Creek) are still in prod — merge via the /admin duplicate UI.

### Known limitations / follow-ups

- ~~Reset links are admin-delivered~~ **DONE 2026-07-08**: `/admin` now has a "Password reset link" section (`POST /api/admin/reset-link`, gated by `requireAdmin`; link shown only to the authenticated admin, valid 30 min). Pages-log tailing no longer needed.
- ~~/reset page is left-aligned~~ **FIXED 2026-07-08**: `.app-shell` is a flex row, so the page needed `flex: 1` — card now centers.
- fs.usda.gov rate-limits the scraper (HTTP 429); multi-pass `pnpm discover` with 10–15 min cooldowns converges.
- SonarQube (sonarjs) repo scan 2026-07-08 left unfixed: super-linear regexes in `auth/validate.ts` (email — hit by public auth routes), `auth/tokens.ts`, `api/alerts/[id]`, `etl fsScraper/normalize`; plus minor hygiene (unused import in filterStore, nested ternary in ratings route, `Math.random()` in username.ts). Re-run with `eslint.sonar.config.mjs` (repo root, untracked).

### Session 2026-07-11 — moderation wishlist built (`feat/moderation-wishlist`, PR open)

Both wishlist items below are **implemented** on `feat/moderation-wishlist` (11 commits, plan: `docs/superpowers/plans/2026-07-11-moderation-wishlist.md`), awaiting owner code review + merge.

- **Expanded suggest-an-edit**: site counts (`fcfs_total`/`reservable_total`, derived FCFS flags recomputed on approval via shared `$lib/fcfs.ts`), closed status, and location via a draggable-pin Leaflet picker (`LocationPicker.svelte`). New fields validated in `/api/suggestions`.
- **Suggest-a-deletion**: `delete_suggestions` table (all rules `'false'`), required reason, `FlagDeletionModal` entry next to report-duplicate, `/admin` "Deletion flags" queue. Approval **tombstones** (`facilities.is_deleted`) — public bbox route filters tombstones, ETL never updates/resurrects them (`etl/tests/tombstone.test.ts`).
- **Admin UX**: `/admin` is now its own scroll container (the `.app-shell` overflow:hidden lock made it unscrollable); "View on map" links on all three queues; location edits render a before/after mini-map (`LocationDiffMap.svelte`); admins opening a detail panel see a "⚑ N pending reviews" pill linking to `/admin` (`/api/admin/pending/[facilityId]`).
- **⚠ Deploy order**: run `cd backend && pnpm deploy` (new table + column) BEFORE merging to `main` — the auto-deployed frontend 500s on `/api/deletions` without the schema.
- **⚠ Local dev DB trap (root-caused & fixed)**: commit `b8e4073` (7/7 prod deploy) changed `database_id` in `wrangler.jsonc`, which re-keys miniflare's local D1 storage — every dev run since bound a NEW empty DB ("no such table" everywhere). Fixed by copying the old sqlite over the new object and hand-applying the new DDL. The served file is now `da240ff2…sqlite` (use THIS hash for the sqlite promote command below). `pnpm migrate` (`teeny deploy --local`) proved unreliable locally (ledger-only writes, empty `migrations/`) — for local schema changes prefer direct SQL against the served sqlite + verify with a real request.
- Tests now: frontend 44 (`pnpm check` 0/0), etl 130.

### ~~Wishlist: expand suggest-an-edit fields (owner request, 2026-07-07)~~ — DONE 2026-07-11 (see session note above)

Users should additionally be able to suggest edits for:
1. **Site counts** — total sites and FCFS site count (`fcfs_total`/`reservable_total`; note the derived `is_fully_fcfs`/`is_partial_fcfs` flags must be recomputed on approval).
2. **Campground location** — coordinates. Typing lat/lng works, but drag/place a pin on a map would be much better; needs a richer edit UI than the current field-patch form (map picker in the suggest-edit modal).
3. **Closed status** — whether the campground is closed (`is_closed`; drives the red marker).

### ~~Wishlist: suggest-a-deletion (owner request, 2026-07-09)~~ — DONE 2026-07-11 (see session note above)

Users should be able to flag a facility for **deletion** — some records aren't real campgrounds (bad scrape/RIDB entries). A **reason is required** (free text), same as the reason we'd want on any moderation action. Suggested shape:
- New `delete_suggestions` table (mirror `merge_suggestions`: `facility`, `reason`, `status` pending|approved|rejected, reviewer fields; **ALL rules `'false'`**, service-token-only via SvelteKit server routes — Teenybase can't express role checks or compound WHERE).
- Approval should **soft-delete / tombstone** rather than hard-delete, so the ETL doesn't resurrect the row on the next sync (compare the `merged_ridb_ids` absorb pattern — likely a `deleted`/`suppressed` flag the ETL respects, since a deleted `ridb_id` would otherwise reappear).
- Surface the flag entry point next to the existing report-duplicate action; approve/reject from `/admin` alongside edits and merges.

~~Also: **favicon + PWA icons**~~ — **DONE 2026-07-08**: owner-supplied icon set (mountain-ridge logo, Folded Field Map palette) lives in `frontend/static/icons/` (16/32 favicons, 180 apple-touch, 48/192/512 + `site.webmanifest`); wired into `app.html` head, `theme-color` now `#44542f`.

## How to run locally

```bash
cd backend && pnpm dev    # :8787 — Pocket UI /api/v1/pocket/, Swagger /api/v1/doc/ui
cd frontend && pnpm dev   # :5173
cd etl && pnpm sync       # RIDB; pnpm discover (fs.usda.gov); pnpm sync-nps (NPS)
cd backend && pnpm generate && pnpm migrate   # after schema changes
```

Tests: `frontend pnpm check` (0/0 before every commit) + `pnpm test` (40); `etl pnpm test` (127).

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
