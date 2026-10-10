# CampFinder — Handoff

Current state, next steps and hard-won gotchas. Stack, rules and code map: `CLAUDE.md`. Per-session history: `git log -p docs/handoff.md` and PRs #1–#6.

## Status (2026-10-10)

- **Live and soft-launched** (since 2026-07-11). PRs #1–#6 are merged and deployed. #6 (2026-10-10): submit routes return `{ ok: true }` and log Teenybase errors instead of relaying them; whitespace-only suggest-an-edit fields are blank, not `0` (`lib/editChanges.ts`); a merge rejects the loser's other pending flags/merges and `/admin` drops its rows (`lib/admin/queues.ts` `refsFacility`); elevation is fetched on campground approve and on approved moves (`lib/server/elevation.ts`).
- **The owner's stance:** next work should come from user feedback, not speculation.

## Next session: research (no building yet)

The owner wants a **research session** on one or both tracks below. Deliverable: a findings doc in `docs/research/` (sources, options compared, a recommendation and a rough phased plan), reviewed with the owner before any code. Verify claims against primary docs and real requests, not memory. The goal is a site the owner and friends use to find campsites anywhere in the **Mountain West** (CO, UT, WY, MT, ID, NM, AZ, NV), not just Colorado.

### Track A: expand the database to most Mountain West states

What's CO-specific today:
- **ETL discovery:** `etl/src/forests.ts` has `CO_BBOX`/`inCoBbox` and `buildCoGrid()`. RIDB clamps `radius` to ~25 mi, so coverage is a grid of radius queries (0.4° × 0.5° steps); deliberately no `state`/`activity` filter (both drop real campgrounds). The forest list and fs.usda.gov scrape (`fsScraper.ts`, `discover.ts`) are CO forests; fs.usda.gov 429s (multi-pass with 10–15 min cooldowns). NPS via `sync-nps.ts`. Dedupe (`dedupe.ts`) absorbs `fs-`/`nps-`/`user-` rows.
- **FCC cell data:** state_fips 08 only, CSVs on the owner's machine (`etl/README.md`). `enrich-cell` marks out-of-region facilities all-`false` instead of null.
- **Frontend:** `WeatherStrip` hardcodes `timezone=America/Denver` (use `auto`); check the default map view and any CO wording.

Questions to answer:
- **Volume and limits:** how many campgrounds would 8 states add (RIDB, NPS, FS), how many RIDB calls a grid sweep needs (grid points × pages, rate limits), and whether D1/Teenybase free tier holds it (rows, 100k writes/day, `tbList` `limit: 10000` reads in `loadLookups` and `listPublicFacilities` that load all facilities).
- **Better sources:** RIDB bulk export / full-dataset CSV vs the grid sweep; USFS EDW / Enterprise Data Warehouse recreation-site datasets (e.g. "Recreation Opportunities" feature service) as a replacement for scraping fs.usda.gov; BLM recreation sites; state park APIs; OSM `tourism=camp_site` as a gap check. Prefer bulk/official datasets that make discovery repeatable and less manual.
- **Generalizing the ETL:** a `regions` config (state, bbox or polygon, forests, FCC state_fips) instead of `CO_*`; per-region runs and idempotent reruns.
- **Cell coverage at scale:** see the deferred design below; the FCC BDC API (wishlist #4 `pnpm fetch-fcc`) becomes worth it at 8 states × 3 carriers.
- **Backend fit:** whether Teenybase (no compound WHERE, everything filtered in JS after a 10k-row list) still works at ~5–10× the rows, or what the map query needs (bbox WHERE / an index).

### Track B: make Nearby work

The owner says Nearby "does not seem to work well at all". **Measured 2026-10-10:** `GET /api/nearby/<id>` on prod returned `{ pois: null }` for all 6 CO campgrounds tried (so the section hides). Running the same Overpass query from a laptop: `overpass-api.de` 504'd after ~13 s (the route aborts at 10 s), `overpass.kumi.systems` took ~13 s and returned nothing usable, `overpass.private.coffee` 500'd. The public Overpass instances are the problem, likely made worse by Cloudflare's shared egress IPs.

How it works: `lib/server/overpass.ts` builds one query (named `highway=trailhead` within 8 km; named supermarket/convenience and fuel within 25 km; `out center 200`), and `normalizeOverpass` keeps 6 trailheads + 1 grocery + 1 fuel. `routes/api/nearby/[id]/+server.ts` caches in `nearby_pois` for 7 days and serves stale on failure, but a facility that never succeeded has no row.

Questions to answer:
- **Data source:** precompute in the ETL (offline Overpass or a Geofabrik OSM extract for the region, filtered with osmium) and store POIs per facility, vs a more reliable API (e.g. an Overpass instance with an SLA, Mapbox/HERE/Google Places/Foursquare free tiers, OpenTripMap), vs a hybrid. Precomputing removes the runtime dependency entirely and scales to new states with the same extract.
- **What "activities" should mean:** today it's only trailheads/grocery/fuel. Candidates: trails (USFS trail datasets, OSM `route=hiking`), lakes/fishing access, hot springs, viewpoints, dump stations, water fill, ranger stations. Check what the owner and friends actually want.
- **Quality:** named-only filtering drops many trailheads; 25 km radius by straight line misleads in the mountains; consider drive distance or at least labeling.
- **Check first:** `wrangler pages deployment tail` while opening a detail panel, to confirm the prod failure mode (timeout vs 429 vs 403 from Overpass), and `SELECT COUNT(*), MAX(fetched_at) FROM nearby_pois` in prod (wrangler wasn't logged in on 2026-10-10: run `npx wrangler login` first).

### Deferred work these tracks touch

1. **Cell coverage for approved user campgrounds.** `cell_coverage` still comes only from the offline `enrich-cell` run; rerun it against prod after approvals. Planned design (2026-10-10): a `cell_tiles` table with one row per H3 res-5 parent holding three 2,401-bit carrier bitsets (CO ≈ 1,054 rows / ~1.3 MB; a row per res-9 cell is ~1.77M rows for CO, which the free tier's 100k writes/day can't load). A tile row is authoritative over its extent; no tile ⇒ null. h3-js is asm.js; import its browser build in Pages to avoid the Node `require("fs")` branch. Carrier tri-states on the suggest form were also deferred: chips render `null` and `false` identically, so partly known carriers would read as "no signal".
2. **Merge gaps:** `mergeFacilityFields` ignores `elevation_m`/`cell_coverage` (a loser's values are lost when the winner's are null, including when the loser's location is chosen). Pending edits on the loser cascade-delete with no audit row. Pending rows involving the winner show pre-merge data until reload.
3. **Orphaned rows in prod** from earlier merges (pending deletion flags/merges with a NULL facility): reject them via `/admin` once (it shows a "reject to clear" hint).
4. **Backend choice:** stay on Teenybase (pre-alpha; no compound WHERE, local migrate pain) or move to something similar with more features. Track A's findings should inform this.

**Unverified in prod (owner):** a real-request `campground_suggestions/list` → 200; a suggest-a-campground smoke test (submit → approve → marker → flag for deletion); the PR #3 smoke list (elevation/weather/cell on a Denver-area panel, Has Cell Service filter, directions, Nearby, Compare rows, mobile filter collapse).

## Prod

- **Frontend:** https://camp-finder.pages.dev. Pages is git-integrated, so **every push to `main` auto-deploys** (root `frontend`, `pnpm build`, output `.svelte-kit/cloudflare`).
- **Backend:** https://backend.misty-cell-863d.workers.dev (Teenybase Worker + D1 `backend-db`). Deploys are manual.
- **Free tier throughout:** no domain, Resend or CF Access (`RESEND_API_KEY`/`EMAIL_FROM`/`TB_ACCESS_*` unset). Reset links are generated by an admin in `/admin` ("Password reset link"), or read from `wrangler pages deployment tail`.
- **Lockdown:** the `X-TB-Key` guard 403s every path without the secret, including Pocket UI (unreachable in prod by design). Admin data access is `wrangler d1 execute backend-db --remote`.
- **Data:** 647 facilities (RIDB + fs.usda.gov + NPS + user-submitted).
- **Accounts:** knox.wp@gmail.com is the sole user and admin. Invite code `fcfscamp` (Pages env `INVITE_CODE`; changing it only affects new registrations). No test accounts in prod.

### Deploy procedure (schema changes)

1. **Backend first, and deploy it before merging the frontend.** Pages auto-deploys `main`, and new routes 500 without their tables.
2. The guard blocks teeny's settings sync, so run `npx wrangler secret delete TB_SHARED_SECRET` → `pnpm deploy` → `pnpm secrets-upload` (in `backend/`), then confirm a request without the key gets a 403.
3. Verify the new table with a real request (e.g. `POST /api/v1/table/<table>/list` → 200), not the migration ledger.
4. Merge to `main`.

## Secrets & env files

Prod secrets live in the owner's private worksheet and `backend/.prod.vars` (gitignored). CF Worker secrets are write-only, so those two are the readable source of truth.

- **Pages env:** `TB_URL`/`PUBLIC_TB_URL`, `TB_SERVICE_TOKEN`, `TB_SHARED_SECRET`, `AUTH_TOKEN_SECRET`, `INVITE_CODE`
- **`backend/.dev.vars`:** `APP_URL`, `JWT_SECRET(_USERS)`, `ADMIN_JWT_SECRET`, `ADMIN_SERVICE_TOKEN`, `POCKET_UI_*_PASSWORD`. **`.prod.vars`:** the same names + `TB_SHARED_SECRET`
- **`frontend/.env`:** `PUBLIC_TB_URL=http://localhost:8787`, `TB_SERVICE_TOKEN`, `AUTH_TOKEN_SECRET`, `INVITE_CODE=letmecamp`
- **`etl/.env`:** `RIDB_API_KEY`, `NPS_API_KEY`, `TB_API_URL`, `TB_SERVICE_TOKEN`. **For prod runs, add `TB_SHARED_SECRET`** and the worker URL; the ETL sends the header only when the var is set, so without it every request 403s. The ETL's `TB_SERVICE_TOKEN` is the backend's `ADMIN_SERVICE_TOKEN`. Revert to local values afterwards.

## Local dev

```bash
cd backend && pnpm dev    # :8787 — Pocket UI /api/v1/pocket/, Swagger /api/v1/doc/ui
cd frontend && pnpm dev   # :5173 — emails print here as [email:dev] (reset links)
```

Tests: frontend `pnpm check` (0/0 before every commit) + `pnpm test` (185); etl `pnpm test` (155); root `pnpm format:check`.

- Local admin `willis+admin@email.com`; test user `testview@example.com` / `password123` (also promoted to admin locally).
- Promote locally with `sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/da240ff2….sqlite "UPDATE users SET role='admin' WHERE email='<you>'"`. In prod: `cd backend && npx wrangler d1 execute backend-db --remote --command "…"`.
- Leftover local test data: facility "Playwright Edited Meadow" (`user-bqrxpgIFSNK-j9daMGcutA`).

## Gotchas

- **Pages functions are not Node.** Use web APIs only in `frontend/src/lib/server` and routes. A `Buffer` call (fixed in `2e91c43`) made every JWT decode throw, and the parallel refresh races then silently cleared sessions.
- **Local D1 schema changes:** miniflare keys the sqlite file by `database_id`, and the served file is `da240ff2…`. The worker routes tables from `backend/.local-persist/config.json`, so **update both the sqlite and config.json by hand**, then verify with real HTTP. Never run `pnpm migrate` locally while they disagree: it fails partway and reverts config.json. The gitignored `backend/migrations/` numbering is meaningless.
- **Teenybase keeps its migration ledger and settings inside D1.** Plain `wrangler d1 migrations apply` leaves teeny reporting "Table not found". If a teeny deploy crashes, drop the empty tables and rerun it.
- **Rate limits:** fs.usda.gov 429s the scraper (multi-pass `pnpm discover` with 10–15 min cooldowns converges; dedupe makes reruns safe). Overpass 504s/429s under load and timeouts stack a cooldown. The Nearby section hides when there's no cache, and a mirror fallback (kumi.systems) is the fix if this becomes chronic.
- **FCC cell data:** the download flow is in `etl/README.md`. Never filter on `environmnt`: coverage is the union of both values.
- **Carrier overrides:** suggesting "Unknown" removes the carrier from `user_edited`, so FCC data can repopulate it.
- **Blank numerics save as `0` in suggest-a-campground** (by design in `draftToSubmission`), so a fee of 0 reads as "free" even when the submitter just didn't know. Suggest-an-edit sends blank as `null`.
- **GitHub "Cannot update the protected ref":** the `main` ruleset (https://github.com/wpknox/camp-finder/rules/18509008) picked up an `update` rule. Keep only `deletion` + `non_fast_forward`.

## Known issues

- ~50 fs.usda.gov stragglers are still missing (rerun `pnpm discover` with prod `.env`).
- Old duplicate pairs are still in prod (e.g. RIDB "Lodgepole (Taylor River…)" + `fs-gmug-lodgepole-campground-gunnison-rd`, Lottis Creek). Merge them via `/admin`.
- SonarQube findings (2026-07-08, rerun with the untracked `eslint.sonar.config.mjs`): super-linear regexes in `auth/validate.ts` (reachable from public auth routes), `auth/tokens.ts`, `api/alerts/[id]`, `etl fsScraper/normalize`; minor hygiene.
- No test for the `toiletType` check in `/api/suggestions`.
- `WeatherStrip` hardcodes `timezone=America/Denver` (use `auto` if the app leaves CO). Cell chips render `false` and `null` identically.

## Wishlist (deferred until feedback justifies it)

1. **Domain + Resend:** real verification and reset email (the code paths exist).
2. **Submitter notifications:** the admin "note to submitter" is stored but never delivered (depends on 1, or an in-app inbox).
3. **Submitter attribution in `/admin`:** suggestion tables already store `user_id`; resolve it via `users/view/{id}` in the `/api/admin/*` list routes.
4. **`pnpm fetch-fcc`:** automate the FCC download via the BDC Public Data API: `listAsOfDates` → `listAvailabilityData/{date}?category=Provider&subcategory=Hexagon Coverage&technology_type=Mobile Broadband` (state_fips 08, 4G LTE, Verizon/AT&T Mobility/T-Mobile) → `downloadFile/availability/{file_id}` → unzip to `etl/data/fcc/` → `enrich-cell --as-of`. Auth headers are `username` + `hash_value` (`FCC_USERNAME`/`FCC_HASH_VALUE` in `etl/.env`), limit 10 calls/min. Blocked on the owner generating a token (broadbandmap.fcc.gov → Manage API Access). Swagger/spec PDFs are in the owner's Downloads.
5. **Road/trail condition reports:** ephemeral, expiring reports; needs its own spec first.

## Useful checks

```bash
cd backend && npx wrangler d1 execute backend-db --remote --command "SELECT COUNT(*) FROM facilities"
curl "https://camp-finder.pages.dev/api/facilities?north=41&south=38&east=-104&west=-107"
curl -X POST https://backend.misty-cell-863d.workers.dev/api/v1/table/facilities/list -d '{"limit":1}'  # expect 403
```
