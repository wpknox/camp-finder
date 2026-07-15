# Post-Launch Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four independently shippable feature tiers to CampFinder: directions deep-links, elevation + 7-day weather in the detail panel, cached "things nearby" (trailheads/supplies via Overpass), and FCC cell-coverage enrichment with crowdsourced carrier overrides.

**Architecture:** Frontend-only Tier 1; one combined backend schema change (2 columns + 1 table) serving Tiers 2–4; two offline ETL enrichment scripts (Open-Meteo elevation, FCC H3 cell lookup); one new cached server route cloned from the alerts pattern; client-side keyless Open-Meteo weather fetch. Spec: `docs/superpowers/specs/2026-07-14-post-launch-features-design.md`.

**Tech Stack:** SvelteKit (Svelte 5 runes only), Teenybase (Workers+D1), Node/tsx ETL, Vitest, Open-Meteo API (keyless), Overpass API, FCC BDC hex data + `h3-js`.

**User decisions (already made):**
- All 4 tiers, one plan, ordered T1→T4, each tier shippable alone.
- Elevation: ETL-enriched `elevation_m` column; shown in detail panel + Compare.
- Weather: 7-day compact strip, client-side Open-Meteo, elevation-corrected; on narrow mobile may drop to 5 (or 3) visible days if 7 is cramped — fetch stays 7 days.
- Nearby: list in detail panel only (no map pins); trailheads (8 km, nearest 6) + nearest grocery + nearest fuel (25 km); cached 7 days like alerts.
- Cell coverage: Verizon/AT&T/T-Mobile, offline FCC BDC H3 enrichment, chips UI.
- Directions: Google Maps universal link everywhere; Apple Maps link added only on iOS.
- Crowdsourced carrier overrides via existing suggest-an-edit flow; `user_edited` carriers never clobbered by `enrich-cell`.
- Road/trail condition reports DEFERRED to a future spec (not in this plan).

**Branch:** create `feat/post-launch-features` from `main` before Task 1. ⚠ `main` auto-deploys the frontend — schema-dependent frontend code must not reach `main` before the backend deploy (Task 13 handles ordering).

**Repo conventions (enforced):** Svelte 5 runes only (`$state`/`$derived`/`$effect`/`$props`, `onclick=`); Teenybase JSON fields stringified on write, parsed on read; no compound WHERE; `frontend pnpm check` must stay 0/0 and all Vitest suites green before every commit; UI follows `docs/design-language.md`.

---

### Task 1: Directions deep-links (Tier 1)

**Goal:** "Get directions" links in the detail panel — Google Maps everywhere, plus Apple Maps on iOS.

**Files:**
- Create: `frontend/src/lib/platform.ts`
- Create: `frontend/src/lib/platform.test.ts`
- Modify: `frontend/src/lib/detail/DetailPanel.svelte` (script + `.links` block, ~line 211)

**Acceptance Criteria:**
- [ ] `isIOS()` returns true for iPhone/iPad/iPod UAs, false for Android/desktop UAs
- [ ] Detail panel shows "Get directions (Google Maps) ↗" for every facility
- [ ] Apple Maps link renders only when the UA is iOS (verifiable in vitest via the pure fn; manually via devtools UA emulation)
- [ ] `pnpm check` 0/0, `pnpm test` green

**Verify:** `cd frontend && pnpm test -- platform && pnpm check` → tests PASS, 0 errors 0 warnings

**Steps:**

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/platform.test.ts
import { describe, it, expect } from 'vitest'
import { isIOS } from './platform'

describe('isIOS', () => {
  it('detects iPhone', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe(true)
  })
  it('detects iPad', () => {
    expect(isIOS('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe(true)
  })
  it('rejects Android', () => {
    expect(isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe(false)
  })
  it('rejects desktop Mac', () => {
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- platform`
Expected: FAIL — cannot resolve `./platform`

- [ ] **Step 3: Implement `platform.ts`**

```ts
// frontend/src/lib/platform.ts
/** UA-based iOS detection — used only for cosmetic link choices, never gating. */
export function isIOS(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- platform`
Expected: 4 PASS

- [ ] **Step 5: Add links to DetailPanel**

In `DetailPanel.svelte` script, after the existing `nearbyMapsUrl` derived (~line 106):

```ts
import { browser } from '$app/environment'
import { isIOS } from '$lib/platform'
```

```ts
const onIOS = browser && isIOS(navigator.userAgent)
let googleDirectionsUrl = $derived(`https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`)
let appleDirectionsUrl  = $derived(`https://maps.apple.com/?daddr=${facility.lat},${facility.lng}`)
```

In the `.links` div (~line 211), add as the FIRST links:

```svelte
<a href={googleDirectionsUrl} target="_blank" rel="noopener">Get directions (Google Maps) ↗</a>
{#if onIOS}
  <a href={appleDirectionsUrl} target="_blank" rel="noopener">Get directions (Apple Maps) ↗</a>
{/if}
```

- [ ] **Step 6: Verify and commit**

Run: `cd frontend && pnpm check && pnpm test`
Expected: 0 errors 0 warnings; all tests pass.

```bash
git add frontend/src/lib/platform.ts frontend/src/lib/platform.test.ts frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(detail): directions deep-links — Google everywhere, Apple Maps on iOS"
```

---

### Task 2: Backend schema — elevation_m, cell_coverage, nearby_pois

**Goal:** One schema change covering Tiers 2–4: two nullable facility columns and the `nearby_pois` cache table, applied to the local dev DB by hand (known miniflare trap).

**Files:**
- Modify: `backend/teenybase.ts` (facilities fields ~line 115; new table after `alerts` ~line 158)

**Acceptance Criteria:**
- [ ] `facilities` has nullable `elevation_m` (real) and `cell_coverage` (json)
- [ ] `nearby_pois` table exists: `facility_id` relation (CASCADE), `pois` json, `fetched_at` timestamp; public read, all writes `'false'`
- [ ] Local dev D1 has the DDL applied and a real request against :8787 proves it (NOT just the migration ledger)

**Verify:** `curl -s -X POST http://localhost:8787/api/v1/table/nearby_pois/list -H 'Content-Type: application/json' -d '{"limit":1}'` → `{"items":[]}` (not "Table not found"); same for a facilities list showing `elevation_m` key.

**Steps:**

- [ ] **Step 1: Add columns to `facilities` in `backend/teenybase.ts`**

After `is_deleted` (~line 115):

```ts
        // Meters above sea level, enriched by etl `pnpm enrich-elevation`
        // (Open-Meteo). Sync never touches it.
        { name: "elevation_m", type: "number", sqlType: "real" },
        // {verizon,att,tmobile: bool|null, as_of: string|null, user_edited?: string[]}
        // Written by etl `pnpm enrich-cell` (FCC BDC) and admin-approved user
        // overrides; carriers in user_edited are never clobbered by enrich-cell.
        { name: "cell_coverage", type: "json", sqlType: "json" },
```

- [ ] **Step 2: Add `nearby_pois` table**

After the `alerts` table definition (~line 158), same shape as `alerts`:

```ts
    {
      name: "nearby_pois",
      autoSetUid: true,
      fields: [
        ...baseFields,
        {
          name: "facility_id",
          type: "relation",
          sqlType: "text",
          foreignKey: {
            table: "facilities",
            column: "id",
            onDelete: "CASCADE",
          },
        },
        // Array<{name, category: 'trailhead'|'grocery'|'fuel', lat, lng, distance_m}>
        { name: "pois", type: "json", sqlType: "json" },
        { name: "fetched_at", type: "date", sqlType: "timestamp" },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: "rules",
          listRule: "true",
          viewRule: "true",
          createRule: "false",
          updateRule: "false",
          deleteRule: "false",
        } satisfies TableRulesExtensionData,
      ],
    },
```

- [ ] **Step 3: Generate migration SQL and apply it BY HAND locally**

Per the handoff trap (`teeny deploy --local` writes ledger-only): run `cd backend && pnpm generate`, read the newly generated SQL in `backend/migrations/`, then apply exactly that DDL directly:

```bash
sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/da240ff2*.sqlite \
  "ALTER TABLE facilities ADD COLUMN elevation_m real;
   ALTER TABLE facilities ADD COLUMN cell_coverage text;"
# CREATE TABLE nearby_pois … — copy the exact CREATE TABLE (and any index/trigger
# statements) from the generated migration file; do not hand-write it.
```

- [ ] **Step 4: Verify with real requests**

With `cd backend && pnpm dev` running:

```bash
curl -s -X POST http://localhost:8787/api/v1/table/nearby_pois/list -H 'Content-Type: application/json' -d '{"limit":1}'
curl -s -X POST http://localhost:8787/api/v1/table/facilities/list -H 'Content-Type: application/json' -d '{"limit":1}' | grep -o 'elevation_m'
```

Expected: `{"items":[]}` and `elevation_m`.

- [ ] **Step 5: Commit**

```bash
git add backend/teenybase.ts
git commit -m "feat(schema): elevation_m + cell_coverage columns, nearby_pois cache table"
```

⚠ Prod DDL is applied in Task 13 (`cd backend && pnpm deploy` with `.prod.vars`) BEFORE the frontend merge.

---

### Task 3: ETL `pnpm enrich-elevation`

**Goal:** Backfill `elevation_m` for all facilities missing it, via Open-Meteo's batch elevation API (no key).

**Files:**
- Create: `etl/src/enrich-elevation.ts`
- Create: `etl/tests/elevation.test.ts`
- Modify: `etl/package.json` (scripts)
- Modify: `etl/src/teenybase.ts` (add `listForEnrichment`)

**Acceptance Criteria:**
- [ ] `chunk` splits arrays into ≤100-item batches; `fetchElevations` builds one comma-separated request per batch and parses `{elevation:[…]}`
- [ ] Only facilities with `elevation_m == null` and not `is_deleted` are patched; values rounded to whole meters
- [ ] `pnpm enrich-elevation` against local backend fills all 592+ local rows
- [ ] `cd etl && pnpm test` green

**Verify:** `cd etl && pnpm test -- elevation` → PASS; then `pnpm enrich-elevation` prints `patched N facilities`, and `curl -s -X POST http://localhost:8787/api/v1/table/facilities/list -H 'Content-Type: application/json' -d '{"limit":1}' | grep -o '"elevation_m":[0-9]*'` shows a number.

**Steps:**

- [ ] **Step 1: Write failing tests**

```ts
// etl/tests/elevation.test.ts
import { describe, it, expect, vi } from "vitest";
import { chunk, fetchElevations } from "../src/enrich-elevation.js";

describe("chunk", () => {
  it("splits into batches of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("handles empty input", () => {
    expect(chunk([], 100)).toEqual([]);
  });
});

describe("fetchElevations", () => {
  it("requests comma-separated coords and returns elevations in order", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elevation: [2987.0, 3105.4] }),
    });
    const coords = [
      { lat: 38.87, lng: -106.99 },
      { lat: 39.1, lng: -106.5 },
    ];
    const result = await fetchElevations(coords, fetchFn as unknown as typeof fetch);
    expect(result).toEqual([2987.0, 3105.4]);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("latitude=38.87,39.1");
    expect(url).toContain("longitude=-106.99,-106.5");
  });
  it("throws on non-ok response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(fetchElevations([{ lat: 1, lng: 2 }], fetchFn as unknown as typeof fetch)).rejects.toThrow("429");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd etl && pnpm test -- elevation`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `listForEnrichment` to `etl/src/teenybase.ts`**

Inside `TbClient` (after `listAllWithMerged`):

```ts
  async listForEnrichment(): Promise<
    Array<{ id: string; lat: number; lng: number; elevation_m: number | null; cell_coverage: Record<string, unknown> | null; is_deleted: boolean }>
  > {
    const res = (await this.tbFetch("/table/facilities/list", { limit: 10000 })) as {
      items: Array<{ id: string; lat: number; lng: number; elevation_m?: number | null; cell_coverage?: string | Record<string, unknown> | null; is_deleted?: boolean | null }>;
    };
    return res.items.map((f) => ({
      id: f.id,
      lat: f.lat,
      lng: f.lng,
      elevation_m: f.elevation_m ?? null,
      cell_coverage:
        typeof f.cell_coverage === "string" ? JSON.parse(f.cell_coverage) : (f.cell_coverage ?? null),
      is_deleted: !!f.is_deleted,
    }));
  }
```

- [ ] **Step 4: Implement `etl/src/enrich-elevation.ts`**

```ts
// etl/src/enrich-elevation.ts — backfill facilities.elevation_m from Open-Meteo.
// Keyless API; batches of 100 coords; never overwrites a non-null elevation.
import "dotenv/config";
import { TbClient } from "./teenybase.js";

const BATCH = 100;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchElevations(
  coords: Array<{ lat: number; lng: number }>,
  fetchFn: typeof fetch = fetch,
): Promise<number[]> {
  const lats = coords.map((c) => c.lat).join(",");
  const lngs = coords.map((c) => c.lng).join(",");
  const res = await fetchFn(
    `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`,
  );
  if (!res.ok) throw new Error(`Open-Meteo elevation ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation;
}

async function main() {
  const tb = new TbClient(process.env.TB_API_URL!, process.env.TB_SERVICE_TOKEN!);
  const all = await tb.listForEnrichment();
  const missing = all.filter((f) => f.elevation_m == null && !f.is_deleted);
  console.log(`${missing.length} facilities missing elevation (of ${all.length})`);
  let patched = 0;
  for (const batch of chunk(missing, BATCH)) {
    const elevations = await fetchElevations(batch);
    for (let i = 0; i < batch.length; i++) {
      await tb.patchFacility(batch[i].id, { elevation_m: Math.round(elevations[i]) });
      patched++;
    }
    console.log(`patched ${patched}/${missing.length}`);
  }
  console.log(`patched ${patched} facilities`);
}

// Only run as a script, not when imported by tests.
if (process.argv[1]?.endsWith("enrich-elevation.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Add script to `etl/package.json`**

```json
    "enrich-elevation": "tsx src/enrich-elevation.ts",
```

- [ ] **Step 6: Test, run locally, commit**

Run: `cd etl && pnpm test` → all green (130 + 4 new).
Run: `pnpm enrich-elevation` (local `.env`) → `patched N facilities`; spot-check via the curl in **Verify**.

```bash
git add etl/src/enrich-elevation.ts etl/tests/elevation.test.ts etl/package.json etl/src/teenybase.ts
git commit -m "feat(etl): enrich-elevation — Open-Meteo backfill for facilities.elevation_m"
```

---

### Task 4: `$lib/weather.ts` — WMO mapping + elevation formatting

**Goal:** Pure, tested helpers: WMO weather-code → icon/label, meters→feet formatting.

**Files:**
- Create: `frontend/src/lib/weather.ts`
- Create: `frontend/src/lib/weather.test.ts`

**Acceptance Criteria:**
- [ ] Every WMO code group maps to an icon+label; unknown codes fall back to cloud
- [ ] `formatElevationFt(2987)` → `"9,800 ft"`; null/undefined → null
- [ ] `pnpm test` green

**Verify:** `cd frontend && pnpm test -- weather` → PASS

**Steps:**

- [ ] **Step 1: Write failing tests**

```ts
// frontend/src/lib/weather.test.ts
import { describe, it, expect } from 'vitest'
import { wmoToWeather, metersToFeet, formatElevationFt } from './weather'

describe('wmoToWeather', () => {
  it('maps clear sky', () => expect(wmoToWeather(0)).toEqual({ icon: '☀️', label: 'Clear' }))
  it('maps partly cloudy', () => expect(wmoToWeather(2).icon).toBe('⛅'))
  it('maps fog', () => expect(wmoToWeather(45).label).toBe('Fog'))
  it('maps rain', () => expect(wmoToWeather(63).icon).toBe('🌧️'))
  it('maps snow', () => expect(wmoToWeather(73).icon).toBe('🌨️'))
  it('maps thunderstorm', () => expect(wmoToWeather(95).icon).toBe('⛈️'))
  it('falls back for unknown codes', () => expect(wmoToWeather(42).icon).toBe('☁️'))
})

describe('elevation formatting', () => {
  it('converts meters to feet', () => expect(Math.round(metersToFeet(1000))).toBe(3281))
  it('formats with thousands separator', () => expect(formatElevationFt(2987)).toBe('9,800 ft'))
  it('returns null for null/undefined', () => {
    expect(formatElevationFt(null)).toBeNull()
    expect(formatElevationFt(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd frontend && pnpm test -- weather` → FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// frontend/src/lib/weather.ts — pure helpers for WeatherStrip + elevation display.
export interface DayWeather {
  icon: string
  label: string
}

/** WMO weather interpretation codes (Open-Meteo `weather_code`), grouped. */
export function wmoToWeather(code: number): DayWeather {
  if (code === 0) return { icon: '☀️', label: 'Clear' }
  if (code === 1) return { icon: '🌤️', label: 'Mostly clear' }
  if (code === 2) return { icon: '⛅', label: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', label: 'Overcast' }
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' }
  if ((code >= 61 && code <= 67) || code === 80 || code === 81 || code === 82)
    return { icon: '🌧️', label: 'Rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: '🌨️', label: 'Snow' }
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' }
  return { icon: '☁️', label: 'Clouds' }
}

export function metersToFeet(m: number): number {
  return m * 3.28084
}

export function formatElevationFt(m: number | null | undefined): string | null {
  if (m == null) return null
  return `${Math.round(metersToFeet(m)).toLocaleString('en-US')} ft`
}
```

- [ ] **Step 4: Verify pass and commit**

Run: `cd frontend && pnpm test -- weather && pnpm check` → PASS, 0/0.

```bash
git add frontend/src/lib/weather.ts frontend/src/lib/weather.test.ts
git commit -m "feat(lib): weather helpers — WMO code mapping + elevation formatting"
```

---

### Task 5: Elevation in the UI (types, detail header, Compare)

**Goal:** Surface stored elevation in the detail-panel meta line and as a Compare row.

**Files:**
- Modify: `frontend/src/lib/types.ts` (Facility)
- Modify: `frontend/src/lib/detail/DetailPanel.svelte` (meta line, ~line 153)
- Modify: `frontend/src/lib/compare/CompareView.svelte` (rows array, ~line 6)

**Acceptance Criteria:**
- [ ] `Facility` has `elevation_m: number | null`
- [ ] Detail meta line shows `… · 9,800 ft` when elevation present, nothing extra when null
- [ ] Compare has an "Elevation" row (`?` when null)
- [ ] `pnpm check` 0/0, tests green

**Verify:** `cd frontend && pnpm check && pnpm test` → 0/0, PASS; then with dev servers running (elevation enriched in Task 3), open a campground → meta line shows feet.

**Steps:**

- [ ] **Step 1: Add the field to `Facility` in `types.ts`** (after `is_deleted?: boolean;`):

```ts
  elevation_m?: number | null;
```

- [ ] **Step 2: Detail panel meta line**

In `DetailPanel.svelte`, import and derive:

```ts
import { formatElevationFt } from '$lib/weather'
```

```ts
let elevationFt = $derived(formatElevationFt(facility.elevation_m))
```

Change the meta `<p>` (~line 153):

```svelte
<p class="meta">{facility.forest}{facility.district ? ` · ${facility.district}` : ''}{elevationFt ? ` · ${elevationFt}` : ''}</p>
```

- [ ] **Step 3: Compare row**

In `CompareView.svelte`, import `formatElevationFt` and add to `rows` after `Forest`:

```ts
import { formatElevationFt } from '$lib/weather'
```

```ts
    { label: 'Elevation',    key: f => formatElevationFt(f.elevation_m) ?? '?' },
```

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && pnpm check && pnpm test` → 0/0, PASS. Manual: open a facility on :5173 → `· 9,800 ft` in meta; add two to Compare → Elevation row present.

```bash
git add frontend/src/lib/types.ts frontend/src/lib/detail/DetailPanel.svelte frontend/src/lib/compare/CompareView.svelte
git commit -m "feat(ui): show facility elevation in detail header and Compare"
```

---

### Task 6: WeatherStrip component

**Goal:** 7-day compact forecast strip in the detail panel, client-side Open-Meteo, elevation-corrected, mobile-safe.

**Files:**
- Create: `frontend/src/lib/detail/WeatherStrip.svelte`
- Modify: `frontend/src/lib/detail/DetailPanel.svelte` (render after `<AmenityGrid …/>`, ~line 199)

**Acceptance Criteria:**
- [ ] Fetches `api.open-meteo.com/v1/forecast` with daily weather_code, temp max/min (°F), precip probability, `timezone=America/Denver`, `forecast_days=7`, and `&elevation=` when `facility.elevation_m` is set
- [ ] Renders day name, icon, high, low, precip % per day; header "Weather at 9,800 ft" (or "Weather" when elevation null); "Weather by Open-Meteo" credit link
- [ ] Fetch failure → section renders nothing (no error banner)
- [ ] ≤480px viewports show 5 days (columns 6–7 hidden via CSS); strip itself scrolls horizontally rather than overflowing the panel
- [ ] `pnpm check` 0/0

**Verify:** `cd frontend && pnpm check` → 0/0; manual on :5173 — open a campground, see 7-day strip; devtools mobile emulation (390px) shows 5 days; devtools offline → section absent, no console error.

**Steps:**

- [ ] **Step 1: Create `WeatherStrip.svelte`**

```svelte
<script lang="ts">
  import { wmoToWeather, formatElevationFt } from '$lib/weather'

  let { lat, lng, elevationM }: { lat: number; lng: number; elevationM: number | null | undefined } = $props()

  interface Day { date: string; code: number; hi: number; lo: number; precip: number }
  let days = $state<Day[] | null>(null)
  let failed = $state(false)

  const elevFt = $derived(formatElevationFt(elevationM))

  $effect(() => {
    // Re-fetch when the selected facility changes.
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      temperature_unit: 'fahrenheit',
      timezone: 'America/Denver',
      forecast_days: '7',
    })
    if (elevationM != null) params.set('elevation', String(elevationM))
    let stale = false
    days = null
    failed = false
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] } }) => {
        if (stale) return
        days = d.daily.time.map((date, i) => ({
          date,
          code: d.daily.weather_code[i],
          hi: Math.round(d.daily.temperature_2m_max[i]),
          lo: Math.round(d.daily.temperature_2m_min[i]),
          precip: d.daily.precipitation_probability_max[i] ?? 0,
        }))
      })
      .catch(() => { if (!stale) failed = true })
    return () => { stale = true }
  })

  function dayName(iso: string): string {
    // Parse as local date (ISO date-only strings are UTC by default).
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
  }
</script>

{#if !failed}
  <section class="weather">
    <h3>{elevFt ? `Weather at ${elevFt}` : 'Weather'}</h3>
    {#if days}
      <div class="strip">
        {#each days as d}
          {@const w = wmoToWeather(d.code)}
          <div class="day" title={w.label}>
            <span class="name">{dayName(d.date)}</span>
            <span class="icon">{w.icon}</span>
            <span class="hi">{d.hi}°</span>
            <span class="lo">{d.lo}°</span>
            <span class="precip">{d.precip}%</span>
          </div>
        {/each}
      </div>
      <p class="credit">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></p>
    {:else}
      <p class="loading">Loading forecast…</p>
    {/if}
  </section>
{/if}

<style>
  .weather { margin: 1.2rem 0; padding-top: 1rem; border-top: 1px solid var(--line); }
  h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; margin: 0 0 0.55rem; }
  .strip { display: flex; gap: 0.25rem; overflow-x: auto; }
  .day {
    flex: 1 1 0;
    min-width: 2.9rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.4rem 0.15rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--paper-deep);
  }
  .name { font-family: var(--font-ui); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }
  .icon { font-size: 1.15rem; line-height: 1.3; }
  .hi, .lo, .precip { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 0.74rem; }
  .hi { font-weight: 700; color: var(--ink); }
  .lo { color: var(--ink-soft); }
  .precip { color: var(--pine); font-size: 0.66rem; }
  .loading { color: var(--ink-soft); font-size: 0.85rem; }
  .credit { font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.7rem; margin: 0.4rem 0 0; }
  .credit a { color: var(--ink-faint); }
  /* Small phones: 5 days is enough — hide the last two columns (fetch stays 7). */
  @media (max-width: 480px) {
    .day:nth-child(n + 6) { display: none; }
  }
</style>
```

- [ ] **Step 2: Render in DetailPanel**

```ts
import WeatherStrip from './WeatherStrip.svelte'
```

After `<AmenityGrid amenities={facility.amenities} />` (~line 199):

```svelte
    <WeatherStrip lat={facility.lat} lng={facility.lng} elevationM={facility.elevation_m} />
```

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && pnpm check && pnpm test` → 0/0, PASS. Manual per **Verify** (desktop 7 days, 390px emulation 5 days, offline hides section).

```bash
git add frontend/src/lib/detail/WeatherStrip.svelte frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(detail): 7-day elevation-corrected Open-Meteo weather strip"
```

---

### Task 7: Overpass server module

**Goal:** Pure, tested server-side helpers: Overpass query builder, response normalizer (categorize/sort/cap), haversine.

**Files:**
- Create: `frontend/src/lib/server/overpass.ts`
- Create: `frontend/src/lib/server/overpass.test.ts`

**Acceptance Criteria:**
- [ ] `haversineMeters` accurate within 1% on a known pair
- [ ] `normalizeOverpass` handles node (lat/lon) and way/relation (center.lat/lon) elements, categorizes trailhead/grocery/fuel, sorts by distance, caps at 6 trailheads + 1 grocery + 1 fuel, skips unnamed trailheads, names fuel stations from `name` → `brand` → "Gas station"
- [ ] `pnpm test` green

**Verify:** `cd frontend && pnpm test -- overpass` → PASS

**Steps:**

- [ ] **Step 1: Write failing tests**

```ts
// frontend/src/lib/server/overpass.test.ts
import { describe, it, expect } from 'vitest'
import { haversineMeters, buildOverpassQuery, normalizeOverpass, type OverpassResponse } from './overpass'

describe('haversineMeters', () => {
  it('is ~1.11 km per 0.01° latitude', () => {
    const d = haversineMeters(39.0, -106.0, 39.01, -106.0)
    expect(d).toBeGreaterThan(1100)
    expect(d).toBeLessThan(1125)
  })
})

describe('buildOverpassQuery', () => {
  it('includes both radii and the coordinates', () => {
    const q = buildOverpassQuery(39.0, -106.0)
    expect(q).toContain('around:8000,39,-106')
    expect(q).toContain('around:25000,39,-106')
    expect(q).toContain('highway"="trailhead')
    expect(q).toContain('out center')
  })
})

const raw: OverpassResponse = {
  elements: [
    { type: 'node', id: 1, lat: 39.001, lon: -106.0, tags: { highway: 'trailhead', name: 'Lost Lake TH' } },
    { type: 'node', id: 2, lat: 39.002, lon: -106.0, tags: { highway: 'trailhead' } }, // unnamed → skip
    { type: 'way', id: 3, center: { lat: 39.05, lon: -106.0 }, tags: { shop: 'supermarket', name: 'City Market' } },
    { type: 'node', id: 4, lat: 39.06, lon: -106.0, tags: { shop: 'convenience', name: 'Kum & Go' } }, // farther grocery → dropped
    { type: 'node', id: 5, lat: 39.04, lon: -106.0, tags: { amenity: 'fuel', brand: 'Shell' } },
    ...Array.from({ length: 8 }, (_, i) => ({
      type: 'node' as const, id: 10 + i, lat: 39.003 + i * 0.001, lon: -106.0,
      tags: { highway: 'trailhead', name: `TH ${i}` },
    })),
  ],
}

describe('normalizeOverpass', () => {
  const pois = normalizeOverpass(raw, 39.0, -106.0)
  it('caps trailheads at 6, sorted nearest-first', () => {
    const ths = pois.filter((p) => p.category === 'trailhead')
    expect(ths).toHaveLength(6)
    expect(ths[0].name).toBe('Lost Lake TH')
    expect(ths.every((p, i, a) => i === 0 || a[i - 1].distance_m <= p.distance_m)).toBe(true)
  })
  it('keeps only the nearest grocery', () => {
    const groceries = pois.filter((p) => p.category === 'grocery')
    expect(groceries).toHaveLength(1)
    expect(groceries[0].name).toBe('City Market')
  })
  it('names fuel from brand fallback', () => {
    const fuel = pois.filter((p) => p.category === 'fuel')
    expect(fuel).toHaveLength(1)
    expect(fuel[0].name).toBe('Shell')
  })
  it('uses way center coordinates', () => {
    expect(pois.find((p) => p.name === 'City Market')!.lat).toBeCloseTo(39.05)
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `cd frontend && pnpm test -- overpass` → FAIL (module not found)

- [ ] **Step 3: Implement `overpass.ts`**

```ts
// frontend/src/lib/server/overpass.ts — query building + normalization for the
// "things nearby" feature. Pure functions; the fetch lives in the route.
export interface NearbyPoi {
  name: string
  category: 'trailhead' | 'grocery' | 'fuel'
  lat: number
  lng: number
  distance_m: number
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

export interface OverpassResponse {
  elements: OverpassElement[]
}

const TRAILHEAD_RADIUS_M = 8000
const SUPPLY_RADIUS_M = 25000
const MAX_TRAILHEADS = 6

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function buildOverpassQuery(lat: number, lng: number): string {
  return `[out:json][timeout:10];
(
  nwr["highway"="trailhead"]["name"](around:${TRAILHEAD_RADIUS_M},${lat},${lng});
  nwr["shop"~"^(supermarket|convenience)$"]["name"](around:${SUPPLY_RADIUS_M},${lat},${lng});
  nwr["amenity"="fuel"](around:${SUPPLY_RADIUS_M},${lat},${lng});
);
out center 200;`
}

function coords(el: OverpassElement): { lat: number; lng: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon }
  if (el.center) return { lat: el.center.lat, lng: el.center.lon }
  return null
}

function categorize(tags: Record<string, string>): NearbyPoi['category'] | null {
  if (tags.highway === 'trailhead') return 'trailhead'
  if (tags.shop === 'supermarket' || tags.shop === 'convenience') return 'grocery'
  if (tags.amenity === 'fuel') return 'fuel'
  return null
}

export function normalizeOverpass(raw: OverpassResponse, lat: number, lng: number): NearbyPoi[] {
  const all: NearbyPoi[] = []
  for (const el of raw.elements ?? []) {
    const tags = el.tags ?? {}
    const category = categorize(tags)
    const c = coords(el)
    if (!category || !c) continue
    const name = tags.name ?? tags.brand ?? (category === 'fuel' ? 'Gas station' : null)
    if (!name) continue // unnamed trailheads/shops aren't useful list entries
    all.push({ name, category, lat: c.lat, lng: c.lng, distance_m: Math.round(haversineMeters(lat, lng, c.lat, c.lng)) })
  }
  all.sort((a, b) => a.distance_m - b.distance_m)
  return [
    ...all.filter((p) => p.category === 'trailhead').slice(0, MAX_TRAILHEADS),
    ...all.filter((p) => p.category === 'grocery').slice(0, 1),
    ...all.filter((p) => p.category === 'fuel').slice(0, 1),
  ]
}
```

- [ ] **Step 4: Verify pass and commit**

Run: `cd frontend && pnpm test -- overpass && pnpm check` → PASS, 0/0.

```bash
git add frontend/src/lib/server/overpass.ts frontend/src/lib/server/overpass.test.ts
git commit -m "feat(server): overpass query builder + POI normalizer for things-nearby"
```

---

### Task 8: `/api/nearby/[id]` cached route

**Goal:** Server route serving nearby POIs from the `nearby_pois` cache (7-day TTL), falling back to a live Overpass query; serve-stale on Overpass failure.

**Files:**
- Create: `frontend/src/routes/api/nearby/[id]/+server.ts`

**Acceptance Criteria:**
- [ ] Fresh cache (<7 d) returns `{pois, fetched_at, cached: true}` without hitting Overpass
- [ ] Cache miss queries Overpass (POST, 10 s timeout, CampFinder UA), normalizes, upserts the row via service token (`pois` stringified), returns `cached: false`
- [ ] Overpass failure with a stale row → returns the stale pois; with no row → `{pois: null}`; never a 500
- [ ] `pnpm check` 0/0

**Verify:** with both dev servers running: `curl -s http://localhost:5173/api/nearby/<facility-id>` twice → first `"cached":false`, second `"cached":true`; row visible via `curl -s -X POST http://localhost:8787/api/v1/table/nearby_pois/list -H 'Content-Type: application/json' -d '{"limit":1}'`.

**Steps:**

- [ ] **Step 1: Implement the route** (mirrors `api/alerts/[id]`)

```ts
// frontend/src/routes/api/nearby/[id]/+server.ts
import { json } from '@sveltejs/kit'
import { tbFetch } from '$lib/server/tbFetch'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import { buildOverpassQuery, normalizeOverpass, type NearbyPoi, type OverpassResponse } from '$lib/server/overpass'
import type { RequestHandler } from './$types'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const tbHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TB_SERVICE_TOKEN}`,
}

interface CacheRow { id: string; pois: string | NearbyPoi[] | null; fetched_at: string }

function parsePois(v: CacheRow['pois']): NearbyPoi[] | null {
  if (v == null) return null
  if (typeof v === 'string') {
    try { return JSON.parse(v) as NearbyPoi[] } catch { return null }
  }
  return v
}

export const GET: RequestHandler = async ({ params }) => {
  const facilityId = params.id

  const cacheRes = await tbFetch(`/api/v1/table/nearby_pois/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `facility_id == '${facilityId}'`, limit: 1 }),
  })
  const cache = (await cacheRes.json()) as { items?: CacheRow[] }
  const row = cache.items?.[0]

  if (row && new Date(row.fetched_at).getTime() >= Date.now() - CACHE_TTL_MS) {
    return json({ pois: parsePois(row.pois), fetched_at: row.fetched_at, cached: true })
  }

  const facRes = await tbFetch(`/api/v1/table/facilities/view/${facilityId}`)
  const facility = facRes.ok ? ((await facRes.json()) as { lat?: number; lng?: number }) : null
  if (facility?.lat == null || facility?.lng == null) return json({ pois: null })

  let pois: NearbyPoi[] | null = null
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CampFinder/1.0 (campground info aggregator)',
      },
      body: `data=${encodeURIComponent(buildOverpassQuery(facility.lat, facility.lng))}`,
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) pois = normalizeOverpass((await res.json()) as OverpassResponse, facility.lat, facility.lng)
  } catch { /* fail gracefully below */ }

  if (pois === null) {
    // Overpass down or rate-limited: serve stale if we have anything at all.
    if (row) return json({ pois: parsePois(row.pois), fetched_at: row.fetched_at, cached: true, stale: true })
    return json({ pois: null })
  }

  const fetched_at = new Date().toISOString()
  if (row) {
    await tbFetch(`/api/v1/table/nearby_pois/edit/${row.id}`, {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ pois: JSON.stringify(pois), fetched_at }),
    })
  } else {
    await tbFetch(`/api/v1/table/nearby_pois/insert`, {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ values: { facility_id: facilityId, pois: JSON.stringify(pois), fetched_at } }),
    })
  }

  return json({ pois, fetched_at, cached: false })
}
```

- [ ] **Step 2: Verify and commit**

Run: `cd frontend && pnpm check` → 0/0. Manual per **Verify** (two curls: `cached:false` then `cached:true`).

```bash
git add frontend/src/routes/api/nearby
git commit -m "feat(api): /api/nearby/[id] — Overpass POIs cached 7 days, serve-stale on failure"
```

---

### Task 9: NearbySection component

**Goal:** "Nearby" list in the detail panel: icon, name, distance in miles, each row linking to Google Maps directions; OSM credit.

**Files:**
- Create: `frontend/src/lib/detail/NearbySection.svelte`
- Modify: `frontend/src/lib/detail/DetailPanel.svelte` (render after `<AlertsSection …/>`, ~line 205)

**Acceptance Criteria:**
- [ ] Renders grouped rows with icons (⛰ trailhead / 🛒 grocery / ⛽ fuel), name, `X.X mi`, each an outbound Google-directions link
- [ ] Loading state while fetching; section hidden entirely when `pois` is null or empty
- [ ] "Data © OpenStreetMap contributors" credit
- [ ] `pnpm check` 0/0

**Verify:** `cd frontend && pnpm check` → 0/0; manual on :5173 — open a campground near Gunnison → trailheads + grocery + fuel listed with sane distances.

**Steps:**

- [ ] **Step 1: Create `NearbySection.svelte`** (modeled on `AlertsSection.svelte`)

```svelte
<script lang="ts">
  import { onMount } from 'svelte'

  let { facilityId }: { facilityId: string } = $props()

  interface Poi { name: string; category: 'trailhead' | 'grocery' | 'fuel'; lat: number; lng: number; distance_m: number }

  let loading = $state(true)
  let pois = $state<Poi[] | null>(null)

  const ICONS: Record<Poi['category'], string> = { trailhead: '⛰️', grocery: '🛒', fuel: '⛽' }

  function miles(m: number): string {
    return `${(m / 1609.34).toFixed(1)} mi`
  }
  function dirUrl(p: Poi): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
  }

  onMount(async () => {
    try {
      const res = await fetch(`/api/nearby/${facilityId}`)
      const data = await res.json()
      pois = data.pois
    } catch {
      pois = null
    } finally {
      loading = false
    }
  })
</script>

{#if loading || (pois && pois.length > 0)}
  <section class="nearby">
    <h3>Nearby</h3>
    {#if loading}
      <p class="status">Looking around…</p>
    {:else if pois}
      <ul>
        {#each pois as p}
          <li>
            <span class="icon">{ICONS[p.category]}</span>
            <a href={dirUrl(p)} target="_blank" rel="noopener">{p.name}</a>
            <span class="dist">{miles(p.distance_m)}</span>
          </li>
        {/each}
      </ul>
      <p class="credit">Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</p>
    {/if}
  </section>
{/if}

<style>
  .nearby { margin: 1.2rem 0; padding-top: 1rem; border-top: 1px solid var(--line); }
  h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; margin: 0 0 0.55rem; }
  .status { color: var(--ink-soft); font-size: 0.85rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
  li { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.86rem; }
  .icon { flex: none; }
  li a { color: var(--pine); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dist { margin-left: auto; font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink-faint); font-size: 0.76rem; flex: none; }
  .credit { font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.7rem; margin: 0.5rem 0 0; }
  .credit a { color: var(--ink-faint); }
</style>
```

- [ ] **Step 2: Render in DetailPanel**

```ts
import NearbySection from './NearbySection.svelte'
```

After `<AlertsSection facilityId={facility.id} />` (~line 205):

```svelte
    <NearbySection facilityId={facility.id} />
```

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && pnpm check && pnpm test` → 0/0, PASS. Manual per **Verify**.

```bash
git add frontend/src/lib/detail/NearbySection.svelte frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(detail): things-nearby section — trailheads, grocery, fuel with distances"
```

---

### Task 10: ETL `pnpm enrich-cell` (FCC BDC + h3-js)

**Goal:** Offline enrichment writing `cell_coverage` per facility from FCC H3 res-9 hex data; never overwrites `user_edited` carriers.

**Files:**
- Create: `etl/src/enrich-cell.ts`
- Create: `etl/tests/cell.test.ts`
- Create: `etl/README.md` (FCC download instructions section — create the file if absent)
- Modify: `etl/package.json` (dep `h3-js`, script `enrich-cell`)
- Modify: `.gitignore` (add `etl/data/`)

**Acceptance Criteria:**
- [ ] `parseHexFile` extracts the H3 column (header matching `/h3/i`, else first column) into a `Set<string>`
- [ ] `coverageFor(lat, lng, sets)` returns per-carrier booleans via `latLngToCell(lat, lng, 9)` membership
- [ ] `mergeCoverage(existing, computed, asOf)` preserves values for carriers listed in `existing.user_edited` and returns `null` when nothing changed
- [ ] Script reads `etl/data/fcc/{verizon,att,tmobile}.csv`, requires `--as-of YYYY-MM`, patches only changed facilities, skips tombstoned rows
- [ ] `etl/data/` gitignored; README documents the FCC download click-path
- [ ] `cd etl && pnpm test` green

**Verify:** `cd etl && pnpm test -- cell` → PASS. (Live run deferred to Task 13 — needs the manual FCC download.)

**Steps:**

- [ ] **Step 1: Add dependency and script**

```bash
cd etl && pnpm add h3-js
```

`etl/package.json` scripts: `"enrich-cell": "tsx src/enrich-cell.ts",`

- [ ] **Step 2: Write failing tests**

```ts
// etl/tests/cell.test.ts
import { describe, it, expect } from "vitest";
import { latLngToCell } from "h3-js";
import { parseHexFile, coverageFor, mergeCoverage } from "../src/enrich-cell.js";

const LAT = 38.87, LNG = -106.99;
const CELL = latLngToCell(LAT, LNG, 9);

describe("parseHexFile", () => {
  it("uses the h3-named column", () => {
    const csv = `state,h3_res9_id,tech\nCO,${CELL},4\nCO,89268cd3273ffff,4\n`;
    const set = parseHexFile(csv);
    expect(set.has(CELL)).toBe(true);
    expect(set.size).toBe(2);
  });
  it("falls back to the first column when no h3 header", () => {
    const csv = `hex,tech\n${CELL},4\n`;
    expect(parseHexFile(csv).has(CELL)).toBe(true);
  });
});

describe("coverageFor", () => {
  it("reports membership per carrier", () => {
    const sets = { verizon: new Set([CELL]), att: new Set<string>(), tmobile: new Set([CELL]) };
    expect(coverageFor(LAT, LNG, sets)).toEqual({ verizon: true, att: false, tmobile: true });
  });
});

describe("mergeCoverage", () => {
  it("builds a fresh record when none exists", () => {
    const merged = mergeCoverage(null, { verizon: true, att: false, tmobile: true }, "2026-06");
    expect(merged).toEqual({ verizon: true, att: false, tmobile: true, as_of: "2026-06" });
  });
  it("preserves user_edited carriers", () => {
    const existing = { verizon: false, att: true, tmobile: false, as_of: "2025-12", user_edited: ["att"] };
    const merged = mergeCoverage(existing, { verizon: true, att: false, tmobile: false }, "2026-06");
    expect(merged).toEqual({ verizon: true, att: true, tmobile: false, as_of: "2026-06", user_edited: ["att"] });
  });
  it("returns null when nothing changed", () => {
    const existing = { verizon: true, att: false, tmobile: true, as_of: "2026-06" };
    expect(mergeCoverage(existing, { verizon: true, att: false, tmobile: true }, "2026-06")).toBeNull();
  });
});
```

- [ ] **Step 3: Verify failure**

Run: `cd etl && pnpm test -- cell` → FAIL (module not found)

- [ ] **Step 4: Implement `etl/src/enrich-cell.ts`**

```ts
// etl/src/enrich-cell.ts — FCC BDC mobile-coverage lookup for facilities.
// Input: manually downloaded per-carrier H3 res-9 hex CSVs (see etl/README.md).
// Usage: pnpm enrich-cell --as-of 2026-06
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { latLngToCell } from "h3-js";
import { TbClient } from "./teenybase.js";

export type Carrier = "verizon" | "att" | "tmobile";
export const CARRIERS: Carrier[] = ["verizon", "att", "tmobile"];

export interface CellCoverage {
  verizon: boolean | null;
  att: boolean | null;
  tmobile: boolean | null;
  as_of: string | null;
  user_edited?: string[];
}

export function parseHexFile(content: string): Set<string> {
  const lines = content.split("\n").filter((l) => l.trim());
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  let col = header.findIndex((h) => /h3/.test(h));
  if (col === -1) col = 0;
  const set = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(",")[col]?.trim();
    if (v) set.add(v);
  }
  return set;
}

export function coverageFor(
  lat: number,
  lng: number,
  sets: Record<Carrier, Set<string>>,
): Record<Carrier, boolean> {
  const cell = latLngToCell(lat, lng, 9);
  return {
    verizon: sets.verizon.has(cell),
    att: sets.att.has(cell),
    tmobile: sets.tmobile.has(cell),
  };
}

/** Merge computed FCC values into an existing record, never touching carriers a
 * user override owns. Returns null when the result equals the existing record. */
export function mergeCoverage(
  existing: CellCoverage | null,
  computed: Record<Carrier, boolean>,
  asOf: string,
): CellCoverage | null {
  const userEdited = existing?.user_edited ?? [];
  const merged: CellCoverage = {
    verizon: userEdited.includes("verizon") ? (existing?.verizon ?? null) : computed.verizon,
    att: userEdited.includes("att") ? (existing?.att ?? null) : computed.att,
    tmobile: userEdited.includes("tmobile") ? (existing?.tmobile ?? null) : computed.tmobile,
    as_of: asOf,
  };
  if (userEdited.length) merged.user_edited = userEdited;
  if (
    existing &&
    existing.verizon === merged.verizon &&
    existing.att === merged.att &&
    existing.tmobile === merged.tmobile &&
    existing.as_of === merged.as_of
  ) {
    return null;
  }
  return merged;
}

async function main() {
  const asOfIdx = process.argv.indexOf("--as-of");
  const asOf = asOfIdx !== -1 ? process.argv[asOfIdx + 1] : null;
  if (!asOf || !/^\d{4}-\d{2}$/.test(asOf)) {
    console.error("Usage: pnpm enrich-cell --as-of YYYY-MM  (FCC data vintage)");
    process.exit(1);
  }
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "fcc");
  const sets = Object.fromEntries(
    CARRIERS.map((c) => [c, parseHexFile(readFileSync(join(dataDir, `${c}.csv`), "utf8"))]),
  ) as Record<Carrier, Set<string>>;
  CARRIERS.forEach((c) => console.log(`${c}: ${sets[c].size} hexes`));

  const tb = new TbClient(process.env.TB_API_URL!, process.env.TB_SERVICE_TOKEN!);
  const facilities = await tb.listForEnrichment();
  let patched = 0;
  for (const f of facilities) {
    if (f.is_deleted) continue;
    const merged = mergeCoverage(f.cell_coverage as CellCoverage | null, coverageFor(f.lat, f.lng, sets), asOf);
    if (!merged) continue;
    await tb.patchFacility(f.id, { cell_coverage: JSON.stringify(merged) });
    patched++;
  }
  console.log(`patched ${patched}/${facilities.length} facilities`);
}

if (process.argv[1]?.endsWith("enrich-cell.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 5: README + gitignore**

Append to `etl/README.md` (create file if it doesn't exist):

```markdown
## FCC cell-coverage data (`pnpm enrich-cell`)

1. Go to https://broadbandmap.fcc.gov/data-download → **Mobile** → Coverage data.
2. Pick the latest vintage. For each provider — **Verizon**, **AT&T Mobility**,
   **T-Mobile** — download the Colorado **4G LTE Mobile Broadband** coverage file
   in the **H3 hexagon (resolution 9)** CSV format.
3. Unzip and save as `etl/data/fcc/verizon.csv`, `etl/data/fcc/att.csv`,
   `etl/data/fcc/tmobile.csv` (gitignored — files are large).
4. Run `pnpm enrich-cell --as-of YYYY-MM` (the vintage from step 2).

Carriers listed in a facility's `cell_coverage.user_edited` came from
admin-approved user reports and are never overwritten. FCC refreshes data
roughly twice a year — rerun then.
```

Add to root `.gitignore` (under a `# Data` heading at the end):

```
# ETL local data (FCC downloads etc.)
etl/data/
```

- [ ] **Step 6: Verify and commit**

Run: `cd etl && pnpm test` → all green.

```bash
git add etl/src/enrich-cell.ts etl/tests/cell.test.ts etl/README.md etl/package.json pnpm-lock.yaml .gitignore
git commit -m "feat(etl): enrich-cell — FCC BDC H3 lookup with user_edited protection"
```

---

### Task 11: Cell-coverage UI (chips + Compare + API parse)

**Goal:** Carrier chips in the detail panel, a Compare row, and JSON parsing in the facilities API.

**Files:**
- Modify: `frontend/src/lib/types.ts` (CellCoverage type, Facility field)
- Modify: `frontend/src/routes/api/facilities/+server.ts` (parse `cell_coverage` like `amenities`)
- Create: `frontend/src/lib/detail/CellCoverageChips.svelte`
- Modify: `frontend/src/lib/detail/DetailPanel.svelte` (render after WeatherStrip)
- Modify: `frontend/src/lib/compare/CompareView.svelte` (Cell signal row)

**Acceptance Criteria:**
- [ ] `Facility.cell_coverage?: CellCoverage | null`; bbox API returns it parsed
- [ ] Chips render ● for covered / ○ for not, per carrier; caption "FCC-reported 4G data coverage · as of YYYY-MM"; component renders nothing when `cell_coverage` is null
- [ ] Compare row shows covered carriers (e.g. `V · T`), `None`, or `?` when unenriched
- [ ] `pnpm check` 0/0, tests green

**Verify:** `cd frontend && pnpm check && pnpm test` → 0/0, PASS. (Visual check happens after Task 13's prod enrichment; locally, hand-set one row: `sqlite3 backend/.local-persist/v3/d1/miniflare-D1DatabaseObject/da240ff2*.sqlite "UPDATE facilities SET cell_coverage='{\"verizon\":true,\"att\":false,\"tmobile\":true,\"as_of\":\"2026-06\"}' WHERE id=(SELECT id FROM facilities LIMIT 1)"` and open that facility.)

**Steps:**

- [ ] **Step 1: Types**

In `types.ts`, after the `Amenities` interface:

```ts
export interface CellCoverage {
  verizon: boolean | null;
  att: boolean | null;
  tmobile: boolean | null;
  as_of: string | null;
  user_edited?: string[];
}
```

In `Facility`, after `elevation_m`:

```ts
  cell_coverage?: CellCoverage | null;
```

- [ ] **Step 2: Parse in the facilities bbox API**

In `frontend/src/routes/api/facilities/+server.ts`, extend the `.map()`:

```ts
    .map((f) => ({
      ...f,
      amenities:
        typeof f.amenities === "string" ? JSON.parse(f.amenities) : f.amenities,
      cell_coverage:
        typeof f.cell_coverage === "string" ? JSON.parse(f.cell_coverage) : (f.cell_coverage ?? null),
    }));
```

- [ ] **Step 3: Create `CellCoverageChips.svelte`**

```svelte
<script lang="ts">
  import type { CellCoverage } from '$lib/types'

  let { coverage }: { coverage: CellCoverage | null | undefined } = $props()

  const CARRIERS: Array<{ key: 'verizon' | 'att' | 'tmobile'; label: string }> = [
    { key: 'verizon', label: 'Verizon' },
    { key: 'att', label: 'AT&T' },
    { key: 'tmobile', label: 'T-Mobile' },
  ]
</script>

{#if coverage}
  <section class="cell">
    <h3>Cell signal</h3>
    <div class="chips">
      {#each CARRIERS as c}
        <span class="chip" class:on={coverage[c.key] === true}>
          {coverage[c.key] === true ? '●' : '○'} {c.label}
        </span>
      {/each}
    </div>
    <p class="caption">
      FCC-reported 4G data coverage{coverage.as_of ? ` · as of ${coverage.as_of}` : ''}
      {#if coverage.user_edited?.length}· includes camper reports{/if}
    </p>
  </section>
{/if}

<style>
  .cell { margin: 1.2rem 0; padding-top: 1rem; border-top: 1px solid var(--line); }
  h3 { font-family: var(--font-display); font-size: 1.1rem; font-weight: 600; margin: 0 0 0.55rem; }
  .chips { display: flex; gap: 0.45rem; flex-wrap: wrap; }
  .chip {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    padding: 0.22rem 0.65rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    color: var(--ink-faint);
    background: var(--paper-deep);
  }
  .chip.on {
    color: var(--pine-deep);
    border-color: color-mix(in srgb, var(--moss) 50%, transparent);
    background: color-mix(in srgb, var(--moss) 18%, var(--paper-2));
  }
  .caption { font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.7rem; margin: 0.45rem 0 0; }
</style>
```

- [ ] **Step 4: Render in DetailPanel + Compare row**

DetailPanel: `import CellCoverageChips from './CellCoverageChips.svelte'`; after `<WeatherStrip …/>`:

```svelte
    <CellCoverageChips coverage={facility.cell_coverage} />
```

CompareView `rows`, after `Elevation`:

```ts
    { label: 'Cell Signal', key: f => {
        const c = f.cell_coverage
        if (!c) return '?'
        const on = [c.verizon && 'V', c.att && 'A', c.tmobile && 'T'].filter(Boolean)
        return on.length ? on.join(' · ') : 'None'
      } },
```

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && pnpm check && pnpm test` → 0/0, PASS. Manual with the hand-set local row per **Verify**.

```bash
git add frontend/src/lib/types.ts frontend/src/routes/api/facilities/+server.ts frontend/src/lib/detail/CellCoverageChips.svelte frontend/src/lib/detail/DetailPanel.svelte frontend/src/lib/compare/CompareView.svelte
git commit -m "feat(ui): cell-coverage chips, Compare row, API JSON parse"
```

---

### Task 12: Crowdsourced carrier overrides (suggest-an-edit)

**Goal:** Users report actual carrier availability through the existing suggest-edit → admin-approval flow; approved carriers become `user_edited` so `enrich-cell` never clobbers them.

**Files:**
- Modify: `frontend/src/lib/types.ts` (EditChanges)
- Modify: `frontend/src/lib/detail/SuggestEditModal.svelte` (tri-state carrier group + diff)
- Modify: `frontend/src/routes/api/suggestions/+server.ts` (ALLOWED_KEYS + validation)
- Modify: `frontend/src/routes/api/admin/suggestions/+server.ts` (approval merge)
- Modify: `frontend/src/routes/admin/+page.svelte` (FIELD_LABELS + diff rendering)

**Acceptance Criteria:**
- [ ] `EditChanges.cell_coverage` accepted end-to-end: modal diff → POST validation → stored → admin diff view → approval
- [ ] Approval merges only the suggested carriers into the facility's `cell_coverage` JSON (stringified), appends them to `user_edited` (deduped), and preserves `as_of`
- [ ] `/api/suggestions` rejects unknown carrier keys and non-boolean/null values with 400
- [ ] Admin diff shows per-carrier rows ("Verizon coverage: No → Yes"), not `[object Object]`
- [ ] `pnpm check` 0/0, tests green

**Verify:** `cd frontend && pnpm check && pnpm test` → 0/0, PASS. Manual round trip on :5173: log in as test user → suggest "Verizon: yes" → log in as local admin → approve → facility chips show Verizon ●, and `sqlite3 … "SELECT cell_coverage FROM facilities WHERE id='…'"` contains `"user_edited":["verizon"]`.

**Steps:**

- [ ] **Step 1: Types**

In `types.ts`, add to `EditChanges`:

```ts
  cell_coverage?: Partial<Record<'verizon' | 'att' | 'tmobile', boolean | null>>;
```

- [ ] **Step 2: SuggestEditModal — carrier tri-state group**

Mirror the amenities pattern. In the script:

```ts
  const CARRIERS: Array<{ key: 'verizon' | 'att' | 'tmobile'; label: string }> = [
    { key: 'verizon', label: 'Verizon' },
    { key: 'att', label: 'AT&T' },
    { key: 'tmobile', label: 'T-Mobile' },
  ]
  let carrierValues = $state(Object.fromEntries(
    CARRIERS.map(({ key }) => [key, triState(initial.cell_coverage?.[key])]),
  ) as Record<string, 'yes' | 'no' | 'unknown'>)
```

In the `changes` `$derived.by`, after the amenities diff:

```ts
    const carrierDiff: NonNullable<EditChanges['cell_coverage']> = {}
    for (const { key } of CARRIERS) {
      const original = triState(facility.cell_coverage?.[key])
      const current = carrierValues[key]
      if (current !== original) {
        carrierDiff[key] = current === 'yes' ? true : current === 'no' ? false : null
      }
    }
    if (Object.keys(carrierDiff).length) c.cell_coverage = carrierDiff
```

In the template, after the amenities fieldset, add a fieldset rendered exactly like the amenities tri-state rows (same markup/classes), titled **"Cell coverage — your experience"**, iterating `CARRIERS` and binding `carrierValues[key]`.

- [ ] **Step 3: `/api/suggestions` validation**

Add `'cell_coverage'` to `ALLOWED_KEYS`. In `validateChanges`, before `return null`:

```ts
  if (changes.cell_coverage !== undefined) {
    if (typeof changes.cell_coverage !== 'object' || changes.cell_coverage === null)
      return 'cell_coverage must be an object'
    for (const [k, v] of Object.entries(changes.cell_coverage)) {
      if (!['verizon', 'att', 'tmobile'].includes(k)) return `Unknown carrier: ${k}`
      if (v !== null && typeof v !== 'boolean') return 'carrier values must be boolean or null'
    }
  }
```

- [ ] **Step 4: Admin approval merge**

In `api/admin/suggestions/+server.ts` POST handler: add `cell_coverage` to the `RawFacility` interface (`cell_coverage: string | Record<string, unknown> | null;` — also add it to the GET's facility list usage type if TS complains), and destructure it out of `changes` alongside `amenities`:

```ts
    const { amenities: amenityChanges, cell_coverage: carrierChanges, ...scalarChanges } = changes as {
      amenities?: Partial<Amenities>;
      cell_coverage?: Record<string, boolean | null>;
    } & Record<string, unknown>;
```

After the amenities merge block:

```ts
    if (carrierChanges && typeof carrierChanges === "object") {
      const current = parseJson<Record<string, unknown>>(facility.cell_coverage, {
        verizon: null, att: null, tmobile: null, as_of: null,
      });
      const userEdited = new Set((current.user_edited as string[] | undefined) ?? []);
      for (const k of Object.keys(carrierChanges)) userEdited.add(k);
      patch.cell_coverage = JSON.stringify({
        ...current,
        ...carrierChanges,
        user_edited: [...userEdited],
      });
    }
```

- [ ] **Step 5: Admin diff rendering**

In `frontend/src/routes/admin/+page.svelte`:
- Add to `FIELD_LABELS` (~line 159): `cell_coverage: "Cell coverage",`
- Add a carrier label map next to `AMENITY_LABELS`:

```ts
  const CARRIER_LABELS: Record<string, string> = {
    verizon: "Verizon coverage",
    att: "AT&T coverage",
    tmobile: "T-Mobile coverage",
  };
```

- In the diff `{#each Object.entries(row.changes) …}` block (~line 497), add a branch before the generic `{:else}` mirroring the amenities branch:

```svelte
                {:else if key === "cell_coverage" && value && typeof value === "object"}
                  {#each Object.entries(value as Record<string, unknown>) as [cKey, cVal]}
                    <div class="diff-row">
                      <span class="diff-field">{CARRIER_LABELS[cKey] ?? cKey}</span>
                      <span class="diff-current">
                        {fmtValue(row.current?.cell_coverage?.[cKey as 'verizon' | 'att' | 'tmobile'])}
                      </span>
                      <span class="diff-arrow">→</span>
                      <span class="diff-proposed">{fmtValue(cVal)}</span>
                    </div>
                  {/each}
```

- [ ] **Step 6: Verify and commit**

Run: `cd frontend && pnpm check && pnpm test` → 0/0, PASS. Manual round trip per **Verify** (suggest → approve → chips + `user_edited` in sqlite).

```bash
git add frontend/src/lib/types.ts frontend/src/lib/detail/SuggestEditModal.svelte frontend/src/routes/api/suggestions/+server.ts frontend/src/routes/api/admin/suggestions/+server.ts frontend/src/routes/admin/+page.svelte
git commit -m "feat(moderation): crowdsourced carrier-coverage overrides via suggest-an-edit"
```

---

### Task 13: Prod rollout + handoff update

**Goal:** Ship in the safe order: backend schema → prod enrichment → PR merge → smoke → docs.

**Files:**
- Modify: `docs/handoff.md` (new session section)

**Acceptance Criteria:**
- [ ] Prod D1 has the new columns/table (verified by request, not ledger)
- [ ] Prod facilities have `elevation_m` populated; `cell_coverage` populated if the FCC download was done (otherwise noted as pending in handoff)
- [ ] PR merged to `main`, auto-deploy green, prod smoke passes
- [ ] `docs/handoff.md` documents the session, the `enrich-cell` FCC-download runbook pointer, and the deferred road/trail-conditions wishlist item

**Verify:** `curl -s "https://camp-finder.pages.dev/api/facilities?north=39.2&south=38.8&east=-106.3&west=-107.1" | grep -o '"elevation_m":[0-9]*' | head -3` → numbers; open a campground on prod → weather strip + directions links render.

**Steps:**

- [ ] **Step 1: Deploy backend schema to prod**

```bash
cd backend && pnpm deploy   # needs .prod.vars; watch for the X-TB-Key settings-sync quirk (handoff 2026-07-07)
```

Verify: `curl -s -X POST https://backend.misty-cell-863d.workers.dev/api/v1/table/nearby_pois/list -H 'Content-Type: application/json' -H "X-TB-Key: $TB_SHARED_SECRET" -d '{"limit":1}'` → `{"items":[]}`.

- [ ] **Step 2: Run prod enrichment**

```bash
cd etl
# with prod TB_API_URL / TB_SERVICE_TOKEN / TB_SHARED_SECRET in the environment:
pnpm enrich-elevation
# if FCC files downloaded (etl/README.md):
pnpm enrich-cell --as-of <vintage>
```

If the FCC download isn't done yet, skip `enrich-cell` — the UI hides the section on null. Note it as pending in the handoff.

- [ ] **Step 3: Open PR, merge, smoke**

```bash
git push -u origin feat/post-launch-features
gh pr create --title "Post-launch features: directions, elevation+weather, nearby, cell coverage" --body "Implements docs/superpowers/specs/2026-07-14-post-launch-features-design.md (plan: docs/superpowers/plans/2026-07-14-post-launch-features.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merge after review; wait for Pages auto-deploy; run the **Verify** curl + manual prod smoke (open campground → directions links, elevation in header, weather strip, nearby list; Compare → Elevation/Cell rows; suggest a carrier edit end-to-end if enriched).

- [ ] **Step 4: Update `docs/handoff.md`**

Add a `### Session 2026-07-XX — post-launch features shipped` section covering: the four tiers, the enrichment runbooks (`pnpm enrich-elevation`, `pnpm enrich-cell --as-of` + FCC download pointer), the carrier-override moderation flow, and a new wishlist entry: **road conditions & trail status reports (deferred 2026-07-14** — ephemeral timestamped model, needs own spec**)**.

```bash
git add docs/handoff.md
git commit -m "docs(handoff): post-launch features shipped — enrichment runbooks + deferred conditions wishlist"
git push
```

---

## Self-Review (completed)

- **Spec coverage:** T1→Task 1; T2→Tasks 2–6; T3→Tasks 2, 7–9; T4→Tasks 2, 10–12; crowdsourced overrides→Task 12; deferred conditions→Task 13 handoff note; deploy order→Tasks 2/13. ✔
- **Placeholders:** none — all code blocks complete. ✔
- **Type consistency:** `CellCoverage` shape identical in `etl/src/enrich-cell.ts` and `frontend/src/lib/types.ts`; `NearbyPoi` shared by Tasks 7–9; `formatElevationFt` defined Task 4, consumed Tasks 5–6. ✔
