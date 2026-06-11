# CampFinder — Session Handoff

## What this is

CampFinder is a map-first PWA for discovering Colorado campgrounds. Built on:
- **Frontend**: SvelteKit (Svelte 5 runes) + Leaflet + OpenStreetMap, hosted on Cloudflare Pages
- **Backend**: Teenybase (Cloudflare Workers + D1), REST API at `/api/v1/table/<name>/...`
- **ETL**: Node/TypeScript scripts — pulls from RIDB API and scrapes fs.usda.gov, normalizes, writes to Teenybase

## Current status: ~592 campgrounds (RIDB + FS + NPS all synced)

**~592 Colorado campgrounds seeded** (270 from RIDB + ~300 discovered from fs.usda.gov + 22 from NPS API). Map, search, detail panel, filters, compare, auth, save, and ratings all wired up. Closed campgrounds show a red marker and a sticky red banner. UI/UX needs a polish pass before deployment.

**NPS API pipeline is built, tested, and run.** `pnpm sync-nps` added 22 NPS campgrounds across all 8 CO parks (5 ROMO + 17 from the rest), including Gates of Lodore Campground (the original motivation). Park codes: romo, dino, meve, blca, cure, grsa, colm, flfo (flfo has no campgrounds). Re-run anytime — it's idempotent and dedupes against all existing records.

**NPS bug fixed:** `NpsClient.getCampgrounds` was using `URLSearchParams.set()`, which percent-encoded the comma in the multi-park `parkCode` query to `%2C`. The NPS API mishandles that, silently returning only the first park (`romo`, `total: 5`) and breaking pagination. Fixed by building the query string with literal commas (`etl/src/nps.ts`).

**Known data quirk:** "East Portal Campground" appears under both `cure` and `blca` (NPS lists it under both units) — inserted as two records with distinct `nps-{parkCode}-{id}` IDs. Likely the same physical campground; not yet deduped.

**Why NPS was added:** RIDB `state=CO` filter silently drops NPS facilities whose parks span CO/UT — confirmed with Gates of Lodore Campground (RIDB ID `10199750`, `ParentOrgID: 128`, no `FACILITYADDRESS`). NPS API returns `numberOfSitesFirstComeFirstServe` and `numberOfSitesReservable` directly, plus structured amenities (toilet type, potable water, food storage lockers, RV length, electric hookups).

**Current branch:** `main` — `feat/auth-foundation` was **merged** on 2026-06-11 (`--no-ff`, commit `656ac82`), after multi-user data isolation was verified (see below). The `feat/auth-foundation` branch still exists locally and can be deleted (`git branch -d feat/auth-foundation`).

---

## How to run locally

**Terminal 1 — Backend (Teenybase):**
```bash
cd backend && pnpm dev
# Runs on http://localhost:8787
# Admin UI:  http://localhost:8787/api/v1/pocket/
# Swagger:   http://localhost:8787/api/v1/doc/ui
```

**Terminal 2 — Frontend (SvelteKit):**
```bash
cd frontend && pnpm dev
# Runs on http://localhost:5173
```

**ETL — RIDB sync:**
```bash
cd etl && pnpm sync
# Requires etl/.env with RIDB_API_KEY, TB_SERVICE_TOKEN, TB_API_URL
# TB_SERVICE_TOKEN matches ADMIN_SERVICE_TOKEN in backend/.dev.vars
# Takes ~3-5 minutes for 270 facilities
```

**ETL — FS campground discovery:**
```bash
cd etl && pnpm discover
# No API key needed — scrapes fs.usda.gov
# Discovers FCFS-only campgrounds not in RIDB
# Also patches RIDB records with fs_url, is_closed, and fee data from FS pages
# Expect some 429s from fs.usda.gov; script is idempotent, re-run to fill gaps
```

**Backend schema migration (after schema changes):**
```bash
cd backend && pnpm generate && pnpm migrate
```

---

## Key env files

**`backend/.dev.vars`** — Teenybase local secrets (already configured):
- `APP_URL`, `JWT_SECRET`, `ADMIN_SERVICE_TOKEN`, `POCKET_UI_*_PASSWORD`, etc.

**`etl/.env`** — ETL secrets (user manages manually):
- `RIDB_API_KEY=<user's key>`
- `TB_API_URL=http://localhost:8787`
- `TB_SERVICE_TOKEN=<matches ADMIN_SERVICE_TOKEN in .dev.vars>`

**`frontend/.env`** (or `.env.local`):
- `PUBLIC_TB_URL=http://localhost:8787`

---

## Critical technical decisions (do not deviate)

### Svelte 5 runes — mandatory
All `.svelte` files use Svelte 5 syntax. Never use Svelte 4 patterns.
- State: `let x = $state(0)` — not `let x = 0`
- Props: `let { prop } = $props()` — not `export let prop`
- Derived: `let y = $derived(x * 2)` — not `$: y = x * 2`
- Effects: `$effect(() => { ... })` — not `$: { ... }`
- Events: `onclick={fn}` — not `on:click={fn}`
- Slots: `{@render children()}` — not `<slot />`
- Event dispatch: callback props (`onclose`, `onselect`) — not `createEventDispatcher`

### Teenybase JSON fields must be stringified
When writing to Teenybase, `json`-typed fields (like `amenities`) must be sent as `JSON.stringify(value)` strings — not plain objects. When reading back, parse them: `typeof f.amenities === 'string' ? JSON.parse(f.amenities) : f.amenities`.

### Teenybase WHERE clause limitation
**Teenybase does not support compound WHERE expressions** (`&&` or `AND` both fail with parse errors). Work around this by fetching all records with a high `limit` and filtering in the SvelteKit server route. This is fine at current scale (~570 campgrounds). See `frontend/src/routes/api/facilities/+server.ts`.

### Teenybase auth
- Service-side writes use `TB_SERVICE_TOKEN` (sent as `Authorization: Bearer <token>` from `+server.ts` routes only — never exposed to client)
- Auth endpoints: `POST /api/v1/table/users/auth/sign-up`, `/auth/login-password`, `/auth/refresh-token`, `/auth/logout`

#### Auth foundation rework (httpOnly cookie session — implemented)
Auth is now **httpOnly-cookie based; no token is ever in client JS** (replaces the old `localStorage` `cf_auth` token).
- SvelteKit server routes `/api/auth/{register,login,logout,me}` proxy Teenybase and set two httpOnly cookies `cf_access` + `cf_refresh` (`Secure` in prod, `SameSite=Lax`, 30-day cookie lifetime).
- `hooks.server.ts` reads `cf_access` each request, decodes the JWT for identity + `exp`, and silently refreshes via `/auth/refresh-token` when expired; populates `event.locals.user` (`{id, username, email}`), exposed to pages via `+layout.server.ts`.
- Registration fixed: derives a hidden Teenybase-legal `username` (`src/lib/server/auth/username.ts`) and sends `name`; user only enters email + display name + password.
- Save + review **writes are proxied server-side** (`/api/saved`, `/api/ratings/[facilityId]`): `user_id` is derived from `locals.user`, never trusted from the client. Reviews are an **upsert** (one per user+facility); ratings GET stays public.
- `/account` page (guarded; redirects guests to `/`), top-nav sign-in + account menu.
- Pragmatic hardening: email/password validators, generic error messages, in-memory sliding-window rate limiter (10 attempts / 15 min per IP — swap for KV/DO on Workers later).
- Server-side auth utils live under `frontend/src/lib/server/auth/` with Vitest unit tests (validate, username, rateLimit, jwt).
- Verified end-to-end (register/login/me/save/ratings-upsert/guards/logout) against local dev; `pnpm check` 0/0, `pnpm test` 17 passing.

### No PocketBase anywhere
The project switched from PocketBase to Teenybase. Zero PocketBase SDK usage. All backend calls are plain `fetch()` to the Teenybase REST API.

---

## RIDB data limitations (important context)

The RIDB public API has significant gaps:

| Data | Available? | Source |
|---|---|---|
| Facility name, lat/lng, description | ✅ Yes | `/facilities` list |
| Managing agency (USFS, BLM, NPS, State) | ✅ Yes | `ParentOrgID` field |
| FCFS vs reservable campsite counts | ✅ Yes | `/facilities/{id}/campsites` |
| Pets, picnic tables, fire rings, drive-up, max RV length | ✅ Partial | Campsite `ATTRIBUTES` |
| Potable water, toilet type, bear boxes | ⚠️ Partial | Parsed from `FacilityDescription` text |
| Fee data | ❌ Mostly missing | `FacilityUseFeeDescription` is usually empty |
| fs.usda.gov link | ❌ None | Not in RIDB for CO campgrounds |
| Facility-level ATTRIBUTES | ❌ Empty | RIDB list and detail endpoints both return `[]` |

**Fee data:** `FacilityUseFeeDescription` exists in RIDB but is empty for almost all CO campgrounds. `discover.ts` now backfills `fee_min`/`fee_max` onto RIDB records when it scrapes the matching FS page.

**Missing campgrounds:** RIDB only covers campgrounds with recreation.gov listings. `discover.ts` now fills this gap for USFS campgrounds on fs.usda.gov. Non-USFS campgrounds (BLM, state parks, county parks) are still missing — see next priorities.

---

## Data sources and how they combine

| Source | Script | ridb_id format | Count |
|--------|--------|----------------|-------|
| RIDB API | `pnpm sync` | Numeric (e.g. `233847`) | ~270 |
| fs.usda.gov scrape | `pnpm discover` | `fs-[forest-slug]-[campground-slug]` | ~300 |

**Deduplication:** `discover.ts` loads all RIDB records at startup and matches FS campgrounds by normalized name + lat/lng within ~1km. When a match is found, it patches the RIDB record (adds `fs_url`, `is_closed`, fee data) and does NOT create a new FS record. Campgrounds with no RIDB match are inserted as new FS records.

---

## ETL data pipeline

### `pnpm sync` (RIDB)
1. `GET /facilities?state=CO&activity=CAMPING&facilitytype=Campground` — paginated list
2. For each facility in parallel: `GET /facilities/{id}` (description, links) + `GET /facilities/{id}/campsites` (FCFS counts, campsite attributes)
3. Amenities normalized from campsite `ATTRIBUTES` first, then gaps filled from `FacilityDescription` text parsing
4. `ParentOrgID` mapped to human-readable agency name stored in `forest` field
5. **Fee enrichment (three-tier fallback):**
   - Tier 1: `FacilityUseFeeDescription` from RIDB (usually empty for CO)
   - Tier 2: Parse `FacilityDescription` text for dollar amounts in fee-context sentences
   - Tier 3: If facility has an `fs_url`, scrape that page (`parseFsPageFees`)

### `pnpm discover` (fs.usda.gov)
1. For each of 7 CO forest slugs, paginates `https://www.fs.usda.gov/r02/{slug}/recreation/camping-cabins?page=%2C{n}` until 404
2. Scrapes each campground URL, skips RIDB campgrounds (have reservation iframe)
3. Detects: fees (from `id="rec_acc_fees"` OR `<h3>Fee...</h3>`), coordinates, name, FCFS count, `is_closed` (from `<h2>...closed...</h2>`), and amenities from full page body text
4. Matches against existing RIDB records by name+proximity — patches them rather than duplicating
5. New campgrounds inserted with `is_fully_fcfs: true`, `is_partial_fcfs: false`

### `parseDescriptionAmenities` (both pipelines)
Detects from free text:
- `potableWater`: drinking water / water pump / hand pump / water well / well water mentions
- `toiletType`: flush / vault / pit / no toilet mentions  
- `bearBoxes`: bear box / bear locker / food storage locker mentions
- `picnicTables`: "picnic table" (with "no picnic table" negative guard)
- `petsAllowed`: leash/permission language (with "no pets" negative guard)

---

## Map marker colors

| Color | Meaning |
|-------|---------|
| 🔴 Red | Closed (`is_closed: true`) |
| 🟢 Green | Fully FCFS (all sites first-come) |
| 🟡 Yellow | Partial FCFS (mix of reservable + first-come) |
| 🔵 Blue | Reservable only |

Hovering a closed marker shows "⛔ CLOSED — [name]". Opening a closed campground's detail panel shows a sticky red banner at the top.

---

## File map

```
camp-finder/
  backend/
    teenybase.ts          # Schema — single source of truth for all 5 tables
    package.json          # hono ^4.12.0, wrangler ^4.63.0, teenybase latest
    .dev.vars             # Local secrets (gitignored)
    migrations/           # Auto-generated SQL migrations (gitignored, run pnpm generate)

  etl/
    src/
      index.ts            # RIDB sync orchestrator — three-tier fee fallback
      ridb.ts             # RidbClient — getAllFacilities, getFacilityDetail, getCampsites
      teenybase.ts        # TbClient — upsertFacility, upsertFacilities, listAllRidb (excludes
                          #   fs-/nps- prefixes), listAll (all records, for NPS dedup),
                          #   patchFacility. All list calls use limit:10000.
      normalize.ts        # normalizeAmenities, parseDescriptionAmenities (water/toilet/bears/
                          #   picnicTables/petsAllowed/fireRings), aggregateFcfs, scoreDataQuality,
                          #   extractFees, extractFsUrl, extractFeesFromDescription
      fsScraper.ts        # parseFsPageFees, scrapeFsPage, scrapeForestCampgroundUrls,
                          #   isRidbCampground, scrapeCampgroundPage (returns is_closed)
      discover.ts         # fs.usda.gov discovery orchestrator — 7 CO forests,
                          #   deduplicates against RIDB by name+proximity
      nps.ts              # NpsClient, CO_NPS_PARKS (8 CO parks), normalizeNpsCampground,
                          #   normalizeNpsAmenities, extractNpsFees, detectIsClosed,
                          #   isInColorado — all exported for testing
      sync-nps.ts         # NPS sync orchestrator — dedupes against ALL existing records,
                          #   upserts new ones. ridb_id prefix: nps-{parkCode}-{id}
      forests.ts          # CO_QUERY_PARAMS, parentOrgToAgency (ParentOrgID → agency name)
      types.ts            # RidbFacility, RidbCampsite, NormalizedFacility (incl. is_closed),
                          #   Amenities, etc.
    tests/
      fsScraper.test.ts   # 8 tests — parseFsPageFees, scrapeFsPage
      fsDiscovery.test.ts # 14 tests — scrapeForestCampgroundUrls, isRidbCampground,
                          #   scrapeCampgroundPage (incl. h3 fees, is_closed)
      normalize.test.ts   # 32 tests — normalizeAmenities, aggregateFcfs, scoreDataQuality,
                          #   extractFees, extractFeesFromDescription, parseDescriptionAmenities
                          #   (incl. fireRings)
      nps.test.ts         # 53 tests — normalizeNpsCampground, normalizeNpsAmenities,
                          #   extractNpsFees, detectIsClosed, isInColorado
      ridb.test.ts        # 3 tests — parentOrgToAgency

  frontend/
    src/
      lib/
        types.ts                    # Facility (incl. is_closed), Alert, Rating, SavedCampground
        auth/authStore.ts           # writable JWT store, login/register/logout
        auth/AuthModal.svelte       # Login/register modal (Svelte 5)
        map/CampMap.svelte          # Leaflet map — red/green/yellow/blue markers, CLOSED tooltip
        map/mapStore.ts             # facilities, selectedFacility, searchPending, isLoading stores
        filters/filterStore.ts      # filters + filteredFacilities derived store
        filters/FilterSidebar.svelte
        detail/DetailPanel.svelte   # Sticky red CLOSED banner when is_closed; order: banner,
                                    #   header, FCFS, compare, amenities, description, alerts,
                                    #   data quality warning, links, ratings
        detail/FCFSBadge.svelte
        detail/AmenityGrid.svelte
        detail/AlertsSection.svelte # On-demand scrape /api/alerts/[id]; renders as deduped
                                    #   paragraphs; filters "View All Alerts" nav text
        detail/RatingsSection.svelte
        detail/DataQualityWarning.svelte
        saved/SaveButton.svelte
        compare/compareStore.ts
        compare/CompareView.svelte
      routes/
        +layout.svelte
        +page.svelte
        api/facilities/+server.ts
        api/alerts/[id]/+server.ts  # Scrapes fs.usda.gov, 24hr cache, whitespace-normalized
        api/ratings/[facilityId]/+server.ts
        compare/+page.server.ts
        compare/+page.svelte

  docs/
    handoff.md                      # This file
    campfinder-spec.md              # Original brainstorm spec
    superpowers/
      specs/2026-05-26-search-ux-design.md
      plans/2026-05-26-search-ux.md
      plans/2026-05-27-fs-campground-discovery.md   # COMPLETE
```

---

## Known issues / resolved

| Issue | Status |
|-------|--------|
| Hono 4.0.0 `TypeError: Can't modify immutable headers` | **Fixed** — pinned hono `^4.12.0` |
| `Cannot read properties of undefined` in normalize.ts | **Fixed** — null guards on attributes/links |
| Teenybase 400 "expected string, received object" for amenities | **Fixed** — `JSON.stringify(amenities)` in ETL |
| Svelte 4 syntax in components | **Fixed** — all rewritten to Svelte 5 runes |
| Search button did nothing | **Fixed** — fetch all + filter server-side (Teenybase WHERE limitation) |
| ETL only seeding 21 campgrounds | **Fixed** — removed National Forest name filter |
| All amenities false/empty | **Fixed** — per-facility detail + campsite ATTRIBUTES + description parsing |
| Fee data missing for most campgrounds | **Improved** — three-tier ETL fallback; discover.ts backfills from FS pages |
| Alerts section unreadable (raw whitespace) | **Fixed** — paragraph rendering with whitespace normalization + dedup |
| "View All Alerts" nav text appearing in alerts | **Fixed** — line-level filter in alerts API route |
| FCFS filter excluding new FS campgrounds | **Fixed** — filter uses `is_fully_fcfs`/`is_partial_fcfs` flags, not `fcfs_total` count |
| Fee scraping missed h3-based sections | **Fixed** — `hasFeeSection` now detects `<h3>Fee...</h3>` pattern |
| Amenity detection missing data from page body | **Fixed** — discover.ts passes full page body (not just meta description) to `parseDescriptionAmenities` |
| FS campgrounds creating duplicates of RIDB records | **Fixed** — name+proximity dedup in discover.ts; 52 existing duplicates removed via SQL |
| `is_closed` field not recognized by Teenybase | **Fixed** — migration `0005_add_is_closed_to_facilities.sql` (run `pnpm generate && pnpm migrate`) |
| NPS campgrounds missing despite being in RIDB | **Fixed** — RIDB `state=CO` silently drops cross-border NPS parks (confirmed: Gates of Lodore, `ParentOrgID: 128`, no `FACILITYADDRESS`). New `nps.ts` + `pnpm sync-nps` fetches directly from NPS API by park code. |
| `parseDescriptionAmenities` missing fireRings detection | **Fixed** — added `fireRings` via fire pit/ring/grate keywords with negation guard; "grill" excluded (too broad) |

---

## What's next

### Done this session (2026-06-11 — isolation verification + merge)
- ✅ **Verified multi-user data isolation (adversarial, both directions).** Ran tests directly against Teenybase (`:8787`) — the real trust boundary — with two distinct authenticated users:
  - **Reviews (`ratings`):** cross-user edit → `404` (attacker can't resolve the row); cross-user delete → `200` but 0 rows affected (row survives); forged insert (attacker token + victim `user_id`) → 0 rows inserted (Teenybase injects `WHERE (<auth.uid> IS new.user_id)` into the INSERT); forged `user_id` in edit body → still `404`. Confirmed **symmetric** (A→B and B→A both blocked).
  - **Saved campgrounds (`saved_campgrounds`):** cross-user list (even with forged `where user_id == victim`) → empty; view-by-id → `404`; delete → 0 rows (survives); unauthenticated list → empty; owner still sees own (sanity).
  - **Frontend boundary:** `PUBLIC_TB_URL` is referenced **only** in server-side files — no client component talks to Teenybase directly. All writes go through SvelteKit routes that derive `user_id` from the session cookie.
  - **Note / deployment caveat:** at the raw Teenybase layer `ratings.listRule = 'true'` (public), so anyone who could reach the Teenybase Worker directly could enumerate reviews by `user_id`. That's the intended public-crowdsourced-reviews model and is not exposed to clients today, but in production the Teenybase Worker must not be openly internet-reachable (or tighten that rule) if review *authorship* should ever be private. `saved_campgrounds` and `users` are siloed even at the raw layer.
- ✅ **Merged `feat/auth-foundation` → main** (`--no-ff`, `656ac82`). Pre-merge: `pnpm check` 0/0, `pnpm test` 17/17.
- ✅ **Refreshed `CLAUDE.md`** — fixed stale auth description (was "stores JWT in localStorage" → now httpOnly-cookie session, no client token), corrected three lingering PocketBase→Teenybase references, added a Commands section, and documented two Teenybase quirks (stringify JSON fields; no compound `AND` in WHERE).

### Done previous session (2026-06-03 — mobile + auth UX polish)
- ✅ **Mobile layout overhaul** (spec: `docs/superpowers/specs/2026-06-03-mobile-ui-overhaul-design.md`). On phone widths (≤640px): `.app-shell` stacks column (sidebar above map); the sidebar is a fixed `33vh` region with a **collapsible "Filters" disclosure** (collapsed by default; desktop forces it open and hides the toggle), a **pinned "Search this area" button** that never scrolls away, and a **scrolling results list** below it. The expanded filter body scrolls within the sidebar so Max-fee/Sort stay reachable. Desktop layout unchanged.
- ✅ **Full-screen mobile detail panel** — `DetailPanel` becomes a `100dvh` takeover on mobile with a grabber bar; **swipe-down past ~120px dismisses** (short drags snap back), X still closes. Desktop keeps the resizable right-side panel.
- ✅ **Signed-in display-name indicator** — the Account button shows an avatar (first initial) + the registered **display name**. Teenybase's auth/login response omits the custom `name` field, so: register uses the form's name; login fetches it via `tbGetName` (reads `users/view/{id}`); the name is cached in a server-set httpOnly `cf_name` cookie so it survives reloads with no per-request lookup; falls back to the email local-part. Touched: `session.ts` (NAME_COOKIE), `hooks.server.ts`, `app.d.ts`, `authStore.ts`, login/register routes, `AccountMenu.svelte`.
- ✅ **Auth modal UX** — fields wrapped in a real `<form>` so **Enter submits**; a **spinner + "Please wait…"** shows on the disabled button while a request is in flight; the mode-toggle action word ("Register"/"Sign in") is styled as an underlined green link.
- ✅ **Reviews bug fix** — reviews now reload when the selected facility changes (`RatingsSection` used `$effect` keyed on `facilityId` + a stale-response guard, replacing onMount-only load). Map-background click closes the detail panel; marker clicks `stopPropagation` so they don't self-dismiss.

### Done previous session
- ✅ **Account features plan** (`docs/superpowers/plans/2026-06-02-account-features.md`) — reviews modal (public read; auth write/edit/delete; one editable review per user+facility), reusable `ConfirmDialog` on destructive actions, compact review summary in the detail panel, and an `/account` dashboard listing saved campgrounds + my reviews with deep links (`?facility=`, `?reviews=1`) back to the map. DB-level unique `(user_id, facility_id)` index on `ratings` + `createRule: auth.uid == user_id` (migration `0007`). Verified: `pnpm test` 17 passing, `pnpm check` 0/0, logged-out review POST → 401, guest reviews-modal + deep-link confirmed in browser.
- ✅ **Search UX plan** (`docs/superpowers/plans/2026-05-26-search-ux.md`) — search button moved into sidebar with amber staleness hint; dashed blue viewport bbox overlay shows on the map when a search is pending.
- ✅ **BLM investigation** — BLM camping data *is* reachable via the BLM ArcGIS REST service (`https://gis.blm.gov/arcgis/rest/services/recreation/BLM_Natl_Recreation_Sites_Facilities/MapServer`, no key). But the camping layers (2, 8) are RIDB-derived, so BLM campgrounds with recreation.gov listings are already pulled by `pnpm sync`. Net-new data lives in the non-RIDB "Recreation Facilities/Sites" layers (0, 1), but those need field-schema work and lack FCFS/amenity richness. **Verdict: low marginal value — deprioritized.**

### Next up (high priority)
1. **~~Merge `feat/auth-foundation` → main.~~** ✅ Done 2026-06-11 (`656ac82`). See "Done this session" above.
2. **~~Verify multi-user data isolation.~~** ✅ Done 2026-06-11 — adversarial tests confirm `ratings` + `saved_campgrounds` are siloed per-user, both directions. See "Done this session" above. The one open follow-up is the **deployment caveat**: don't leave the Teenybase Worker openly internet-reachable in prod (or tighten `ratings.listRule`) if review authorship should ever be private.

### Medium priority
3. **UI/UX polish pass (the big one).** Functional but visually rough, and we want a *unique* experience, not generic. **Install the `frontend-design` superpowers skill first**, then do a real design pass: sidebar layout, detail panel, typography, color/identity, empty states, and continued mobile refinement. This session's mobile work was tactical fixes; this is the holistic design pass.

### Lower priority
4. **Deployment** (deferred until local testing is solid):
   - Frontend → Cloudflare Pages
   - Backend → `pnpm deploy` (Teenybase to Cloudflare Workers + D1)
   - Set production env vars

### Housekeeping
- A throwaway dev account `testview@example.com` (display name "Test Viewer", password `password123`) was created in the **local** D1 while testing the display-name indicator. Harmless; delete from the local DB if you want a clean users table. It's a good second account for the multi-user isolation testing above.

---

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

# Verify NPS sync worked (Gates of Lodore should appear after pnpm sync-nps)
curl http://localhost:8787/api/v1/table/facilities/list -X POST \
  -H 'Content-Type: application/json' -d '{"where": "ridb_id == \"nps-dino-10199750\"", "limit": 1}'

# Count NPS campgrounds
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/*.sqlite \
  "SELECT COUNT(*) FROM facilities WHERE ridb_id LIKE 'nps-%'"
```
