# CampFinder — Session Handoff

## What this is

CampFinder is a map-first PWA for discovering Colorado campgrounds. Built on:
- **Frontend**: SvelteKit (Svelte 5 runes) + Leaflet + OpenStreetMap, hosted on Cloudflare Pages
- **Backend**: Teenybase (Cloudflare Workers + D1), REST API at `/api/v1/table/<name>/...`
- **ETL**: Node/TypeScript script — pulls from RIDB API, normalizes, writes to Teenybase

## Current status: Local testing in progress, core features working

270 Colorado campgrounds seeded. Map, search, detail panel, filters, compare, auth, save, and ratings are all wired up. UI/UX needs a polish pass before deployment.

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

**ETL (re-seed):**
```bash
cd etl && pnpm sync
# Requires etl/.env with RIDB_API_KEY, TB_SERVICE_TOKEN, TB_API_URL
# TB_SERVICE_TOKEN matches ADMIN_SERVICE_TOKEN in backend/.dev.vars
# Takes ~3-5 minutes for 270 facilities (parallel detail + campsite requests)
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
**Teenybase does not support compound WHERE expressions** (`&&` or `AND` both fail with parse errors). Work around this by fetching all records with a high `limit` and filtering in the SvelteKit server route. This is fine at current scale (~270 campgrounds). See `frontend/src/routes/api/facilities/+server.ts`.

### Teenybase auth
- Service-side writes use `TB_SERVICE_TOKEN` (sent as `Authorization: Bearer <token>` from `+server.ts` routes only — never exposed to client)
- User JWT stored in `localStorage` as key `cf_auth`
- Auth endpoints: `POST /api/v1/table/users/auth/sign-up`, `/auth/login-password`

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

**Fee data:** `FacilityUseFeeDescription` exists in RIDB but is empty for almost all CO campgrounds. Fees ARE shown on recreation.gov — they're stored in the reservation system, not the facilities API. This is a known gap. Options: scrape recreation.gov or fs.usda.gov.

**Missing campgrounds:** RIDB only covers campgrounds with recreation.gov listings. Many USFS campgrounds that are walk-in/FCFS-only are not in RIDB at all. These would require scraping `fs.usda.gov` to discover.

---

## ETL data pipeline

The ETL now does per-facility API calls to get full data:
1. `GET /facilities?state=CO&activity=CAMPING&facilitytype=Campground` — paginated list (270 facilities)
2. For each facility in parallel: `GET /facilities/{id}` (description, links) + `GET /facilities/{id}/campsites` (FCFS counts, campsite attributes)
3. Amenities normalized from campsite `ATTRIBUTES` first, then gaps filled from `FacilityDescription` text parsing
4. `ParentOrgID` mapped to human-readable agency name stored in `forest` field

---

## File map

```
camp-finder/
  backend/
    teenybase.ts          # Schema — single source of truth for all 5 tables
    package.json          # hono ^4.12.0, wrangler ^4.63.0, teenybase latest
    .dev.vars             # Local secrets (gitignored)

  etl/
    src/
      index.ts            # Orchestrator — fetches RIDB, normalizes, writes to TB
      ridb.ts             # RidbClient — getAllFacilities, getFacilityDetail, getCampsites
      teenybase.ts        # TbClient — upsertFacility (insert or edit by ridb_id)
      normalize.ts        # normalizeAmenities (campsite attrs), parseDescriptionAmenities,
                          #   aggregateFcfs, scoreDataQuality, extractFees, extractFsUrl
      forests.ts          # CO_QUERY_PARAMS, parentOrgToAgency (ParentOrgID → agency name)
      types.ts            # RidbFacility, RidbCampsite, NormalizedFacility, Amenities, etc.

  frontend/
    src/
      lib/
        types.ts                    # Facility, Alert, Rating, SavedCampground
        auth/authStore.ts           # writable JWT store, login/register/logout
        auth/AuthModal.svelte       # Login/register modal (Svelte 5)
        map/CampMap.svelte          # Leaflet map — SSR-safe, bind:this, renderPins/getMapBounds
        map/mapStore.ts             # facilities, selectedFacility, searchPending, isLoading stores
        filters/filterStore.ts      # filters + filteredFacilities derived store
        filters/FilterSidebar.svelte
        detail/DetailPanel.svelte   # Full detail view — order: header, FCFS, compare, amenities, description, alerts, links, ratings
        detail/FCFSBadge.svelte
        detail/AmenityGrid.svelte
        detail/AlertsSection.svelte # Fetches /api/alerts/[id]
        detail/RatingsSection.svelte
        detail/DataQualityWarning.svelte  # Only shown when fs_url is present
        saved/SaveButton.svelte     # Toggle save via Teenybase REST
        compare/compareStore.ts     # Set of facility IDs to compare
        compare/CompareView.svelte
      routes/
        +layout.svelte              # AuthModal + global layout
        +page.svelte                # Main map page
        api/facilities/+server.ts   # bbox → fetch all from TB, filter server-side (Teenybase WHERE limitation)
        api/alerts/[id]/+server.ts  # On-demand scrape fs.usda.gov, cache 24hr
        api/ratings/[facilityId]/+server.ts  # GET public, POST forwards user JWT
        compare/+page.server.ts     # Fetch facilities by IDs for compare view
        compare/+page.svelte        # Side-by-side compare table

  docs/
    handoff.md                      # This file
    campfinder-spec.md              # Original brainstorm spec
    superpowers/
      specs/2026-05-26-search-ux-design.md   # Approved design doc
      plans/2026-05-26-search-ux.md          # Ready-to-execute implementation plan
```

---

## Known issues / resolved

| Issue | Status |
|-------|--------|
| Hono 4.0.0 `TypeError: Can't modify immutable headers` in Pocket UI | **Fixed** — pinned hono to `^4.12.0` |
| `Cannot read properties of undefined (reading 'find')` in normalize.ts | **Fixed** — `attributes = attributes ?? []` + `f.LINK ?? []` |
| Teenybase 400 "expected string, received object" for amenities | **Fixed** — `JSON.stringify(amenities)` in ETL, parse back in frontend |
| Svelte 4 syntax used in components | **Fixed** — all components rewritten to Svelte 5 runes |
| Search button did nothing | **Fixed** — Teenybase rejects compound WHERE; now fetches all + filters in server route |
| ETL only seeding 21 campgrounds | **Fixed** — removed National Forest name filter; now seeds all 270 CO campgrounds |
| All amenities false/empty | **Fixed** — ETL now fetches per-facility detail + campsite ATTRIBUTES; description parsing fills water/toilet/bear box gaps |

---

## What's next

### High priority
1. **Execute search UX plan** (`docs/superpowers/plans/2026-05-26-search-ux.md`):
   - Move "Search this area" button into sidebar with staleness hint
   - Show dashed viewport bbox overlay on map when search is pending

2. **Fee data** — `FacilityUseFeeDescription` in RIDB is almost always empty for CO campgrounds. Fees are available on recreation.gov and fs.usda.gov but require scraping. This is a visible gap — most campgrounds show "Fee unknown."

3. **fs.usda.gov scraping** — Many CO campgrounds (especially walk-in/FCFS-only sites) are not in RIDB at all. To surface these, we'd need to scrape the Forest Service website. This is a significant effort but would greatly expand coverage.

### Medium priority
4. **Auth UI** — `AuthModal.svelte` exists but a proper `/login` or `/account` page would make auth feel complete, especially as a prerequisite for ratings/reviews.

5. **Ratings & reviews UI** — The backend table and API route exist. Need UI for submitting a rating (requires auth).

6. **UI/UX polish pass** — The app is functional but visually rough. Install the `frontend-design` superpowers skill before starting this work. Key areas: sidebar layout, detail panel polish, mobile experience, typography.

### Lower priority
7. **Deployment** (deferred until local testing is solid):
   - Frontend → Cloudflare Pages
   - Backend → `pnpm deploy` (Teenybase to Cloudflare Workers + D1)
   - Set production env vars

---

## Useful curl commands for verifying data

```bash
# List facilities
curl http://localhost:8787/api/v1/table/facilities/list -X POST \
  -H 'Content-Type: application/json' -d '{"limit": 5}'

# Check a specific facility by ridb_id
curl http://localhost:8787/api/v1/table/facilities/list -X POST \
  -H 'Content-Type: application/json' -d '{"where": "ridb_id = \"251844\"", "limit": 1}'

# Test the bbox search route
curl "http://localhost:5173/api/facilities?north=41&south=38&east=-104&west=-107"
```
