# CampFinder — Session Handoff

## What this is

CampFinder is a map-first web app for discovering Colorado campgrounds. See `CLAUDE.md` for stack, commands, architectural decisions, and Teenybase quirks. See `docs/design-language.md` ("Folded Field Map") before any UI work.

## Current status (2026-07-16): DEPLOYED + SOFT-LAUNCHED 🎉 — PR #3 awaiting owner review

The app is in a good spot to share with real users. Moderation wishlist merged (PR #2), brand icon unified, prod smoke-checked. **Post-launch features (directions, elevation+weather, nearby, cell coverage) are built and reviewed on PR #3** — owner is reviewing; merge must follow the backend schema deploy (see session 2026-07-16). See "Wishlist: post-launch" below for the known future work.

## Deploy status (2026-07-07)

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

### Session 2026-07-11 — moderation wishlist built (merged to `main` as PR #2)

Both wishlist items below are **implemented** on `feat/moderation-wishlist` (11 commits, plan: `docs/superpowers/plans/2026-07-11-moderation-wishlist.md`) and **merged to `main`** later the same day.

- **Expanded suggest-an-edit**: site counts (`fcfs_total`/`reservable_total`, derived FCFS flags recomputed on approval via shared `$lib/fcfs.ts`), closed status, and location via a draggable-pin Leaflet picker (`LocationPicker.svelte`). New fields validated in `/api/suggestions`.
- **Suggest-a-deletion**: `delete_suggestions` table (all rules `'false'`), required reason, `FlagDeletionModal` entry next to report-duplicate, `/admin` "Deletion flags" queue. Approval **tombstones** (`facilities.is_deleted`) — public bbox route filters tombstones, ETL never updates/resurrects them (`etl/tests/tombstone.test.ts`).
- **Admin UX**: `/admin` is now its own scroll container (the `.app-shell` overflow:hidden lock made it unscrollable); "View on map" links on all three queues; location edits render a before/after mini-map (`LocationDiffMap.svelte`); admins opening a detail panel see a "⚑ N pending reviews" pill linking to `/admin` (`/api/admin/pending/[facilityId]`).
- **⚠ Deploy order**: run `cd backend && pnpm deploy` (new table + column) BEFORE merging to `main` — the auto-deployed frontend 500s on `/api/deletions` without the schema.
- **⚠ Local dev DB trap (root-caused & fixed)**: commit `b8e4073` (7/7 prod deploy) changed `database_id` in `wrangler.jsonc`, which re-keys miniflare's local D1 storage — every dev run since bound a NEW empty DB ("no such table" everywhere). Fixed by copying the old sqlite over the new object and hand-applying the new DDL. The served file is now `da240ff2…sqlite` (use THIS hash for the sqlite promote command below). `pnpm migrate` (`teeny deploy --local`) proved unreliable locally (ledger-only writes, empty `migrations/`) — for local schema changes prefer direct SQL against the served sqlite + verify with a real request.
- Tests now: frontend 44 (`pnpm check` 0/0), etl 130.

### Session 2026-07-16 — post-launch features built (PR #3 open, NOT merged)

All four feature tiers from `docs/superpowers/plans/2026-07-14-post-launch-features.md` (spec: `docs/superpowers/specs/2026-07-14-post-launch-features-design.md`) are **implemented and reviewed** on `feat/post-launch-features` — 22 commits, subagent-driven with two-stage review per task plus a final whole-branch review (verdict: ready to merge). **PR #3 is open; owner reviews and decides the merge.**

- **Directions deep-links**: Google Maps universal link everywhere, Apple Maps added on iOS (`$lib/platform.ts`).
- **Elevation + weather**: `facilities.elevation_m` backfilled by `cd etl && pnpm enrich-elevation` (Open-Meteo, keyless; already run against local). Shown in detail header + Compare. `WeatherStrip.svelte` fetches a 7-day elevation-corrected forecast client-side.
- **Things nearby**: `nearby_pois` cache table + `/api/nearby/[id]` (Overpass on miss, 7-day TTL, serve-stale on failure) + `NearbySection`. **Field note:** the section hides entirely when Overpass fails and no cache exists — during this session overpass-api.de 504'd under load, then 429'd our IP (timeouts stack a cooldown penalty). Normal usage (1 query/campground/week) is fine; if chronic, add a mirror fallback (kumi.systems) and a short server-side no-retry window on 429/504.
- **Cell coverage**: `facilities.cell_coverage` JSON (Verizon/AT&T/T-Mobile + `as_of` + `user_edited`), offline enrichment via `cd etl && pnpm enrich-cell --as-of YYYY-MM` from FCC BDC H3 res-9 CSVs (download runbook: `etl/README.md`). Chips in detail panel, Cell Signal row in Compare. **Not yet populated anywhere — FCC download pending** (UI hides on null, so shipping without it is safe).
- **Crowdsourced carrier overrides**: suggest-an-edit now has a carrier tri-state group; admin approval merges only suggested carriers and appends them to `user_edited` (never clobbered by `enrich-cell`). **Semantic decision:** suggesting "Unknown" (null) *relinquishes* ownership — the key is removed from `user_edited` so FCC data can repopulate it.
- Tests now: frontend 64 (`pnpm check` 0/0), etl 143. Local D1 got the new DDL by hand (miniflare trap, see 2026-07-11 note); all 588 local facilities have `elevation_m`.

**⚠ Remaining rollout steps (in order — deploy order matters, `main` auto-deploys the frontend):**
1. Backend schema deploy: `cd backend && npx wrangler secret delete TB_SHARED_SECRET` → `pnpm deploy` → `pnpm secrets-upload` (the X-TB-Key settings-sync quirk, see 2026-07-07). Verify `nearby_pois` with a real request, not the ledger.
2. Prod enrichment: `cd etl && pnpm enrich-elevation` with prod env values (`enrich-cell` waits on the FCC download).
3. Merge PR #3 → Pages auto-deploy → smoke (detail panel: directions/elevation/weather/nearby; Compare rows).

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

### Session 2026-07-11 (later) — merged, icon unified, soft launch

- **PR #2 merged to `main`** and auto-deployed; prod smoke-checked after merge (main page 200, bbox API 200 with data — the `/api/deletions` schema was already live in prod).
- **Brand icon unified** (`989b217`): the header mark in `+layout.svelte` was a generic tent triangle that didn't match the favicon set. Redrawn as the same mountain-range + clay-sun mark on a cream (`--paper-2`) tile, so the browser tab and the top-left brand are now the same icon.
- **GitHub "Cannot update the protected ref" (resolved)**: the repo ruleset `main` (id 18509008) had picked up a `update` ("Restrict updates") rule — that rule blocks ALL ref updates including PR merges, not just direct pushes. If the error recurs, edit https://github.com/wpknox/camp-finder/rules/18509008 and keep only `deletion` + `non_fast_forward` (add `pull_request` if we want to require PRs).

### Session 2026-07-14 — post-launch features: spec + plan written, execution NOT started

Researched and designed four post-launch feature tiers; spec and implementation
plan are committed, **no implementation code exists yet**.

- **Spec:** `docs/superpowers/specs/2026-07-14-post-launch-features-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-14-post-launch-features.md` (+ co-located `.tasks.json`, 13 tasks with dependencies)
- **Branch:** `feat/post-launch-features` (created from `main`, this session)

The four tiers, each independently shippable, in order: (1) directions
deep-links (Google everywhere + Apple Maps on iOS), (2) `elevation_m` column +
ETL `enrich-elevation` (Open-Meteo) + 7-day elevation-corrected weather strip,
(3) "things nearby" — Overpass trailheads/grocery/fuel cached in a new
`nearby_pois` table like alerts, (4) FCC cell-coverage enrichment
(`enrich-cell`, h3-js) + carrier chips + **crowdsourced carrier overrides**
through the existing suggest-an-edit flow (`user_edited` carriers are never
clobbered by the FCC refresh).

**Key ordering constraint (in the plan):** backend schema deploy (`cd backend
&& pnpm deploy`) must land in prod BEFORE the frontend merge to `main`; local
schema DDL is applied by hand per the known miniflare trap.

**⏭ Next session: execute the plan with subagent-driven development** — invoke
`superpowers-extended-cc:subagent-driven-development` against the plan file (or
`/superpowers-extended-cc:executing-plans docs/superpowers/plans/2026-07-14-post-launch-features.md`
in a fresh session); the `.tasks.json` carries full per-task briefs.

**Deferred (needs its own brainstorm/spec):** road-conditions & trail-status
reports — ephemeral timestamped condition-report model, not facility edits
(owner request 2026-07-14; see spec's "Deferred" section).

### Wishlist: post-launch (owner, 2026-07-11)

Deliberately deferred until user feedback justifies them:

1. **Domain + real email**: buy a domain, then wire up Resend for real email verification and password reset (the code paths exist but are disabled — `RESEND_API_KEY`/`EMAIL_FROM` deliberately unset in prod; reset links are currently admin-generated from `/admin`).
2. **Submitter notifications**: the admin review UI has a "note to submitter" box on suggestions, but **it does nothing today** — the note is stored with the review and is never delivered to the user. Wiring it up probably depends on email (item 1), or an in-app inbox/banner.
3. **Submitter attribution for admins**: it would be cool if the admin queues showed WHO made each edit suggestion / deletion flag / duplicate-merge request. All three tables (`edit_suggestions`, `merge_suggestions`, `delete_suggestions`) already store `user_id` — this is purely a display gap: resolve the username/email server-side (service token, `users/view/{id}`) in the `/api/admin/*` list routes and show it in the three `/admin` queues.
4. **Automate the FCC cell-coverage download (`pnpm fetch-fcc`)** (owner request, 2026-07-16): the BDC Public Data API can replace the manual `etl/README.md` click-path — `listAsOfDates` → `listAvailabilityData/{as_of_date}?category=Provider&subcategory=Hexagon Coverage&technology_type=Mobile Broadband` (filter state_fips 08, 4G LTE, Verizon/AT&T Mobility/T-Mobile) → `downloadFile/availability/{file_id}` → unzip into `etl/data/fcc/`, then chain `enrich-cell --as-of`. Auth is a free FCC User Registration account + self-service token (broadbandmap.fcc.gov login → username menu → Manage API Access → Generate); headers `username` + `hash_value`; rate limit 10 calls/min (we need ~5). Owner still needs to register + generate the token (`FCC_USERNAME`/`FCC_HASH_VALUE` in `etl/.env`). Reference docs in owner's Downloads: `bdc-public-data-api-swagger.yaml`, `bdc-public-data-api-specifications.pdf`.
5. **Road conditions & trail status reports** (deferred 2026-07-14): ephemeral timestamped camper reports ("road washed out", "trail snowed in") — different data model from permanent facility facts (needs expiry/decay), so it needs its own spec before any build.
6. **WeatherStrip timezone** (final-review note, 2026-07-16): `timezone=America/Denver` is hardcoded — fine for CO, wrong day-bucketing if the app ever covers other states; Open-Meteo supports `timezone=auto`. Same review noted chips render `false` (FCC says no) and `null` (unknown) identically as ○.

### Feedback-driven from here

The app is now being shared with real users. **The next round of work should be driven by their feedback** — collect what campers actually ask for (pain points, missing data, confusing UI) rather than speculating. Revisit the wishlist above as feedback confirms demand.

## How to run locally

```bash
cd backend && pnpm dev    # :8787 — Pocket UI /api/v1/pocket/, Swagger /api/v1/doc/ui
cd frontend && pnpm dev   # :5173
cd etl && pnpm sync       # RIDB; pnpm discover (fs.usda.gov); pnpm sync-nps (NPS)
cd backend && pnpm generate && pnpm migrate   # after schema changes
```

Tests: `frontend pnpm check` (0/0 before every commit) + `pnpm test` (64); `etl pnpm test` (143).

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
