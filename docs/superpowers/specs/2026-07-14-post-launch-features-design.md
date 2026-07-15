# Post-Launch Features — Design (2026-07-14)

Four post-launch features for CampFinder, designed as independent tiers shipped in
order. One implementation plan covers all four; each tier is a shippable increment.

**Tiers:** (1) directions deep-link → (2) elevation + weather → (3) things nearby →
(4) cell coverage.

All UI follows `docs/design-language.md` (Folded Field Map) and Svelte 5 runes.
No new paid services; everything stays on the current free tier.

---

## Tier 1 — Directions deep-link (frontend only)

**What:** "Get directions" link(s) in the detail panel that open the user's maps
app routed to the campground. No starting position needed — the maps app supplies
it. No backend changes, no API keys.

**Where:** `DetailPanel.svelte`'s existing `.links` block, following the pattern of
the current `nearbyMapsUrl` link.

**Behavior:**
- All platforms: `Get directions ↗` → `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`
  (universal link; opens the Google Maps app when installed, web otherwise).
- iOS only: an additional `Directions (Apple Maps) ↗` →
  `https://maps.apple.com/?daddr={lat},{lng}`.
- iOS detection lives in a new `frontend/src/lib/platform.ts` exporting
  `isIOS(userAgent: string): boolean` (`/iPad|iPhone|iPod/` test) so it is
  unit-testable; the component guards for SSR (no `navigator` on the server —
  compute in `$state` initialized in the browser, default false).

**Testing:** Vitest unit tests for `isIOS`; `pnpm check` 0/0.

---

## Tier 2 — Elevation (schema + ETL) and weather (client-side)

### Elevation

**Schema:** new nullable `elevation_m` (`number` / `real`) column on `facilities`
in `backend/teenybase.ts`.

- ⚠ **Deploy order:** deploy the backend schema to prod (`cd backend && pnpm deploy`)
  BEFORE merging the frontend to `main`.
- ⚠ **Local dev:** per the known trap (handoff 2026-07-11), apply the DDL by hand
  against the served sqlite (`da240ff2…sqlite`) and verify with a real request;
  do not rely on `teeny deploy --local`.

**ETL:** new script `etl` → `pnpm enrich-elevation`:
- Lists facilities where `elevation_m` is null (service token, high limit — no
  compound WHERE, filter client-side per the Teenybase quirk).
- Calls the Open-Meteo Elevation API (`https://api.open-meteo.com/v1/elevation`),
  no key, comma-separated batches of up to 100 coordinates (~7 requests for 649
  facilities). Copernicus DEM 90 m.
- Writes back via service token. The regular `sync` upsert never overwrites a
  non-null `elevation_m` (same clobber-protection idiom as fees/fs_url in
  `etl/src/teenybase.ts` UpsertOptions).

**UI:**
- Detail panel header meta line shows elevation in feet, e.g. `9,800 ft`
  (conversion + formatting in `$lib/weather.ts`, see below). Hidden when null.
- Compare view gets an Elevation row.

### Weather

**What:** new `frontend/src/lib/detail/WeatherStrip.svelte` in the detail panel —
a compact 7-day forecast strip: per-day weather icon, high/low °F, precipitation
probability. Header: `Weather at 9,800 ft` (falls back to `Weather` when
elevation is null).

**Data:** fetched client-side directly from Open-Meteo's forecast API
(CORS-enabled, keyless — the "RIDB key stays server-side" rule doesn't apply
because there is no key; no caching table, no server route):

```
https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}
  &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max
  &temperature_unit=fahrenheit&timezone=America/Denver&forecast_days=7
  &elevation={elevation_m}          # only when stored elevation is present
```

Passing the stored `elevation_m` makes Open-Meteo downscale temperatures to the
campground's altitude.

**Support module:** `frontend/src/lib/weather.ts` — pure, unit-testable:
- WMO `weather_code` → `{icon, label}` mapping (grouped: clear / partly cloudy /
  fog / rain / snow / thunderstorm / …).
- `metersToFeet` + display formatting (`9,800 ft`).

**Error handling:** fetch failure or non-200 hides the section entirely (no
error banner — same graceful-degradation stance as alerts).

**Attribution:** small footer credit `Weather by Open-Meteo` linking to
open-meteo.com (CC BY 4.0 requirement).

**Testing:** Vitest for the weather-code mapping and formatting; component
renders from a fixture response.

---

## Tier 3 — Things nearby (Overpass, cached like alerts)

**What:** a "Nearby" section in the detail panel listing trailheads and
supplies/fuel around the campground, sourced from OpenStreetMap via the Overpass
API, cached server-side exactly like alerts.

**Schema:** new Teenybase table `nearby_pois` mirroring `alerts`:
- `facility_id` — relation → facilities, `onDelete: CASCADE`
- `pois` — json (stringified on write, per the Teenybase quirk)
- `fetched_at` — timestamp
- Rules: public read (`listRule/viewRule: 'true'`), create/update/delete `'false'`
  (service-token writes from the server route only).
- Same deploy-order and local-DDL cautions as Tier 2.

**Server route:** `frontend/src/routes/api/nearby/[id]/+server.ts`, cloned from
`api/alerts/[id]`:
1. Cache hit if a `nearby_pois` row exists with `fetched_at` < **7 days** old →
   return it.
2. Else query Overpass (`https://overpass-api.de/api/interpreter`, POST, 10 s
   timeout, `User-Agent: CampFinder/1.0`). One request, two clauses:
   - **Trailheads:** `node/way["highway"="trailhead"](around:8000,{lat},{lng})`,
     named only; keep the nearest **6**.
   - **Supplies & fuel:** `["shop"~"supermarket|convenience"]` and
     `["amenity"="fuel"]` `(around:25000,…)`; keep the nearest **1 grocery** and
     **1 fuel**.
3. Normalize to `Array<{name, category: 'trailhead'|'grocery'|'fuel', lat, lng,
   distance_m}>` — haversine distance computed server-side, sorted ascending.
4. Upsert the cache row; return `{pois, fetched_at, cached}`.
5. Overpass failure (timeout / 429 / down): if a stale cache row exists, serve it
   stale; otherwise return `{pois: null}` and the UI hides the section. Never
   block the panel.

**UI:** new `frontend/src/lib/detail/NearbySection.svelte` below `AlertsSection`:
- Row per POI: category icon (⛰ trailhead, 🛒 grocery, ⛽ fuel), name, distance
  in miles (1 decimal), linking to
  `https://www.google.com/maps/dir/?api=1&destination={poi.lat},{poi.lng}`.
- Footer credit `Data © OpenStreetMap contributors`.

**Testing:** Vitest for the Overpass response normalizer (fixture JSON) and the
haversine/miles formatting; route logic covered by normalizer tests.

---

## Tier 4 — Cell coverage (offline ETL enrichment)

**What:** per-carrier "is there reported 4G data coverage at this spot" chips for
Verizon / AT&T / T-Mobile, computed offline from FCC Broadband Data Collection
(BDC) mobile coverage data — no runtime dependency.

**Schema:** new nullable `cell_coverage` (json) column on `facilities`:

```json
{ "verizon": true, "att": false, "tmobile": true, "as_of": "2026-06" }
```

**ETL:** new script `etl` → `pnpm enrich-cell`:
- **Input:** FCC BDC mobile-coverage hex exports for Colorado — one file per
  carrier, H3 **resolution-9** hex indexes, downloaded manually from the FCC
  National Broadband Map data-download portal. Exact download steps (portal URL,
  filters: state=CO, technology=4G LTE data, per-carrier) documented in a new
  `etl/README.md` section. Files live in `etl/data/fcc/` — **gitignored** (large).
- **Lookup:** for each facility, `h3-js` `latLngToCell(lat, lng, 9)` →
  set-membership test against each carrier's hex set (streamed into a `Set` —
  CO-sized files fit in memory).
- **Write:** service-token update per facility; skip writes when the value is
  unchanged. `as_of` comes from the FCC data vintage, passed as a CLI arg or
  read from the filename.
- **Cadence:** manual re-run when FCC publishes new data (~2×/year). The regular
  `sync` never touches `cell_coverage`.

**UI:**
- Detail panel: three chips — `● Verizon  ○ AT&T  ● T-Mobile` (● reported
  coverage, ○ none) with caption `FCC-reported 4G data coverage · as of 2026-06`.
  Section hidden entirely when `cell_coverage` is null.
- Compare view gets a Cell signal row.
- Honest framing: FCC data is carrier-reported propagation modeling, often
  optimistic in canyons — the caption says "reported" deliberately.

**Testing:** Vitest for the H3 lookup wiring (fixture hex set + known
coordinates) and the chips component render states (null / partial / full).

---

## Cross-cutting

- **Deploy order (Tiers 2, 3, 4):** backend schema deploy → prod ETL enrichment
  (where applicable) → frontend merge to `main` (auto-deploys).
- **Implementation order:** T1 → T2 → T3 → T4, each independently shippable.
- **No new secrets or env vars.** Open-Meteo and Overpass are keyless; FCC data
  is a manual file download.
- **Quality gates:** `frontend pnpm check` 0/0 and all Vitest suites green before
  every commit, per repo convention.
