# fs.usda.gov Campground Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape all 7 Colorado National Forest camping pages on fs.usda.gov to discover FCFS-only campgrounds that are not listed in RIDB, and insert them into the Teenybase database.

**Architecture:** Three new functions are added to `etl/src/fsScraper.ts` (tested with HTML fixtures): `scrapeForestCampgroundUrls` parses listing pages, `isRidbCampground` detects pages with a specific recreation.gov reservation iframe (those campgrounds are already in RIDB — skip them), and `scrapeCampgroundPage` extracts structured data from FCFS-only pages. A new `etl/src/discover.ts` orchestrator paginates each forest's listing, calls these functions, and upserts results into Teenybase using the existing `TbClient`. Synthetic `ridb_id`s of the form `fs-[forest-slug]-[campground-slug]` prevent collision with RIDB numeric IDs.

**Tech Stack:** Node/TypeScript, `node-html-parser` (already installed), vitest (existing), Teenybase REST API via existing `TbClient`

---

## Background: What We Learned From the Site

- **Listing page URL pattern:** `https://www.fs.usda.gov/r02/[slug]/recreation/camping-cabins?page=,N` — 10 campgrounds per page, paginate until empty
- **Campground page URL pattern:** `https://www.fs.usda.gov/r02/[slug]/recreation/[campground-slug]`
- **RIDB indicator:** Reservable campgrounds embed `<iframe src="https://cdn.recreation.gov/widget/fs/camping/index.html?id=XXXXX">` — skip these, they're already in our DB
- **Lat/lng:** Always present as `<p><b>Latitude: </b> 39.236566</p>` and `<p><b>Longitude: </b> -107.203346</p>`
- **Fee:** Inside `<div class="usa-accordion__content" id="rec_acc_fees">` — reuses existing `parseFsPageFees`
- **FCFS count:** Often in meta description as "has 6 first-come first-serve campsites"
- **Colorado forests (7):** `arp`, `psicc`, `riogrande`, `sanjuan`, `gmug`, `whiteriver`, `mbrtb`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `etl/src/fsScraper.ts` | Modify | Add `ScrapedCampground` interface + 3 new parse functions |
| `etl/src/discover.ts` | Create | Orchestrator: enumerate forests → scrape → upsert |
| `etl/package.json` | Modify | Add `"discover": "tsx src/discover.ts"` script |
| `etl/tests/fsDiscovery.test.ts` | Create | Tests for the 3 new parse functions using HTML fixtures |

---

### Task 1: TDD — scrapeForestCampgroundUrls

Parses a forest camping listing page and returns campground URL paths. Campground links match `/r02/[slug]/recreation/[path-containing-campground]` with no sub-paths (no `/groups/`, `/wilderness/` etc.).

**Files:**
- Modify: `etl/src/fsScraper.ts`
- Create: `etl/tests/fsDiscovery.test.ts`

- [ ] **Step 1: Write the failing test**

Create `etl/tests/fsDiscovery.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scrapeForestCampgroundUrls, isRidbCampground, scrapeCampgroundPage } from '../src/fsScraper.js'

describe('scrapeForestCampgroundUrls', () => {
  const listingHtml = `
    <html><body>
      <a href="/r02/whiteriver/recreation/opportunities">Opportunities</a>
      <a href="/r02/whiteriver/recreation/epic-adventures">Epic Adventures</a>
      <a href="/r02/whiteriver/recreation/aspen-sopris-ranger-district-0">Ranger District</a>
      <a href="/r02/whiteriver/recreation/groups/wilderness">Wilderness</a>
      <a href="/r02/whiteriver/recreation/avalanche-campground">Avalanche Campground</a>
      <a href="/r02/whiteriver/recreation/bogan-flats-campground">Bogan Flats</a>
      <a href="/r02/whiteriver/recreation/bogan-flats-group-campground">Bogan Flats Group</a>
    </body></html>
  `

  it('returns campground paths and filters non-campground links', () => {
    expect(scrapeForestCampgroundUrls(listingHtml)).toEqual([
      '/r02/whiteriver/recreation/avalanche-campground',
      '/r02/whiteriver/recreation/bogan-flats-campground',
      '/r02/whiteriver/recreation/bogan-flats-group-campground',
    ])
  })

  it('returns empty array for a page with no campground links', () => {
    expect(scrapeForestCampgroundUrls('<html><body><a href="/about">About</a></body></html>')).toEqual([])
  })

  it('deduplicates repeated links', () => {
    const html = `
      <html><body>
        <a href="/r02/arp/recreation/mirror-lake-campground">Mirror Lake</a>
        <a href="/r02/arp/recreation/mirror-lake-campground">Mirror Lake</a>
      </body></html>
    `
    expect(scrapeForestCampgroundUrls(html)).toEqual([
      '/r02/arp/recreation/mirror-lake-campground',
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test tests/fsDiscovery.test.ts
```

Expected: 3 failures — `scrapeForestCampgroundUrls is not a function`.

- [ ] **Step 3: Implement scrapeForestCampgroundUrls in fsScraper.ts**

Add the `ScrapedCampground` interface and `scrapeForestCampgroundUrls` function to `etl/src/fsScraper.ts` (after the existing exports):

```typescript
export interface ScrapedCampground {
  name: string
  lat: number
  lng: number
  description: string
  fee_min: number | null
  fee_max: number | null
  fcfs_total: number
  fs_url: string
}

export function scrapeForestCampgroundUrls(html: string): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  // Match href="/r02/[slug]/recreation/[path-containing-campground]" with no sub-path
  const re = /href="(\/r02\/[^"\/]+\/recreation\/[^"\/]*campground[^"\/]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const path = m[1]
    if (!seen.has(path)) {
      seen.add(path)
      results.push(path)
    }
  }
  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test tests/fsDiscovery.test.ts
```

Expected: 3 passing (the `isRidbCampground` and `scrapeCampgroundPage` tests still fail — that's fine, we haven't written those yet).

- [ ] **Step 5: Commit**

```bash
git add etl/src/fsScraper.ts etl/tests/fsDiscovery.test.ts
git commit -m "feat(etl): scrapeForestCampgroundUrls — parse camping listing pages"
```

---

### Task 2: TDD — isRidbCampground

Returns `true` when a campground page embeds a specific recreation.gov reservation widget (meaning the campground is already in RIDB and should be skipped).

**Files:**
- Modify: `etl/src/fsScraper.ts`
- Modify: `etl/tests/fsDiscovery.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `describe` blocks in `etl/tests/fsDiscovery.test.ts`:

```typescript
describe('isRidbCampground', () => {
  it('returns true when page has a specific recreation.gov reservation iframe', () => {
    const html = `
      <html><body>
        <iframe src="https://cdn.recreation.gov/widget/fs/camping/index.html?id=231880"
                width="100%" height="800"></iframe>
      </body></html>
    `
    expect(isRidbCampground(html)).toBe(true)
  })

  it('returns false when page only has the generic recreation.gov link', () => {
    const html = `
      <html><body>
        <a href="https://recreation.gov" class="first">Recreation.gov</a>
      </body></html>
    `
    expect(isRidbCampground(html)).toBe(false)
  })

  it('returns false for a page with no recreation.gov reference at all', () => {
    expect(isRidbCampground('<html><body><p>Primitive camping area.</p></body></html>')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test tests/fsDiscovery.test.ts
```

Expected: 3 new failures — `isRidbCampground is not a function`.

- [ ] **Step 3: Implement isRidbCampground in fsScraper.ts**

Add after `scrapeForestCampgroundUrls`:

```typescript
export function isRidbCampground(html: string): boolean {
  return html.includes('cdn.recreation.gov/widget/fs/camping/index.html?id=')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test tests/fsDiscovery.test.ts
```

Expected: 6 passing (3 from Task 1 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add etl/src/fsScraper.ts etl/tests/fsDiscovery.test.ts
git commit -m "feat(etl): isRidbCampground — detect reservation-embedded campground pages"
```

---

### Task 3: TDD — scrapeCampgroundPage

Extracts a full `ScrapedCampground` record from a campground detail page. Returns `null` for RIDB campgrounds (they're already in our DB) and for pages missing lat/lng (unusable without coordinates).

**Files:**
- Modify: `etl/src/fsScraper.ts`
- Modify: `etl/tests/fsDiscovery.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `etl/tests/fsDiscovery.test.ts`:

```typescript
describe('scrapeCampgroundPage', () => {
  const fcfsHtml = `
    <html>
    <head>
      <title>White River National Forest | Avalanche Campground | Forest Service</title>
      <meta name="description" content="Avalanche Campground has 6 first-come first-serve campsites. Located adjacent to Avalanche Creek." />
    </head>
    <body>
      <div class="usa-accordion__content" id="rec_acc_fees">
        <p>Overnight Use:<br />Single Site: $21 per night</p>
      </div>
      <p><b>Latitude: </b> 39.236566</p>
      <p><b>Longitude: </b> -107.203346</p>
      <a href="https://recreation.gov" class="first">Recreation.gov</a>
    </body></html>
  `
  const fcfsUrl = 'https://www.fs.usda.gov/r02/whiteriver/recreation/avalanche-campground'

  it('extracts a full ScrapedCampground from a FCFS page', () => {
    expect(scrapeCampgroundPage(fcfsHtml, fcfsUrl)).toEqual({
      name: 'Avalanche Campground',
      lat: 39.236566,
      lng: -107.203346,
      description: 'Avalanche Campground has 6 first-come first-serve campsites. Located adjacent to Avalanche Creek.',
      fee_min: 21,
      fee_max: 21,
      fcfs_total: 6,
      fs_url: fcfsUrl,
    })
  })

  it('returns null for a RIDB campground page (has reservation iframe)', () => {
    const ridbHtml = `
      <html>
      <head>
        <title>White River National Forest | Difficult Campground | Forest Service</title>
        <meta name="description" content="Difficult Campground offers reservable sites." />
      </head>
      <body>
        <iframe src="https://cdn.recreation.gov/widget/fs/camping/index.html?id=231880"></iframe>
        <p><b>Latitude: </b> 39.14255</p>
        <p><b>Longitude: </b> -106.77365</p>
      </body></html>
    `
    expect(scrapeCampgroundPage(ridbHtml, 'https://www.fs.usda.gov/r02/whiteriver/recreation/difficult-campground')).toBeNull()
  })

  it('returns null when lat/lng are missing', () => {
    const noLatLng = `
      <html>
      <head>
        <title>White River National Forest | Mystery Camp | Forest Service</title>
        <meta name="description" content="Some campground." />
      </head>
      <body><p>No coordinates here.</p></body></html>
    `
    expect(scrapeCampgroundPage(noLatLng, 'https://www.fs.usda.gov/r02/whiteriver/recreation/mystery-camp')).toBeNull()
  })

  it('defaults fcfs_total to 0 when not mentioned in description', () => {
    const noCount = `
      <html>
      <head>
        <title>Rio Grande National Forest | Lost Trail Campground | Forest Service</title>
        <meta name="description" content="Lost Trail offers primitive campsites along the river." />
      </head>
      <body>
        <p><b>Latitude: </b> 37.5</p>
        <p><b>Longitude: </b> -106.8</p>
      </body></html>
    `
    const result = scrapeCampgroundPage(noCount, 'https://www.fs.usda.gov/r02/riogrande/recreation/lost-trail-campground')
    expect(result?.fcfs_total).toBe(0)
  })

  it('returns null fee fields when no fee info is present', () => {
    const noFee = `
      <html>
      <head>
        <title>Rio Grande National Forest | Free Camp | Forest Service</title>
        <meta name="description" content="Free Camp has 4 first-come first-serve campsites." />
      </head>
      <body>
        <p><b>Latitude: </b> 37.6</p>
        <p><b>Longitude: </b> -106.9</p>
      </body></html>
    `
    const result = scrapeCampgroundPage(noFee, 'https://www.fs.usda.gov/r02/riogrande/recreation/free-camp')
    expect(result?.fee_min).toBeNull()
    expect(result?.fee_max).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test tests/fsDiscovery.test.ts
```

Expected: 5 new failures — `scrapeCampgroundPage is not a function`.

- [ ] **Step 3: Implement scrapeCampgroundPage in fsScraper.ts**

Add after `isRidbCampground`:

```typescript
export function scrapeCampgroundPage(html: string, url: string): ScrapedCampground | null {
  if (isRidbCampground(html)) return null

  const latMatch = html.match(/<b>Latitude:\s*<\/b>\s*([\d.-]+)/)
  const lngMatch = html.match(/<b>Longitude:\s*<\/b>\s*([\d.-]+)/)
  if (!latMatch || !lngMatch) return null

  const lat = parseFloat(latMatch[1])
  const lng = parseFloat(lngMatch[1])
  if (isNaN(lat) || isNaN(lng)) return null

  const titleMatch = html.match(/<title>[^|]+\|\s*([^|]+)\|\s*Forest Service<\/title>/)
  const name = titleMatch ? titleMatch[1].trim() : url.split('/').pop()?.replace(/-/g, ' ') ?? 'Unknown'

  const descMatch = html.match(/<meta name="description" content="([^"]+)"/)
  const description = descMatch ? descMatch[1] : ''

  const fees = parseFsPageFees(html)

  const fcfsMatch = description.match(/(\d+)\s+first.come/i)
  const fcfs_total = fcfsMatch ? parseInt(fcfsMatch[1], 10) : 0

  return { name, lat, lng, description, fee_min: fees.fee_min, fee_max: fees.fee_max, fcfs_total, fs_url: url }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test tests/fsDiscovery.test.ts
```

Expected: all 11 discovery tests passing, plus all pre-existing tests (32 + 11 = 43 total).

- [ ] **Step 5: Commit**

```bash
git add etl/src/fsScraper.ts etl/tests/fsDiscovery.test.ts
git commit -m "feat(etl): scrapeCampgroundPage — extract FCFS campground data from fs.usda.gov pages"
```

---

### Task 4: Create discover.ts orchestrator

Enumerates all 7 CO forests, paginates each listing, scrapes each campground page, and upserts into Teenybase. Uses `normalizeAmenities([])` + `parseDescriptionAmenities` for amenities (no campsite-level data available).

**Files:**
- Create: `etl/src/discover.ts`
- Modify: `etl/package.json`

- [ ] **Step 1: Create etl/src/discover.ts**

```typescript
import 'dotenv/config'
import { TbClient } from './teenybase.js'
import { scrapeForestCampgroundUrls, scrapeCampgroundPage } from './fsScraper.js'
import { normalizeAmenities, parseDescriptionAmenities, scoreDataQuality } from './normalize.js'
import type { NormalizedFacility } from './types.js'

const TB_API_URL       = process.env.TB_API_URL ?? 'http://localhost:8787'
const TB_SERVICE_TOKEN = process.env.TB_SERVICE_TOKEN!

if (!TB_SERVICE_TOKEN) throw new Error('TB_SERVICE_TOKEN is required')

const tb = new TbClient(TB_API_URL, TB_SERVICE_TOKEN)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const CO_FORESTS: Array<{ slug: string; name: string }> = [
  { slug: 'arp',        name: 'Arapaho and Roosevelt National Forests' },
  { slug: 'psicc',      name: 'Pike and San Isabel National Forests' },
  { slug: 'riogrande',  name: 'Rio Grande National Forest' },
  { slug: 'sanjuan',    name: 'San Juan National Forest' },
  { slug: 'gmug',       name: 'Grand Mesa, Uncompahgre and Gunnison National Forests' },
  { slug: 'whiteriver', name: 'White River National Forest' },
  { slug: 'mbrtb',      name: 'Medicine Bow-Routt National Forests' },
]

const BASE = 'https://www.fs.usda.gov'
const HEADERS = { 'User-Agent': 'CampFinder/1.0 (campground info aggregator)' }

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) { console.warn(`  HTTP ${res.status}: ${url}`); return null }
    return res.text()
  } catch (e) {
    console.warn(`  Fetch failed: ${url}: ${e}`)
    return null
  }
}

async function collectCampgroundUrls(slug: string): Promise<string[]> {
  const paths: string[] = []
  for (let page = 0; ; page++) {
    const url = `${BASE}/r02/${slug}/recreation/camping-cabins?page=%2C${page}`
    const html = await fetchHtml(url)
    if (!html) break
    const found = scrapeForestCampgroundUrls(html)
    if (found.length === 0) break
    paths.push(...found)
    await sleep(500)
  }
  return [...new Set(paths)]
}

async function main() {
  console.log(`Connecting to Teenybase at ${TB_API_URL}...`)

  const discovered: NormalizedFacility[] = []

  for (const forest of CO_FORESTS) {
    console.log(`\nEnumerating ${forest.name} (${forest.slug})...`)
    const paths = await collectCampgroundUrls(forest.slug)
    console.log(`  Found ${paths.length} campground URLs`)

    for (const path of paths) {
      const url = `${BASE}${path}`
      const slug = path.split('/').pop() ?? path
      process.stdout.write(`  Scraping: ${slug.slice(0, 50).padEnd(50)}\r`)

      const html = await fetchHtml(url)
      if (!html) { await sleep(300); continue }

      const campground = scrapeCampgroundPage(html, url)
      if (!campground) { await sleep(300); continue } // RIDB campground — skip

      const amenities = {
        ...normalizeAmenities([]),
        ...parseDescriptionAmenities(campground.description),
      }

      const ridb_id = `fs-${forest.slug}-${slug}`

      discovered.push({
        ridb_id,
        name: campground.name,
        lat: campground.lat,
        lng: campground.lng,
        forest: forest.name,
        district: '',
        description: campground.description,
        fee_min: campground.fee_min,
        fee_max: campground.fee_max,
        season_start: '',
        season_end: '',
        fcfs_total: campground.fcfs_total,
        reservable_total: 0,
        is_fully_fcfs: true,
        is_partial_fcfs: false,
        amenities: JSON.stringify(amenities) as any,
        ridb_data_quality: scoreDataQuality(amenities),
        fs_url: campground.fs_url,
        last_synced: new Date().toISOString(),
      })

      await sleep(300)
    }
  }

  console.log(`\n\nDiscovered ${discovered.length} FCFS-only campgrounds. Upserting...`)
  await tb.upsertFacilities(discovered, (i, total) => {
    process.stdout.write(`\rUpserted ${i}/${total}`)
  })
  console.log('\nDiscover complete.')
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
```

- [ ] **Step 2: Add discover script to etl/package.json**

Find the `"scripts"` block in `etl/package.json`:

```json
  "scripts": {
    "sync": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

Add the discover script:

```json
  "scripts": {
    "sync": "tsx src/index.ts",
    "discover": "tsx src/discover.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && npx tsc --noEmit 2>&1 && echo "clean"
```

Expected: `clean`

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test
```

Expected: all 43 tests pass (32 pre-existing + 11 new discovery tests).

- [ ] **Step 5: Commit**

```bash
git add etl/src/discover.ts etl/package.json
git commit -m "feat(etl): discover.ts — scrape FCFS-only campgrounds from all 7 CO national forests"
```

---

### Task 5: Smoke test the discover script

**Requires:** backend running at `http://localhost:8787`, `.env` file with `TB_SERVICE_TOKEN`

This step confirms real-world scraping works end-to-end. It takes ~10–20 minutes (7 forests × multiple pages × 300ms delays).

- [ ] **Step 1: Ensure backend is running**

In a separate terminal:
```bash
cd /Users/wpknox/Projects/camp-finder/backend && pnpm dev
```

- [ ] **Step 2: Run the discover script**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm discover
```

Watch for:
- Each forest is enumerated with a campground count
- `HTTP 404` or `Fetch failed` warnings are expected for a few URLs — that's fine
- "Discovered X FCFS-only campgrounds" — expect 50–200 new campgrounds across 7 forests

- [ ] **Step 3: Verify new campgrounds in the database**

```bash
curl http://localhost:8787/api/v1/table/facilities/list -X POST \
  -H 'Content-Type: application/json' \
  -d '{"where": "ridb_id ~ \"fs-\"", "limit": 10}' | npx -y jq '[.items[] | {name: .name, ridb_id: .ridb_id, lat: .lat, fee_min: .fee_min, is_fully_fcfs: .is_fully_fcfs}]'
```

Expected: results with `ridb_id` values like `"fs-whiteriver-avalanche-campground"`, `is_fully_fcfs: true`.

- [ ] **Step 4: Check that RIDB campgrounds are not duplicated**

```bash
# Count total facilities — should be 270 (RIDB) + newly discovered
curl http://localhost:8787/api/v1/table/facilities/list -X POST \
  -H 'Content-Type: application/json' \
  -d '{"limit": 1}' | npx -y jq '.metadata.total // .total // length'
```

Expected: more than 270.
