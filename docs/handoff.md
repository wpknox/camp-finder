# CampFinder — Session Handoff

## What this is

CampFinder is a map-first PWA for discovering Colorado campgrounds. See `CLAUDE.md` for stack, commands, architectural decisions, and quirks. See `docs/design-language.md` ("Folded Field Map" identity — palette, type, textures) before any UI work.

## Current status

~592 Colorado campgrounds seeded (270 RIDB + ~300 fs.usda.gov discovery + 22 NPS). Map, search, filters, detail panel, compare, auth, save, and ratings are all wired up. UI wears the "Folded Field Map" design identity end-to-end.

---

## Done this session (2026-07-04 — admin moderation + crowdsourced edits & duplicate merge)

Implemented the full `2026-07-03-admin-moderation-and-crowdsourced-edits.md` plan (all 10 tasks) on branch `feat/admin-moderation`. Not yet merged.

- **Schema** (migrations `0009` edit_suggestions, `0010` merge_suggestions, `0011` facilities.merged_ridb_ids; plus `users.role`): two new suggestion tables with ALL rules `'false'` (service-token-only), a nullable `users.role`, and `facilities.merged_ridb_ids` JSON. Frontend types added.
- **`requireAdmin` gate** (`frontend/src/lib/server/auth/admin.ts`): re-verifies `role` against the users table via `TB_SERVICE_TOKEN` on every call; role never trusted from JWT/cookie. `/api/auth/me` surfaces role display-only; AccountMenu shows an Admin link for admins.
- **Submission APIs**: `POST /api/suggestions` (edit patches) and `POST /api/duplicates` (duplicate flags) — rate-limited, `user_id` from `locals.user` only, unordered-pair dedupe for duplicates.
- **Admin review APIs**: `/api/admin/suggestions` + `/api/admin/merges` (GET queues with JS joins, POST approve/reject). Approve-edit deep-merges amenities per-key; approve-merge runs the merge engine (`lib/server/admin/merge.ts`, unit-tested): pickWinner (RIDB > NPS > fs-scrape, admin override), repoint ratings/saves with unique-index dedupe, delete loser alerts, accumulate `merged_ridb_ids`, delete loser last.
- **UI**: `SuggestEditModal` (diff-only submission) and `ReportDuplicateModal` (nearby-facility picker) in the detail panel; `/admin` review page with edit + merge queues (server-guarded by `requireAdmin`).
- **ETL respects merges**: `buildRidbIndex` + `listAllWithMerged` in `etl/src/teenybase.ts`; `discover.ts`/`sync-nps.ts` consult the index so a merged record is never resurrected. `etl pnpm test` 108/108.
- **Alerts cache bugfix**: the 24h cache lookup used a compound `&&` WHERE (which Teenybase rejects), so the cache never hit and every detail-panel open re-scraped fs.usda.gov. Now single-condition WHERE + JS freshness filter.

### Security-check outcome (register mass-assignment)
Teenybase's `users` register endpoint **mass-assigns arbitrary fields** — a `role: "admin"` in the register payload would set it directly, and the Worker is directly reachable on :8787. **Mitigation in place:** the role is never trusted from the client/JWT — `requireAdmin` always re-reads it server-side via the service token, and our own `/api/auth/register` proxy controls its outbound body. **Deployment blocker:** the Teenybase Worker must NOT be publicly reachable in prod until this is fixed upstream (or add a WAF rule / strip `role` via a trigger). See "Deployment blockers" below.

### Admin account
`willis+admin@email.com` is the current admin (promoted via sqlite this session). The old `campfinder-admin@example.com` was demoted (its password was set in an earlier session and is unrecoverable). Admin is promoted manually — there is no API path to it by design. The Admin link reads `role` from the login session, so after promotion you must **sign out/in** for the link to appear (the server gate works immediately regardless).
```bash
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "UPDATE users SET role='admin' WHERE email='<you>'"   # promote
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT email, role FROM users WHERE role IS NOT NULL" # verify
```
Note: the sqlite glob matches two files — use the long-hash `.sqlite`, not `metadata.sqlite`.

### Live-testing results (2026-07-04, servers up)
Exercised the flows end-to-end. Findings:
- **Suggest-an-edit: WORKS.** Approving an edit applies the patch to the facility (verified `picnicTables:true` and `{"fee_min":15}` landed in the DB). The `facilities/edit/{id}` endpoint is the same one the ETL uses.
- **Merge: WORKS** (data-wise) but surfaced one bug (now fixed):
  - **FIXED — cascade false-failure.** `merge_suggestions.facility_a`/`facility_b` were `onDelete: CASCADE`. A merge deletes the loser facility as its last step, which cascade-deleted the suggestion row mid-merge; the subsequent "mark approved" then 404'd and the UI showed "failed to update" even though the merge succeeded — and no approval audit record survived. Changed both FKs to `SET NULL` (migration `0012`, commit `dbba674`). **Restart the backend** after pulling — the migration recreated the table.
- **Known stale-cache UX gotcha (not a bug, by design):** the map store holds facilities from the last "Search this area" and never auto-refreshes (CLAUDE.md: "Map search is explicit, not reactive"). So after an admin approves an edit/merge, the map pins + a cached detail panel are stale until you re-search or reload. This is why an approved edit "looks like it didn't apply." See pending work item #2 for the intended fix.

### Pending work — moderation polish (next session)
Discussed with the user; decisions recorded:
1. **Field-level merge chooser** (the substantial piece). Today `mergeFacilityFields` always keeps the winner's `lat`/`lng`/`name` and only fills the winner's *empty* fields from the loser — so an admin can't keep record A's data but record B's better map marker (the real case hit: "PIKE COMMUNITY" had richer data, its duplicate had a better location). **Desired:** rework the merge engine to apply an explicit per-field A/B selection (INCLUDING `lat`/`lng` and `name`); extend `POST /api/admin/merges` to accept the selection map; rebuild the admin merge UI as side-by-side A|B with a master "use all of A / use all of B" toggle that sets every field's default, then per-field overrides the admin can flip. **Admin makes all choices** — the submitter just flags "same." TDD the engine (`lib/server/admin/merge.ts` + test).
2. **Detail-panel fresh fetch on open** (small). Fetch the single facility fresh when the detail panel opens so approved edits/merges show without a manual "Search this area." Fixes the stale-cache gotcha above.
3. Suggested execution: same as this session — write a short plan, run the fable orchestrator + subagents with the strict `pnpm check` 0/0-before-commit rule.

### Still unverified (optional)
- **ETL non-resurrection after a real merge**: after a live merge, `cd etl && pnpm sync` (+ `sync-nps`) → facility count unchanged, no resurrected pin. (Engine + `buildRidbIndex` unit-tested 108/108; the live post-merge sync wasn't run.)
- The "East Portal" pair from the original plan **no longer exists** as a natural duplicate (only the `nps-cure` record remains; the `blca` counterpart isn't in the DB). Use any real pair to exercise merges instead.

## Done in previous session (2026-06-16 — "Folded Field Map" design pass + fixes)

Merged to `main` via `b1378d9`.

- Full UI/UX design pass to the "Folded Field Map" identity (USGS Topo basemap, earthy palette, Fraunces/Hanken/JetBrains Mono type, paper textures) across every surface — nav, map/legend, filters, detail panel + children, auth modal, account page, reviews, compare view.
- New `CompareTray.svelte` — bottom-center paper "clipboard" listing compared campgrounds with per-item remove + clear-all.
- Save dedupe: unique `(user_id, facility_id)` index (migration `0008`, local D1 only), idempotent `POST /api/saved`, confirm-to-remove dialog.
- Fixed compare page returning nothing for 2+ ids (was using `||` in Teenybase WHERE, which Teenybase rejects same as `&&`) — now fetches all + filters in-process.
- Fixed account dropdown trapped under the map (nav stacking context / z-index).
- Mobile sidebar rework: results list is now tap-to-expand; fixed a bug where expanding Filters showed nothing.

## Done earlier (kept for context)

- 2026-06-11 — Merged `feat/auth-foundation` → main. Verified multi-user data isolation adversarially (`ratings` + `saved_campgrounds` siloed both directions). **Open caveat:** don't leave the Teenybase Worker openly internet-reachable in prod (or tighten `ratings.listRule`) if review authorship should ever be private.
- 2026-06-03 — Mobile layout overhaul, full-screen mobile detail panel, signed-in display-name indicator, auth modal UX polish, reviews reload-on-facility-change bug fix.
- NPS API pipeline built and run (`pnpm sync-nps`, 22 campgrounds across 8 CO parks). RIDB's `state=CO` filter silently drops NPS facilities whose parks span CO/UT (confirmed via Gates of Lodore).
- BLM investigation: BLM camping data is RIDB-derived already for listed campgrounds; non-RIDB BLM layers lack FCFS/amenity richness — deprioritized.

---

## What's next

### Immediate — verify + merge the moderation branch
`feat/admin-moderation` is code-complete and committed but not merged. Run the four unverified flows listed above with dev servers up, then merge to `main`. (The two former "medium priority" items — crowdsourced edits and duplicate merge — are now BUILT on this branch; see "Done this session".)

### Deployment blockers
- **Teenybase register mass-assigns `role`** — the Worker must not be publicly reachable in prod until fixed upstream (or add a WAF rule / strip `role` via a trigger). Runtime is safe because `requireAdmin` re-verifies server-side, but a directly-reachable Worker lets anyone self-assign `role='admin'` in the DB.
- Don't leave the Teenybase Worker openly internet-reachable in prod (or tighten `ratings.listRule`) if review authorship should ever be private.

### Lower priority
- **Deployment** (deferred until local testing is solid):
   - Frontend → Cloudflare Pages; Backend → `pnpm deploy` (Teenybase to Cloudflare Workers + D1)
   - Set production env vars
   - Run `pnpm generate && pnpm migrate` against prod D1 so all indexes/tables exist there — notably `saved_campgrounds` unique `(user_id, facility_id)` (migration `0008`) and the new moderation migrations `0009`/`0010`/`0011`, all currently local-only.

### Housekeeping
- A throwaway dev account `testview@example.com` (display name "Test Viewer", password `password123`) exists in the local D1. Harmless; delete if you want a clean users table.

---

## How to run locally

**Terminal 1 — Backend (Teenybase):**
```bash
cd backend && pnpm dev
# http://localhost:8787 — Admin UI at /api/v1/pocket/, Swagger at /api/v1/doc/ui
```

**Terminal 2 — Frontend (SvelteKit):**
```bash
cd frontend && pnpm dev
# http://localhost:5173
```

**ETL:**
```bash
cd etl && pnpm sync       # RIDB sync — requires etl/.env (RIDB_API_KEY, TB_SERVICE_TOKEN, TB_API_URL)
cd etl && pnpm discover   # fs.usda.gov scrape — no key needed, idempotent, expect some 429s
cd etl && pnpm sync-nps   # NPS API sync — idempotent, dedupes against all existing records
```

**Backend schema migration (after schema changes):**
```bash
cd backend && pnpm generate && pnpm migrate
```

## Key env files

- **`backend/.dev.vars`** — Teenybase local secrets (already configured): `APP_URL`, `JWT_SECRET`, `ADMIN_SERVICE_TOKEN`, `POCKET_UI_*_PASSWORD`, etc.
- **`etl/.env`** (user manages manually) — `RIDB_API_KEY`, `TB_API_URL=http://localhost:8787`, `TB_SERVICE_TOKEN` (matches `ADMIN_SERVICE_TOKEN`)
- **`frontend/.env`** (or `.env.local`) — `PUBLIC_TB_URL=http://localhost:8787`

## Data sources

| Source | Script | ridb_id format | Count |
|--------|--------|----------------|-------|
| RIDB API | `pnpm sync` | Numeric (e.g. `233847`) | ~270 |
| fs.usda.gov scrape | `pnpm discover` | `fs-[forest-slug]-[campground-slug]` | ~300 |
| NPS API | `pnpm sync-nps` | `nps-{parkCode}-{id}` | 22 |

`discover.ts` and `sync-nps.ts` both dedupe against existing records by name + lat/lng proximity (~1km) before inserting, patching the matched record instead of creating a duplicate where possible.

## RIDB data limitations

| Data | Available? | Source |
|---|---|---|
| Facility name, lat/lng, description | Yes | `/facilities` list |
| Managing agency | Yes | `ParentOrgID` field |
| FCFS vs reservable campsite counts | Yes | `/facilities/{id}/campsites` |
| Pets, picnic tables, fire rings, drive-up, max RV length | Partial | Campsite `ATTRIBUTES` |
| Potable water, toilet type, bear boxes | Partial | Parsed from `FacilityDescription` text |
| Fee data | Mostly missing | `FacilityUseFeeDescription` usually empty |
| fs.usda.gov link | None | Not in RIDB for CO campgrounds |
| Facility-level ATTRIBUTES | Empty | RIDB list/detail both return `[]` |

RIDB only covers campgrounds with recreation.gov listings; `pnpm discover` fills the gap for USFS campgrounds via fs.usda.gov scraping. Non-USFS campgrounds (BLM, state, county) are still missing.

## File map

```
camp-finder/
  backend/
    teenybase.ts          # Schema — single source of truth for all 7 tables
    migrations/           # Auto-generated SQL migrations (gitignored, run pnpm generate)
  etl/
    src/
      index.ts            # RIDB sync orchestrator — three-tier fee fallback
      ridb.ts / teenybase.ts / normalize.ts / fsScraper.ts / discover.ts / nps.ts / sync-nps.ts
      forests.ts           # CO_QUERY_PARAMS, parentOrgToAgency
      types.ts
    tests/                 # Vitest — fsScraper, fsDiscovery, normalize, nps, ridb
  frontend/
    src/
      lib/
        auth/              # authStore, AuthModal
        map/                # CampMap, mapStore
        filters/            # filterStore, FilterSidebar
        detail/             # DetailPanel + FCFSBadge, AmenityGrid, AlertsSection, RatingsSection, DataQualityWarning
        saved/              # SaveButton
        compare/            # compareStore, CompareView, CompareTray
      routes/
        api/facilities, api/alerts/[id], api/ratings/[facilityId]
        compare/
  docs/
    handoff.md              # This file
    design-language.md      # "Folded Field Map" visual identity
    campfinder-spec.md       # Original brainstorm spec
```

## Useful curl commands for verifying data

```bash
# List facilities
curl http://localhost:8787/api/v1/table/facilities/list -X POST \
  -H 'Content-Type: application/json' -d '{"limit": 5}'

# Check a specific facility by ridb_id
curl http://localhost:8787/api/v1/table/facilities/list -X POST \
  -H 'Content-Type: application/json' -d '{"where": "ridb_id == \"251844\"", "limit": 1}'

# Test the bbox search route
curl "http://localhost:5173/api/facilities?north=41&south=38&east=-104&west=-107"

# Count closed campgrounds
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT COUNT(*) FROM facilities WHERE is_closed = 1"

# Count NPS campgrounds
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT COUNT(*) FROM facilities WHERE ridb_id LIKE 'nps-%'"
```
