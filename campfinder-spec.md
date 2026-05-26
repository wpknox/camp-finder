# CampFinder — Project Spec & Brainstorm

> Generated from brainstorming session. Use this as context when starting planning/coding mode.

-----

## Problem Statement

The USDA Forest Service website (`fs.usda.gov`) has rich campground data but poor discoverability. Users must already know a campground’s name to find it. There is no map-driven search, no easy filtering by amenities or FCFS availability, and no way to compare campgrounds side by side. Cross-referencing with Google Maps, recreation.gov, and individual USFS pages is tedious.

**Goal:** A lightweight, map-first web app for discovering and comparing National Forest campgrounds — focused on first-come, first-serve availability, amenities, and ease of use on both desktop and mobile.

-----

## Target Users

- Small friend groups planning camping trips
- Users who know a general area but not specific campground names
- Campers who prioritize FCFS sites over reservable ones
- Users on mobile in the field or on desktop at home planning trips

-----

## Core Requirements

### Must Have (v1)

- **Map-first UI** — the map IS the search interface; pan/zoom to area of interest
- **“Search this area” button** — explicit trigger, not automatic (reduces API load, matches deliberate use)
- **Campground pins on map** — click to open detail panel
- **FCFS breakdown per campground** — total sites, FCFS count, reservable count, fully/partially FCFS flag
- **Amenity icon grid** — glanceable on mobile; potable water, toilet type, bear boxes, drive-up, max RV length, pets, hookups
- **Fee display** — nightly cost per site type
- **Link to fs.usda.gov page** — for full official info
- **On-demand alert scraping** — when a user opens a campground detail, scrape the fs.usda.gov page for current alerts (road closures, fire restrictions, access issues)
- **Low data quality warning** — if RIDB data is sparse for a campground, show a visible notice and prompt user to check the official page
- **Responsive design** — desktop and mobile web, no native app required
- **“Nearby Activities” link** — pre-built Google Maps search link (e.g. `https://www.google.com/maps/search/hiking+trails/@{lat},{lng},12z`) opening in new tab; zero implementation cost, genuinely useful

### Should Have (v1 or v2)

- **Filter/sort sidebar** — filter by: FCFS only, amenities (water, toilets, bear boxes), fee range, max RV length; sort by: rating, fee, FCFS count
- **URL-shareable compare state** — e.g. `/compare?ids=10165691,10165692` so friends can share a specific comparison
- **Campground comparison view** — side-by-side or stacked table of amenities, fees, FCFS counts, ratings (max 3–4 campgrounds)
- **User auth** — via PocketBase built-in auth
- **Saved campgrounds** — authenticated users can save/favorite campgrounds with personal notes

### Nice to Have (v2+)

- **Crowdsourced reviews/details** — authenticated users who have visited a campground can add a rating, review, and fill in missing amenity data
- **Hiking trails nearby** — via OpenStreetMap Overpass API or REI Hiking Project API (radius query)
- **Topographic map layer** — USGS topo WMS tiles as a toggleable layer
- **Offline support** — PWA caching of previously viewed campgrounds (not a v1 requirement)
- **Trip planning** — group multiple campgrounds into a “trip” object, shareable with friends

-----

## Data Sources

### Primary: RIDB API (Recreation Information Database)

- Base URL: `https://ridb.recreation.gov/api/v1/`
- Free API key from recreation.gov
- Key endpoints:
  - `GET /facilities?latitude=&longitude=&radius=&activity=CAMPING` — map-bounds search
  - `GET /facilities/{id}` — facility detail
  - `GET /facilities/{id}/campsites` — individual site data, **FCFS lives here** (non-reservable = FCFS)
  - `GET /facilities/{id}/media` — photos
- **Data quality is inconsistent across forests** — defensive mapping required

### Secondary: fs.usda.gov (on-demand scrape)

- Scraped only when a user opens a specific campground detail panel
- Target: alerts, notices, road closures, seasonal access info
- These are not in RIDB and change seasonally
- Example: dispersed camping closures, fire restrictions specific to an area

### Ratings: Crowdsourced (internal)

- Stored in PocketBase
- Users submit after visiting
- Cross-reference with Google manually (link provided, not auto-pulled)

### Nearby Activities: Google Maps deep link (v1)

- No API call — just construct a URL with campground coordinates
- Opens Google Maps search in new tab

-----

## Stack

### Frontend

- **SvelteKit** — compiled reactivity is clean for map-reactive UI; smaller bundle than React (matters on mobile in low-signal areas)
- **Leaflet (vanilla)** — drop to vanilla Leaflet directly rather than a Svelte wrapper for max control over the most critical component
- **OpenStreetMap tiles** — free, no API key
- **USGS Topo WMS** — free toggleable layer for elevation context

### Backend

- **PocketBase** — single binary, SQLite underneath, built-in auth, REST + realtime API, admin UI
- Runs on a $5 VPS or local machine for development
- Handles: campground cache, user auth, saved campgrounds, ratings, crowdsourced details

### Sync / ETL

- A scheduled script (Node or C# console app) that:
1. Queries RIDB for facilities by forest/region
1. Normalizes amenity attributes into a consistent schema
1. Aggregates FCFS counts from campsites endpoint
1. Writes to PocketBase
1. Runs weekly (RIDB data rarely changes)

### Proxy Layer (optional but recommended)

- A thin API route in SvelteKit (server-side) to proxy RIDB calls
- Keeps RIDB API key out of client-side code
- Can add caching headers here

-----

## Data Model (PocketBase Collections)

### `facilities`

```
id              string (PocketBase auto)
ridb_id         string (RIDB facility ID, e.g. "10165691")
name            string
lat             number
lng             number
forest          string
district        string
description     text
fee_min         number
fee_max         number
season_start    string
season_end      string
fcfs_total      number
reservable_total number
is_fully_fcfs   boolean
is_partial_fcfs boolean
amenities       json  (normalized — see below)
ridb_data_quality string  (enum: "rich" | "sparse" | "unknown")
fs_url          string  (link to fs.usda.gov page)
last_synced     datetime
```

### Amenities JSON Schema (normalized from RIDB)

```json
{
  "potableWater": true,
  "toiletType": "vault",        // "flush" | "vault" | "none" | "unknown"
  "bearBoxes": false,
  "driveUp": true,
  "maxRvLength": 35,            // null if unknown
  "electricHookups": false,
  "waterHookups": false,
  "sewerHookups": false,
  "petsAllowed": true,
  "horsesAllowed": false,
  "picnicTables": true,
  "fireRings": true,
  "accessible": false
}
```

### `alerts`

```
id              string
facility_id     string (relation → facilities)
content         text
scraped_at      datetime
```

*Fetched on-demand, stored briefly as cache. Refresh if scraped_at > 24 hours old.*

### `ratings`

```
id              string
facility_id     string (relation → facilities)
user_id         string (relation → users, nullable for anonymous v1)
score           number (1–5)
notes           text
visited_at      date
created         datetime
```

### `saved_campgrounds`

```
id              string
user_id         string (relation → users)
facility_id     string (relation → facilities)
personal_notes  text
saved_at        datetime
```

-----

## FCFS Data Aggregation Logic

FCFS status lives at the **campsite** level in RIDB, not the facility level. The ETL script must:

1. Fetch all campsites for a facility: `GET /facilities/{id}/campsites`
1. For each campsite, check `TypeOfUse` and `CampsiteReservable` flag
1. Aggregate:
- `fcfs_total` = count where `CampsiteReservable == false`
- `reservable_total` = count where `CampsiteReservable == true`
- `is_fully_fcfs` = reservable_total == 0
- `is_partial_fcfs` = fcfs_total > 0 && reservable_total > 0
1. Write aggregated values to `facilities` record

-----

## UI/UX Design Notes

### Map View

- Pins colored/styled by FCFS status:
  - 🟢 Fully FCFS
  - 🟡 Partially FCFS
  - 🔵 Reservable only
- Cluster pins at low zoom levels
- “Search this area” button appears after panning (not auto-firing)

### Campground Detail Panel

- Slides in from right (desktop) or bottom sheet (mobile)
- Sections:
1. **Header** — name, forest, district, season, fee
1. **FCFS Badge** — “16/16 First-Come, First-Serve” or “6/16 FCFS sites available”
1. **Amenity Icon Grid** — glanceable icons with labels
1. **Alerts** — scraped from fs.usda.gov, shown with timestamp; spinner while loading
1. **Data Quality Warning** — if `ridb_data_quality == "sparse"`, show: “Limited data available for this campground. Check the official page for full details.”
1. **Links** — “View on fs.usda.gov” | “Reserve on recreation.gov” | “Nearby Activities on Google Maps”
1. **Ratings** — community score, recent reviews, “Add your review” (auth required)

### Amenity Icon Grid Example

```
💧 Potable Water    🚽 Vault Toilet    🐻 Bear Boxes
🚗 Drive-up         📏 Max RV: 35ft   🐕 Pets OK
🔥 Fire Rings       🪑 Picnic Tables  ♿ Accessible
```

### Compare View

- Triggered by “Add to Compare” on detail panel (max 4)
- URL param: `/compare?ids=10165691,10165692,10165693`
- Shareable — paste URL to friends
- Table layout: campgrounds as columns, attributes as rows
- Differences highlighted

-----

## Build Order (Recommended)

### Phase 1 — Data Pipeline

1. Get RIDB API key
1. Write ETL script: query RIDB → normalize amenities → aggregate FCFS → write to PocketBase
1. Validate data quality across a sample of National Forests
1. Define `ridb_data_quality` heuristic (e.g. sparse if amenities JSON has < 5 fields populated)

### Phase 2 — Core Map Loop

1. SvelteKit project scaffold
1. Leaflet map with OSM tiles
1. “Search this area” button → calls PocketBase facilities query by bounding box
1. Pins rendered on map, colored by FCFS status
1. Pin click → detail panel opens

### Phase 3 — Detail Panel

1. FCFS breakdown display
1. Amenity icon grid
1. Fee, season, contact info
1. On-demand fs.usda.gov scrape for alerts (SvelteKit server route)
1. Data quality warning
1. External links (fs.usda.gov, recreation.gov, Google Maps nearby)

### Phase 4 — Filter & Sort

1. Filter sidebar: FCFS only toggle, amenity checkboxes, fee range slider
1. Sort: by rating, fee, FCFS count
1. List view alongside map (toggleable)

### Phase 5 — Compare

1. “Add to Compare” button in detail panel
1. Compare state in URL params
1. Compare page/view with side-by-side table

### Phase 6 — Auth & User Features

1. PocketBase auth (email/password to start)
1. Saved campgrounds
1. Personal notes on saved campgrounds

### Phase 7 — Crowdsourced Data

1. Rating submission form (authenticated)
1. Review display on detail panel
1. User-submitted amenity corrections/additions

-----

## Key Risks & Mitigations

|Risk                                              |Mitigation                                                      |
|--------------------------------------------------|----------------------------------------------------------------|
|RIDB data quality inconsistent across forests     |Sparse data warning + prominent link to fs.usda.gov             |
|fs.usda.gov scrape breaks on page structure change|Scrape on-demand only; fail gracefully with a message           |
|RIDB API rate limits                              |Cache in PocketBase; weekly ETL not live queries                |
|RIDB amenity field naming inconsistent            |Defensive ETL mapping with fallback to `unknown`                |
|App grows beyond friend group                     |PocketBase scales fine; add proper rate limiting to proxy routes|

-----

## Open Questions for Planning Session

- [ ] Which National Forests to seed first? (Colorado focus initially?)
- [ ] ETL script language — Node/TypeScript or C# console app?
- [ ] Hosting: VPS (DigitalOcean/Hetzner) or Cloudflare Pages + PocketBase on VPS?
- [ ] App name / domain?
- [ ] Anonymous ratings allowed in v1, or auth required from the start?
- [ ] Mobile-first or desktop-first design pass?

-----

*Last updated: brainstorm session — ready for planning/coding mode.*