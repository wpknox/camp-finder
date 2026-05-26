# CampFinder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a map-first PWA for discovering Colorado National Forest campgrounds, surfacing FCFS availability and amenity data from RIDB, with on-demand alert scraping from fs.usda.gov.

**Architecture:** A TypeScript ETL script syncs RIDB data into Teenybase weekly (FCFS counts aggregated from campsite-level data, amenities normalized to a fixed schema). A SvelteKit frontend calls the Teenybase REST API through server routes (keeping RIDB key and service token server-side), renders a Leaflet map with colored pins by FCFS status, and scrapes fs.usda.gov alerts on-demand per campground. PWA manifest + service worker enables installable mobile experience. Everything runs on Cloudflare (Pages + Workers + D1) — no VPS required.

**Tech Stack:** SvelteKit 2.x, Leaflet 1.9, leaflet.markercluster 1.5, Teenybase (Cloudflare Workers + D1), TypeScript 5, Vitest 2, @vite-pwa/sveltekit 0.3, node-html-parser 6, @sveltejs/adapter-cloudflare

---

> **Subsystem note:** Phases 1–2 (Teenybase + ETL) are fully independent of the frontend. Run the ETL first to populate real data before Phase 3.

---

## Repo Structure

```
camp-finder/
  backend/                    # Teenybase project (Cloudflare Workers + D1)
    teenybase.ts              # Entire backend schema: tables, auth, row-level security
    src/index.ts              # Worker entry point (mostly untouched)
    wrangler.jsonc            # Cloudflare Workers config + D1 binding
    .dev.vars                 # Local secrets (JWT_SECRET, ADMIN_SERVICE_TOKEN, etc.)
    .prod.vars                # Production secrets (same keys, strong values)
    migrations/               # Auto-generated SQL — never edit manually

  etl/
    src/
      index.ts                # Orchestrator: loops forests → sync facilities
      ridb.ts                 # Paginated RIDB API client
      forests.ts              # Colorado NF query params
      normalize.ts            # Amenity normalization + FCFS aggregation + data quality
      teenybase.ts            # Upsert facilities via Teenybase REST API
      types.ts                # RidbFacility, RidbCampsite, Facility, Amenities types
    tests/
      normalize.test.ts
      ridb.test.ts
    package.json
    tsconfig.json
    vitest.config.ts
    .env.example              # RIDB_API_KEY, TB_API_URL, TB_SERVICE_TOKEN

  frontend/
    src/
      lib/
        types.ts              # Facility, Amenities, Alert, Rating types (shared)
        map/
          CampMap.svelte      # Leaflet map; exposes renderPins() + getMapBounds()
          mapStore.ts         # { selectedFacility, searchPending }
        detail/
          DetailPanel.svelte  # Slide-in (desktop) / bottom sheet (mobile)
          FCFSBadge.svelte    # "16/16 First-Come, First-Serve" badge
          AmenityGrid.svelte  # Icon grid for amenities
          AlertsSection.svelte # On-demand scraped alerts with 24hr cache
          DataQualityWarning.svelte
        filters/
          FilterSidebar.svelte
          filterStore.ts      # { fcfsOnly, amenities[], feeRange, sortBy }
        compare/
          CompareView.svelte  # Side-by-side table
          compareStore.ts     # Max-4 IDs, synced to URL ?ids=
        auth/
          AuthModal.svelte
          authStore.ts        # PocketBase auth state
        saved/
          SaveButton.svelte
      routes/
        +layout.svelte        # App shell: map + panel side by side
        +page.svelte          # Map page; wires map ↔ store ↔ panel
        +page.server.ts       # (empty, SSR disabled for map page)
        api/
          facilities/
            +server.ts        # GET ?bbox=n,s,e,w[&filters] → PocketBase query
          alerts/
            [id]/
              +server.ts      # GET → scrape or serve cached alert
        compare/
          +page.svelte
          +page.server.ts     # load facilities by ?ids=
    static/
      manifest.webmanifest
      icons/                  # 192x192, 512x512 PNG icons
    vite.config.ts
    svelte.config.js
    package.json
    .env.example              # PUBLIC_PB_URL
```

---

## Phase 1: Teenybase + ETL Pipeline

### Task 1: Teenybase backend project scaffold

**Files:**
- Create: `backend/` (Teenybase project via CLI)

- [ ] **Step 1: Install the Teenybase CLI and scaffold the project**

```bash
pnpm add -g teenybase
teeny create backend -t blank -y
cd backend
```

Expected output: directory created, deps installed automatically, files scaffolded.

- [ ] **Step 2: Verify the key files exist**

```
backend/
  teenybase.ts       ← edit this to define the schema
  src/index.ts       ← worker entry point, leave alone
  wrangler.jsonc     ← Cloudflare Workers config
  .dev.vars          ← local secrets
  migrations/        ← auto-generated, never edit
```

- [ ] **Step 3: Commit the scaffold**

```bash
git add backend/
git commit -m "chore: Teenybase backend scaffold"
```

---

### Task 2: Define the CampFinder schema in teenybase.ts

**Files:**
- Modify: `backend/teenybase.ts`

- [ ] **Step 1: Replace the default teenybase.ts with the CampFinder schema**

```typescript
// backend/teenybase.ts
import {
  DatabaseSettings, TableAuthExtensionData, TableRulesExtensionData,
} from 'teenybase'
import { baseFields, authFields, createdTrigger, updatedTrigger } from 'teenybase/scaffolds/fields'

export default {
  appUrl: '$APP_URL',
  jwtSecret: '$JWT_SECRET',

  tables: [
    {
      name: 'users',
      autoSetUid: true,
      fields: [...baseFields, ...authFields],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'auth',
          jwtSecret: '$JWT_SECRET_USERS',
          jwtTokenDuration: 3600,
          maxTokenRefresh: 5,
          authCookie: { name: 'teeny_auth' },
          passwordConfirmSuffix: 'Confirm',
        } as TableAuthExtensionData,
        {
          name: 'rules',
          createRule: 'true',
          viewRule: 'auth.uid == id',
          updateRule: 'auth.uid == id',
          deleteRule: 'auth.uid == id',
        } as TableRulesExtensionData,
      ],
    },
    {
      name: 'facilities',
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: 'ridb_id',          type: 'text',    sqlType: 'text',      notNull: true, unique: true },
        { name: 'name',             type: 'text',    sqlType: 'text',      notNull: true },
        { name: 'lat',              type: 'number',  sqlType: 'real',      notNull: true },
        { name: 'lng',              type: 'number',  sqlType: 'real',      notNull: true },
        { name: 'forest',           type: 'text',    sqlType: 'text'       },
        { name: 'district',         type: 'text',    sqlType: 'text'       },
        { name: 'description',      type: 'text',    sqlType: 'text'       },
        { name: 'fee_min',          type: 'number',  sqlType: 'real'       },
        { name: 'fee_max',          type: 'number',  sqlType: 'real'       },
        { name: 'season_start',     type: 'text',    sqlType: 'text'       },
        { name: 'season_end',       type: 'text',    sqlType: 'text'       },
        { name: 'fcfs_total',       type: 'integer', sqlType: 'integer'    },
        { name: 'reservable_total', type: 'integer', sqlType: 'integer'    },
        { name: 'is_fully_fcfs',    type: 'bool',    sqlType: 'boolean'    },
        { name: 'is_partial_fcfs',  type: 'bool',    sqlType: 'boolean'    },
        { name: 'amenities',        type: 'json',    sqlType: 'json'       },
        { name: 'ridb_data_quality',type: 'select',  sqlType: 'text'       },
        { name: 'fs_url',           type: 'url',     sqlType: 'text'       },
        { name: 'last_synced',      type: 'date',    sqlType: 'timestamp'  },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'rules',
          listRule: 'true',   // public read — anyone can query facilities
          viewRule: 'true',
          createRule: 'false', // ETL writes via service token, bypasses rules
          updateRule: 'false',
          deleteRule: 'false',
        } as TableRulesExtensionData,
      ],
    },
    {
      name: 'alerts',
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: 'facility_id', type: 'relation', sqlType: 'text',
          foreignKey: { table: 'facilities', column: 'id', onDelete: 'CASCADE' } },
        { name: 'content',     type: 'text',    sqlType: 'text'      },
        { name: 'scraped_at',  type: 'date',    sqlType: 'timestamp' },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'rules',
          listRule: 'true',
          viewRule: 'true',
          createRule: 'false', // server route writes via service token
          updateRule: 'false',
          deleteRule: 'false',
        } as TableRulesExtensionData,
      ],
    },
    {
      name: 'ratings',
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: 'facility_id', type: 'relation', sqlType: 'text',
          foreignKey: { table: 'facilities', column: 'id', onDelete: 'CASCADE' } },
        { name: 'user_id',     type: 'relation', sqlType: 'text',
          foreignKey: { table: 'users', column: 'id', onDelete: 'CASCADE' } },
        { name: 'score',       type: 'integer',  sqlType: 'integer', notNull: true },
        { name: 'notes',       type: 'text',     sqlType: 'text'     },
        { name: 'visited_at',  type: 'date',     sqlType: 'timestamp'},
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'rules',
          listRule: 'true',
          viewRule: 'true',
          createRule: 'auth.uid != null',
          updateRule: 'auth.uid == user_id',
          deleteRule: 'auth.uid == user_id',
        } as TableRulesExtensionData,
      ],
    },
    {
      name: 'saved_campgrounds',
      autoSetUid: true,
      fields: [
        ...baseFields,
        { name: 'user_id',        type: 'relation', sqlType: 'text',
          foreignKey: { table: 'users', column: 'id', onDelete: 'CASCADE' } },
        { name: 'facility_id',    type: 'relation', sqlType: 'text',
          foreignKey: { table: 'facilities', column: 'id', onDelete: 'CASCADE' } },
        { name: 'personal_notes', type: 'text',     sqlType: 'text' },
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: 'rules',
          listRule: 'auth.uid == user_id',
          viewRule: 'auth.uid == user_id',
          createRule: 'auth.uid != null',
          updateRule: 'auth.uid == user_id',
          deleteRule: 'auth.uid == user_id',
        } as TableRulesExtensionData,
      ],
    },
  ],
} satisfies DatabaseSettings
```

- [ ] **Step 2: Populate .dev.vars with local secrets**

`.dev.vars` (already created by scaffold — fill in values):
```
APP_URL=http://localhost:8787
JWT_SECRET=dev-jwt-secret-change-in-prod
JWT_SECRET_USERS=dev-jwt-users-secret-change-in-prod
ADMIN_JWT_SECRET=dev-admin-jwt-secret
ADMIN_SERVICE_TOKEN=dev-service-token-change-in-prod
POCKET_UI_VIEWER_PASSWORD=viewer123
POCKET_UI_EDITOR_PASSWORD=editor123
```

- [ ] **Step 3: Generate migrations and start dev server**

```bash
cd backend
teeny generate --local
teeny deploy --local
teeny dev --local
```

Expected: dev server at `http://localhost:8787`. Check `http://localhost:8787/api/v1/health` → `{ "status": "ok" }`.

- [ ] **Step 4: Verify in admin panel**

Open `http://localhost:8787/api/v1/pocket/`. Log in with the editor password from `.dev.vars`. Confirm all 5 tables exist: `users`, `facilities`, `alerts`, `ratings`, `saved_campgrounds`.

- [ ] **Step 5: Commit**

```bash
git add backend/teenybase.ts backend/.dev.vars.example
git commit -m "feat(backend): CampFinder schema in Teenybase"
```

Note: add `.dev.vars` and `.prod.vars` to `.gitignore` — they contain secrets.

---

### Task 3: ETL project scaffold

**Files:**
- Create: `etl/package.json`
- Create: `etl/tsconfig.json`
- Create: `etl/vitest.config.ts`
- Create: `etl/.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "campfinder-etl",
  "type": "module",
  "scripts": {
    "sync": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "pocketbase": "^0.21.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0"
  }
}
```

Run: `cd etl && pnpm install`

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node' }
})
```

- [ ] **Step 4: Create .env.example**

```
RIDB_API_KEY=your_ridb_api_key_here
TB_API_URL=http://localhost:8787
TB_SERVICE_TOKEN=dev-service-token-change-in-prod
```

Copy to `.env`. `TB_SERVICE_TOKEN` must match `ADMIN_SERVICE_TOKEN` in `backend/.dev.vars`. Get a real RIDB API key at recreation.gov/profile.

- [ ] **Step 5: Commit**

```bash
git add etl/package.json etl/tsconfig.json etl/vitest.config.ts etl/.env.example etl/package-lock.json
git commit -m "chore: ETL project scaffold"
```

---

### Task 4: RIDB + internal types

**Files:**
- Create: `etl/src/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// etl/src/types.ts

// --- RIDB API shapes ---

export interface RidbAttribute {
  AttributeID: number
  AttributeName: string
  AttributeValue: string
}

export interface RidbFacility {
  FacilityID: string
  FacilityName: string
  FacilityLatitude: number
  FacilityLongitude: number
  FacilityDescription: string
  FacilityUseFeeDescription: string
  FacilityAdaAccess: string
  ATTRIBUTES: RidbAttribute[]
  LINK: Array<{ LinkType: string; LinkURL: string; Title: string }>
  OrgFacilityID: string
  ParentOrgID: string
  StayLimit: string
  LastUpdatedDate: string
}

export interface RidbCampsite {
  CampsiteID: string
  FacilityID: string
  CampsiteName: string
  CampsiteType: string
  TypeOfUse: string   // "Overnight" | "Day"
  CampsiteReservable: boolean
  CampsiteAccessible: string
  Loop: string
  ATTRIBUTES: RidbAttribute[]
}

export interface RidbListResponse<T> {
  RECDATA: T[]
  METADATA: {
    RESULTS: { CURRENT_COUNT: number; TOTAL_COUNT: number }
  }
}

// --- Internal / PocketBase shapes ---

export type ToiletType = 'flush' | 'vault' | 'none' | 'unknown'
export type DataQuality = 'rich' | 'sparse' | 'unknown'

export interface Amenities {
  potableWater: boolean
  toiletType: ToiletType
  bearBoxes: boolean
  driveUp: boolean
  maxRvLength: number | null
  electricHookups: boolean
  waterHookups: boolean
  sewerHookups: boolean
  petsAllowed: boolean
  horsesAllowed: boolean
  picnicTables: boolean
  fireRings: boolean
  accessible: boolean
}

export interface FcfsAggregation {
  fcfs_total: number
  reservable_total: number
  is_fully_fcfs: boolean
  is_partial_fcfs: boolean
}

export interface NormalizedFacility {
  ridb_id: string
  name: string
  lat: number
  lng: number
  forest: string
  district: string
  description: string
  fee_min: number | null
  fee_max: number | null
  season_start: string
  season_end: string
  fcfs_total: number
  reservable_total: number
  is_fully_fcfs: boolean
  is_partial_fcfs: boolean
  amenities: Amenities
  ridb_data_quality: DataQuality
  fs_url: string
  last_synced: string
}
```

- [ ] **Step 2: Commit**

```bash
git add etl/src/types.ts
git commit -m "feat(etl): add RIDB and internal types"
```

---

### Task 5: Colorado NF RIDB query parameters

**Files:**
- Create: `etl/src/forests.ts`

RIDB doesn't have stable org IDs across environments, so we query by state and filter to National Forest facilities.

- [ ] **Step 1: Write forests.ts**

```typescript
// etl/src/forests.ts

// Colorado National Forest names for post-fetch filtering.
// RIDB facilities are fetched state=CO; we keep only those whose
// organization name or fs.usda.gov link indicates a National Forest.
export const COLORADO_NF_NAMES = [
  'Arapaho',
  'Roosevelt',
  'White River',
  'Pike',
  'San Isabel',
  'Grand Mesa',
  'Uncompahgre',
  'Gunnison',
  'Rio Grande',
  'San Juan',
  'Routt',
  'Medicine Bow',
  'Manti-La Sal',
]

export function isColoradoNationalForest(facility: { FacilityName: string; LINK: Array<{ LinkURL: string }> }): boolean {
  const hasFsUrl = facility.LINK.some(l => l.LinkURL?.includes('fs.usda.gov'))
  const nameMatch = COLORADO_NF_NAMES.some(nf =>
    facility.FacilityName.toLowerCase().includes(nf.toLowerCase())
  )
  return hasFsUrl || nameMatch
}

// RIDB query params to fetch Colorado campgrounds
export const CO_QUERY_PARAMS = {
  state: 'CO',
  activity: 'CAMPING',
  facilitytype: 'Campground',
} as const
```

- [ ] **Step 2: Commit**

```bash
git add etl/src/forests.ts
git commit -m "feat(etl): Colorado National Forest filter"
```

---

### Task 6: RIDB API client

**Files:**
- Create: `etl/src/ridb.ts`
- Create: `etl/tests/ridb.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `etl/tests/ridb.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RidbClient } from '../src/ridb.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makePageResponse(data: unknown[], total: number) {
  return {
    ok: true,
    json: async () => ({ RECDATA: data, METADATA: { RESULTS: { CURRENT_COUNT: data.length, TOTAL_COUNT: total } } })
  }
}

describe('RidbClient', () => {
  const client = new RidbClient('test-key')
  beforeEach(() => mockFetch.mockReset())

  it('fetches all pages when total > page size', async () => {
    mockFetch
      .mockResolvedValueOnce(makePageResponse([{ FacilityID: '1' }], 2))
      .mockResolvedValueOnce(makePageResponse([{ FacilityID: '2' }], 2))

    const results = await client.getAllFacilities({ state: 'CO', activity: 'CAMPING' }, 1)
    expect(results).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('includes API key in every request', async () => {
    mockFetch.mockResolvedValue(makePageResponse([], 0))
    await client.getAllFacilities({ state: 'CO' })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('apikey=test-key')
  })

  it('fetches campsites for a facility', async () => {
    mockFetch.mockResolvedValue(makePageResponse([{ CampsiteID: 'c1' }], 1))
    const sites = await client.getCampsites('10165691')
    expect(sites[0].CampsiteID).toBe('c1')
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd etl && pnpm test -- tests/ridb.test.ts
```

Expected: FAIL — `RidbClient` not found.

- [ ] **Step 3: Implement the RIDB client**

Create `etl/src/ridb.ts`:
```typescript
import type { RidbFacility, RidbCampsite, RidbListResponse } from './types.js'

const BASE_URL = 'https://ridb.recreation.gov/api/v1'
const PAGE_SIZE = 50

export class RidbClient {
  constructor(private apiKey: string) {}

  async getAllFacilities(
    params: Record<string, string>,
    pageSize = PAGE_SIZE,
  ): Promise<RidbFacility[]> {
    const all: RidbFacility[] = []
    let offset = 0

    while (true) {
      const url = this.buildUrl('/facilities', { ...params, limit: String(pageSize), offset: String(offset) })
      const res = await fetch(url)
      if (!res.ok) throw new Error(`RIDB error ${res.status}: ${await res.text()}`)

      const data: RidbListResponse<RidbFacility> = await res.json()
      all.push(...data.RECDATA)

      if (all.length >= data.METADATA.RESULTS.TOTAL_COUNT) break
      offset += pageSize
      await sleep(200) // be polite to the RIDB API
    }

    return all
  }

  async getCampsites(facilityId: string): Promise<RidbCampsite[]> {
    const all: RidbCampsite[] = []
    let offset = 0

    while (true) {
      const url = this.buildUrl(`/facilities/${facilityId}/campsites`, {
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      const res = await fetch(url)
      if (!res.ok) throw new Error(`RIDB error ${res.status}`)

      const data: RidbListResponse<RidbCampsite> = await res.json()
      all.push(...data.RECDATA)

      if (all.length >= data.METADATA.RESULTS.TOTAL_COUNT) break
      offset += PAGE_SIZE
      await sleep(200)
    }

    return all
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const qs = new URLSearchParams({ ...params, apikey: this.apiKey })
    return `${BASE_URL}${path}?${qs}`
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd etl && pnpm test -- tests/ridb.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add etl/src/ridb.ts etl/tests/ridb.test.ts
git commit -m "feat(etl): RIDB API client with pagination"
```

---

### Task 7: Amenity normalization (TDD)

**Files:**
- Create: `etl/src/normalize.ts`
- Create: `etl/tests/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `etl/tests/normalize.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { normalizeAmenities } from '../src/normalize.js'
import type { RidbAttribute } from '../src/types.js'

function attrs(pairs: [string, string][]): RidbAttribute[] {
  return pairs.map(([name, value], i) => ({ AttributeID: i, AttributeName: name, AttributeValue: value }))
}

describe('normalizeAmenities', () => {
  it('detects potable water from variant names', () => {
    expect(normalizeAmenities(attrs([['Drinking Water', 'Yes']])).potableWater).toBe(true)
    expect(normalizeAmenities(attrs([['Potable Water', 'Available']])).potableWater).toBe(true)
    expect(normalizeAmenities(attrs([['Water Available', 'Yes']])).potableWater).toBe(true)
    expect(normalizeAmenities(attrs([['No Drinking Water', 'True']])).potableWater).toBe(false)
  })

  it('normalizes toilet type from variant names', () => {
    expect(normalizeAmenities(attrs([['Toilet', 'Flush Toilets']])).toiletType).toBe('flush')
    expect(normalizeAmenities(attrs([['Restroom', 'Vault Toilets']])).toiletType).toBe('vault')
    expect(normalizeAmenities(attrs([['Toilet', 'No Toilets']])).toiletType).toBe('none')
    expect(normalizeAmenities(attrs([])).toiletType).toBe('unknown')
  })

  it('parses max RV length as a number', () => {
    expect(normalizeAmenities(attrs([['Max Vehicle Length', '35 feet']])).maxRvLength).toBe(35)
    expect(normalizeAmenities(attrs([['Max Num of Vehicles', '3']])).maxRvLength).toBe(null)
    expect(normalizeAmenities(attrs([])).maxRvLength).toBe(null)
  })

  it('detects bear boxes', () => {
    expect(normalizeAmenities(attrs([['Bear Box', 'Yes']])).bearBoxes).toBe(true)
    expect(normalizeAmenities(attrs([['Food Storage Locker', 'Yes']])).bearBoxes).toBe(true)
  })

  it('defaults unknowns to false/null/unknown rather than throwing', () => {
    const result = normalizeAmenities([])
    expect(result.potableWater).toBe(false)
    expect(result.maxRvLength).toBe(null)
    expect(result.toiletType).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd etl && pnpm test -- tests/normalize.test.ts
```

Expected: FAIL — `normalizeAmenities` not found.

- [ ] **Step 3: Implement normalizeAmenities**

Create `etl/src/normalize.ts`:
```typescript
import type { RidbAttribute, Amenities, ToiletType } from './types.js'

export function normalizeAmenities(attributes: RidbAttribute[]): Amenities {
  const get = (needles: string[]): string | null => {
    const needle = needles.map(n => n.toLowerCase())
    return attributes.find(a =>
      needle.some(n => a.AttributeName.toLowerCase().includes(n))
    )?.AttributeValue ?? null
  }

  const bool = (v: string | null): boolean =>
    v != null && ['yes', 'true', 'y', '1', 'available'].includes(v.toLowerCase().trim())

  // Toilet type: match flush → vault → none → unknown
  const toiletRaw = get(['toilet', 'restroom'])
  let toiletType: ToiletType = 'unknown'
  if (toiletRaw) {
    const t = toiletRaw.toLowerCase()
    if (t.includes('flush'))       toiletType = 'flush'
    else if (t.includes('vault'))  toiletType = 'vault'
    else if (t.includes('none') || t.includes('no toilet')) toiletType = 'none'
  }

  // Max RV length: extract first integer from the value string
  const rvRaw = get(['max vehicle length', 'max rv length', 'rv length'])
  const maxRvLength = rvRaw ? (parseInt(rvRaw.replace(/\D.*/, ''), 10) || null) : null

  return {
    potableWater:   bool(get(['drinking water', 'potable water', 'water available'])) &&
                    !get(['no drinking water', 'no water']),
    toiletType,
    bearBoxes:      bool(get(['bear box', 'bear locker', 'food storage locker'])),
    driveUp:        bool(get(['driveway', 'drive-up', 'drive up', 'vehicle site'])),
    maxRvLength,
    electricHookups: bool(get(['electric hookup', 'electrical hookup', 'electricity', 'amp hookup'])),
    waterHookups:   bool(get(['water hookup', 'water service hookup'])),
    sewerHookups:   bool(get(['sewer hookup', 'sewer service hookup'])),
    petsAllowed:    bool(get(['pets allowed', 'pets', 'dogs allowed'])),
    horsesAllowed:  bool(get(['horses', 'horse allowed'])),
    picnicTables:   bool(get(['picnic table', 'table'])),
    fireRings:      bool(get(['fire pit', 'fire ring', 'campfire ring'])),
    accessible:     bool(get(['ada', 'accessible', 'wheelchair'])),
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd etl && pnpm test -- tests/normalize.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add etl/src/normalize.ts etl/tests/normalize.test.ts
git commit -m "feat(etl): amenity normalization with variant attribute name handling"
```

---

### Task 8: FCFS aggregation + data quality scoring (TDD)

**Files:**
- Modify: `etl/src/normalize.ts`
- Modify: `etl/tests/normalize.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `etl/tests/normalize.test.ts`:
```typescript
import { aggregateFcfs, scoreDataQuality } from '../src/normalize.js'
import type { RidbCampsite } from '../src/types.js'

function site(reservable: boolean, typeOfUse = 'Overnight'): RidbCampsite {
  return { CampsiteID: '', FacilityID: '', CampsiteName: '', CampsiteType: '',
           TypeOfUse: typeOfUse, CampsiteReservable: reservable,
           CampsiteAccessible: 'N', Loop: '', ATTRIBUTES: [] }
}

describe('aggregateFcfs', () => {
  it('counts FCFS vs reservable sites', () => {
    const result = aggregateFcfs([site(false), site(false), site(true)])
    expect(result.fcfs_total).toBe(2)
    expect(result.reservable_total).toBe(1)
    expect(result.is_partial_fcfs).toBe(true)
    expect(result.is_fully_fcfs).toBe(false)
  })

  it('marks fully FCFS when no reservable sites', () => {
    const result = aggregateFcfs([site(false), site(false)])
    expect(result.is_fully_fcfs).toBe(true)
    expect(result.is_partial_fcfs).toBe(false)
  })

  it('excludes day-use sites from FCFS count', () => {
    const result = aggregateFcfs([site(false, 'Day'), site(false, 'Overnight')])
    expect(result.fcfs_total).toBe(1)
  })
})

describe('scoreDataQuality', () => {
  it('returns rich when 5+ amenity fields are populated', () => {
    const amenities = { potableWater: true, toiletType: 'flush' as const,
      bearBoxes: true, driveUp: true, maxRvLength: 35,
      electricHookups: false, waterHookups: false, sewerHookups: false,
      petsAllowed: true, horsesAllowed: false, picnicTables: true, fireRings: true, accessible: false }
    expect(scoreDataQuality(amenities)).toBe('rich')
  })

  it('returns sparse when 1–4 fields are populated', () => {
    const amenities = { potableWater: true, toiletType: 'unknown' as const,
      bearBoxes: false, driveUp: false, maxRvLength: null,
      electricHookups: false, waterHookups: false, sewerHookups: false,
      petsAllowed: false, horsesAllowed: false, picnicTables: false, fireRings: false, accessible: false }
    expect(scoreDataQuality(amenities)).toBe('sparse')
  })

  it('returns unknown when nothing is populated', () => {
    const amenities = { potableWater: false, toiletType: 'unknown' as const,
      bearBoxes: false, driveUp: false, maxRvLength: null,
      electricHookups: false, waterHookups: false, sewerHookups: false,
      petsAllowed: false, horsesAllowed: false, picnicTables: false, fireRings: false, accessible: false }
    expect(scoreDataQuality(amenities)).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd etl && pnpm test -- tests/normalize.test.ts
```

Expected: FAIL — `aggregateFcfs` and `scoreDataQuality` not exported.

- [ ] **Step 3: Add functions to normalize.ts**

Append to `etl/src/normalize.ts`:
```typescript
import type { RidbCampsite, FcfsAggregation, DataQuality } from './types.js'

export function aggregateFcfs(campsites: RidbCampsite[]): FcfsAggregation {
  const overnight = campsites.filter(c => c.TypeOfUse === 'Overnight')
  const fcfs_total = overnight.filter(c => !c.CampsiteReservable).length
  const reservable_total = overnight.filter(c => c.CampsiteReservable).length
  return {
    fcfs_total,
    reservable_total,
    is_fully_fcfs: reservable_total === 0 && fcfs_total > 0,
    is_partial_fcfs: fcfs_total > 0 && reservable_total > 0,
  }
}

export function scoreDataQuality(amenities: Amenities): DataQuality {
  const populated = Object.entries(amenities).filter(([k, v]) => {
    if (k === 'toiletType') return v !== 'unknown'
    if (typeof v === 'boolean') return v === true
    return v !== null
  }).length
  if (populated === 0) return 'unknown'
  if (populated < 5)   return 'sparse'
  return 'rich'
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd etl && pnpm test -- tests/normalize.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add etl/src/normalize.ts etl/tests/normalize.test.ts
git commit -m "feat(etl): FCFS aggregation and data quality scoring"
```

---

### Task 9: Fee + season extraction

**Files:**
- Modify: `etl/src/normalize.ts`
- Modify: `etl/tests/normalize.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `etl/tests/normalize.test.ts`:
```typescript
import { extractFees, extractFsUrl } from '../src/normalize.js'

describe('extractFees', () => {
  it('extracts min and max fee from fee description', () => {
    expect(extractFees('$15 per night')).toEqual({ fee_min: 15, fee_max: 15 })
    expect(extractFees('$10–$20 per night')).toEqual({ fee_min: 10, fee_max: 20 })
    expect(extractFees('Free')).toEqual({ fee_min: 0, fee_max: 0 })
    expect(extractFees('')).toEqual({ fee_min: null, fee_max: null })
  })
})

describe('extractFsUrl', () => {
  it('returns the first fs.usda.gov link', () => {
    const links = [
      { LinkType: 'Official', LinkURL: 'https://www.fs.usda.gov/recarea/arp', Title: '' },
      { LinkType: 'Reservations', LinkURL: 'https://recreation.gov/...', Title: '' },
    ]
    expect(extractFsUrl(links)).toBe('https://www.fs.usda.gov/recarea/arp')
  })

  it('returns empty string when no fs.usda.gov link', () => {
    expect(extractFsUrl([])).toBe('')
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
cd etl && pnpm test -- tests/normalize.test.ts
```

- [ ] **Step 3: Implement**

Append to `etl/src/normalize.ts`:
```typescript
export function extractFees(feeDescription: string): { fee_min: number | null; fee_max: number | null } {
  if (!feeDescription) return { fee_min: null, fee_max: null }
  if (/free/i.test(feeDescription)) return { fee_min: 0, fee_max: 0 }

  const dollars = [...feeDescription.matchAll(/\$(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1]))
  if (dollars.length === 0) return { fee_min: null, fee_max: null }

  return { fee_min: Math.min(...dollars), fee_max: Math.max(...dollars) }
}

export function extractFsUrl(links: Array<{ LinkURL: string }>): string {
  return links.find(l => l.LinkURL?.includes('fs.usda.gov'))?.LinkURL ?? ''
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd etl && pnpm test -- tests/normalize.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add etl/src/normalize.ts etl/tests/normalize.test.ts
git commit -m "feat(etl): fee extraction and fs.usda.gov URL extraction"
```

---

### Task 10: Teenybase write client (upsert via REST)

**Files:**
- Create: `etl/src/teenybase.ts`

The ETL uses the `ADMIN_SERVICE_TOKEN` from `.dev.vars` / `.prod.vars`. This token bypasses row-level security, so it can write to `facilities` even though the table's `createRule` and `updateRule` are `false` for regular users.

- [ ] **Step 1: Write the Teenybase client**

```typescript
// etl/src/teenybase.ts
import type { NormalizedFacility } from './types.js'

export class TbClient {
  constructor(
    private baseUrl: string,
    private serviceToken: string,
  ) {}

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.serviceToken}`,
    }
  }

  private async tbFetch(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Teenybase ${path} ${res.status}: ${text}`)
    }
    return res.json()
  }

  async upsertFacility(facility: NormalizedFacility): Promise<void> {
    // Check for existing record by ridb_id
    const list = await this.tbFetch('/table/facilities/list', {
      where: `ridb_id == '${facility.ridb_id}'`,
      limit: 1,
    }) as { items: Array<{ id: string }> }

    if (list.items.length > 0) {
      await this.tbFetch(`/table/facilities/edit/${list.items[0].id}`, facility)
    } else {
      await this.tbFetch('/table/facilities/insert', { values: facility })
    }
  }

  async upsertFacilities(
    facilities: NormalizedFacility[],
    onProgress?: (i: number, total: number) => void,
  ): Promise<void> {
    for (let i = 0; i < facilities.length; i++) {
      await this.upsertFacility(facilities[i])
      onProgress?.(i + 1, facilities.length)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add etl/src/teenybase.ts
git commit -m "feat(etl): Teenybase upsert client via service token"
```

---

### Task 11: ETL orchestrator

**Files:**
- Create: `etl/src/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
// etl/src/index.ts
import 'dotenv/config'
import { RidbClient } from './ridb.js'
import { TbClient } from './teenybase.js'
import { CO_QUERY_PARAMS, isColoradoNationalForest } from './forests.js'
import { normalizeAmenities, aggregateFcfs, scoreDataQuality, extractFees, extractFsUrl } from './normalize.js'
import type { NormalizedFacility } from './types.js'

const RIDB_API_KEY  = process.env.RIDB_API_KEY!
const TB_API_URL    = process.env.TB_API_URL ?? 'http://localhost:8787'
const TB_SERVICE_TOKEN = process.env.TB_SERVICE_TOKEN!

if (!RIDB_API_KEY)      throw new Error('RIDB_API_KEY is required')
if (!TB_SERVICE_TOKEN)  throw new Error('TB_SERVICE_TOKEN is required')

const ridb = new RidbClient(RIDB_API_KEY)
const tb   = new TbClient(TB_API_URL, TB_SERVICE_TOKEN)

async function main() {
  console.log(`Connecting to Teenybase at ${TB_API_URL}...`)

  console.log('Fetching Colorado campground facilities from RIDB...')
  const allFacilities = await ridb.getAllFacilities(CO_QUERY_PARAMS)

  const nfFacilities = allFacilities.filter(isColoradoNationalForest)
  console.log(`Found ${nfFacilities.length} Colorado National Forest campgrounds`)

  const normalized: NormalizedFacility[] = []

  for (let i = 0; i < nfFacilities.length; i++) {
    const f = nfFacilities[i]
    process.stdout.write(`\rProcessing ${i + 1}/${nfFacilities.length}: ${f.FacilityName.slice(0, 40).padEnd(40)}`)

    let campsites = []
    try {
      campsites = await ridb.getCampsites(f.FacilityID)
    } catch (e) {
      console.warn(`\nCould not fetch campsites for ${f.FacilityID}: ${e}`)
    }

    const amenities = normalizeAmenities(f.ATTRIBUTES)
    const fcfs      = aggregateFcfs(campsites)
    const fees      = extractFees(f.FacilityUseFeeDescription)

    normalized.push({
      ridb_id: f.FacilityID,
      name: f.FacilityName,
      lat: f.FacilityLatitude,
      lng: f.FacilityLongitude,
      forest: '',          // derived from org name — see note below
      district: '',
      description: f.FacilityDescription,
      fee_min: fees.fee_min,
      fee_max: fees.fee_max,
      season_start: '',   // not reliably in RIDB — left for manual entry
      season_end: '',
      ...fcfs,
      amenities,
      ridb_data_quality: scoreDataQuality(amenities),
      fs_url: extractFsUrl(f.LINK),
      last_synced: new Date().toISOString(),
    })
  }

  console.log('\nWriting to Teenybase...')
  await tb.upsertFacilities(normalized, (i, total) => {
    process.stdout.write(`\rUpserted ${i}/${total}`)
  })
  console.log('\nSync complete.')
}

main().catch(e => { console.error(e); process.exit(1) })
```

Add `dotenv` to package.json dependencies: `"dotenv": "^16.0.0"`, then `pnpm install`.

- [ ] **Step 2: Commit**

```bash
git add etl/src/index.ts
git commit -m "feat(etl): ETL orchestrator"
```

---

### Task 12: First ETL run + validation

- [ ] **Step 1: Ensure the Teenybase dev server is running**

```bash
cd backend && teeny dev --local
```

Expected: `http://localhost:8787/api/v1/health` returns `{ "status": "ok" }`

- [ ] **Step 2: Run the ETL**

```bash
cd etl && cp .env.example .env  # fill in RIDB_API_KEY and TB_SERVICE_TOKEN
pnpm sync
```

Expected output:
```
Connecting to Teenybase at http://localhost:8787...
Fetching Colorado campground facilities from RIDB...
Found ~200-400 Colorado National Forest campgrounds
Processing 1/N: ...
Writing to Teenybase...
Sync complete.
```

- [ ] **Step 3: Verify data in admin panel**

Open `http://localhost:8787/api/v1/pocket/` (use editor password from `.dev.vars`) → facilities table. Confirm:
- Records exist with lat/lng in Colorado bounds (~37–41°N, ~102–109°W)
- Some records have `is_fully_fcfs = true`
- `amenities` JSON is populated for at least some records
- `ridb_data_quality` is mixed (rich/sparse/unknown)

- [ ] **Step 4: Spot-check a known campground**

Search for "Maroon Bells" or "Hanging Lake" in the admin panel. Verify the data looks reasonable.

- [ ] **Step 5: Commit any fixes found during validation**

---

## Phase 2: SvelteKit Frontend + Leaflet Map + PWA

### Task 13: SvelteKit project scaffold

**Files:**
- Create: `frontend/` (SvelteKit project)

- [ ] **Step 1: Scaffold the SvelteKit project**

```bash
pnpm create svelte@latest frontend
```

Select: **Skeleton project**, **TypeScript**, **ESLint + Prettier**.

```bash
cd frontend && pnpm install
pnpm add leaflet leaflet.markercluster
pnpm add -D @types/leaflet @types/leaflet.markercluster
pnpm add -D @vite-pwa/sveltekit vite-plugin-pwa workbox-window
```

- [ ] **Step 2: Update svelte.config.js for Cloudflare Pages adapter**

```bash
pnpm add -D @sveltejs/adapter-cloudflare
```

`frontend/svelte.config.js`:
```javascript
import adapter from '@sveltejs/adapter-cloudflare'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
  },
}
```

- [ ] **Step 3: Create .env.example**

```
PUBLIC_PB_URL=http://localhost:8090
```

Copy to `.env`.

- [ ] **Step 4: Verify dev server starts**

```bash
cd frontend && pnpm dev
```

Expected: server at `http://localhost:5173`.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): SvelteKit scaffold with Cloudflare adapter"
```

---

### Task 14: Shared frontend types

**Files:**
- Create: `frontend/src/lib/types.ts`

- [ ] **Step 1: Write shared types**

```typescript
// frontend/src/lib/types.ts

export type ToiletType = 'flush' | 'vault' | 'none' | 'unknown'
export type DataQuality = 'rich' | 'sparse' | 'unknown'

export interface Amenities {
  potableWater: boolean
  toiletType: ToiletType
  bearBoxes: boolean
  driveUp: boolean
  maxRvLength: number | null
  electricHookups: boolean
  waterHookups: boolean
  sewerHookups: boolean
  petsAllowed: boolean
  horsesAllowed: boolean
  picnicTables: boolean
  fireRings: boolean
  accessible: boolean
}

export interface Facility {
  id: string
  ridb_id: string
  name: string
  lat: number
  lng: number
  forest: string
  district: string
  description: string
  fee_min: number | null
  fee_max: number | null
  season_start: string
  season_end: string
  fcfs_total: number
  reservable_total: number
  is_fully_fcfs: boolean
  is_partial_fcfs: boolean
  amenities: Amenities
  ridb_data_quality: DataQuality
  fs_url: string
}

export interface Alert {
  content: string | null
  scraped_at: string | null
}

export interface Rating {
  id: string
  score: number
  notes: string
  visited_at: string
  user_id: string
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(frontend): shared TypeScript types"
```

---

### Task 15: Facilities API server route

**Files:**
- Create: `frontend/src/routes/api/facilities/+server.ts`

This SvelteKit server route proxies the Teenybase bbox query. The `PUBLIC_TB_URL` env var points at the Teenybase Worker. Facilities are publicly readable (listRule: 'true'), so no auth token needed for reads.

- [ ] **Step 1: Update frontend .env.example**

```
PUBLIC_TB_URL=http://localhost:8787
TB_SERVICE_TOKEN=dev-service-token-change-in-prod
```

`PUBLIC_TB_URL` is exposed to the client (safe — it's just a URL). `TB_SERVICE_TOKEN` is server-only (used for alert cache writes).

- [ ] **Step 2: Write the route**

```typescript
// frontend/src/routes/api/facilities/+server.ts
import { json } from '@sveltejs/kit'
import { PUBLIC_TB_URL } from '$env/static/public'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const north = parseFloat(url.searchParams.get('north') ?? '')
  const south = parseFloat(url.searchParams.get('south') ?? '')
  const east  = parseFloat(url.searchParams.get('east')  ?? '')
  const west  = parseFloat(url.searchParams.get('west')  ?? '')

  if ([north, south, east, west].some(isNaN)) {
    return json({ error: 'bbox params required: north, south, east, west' }, { status: 400 })
  }

  const where = `lat >= ${south} && lat <= ${north} && lng >= ${west} && lng <= ${east}`

  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/facilities/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where, limit: 500 }),
  })

  const data = await res.json() as { items?: unknown[] }
  return json(data.items ?? [])
}
```

- [ ] **Step 3: Test the route manually**

With Teenybase dev server and ETL both run:
```bash
curl "http://localhost:5173/api/facilities?north=40.1&south=39.0&east=-104.5&west=-106.0"
```

Expected: JSON array of facilities.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/api/facilities/+server.ts frontend/.env.example
git commit -m "feat(frontend): facilities bbox query via Teenybase REST"
```

---

### Task 16: Map store

**Files:**
- Create: `frontend/src/lib/map/mapStore.ts`

- [ ] **Step 1: Write the store**

```typescript
// frontend/src/lib/map/mapStore.ts
import { writable } from 'svelte/store'
import type { Facility } from '$lib/types'

export const selectedFacility = writable<Facility | null>(null)
export const searchPending    = writable(false)  // true when map has moved but search not yet triggered
export const facilities       = writable<Facility[]>([])
export const isLoading        = writable(false)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/map/mapStore.ts
git commit -m "feat(frontend): map Svelte stores"
```

---

### Task 17: Leaflet map component

**Files:**
- Create: `frontend/src/lib/map/CampMap.svelte`

Key constraints: Leaflet uses `window`; must be dynamically imported inside `onMount`. The component exposes `renderPins()` and `getMapBounds()` via `bind:this`.

- [ ] **Step 1: Write CampMap.svelte**

```svelte
<!-- frontend/src/lib/map/CampMap.svelte -->
<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte'
  import type { Facility } from '$lib/types'
  import { searchPending } from './mapStore'

  const dispatch = createEventDispatcher<{ select: Facility }>()

  let mapEl: HTMLDivElement
  let L: any
  let map: any
  let pinsLayer: any

  onMount(async () => {
    L = (await import('leaflet')).default
    await import('leaflet/dist/leaflet.css')
    await import('leaflet.markercluster')
    await import('leaflet.markercluster/dist/MarkerCluster.css')
    await import('leaflet.markercluster/dist/MarkerCluster.Default.css')

    map = L.map(mapEl, {
      center: [39.55, -105.78],  // Colorado center
      zoom: 8,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    pinsLayer = L.markerClusterGroup({ maxClusterRadius: 40 })
    map.addLayer(pinsLayer)

    // Flag that the map has moved so user can trigger "Search this area"
    map.on('moveend', () => searchPending.set(true))

    return () => map.remove()
  })

  export function renderPins(facilityList: Facility[]) {
    if (!L || !pinsLayer) return
    pinsLayer.clearLayers()

    for (const f of facilityList) {
      const fillColor = f.is_fully_fcfs ? '#22c55e'
                      : f.is_partial_fcfs ? '#eab308'
                      : '#3b82f6'

      const marker = L.circleMarker([f.lat, f.lng], {
        radius: 9, fillColor, color: '#fff', weight: 2, fillOpacity: 0.9,
      })
      marker.bindTooltip(f.name, { permanent: false, direction: 'top' })
      marker.on('click', () => dispatch('select', f))
      pinsLayer.addLayer(marker)
    }
  }

  export function getMapBounds(): { north: number; south: number; east: number; west: number } | null {
    if (!map) return null
    const b = map.getBounds()
    return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }
  }
</script>

<div bind:this={mapEl} class="map-root"></div>

<style>
  .map-root {
    height: 100%;
    width: 100%;
  }
</style>
```

- [ ] **Step 2: Add Leaflet icon fix to app.html**

Leaflet's default marker icons use relative paths that break in bundlers. Add to `frontend/src/app.html` `<head>`:
```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
```

This ensures the CSS loads before the JS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/map/CampMap.svelte frontend/src/app.html
git commit -m "feat(frontend): Leaflet map component with SSR-safe dynamic import"
```

---

### Task 18: Main page — map + search button

**Files:**
- Modify: `frontend/src/routes/+page.svelte`
- Create: `frontend/src/routes/+layout.svelte`

- [ ] **Step 1: Write +layout.svelte**

```svelte
<!-- frontend/src/routes/+layout.svelte -->
<script lang="ts">
  import '../app.css'
</script>

<div class="app-shell">
  <slot />
</div>

<style>
  :global(body) { margin: 0; font-family: system-ui, sans-serif; }
  .app-shell { display: flex; height: 100dvh; overflow: hidden; }
</style>
```

- [ ] **Step 2: Write +page.svelte**

```svelte
<!-- frontend/src/routes/+page.svelte -->
<script lang="ts">
  import CampMap from '$lib/map/CampMap.svelte'
  import DetailPanel from '$lib/detail/DetailPanel.svelte'
  import { selectedFacility, searchPending, facilities, isLoading } from '$lib/map/mapStore'
  import type { Facility } from '$lib/types'

  let campMap: CampMap

  async function searchArea() {
    const bounds = campMap.getMapBounds()
    if (!bounds) return

    isLoading.set(true)
    searchPending.set(false)

    const params = new URLSearchParams({
      north: String(bounds.north), south: String(bounds.south),
      east: String(bounds.east),  west: String(bounds.west),
    })

    const res = await fetch(`/api/facilities?${params}`)
    const data: Facility[] = await res.json()

    facilities.set(data)
    campMap.renderPins(data)
    isLoading.set(false)
  }

  function handleSelect(e: CustomEvent<Facility>) {
    selectedFacility.set(e.detail)
  }
</script>

<div class="map-wrap">
  <CampMap bind:this={campMap} on:select={handleSelect} />

  <div class="search-bar">
    {#if $searchPending}
      <button class="search-btn" on:click={searchArea} disabled={$isLoading}>
        {$isLoading ? 'Searching…' : 'Search this area'}
      </button>
    {/if}
  </div>

  <div class="legend">
    <span class="dot green"></span> Fully FCFS
    <span class="dot yellow"></span> Partial FCFS
    <span class="dot blue"></span> Reservable only
  </div>
</div>

{#if $selectedFacility}
  <DetailPanel facility={$selectedFacility} on:close={() => selectedFacility.set(null)} />
{/if}

<style>
  .map-wrap  { position: relative; flex: 1; min-width: 0; }
  .search-bar { position: absolute; top: 1rem; left: 50%; transform: translateX(-50%); z-index: 1000; }
  .search-btn {
    background: white; border: none; border-radius: 24px;
    padding: .6rem 1.4rem; font-size: .95rem; font-weight: 600;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: pointer;
  }
  .legend {
    position: absolute; bottom: 1rem; left: 1rem; z-index: 1000;
    background: white; border-radius: 8px; padding: .5rem .75rem;
    font-size: .8rem; display: flex; gap: .75rem; align-items: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
  .dot.green  { background: #22c55e; }
  .dot.yellow { background: #eab308; }
  .dot.blue   { background: #3b82f6; }
</style>
```

- [ ] **Step 3: Verify in browser**

```bash
cd frontend && pnpm dev
```

Open `http://localhost:5173`. Pan the map → "Search this area" button appears → click → pins load (if ETL has run).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/+layout.svelte frontend/src/routes/+page.svelte
git commit -m "feat(frontend): main map page with Search this area button"
```

---

### Task 19: PWA setup

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `frontend/static/manifest.webmanifest`
- Create: `frontend/static/icons/` (icon files)

- [ ] **Step 1: Update vite.config.ts**

```typescript
// frontend/vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CampFinder',
        short_name: 'CampFinder',
        description: 'Discover Colorado National Forest campgrounds',
        theme_color: '#16a34a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'osm-tiles', expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
})
```

- [ ] **Step 2: Generate PWA icons**

Create placeholder icons (replace with real art later):
```bash
cd frontend/static && mkdir -p icons
# Use any PNG image generator, or use a simple script:
# Convert a 512x512 PNG to 192x192. For now, use any green square PNG.
# Place as: static/icons/icon-192.png and static/icons/icon-512.png
```

For quick placeholder icons, use ImageMagick if available:
```bash
convert -size 512x512 xc:#16a34a static/icons/icon-512.png
convert -size 192x192 xc:#16a34a static/icons/icon-192.png
```

- [ ] **Step 3: Verify PWA manifest**

```bash
pnpm build && pnpm preview
```

Open Chrome DevTools → Application → Manifest. Confirm it loads and shows CampFinder.

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.ts frontend/static/icons/
git commit -m "feat(frontend): PWA setup with OSM tile caching"
```

---

## Phase 3: Detail Panel

### Task 20: Detail panel shell (slide-in + bottom sheet)

**Files:**
- Create: `frontend/src/lib/detail/DetailPanel.svelte`

- [ ] **Step 1: Write DetailPanel.svelte**

```svelte
<!-- frontend/src/lib/detail/DetailPanel.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { Facility } from '$lib/types'
  import FCFSBadge from './FCFSBadge.svelte'
  import AmenityGrid from './AmenityGrid.svelte'
  import AlertsSection from './AlertsSection.svelte'
  import DataQualityWarning from './DataQualityWarning.svelte'

  export let facility: Facility
  const dispatch = createEventDispatcher()

  $: nearbyMapsUrl = `https://www.google.com/maps/search/hiking+trails/@${facility.lat},${facility.lng},12z`
  $: reserveUrl    = `https://www.recreation.gov/camping/campgrounds/${facility.ridb_id}`
  $: feeStr = facility.fee_min == null ? 'Fee unknown'
            : facility.fee_min === 0   ? 'Free'
            : facility.fee_min === facility.fee_max ? `$${facility.fee_min}/night`
            : `$${facility.fee_min}–$${facility.fee_max}/night`
</script>

<aside class="panel">
  <button class="close-btn" on:click={() => dispatch('close')} aria-label="Close">✕</button>

  <div class="panel-content">
    <header>
      <h2>{facility.name}</h2>
      <p class="meta">{facility.forest}{facility.district ? ` · ${facility.district}` : ''}</p>
      <p class="fee">{feeStr}</p>
    </header>

    <FCFSBadge fcfs_total={facility.fcfs_total} reservable_total={facility.reservable_total}
               is_fully_fcfs={facility.is_fully_fcfs} />

    <AmenityGrid amenities={facility.amenities} />

    <AlertsSection facilityId={facility.id} />

    {#if facility.ridb_data_quality !== 'rich'}
      <DataQualityWarning quality={facility.ridb_data_quality} fsUrl={facility.fs_url} />
    {/if}

    <div class="links">
      {#if facility.fs_url}
        <a href={facility.fs_url} target="_blank" rel="noopener">View on fs.usda.gov ↗</a>
      {/if}
      <a href={reserveUrl} target="_blank" rel="noopener">Reserve on recreation.gov ↗</a>
      <a href={nearbyMapsUrl} target="_blank" rel="noopener">Nearby activities (Google Maps) ↗</a>
    </div>
  </div>
</aside>

<style>
  .panel {
    position: fixed;
    background: white;
    overflow-y: auto;
    z-index: 2000;
    box-shadow: -2px 0 12px rgba(0,0,0,0.15);

    /* Desktop: right panel */
    top: 0; right: 0; bottom: 0;
    width: min(420px, 100vw);
  }

  @media (max-width: 640px) {
    /* Mobile: bottom sheet */
    .panel { top: 40%; left: 0; right: 0; bottom: 0; width: 100%; border-radius: 16px 16px 0 0; }
  }

  .close-btn {
    position: sticky; top: 0; float: right;
    background: none; border: none; font-size: 1.2rem; cursor: pointer;
    padding: 1rem; z-index: 1;
  }
  .panel-content { padding: 1rem 1.25rem 2rem; }
  h2 { margin: 0 0 .25rem; font-size: 1.2rem; }
  .meta { margin: 0; color: #666; font-size: .9rem; }
  .fee { margin: .5rem 0 0; font-weight: 600; }
  .links { display: flex; flex-direction: column; gap: .5rem; margin-top: 1rem; font-size: .9rem; }
  .links a { color: #16a34a; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(frontend): detail panel shell (slide-in desktop, bottom sheet mobile)"
```

---

### Task 21: FCFS badge + amenity grid

**Files:**
- Create: `frontend/src/lib/detail/FCFSBadge.svelte`
- Create: `frontend/src/lib/detail/AmenityGrid.svelte`
- Create: `frontend/src/lib/detail/DataQualityWarning.svelte`

- [ ] **Step 1: Write FCFSBadge.svelte**

```svelte
<!-- frontend/src/lib/detail/FCFSBadge.svelte -->
<script lang="ts">
  export let fcfs_total: number
  export let reservable_total: number
  export let is_fully_fcfs: boolean

  $: total = fcfs_total + reservable_total
  $: label = total === 0 ? 'Site data unavailable'
           : is_fully_fcfs ? `${fcfs_total}/${total} First-Come, First-Serve`
           : `${fcfs_total}/${total} FCFS sites`
  $: color = is_fully_fcfs ? 'green' : fcfs_total > 0 ? 'yellow' : 'blue'
</script>

<div class="badge badge-{color}">
  {label}
</div>

<style>
  .badge { display: inline-block; padding: .35rem .75rem; border-radius: 20px; font-size: .85rem; font-weight: 600; margin: .75rem 0; }
  .badge-green  { background: #dcfce7; color: #15803d; }
  .badge-yellow { background: #fef9c3; color: #a16207; }
  .badge-blue   { background: #dbeafe; color: #1d4ed8; }
</style>
```

- [ ] **Step 2: Write AmenityGrid.svelte**

```svelte
<!-- frontend/src/lib/detail/AmenityGrid.svelte -->
<script lang="ts">
  import type { Amenities } from '$lib/types'
  export let amenities: Amenities

  $: items = [
    { icon: '💧', label: 'Potable Water',  show: amenities.potableWater },
    { icon: amenities.toiletType === 'flush' ? '🚽' : '🪣',
      label: amenities.toiletType === 'flush' ? 'Flush Toilet'
           : amenities.toiletType === 'vault' ? 'Vault Toilet'
           : amenities.toiletType === 'none'  ? 'No Toilet' : null,
      show: amenities.toiletType !== 'unknown' },
    { icon: '🐻', label: 'Bear Boxes',     show: amenities.bearBoxes },
    { icon: '🚗', label: 'Drive-up',       show: amenities.driveUp },
    { icon: '📏', label: `Max RV: ${amenities.maxRvLength}ft`, show: amenities.maxRvLength != null },
    { icon: '⚡', label: 'Electric',       show: amenities.electricHookups },
    { icon: '🐕', label: 'Pets OK',        show: amenities.petsAllowed },
    { icon: '🔥', label: 'Fire Rings',     show: amenities.fireRings },
    { icon: '🪑', label: 'Picnic Tables',  show: amenities.picnicTables },
    { icon: '♿', label: 'Accessible',     show: amenities.accessible },
  ].filter(i => i.show && i.label)
</script>

{#if items.length > 0}
  <div class="grid">
    {#each items as item}
      <div class="item">
        <span class="icon">{item.icon}</span>
        <span class="label">{item.label}</span>
      </div>
    {/each}
  </div>
{:else}
  <p class="empty">Amenity details not available</p>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: .5rem; margin: .75rem 0; }
  .item { display: flex; align-items: center; gap: .4rem; font-size: .82rem; background: #f8f8f8; padding: .4rem .6rem; border-radius: 8px; }
  .icon { font-size: 1rem; }
  .empty { color: #999; font-size: .85rem; }
</style>
```

- [ ] **Step 3: Write DataQualityWarning.svelte**

```svelte
<!-- frontend/src/lib/detail/DataQualityWarning.svelte -->
<script lang="ts">
  export let quality: 'sparse' | 'unknown'
  export let fsUrl: string
</script>

<div class="warning">
  ⚠️ Limited data available for this campground.
  {#if fsUrl}
    <a href={fsUrl} target="_blank" rel="noopener">Check the official page</a> for full details.
  {:else}
    Check the fs.usda.gov page for full details.
  {/if}
</div>

<style>
  .warning { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: .6rem .85rem; font-size: .85rem; margin: .75rem 0; }
  a { color: #92400e; }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/detail/FCFSBadge.svelte frontend/src/lib/detail/AmenityGrid.svelte frontend/src/lib/detail/DataQualityWarning.svelte
git commit -m "feat(frontend): FCFS badge, amenity icon grid, data quality warning"
```

---

### Task 22: Alert scraping API route

**Files:**
- Create: `frontend/src/routes/api/alerts/[id]/+server.ts`

- [ ] **Step 1: Install node-html-parser**

```bash
cd frontend && pnpm add node-html-parser
```

- [ ] **Step 2: Write the alerts server route**

This route uses `TB_SERVICE_TOKEN` (private env var) to write alert cache records, since `alerts.createRule` is `'false'` for public users.

```typescript
// frontend/src/routes/api/alerts/[id]/+server.ts
import { json } from '@sveltejs/kit'
import { parse } from 'node-html-parser'
import { PUBLIC_TB_URL } from '$env/static/public'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import type { RequestHandler } from './$types'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const tbHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TB_SERVICE_TOKEN}`,
}

export const GET: RequestHandler = async ({ params }) => {
  const facilityId = params.id
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString()

  // Check 24hr cache (public read — no auth needed)
  const cacheRes = await fetch(`${PUBLIC_TB_URL}/api/v1/table/alerts/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `facility_id == '${facilityId}' && scraped_at >= '${cutoff}'`, limit: 1 }),
  })
  const cache = await cacheRes.json() as { items?: Array<{ content: string; scraped_at: string }> }

  if (cache.items?.length) {
    return json({ content: cache.items[0].content, scraped_at: cache.items[0].scraped_at, cached: true })
  }

  // Look up fs_url (public read)
  const facRes = await fetch(`${PUBLIC_TB_URL}/api/v1/table/facilities/view/${facilityId}`)
  const facility = facRes.ok ? await facRes.json() as { fs_url?: string } : null

  if (!facility?.fs_url) return json({ content: null, scraped_at: null })

  // Scrape fs.usda.gov
  let content: string | null = null
  try {
    const res = await fetch(facility.fs_url, {
      headers: { 'User-Agent': 'CampFinder/1.0 (campground info aggregator)' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const root = parse(await res.text())
      root.querySelectorAll('nav, footer, script, style, header').forEach(el => el.remove())

      const texts = [
        ...root.querySelectorAll('.usa-alert__text'),
        ...root.querySelectorAll('[class*="alert"]'),
        ...root.querySelectorAll('[class*="closure"]'),
        ...root.querySelectorAll('[class*="notice"]'),
      ]
        .map(el => el.text.trim())
        .filter(t => t.length > 15)
        .filter((t, i, a) => a.indexOf(t) === i)

      content = texts.join('\n\n') || null
    }
  } catch { /* fail gracefully */ }

  const scraped_at = new Date().toISOString()

  // Upsert cache via service token
  const existingRes = await fetch(`${PUBLIC_TB_URL}/api/v1/table/alerts/list`, {
    method: 'POST',
    headers: tbHeaders,
    body: JSON.stringify({ where: `facility_id == '${facilityId}'`, limit: 1 }),
  })
  const existing = await existingRes.json() as { items?: Array<{ id: string }> }

  if (existing.items?.length) {
    await fetch(`${PUBLIC_TB_URL}/api/v1/table/alerts/edit/${existing.items[0].id}`, {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ content, scraped_at }),
    })
  } else {
    await fetch(`${PUBLIC_TB_URL}/api/v1/table/alerts/insert`, {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ values: { facility_id: facilityId, content, scraped_at } }),
    })
  }

  return json({ content, scraped_at, cached: false })
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/api/alerts/ frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): on-demand alert scraping with 24hr PocketBase cache"
```

---

### Task 23: Alerts section component

**Files:**
- Create: `frontend/src/lib/detail/AlertsSection.svelte`

- [ ] **Step 1: Write AlertsSection.svelte**

```svelte
<!-- frontend/src/lib/detail/AlertsSection.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'

  export let facilityId: string

  let loading = true
  let content: string | null = null
  let scraped_at: string | null = null
  let error = false

  onMount(async () => {
    try {
      const res = await fetch(`/api/alerts/${facilityId}`)
      const data = await res.json()
      content = data.content
      scraped_at = data.scraped_at
    } catch {
      error = true
    } finally {
      loading = false
    }
  })

  $: dateStr = scraped_at ? new Date(scraped_at).toLocaleDateString() : ''
</script>

<section class="alerts">
  <h3>Alerts & Closures</h3>

  {#if loading}
    <p class="status">Checking for alerts…</p>
  {:else if error}
    <p class="status error">Could not load alerts. Check the official page for current conditions.</p>
  {:else if content}
    <div class="content">{content}</div>
    <p class="timestamp">Last checked: {dateStr}</p>
  {:else}
    <p class="status">No active alerts found.</p>
  {/if}
</section>

<style>
  .alerts { margin: 1rem 0; }
  h3 { font-size: .95rem; margin: 0 0 .5rem; }
  .status { color: #666; font-size: .85rem; }
  .error { color: #dc2626; }
  .content { background: #fef2f2; border-left: 3px solid #ef4444; padding: .6rem .85rem; border-radius: 0 8px 8px 0; font-size: .85rem; white-space: pre-wrap; }
  .timestamp { color: #999; font-size: .75rem; margin: .25rem 0 0; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/detail/AlertsSection.svelte
git commit -m "feat(frontend): on-demand alerts section with loading state"
```

---

## Phase 4: Filter/Sort Sidebar + List View

### Task 24: Filter store

**Files:**
- Create: `frontend/src/lib/filters/filterStore.ts`

- [ ] **Step 1: Write the filter store**

```typescript
// frontend/src/lib/filters/filterStore.ts
import { writable, derived } from 'svelte/store'
import type { Facility } from '$lib/types'
import { facilities } from '$lib/map/mapStore'

export interface FilterState {
  fcfsOnly: boolean
  water: boolean
  toilets: boolean
  bearBoxes: boolean
  petsAllowed: boolean
  maxFee: number | null       // null = no max
  sortBy: 'name' | 'fee' | 'fcfs_count'
}

export const filters = writable<FilterState>({
  fcfsOnly: false, water: false, toilets: false,
  bearBoxes: false, petsAllowed: false,
  maxFee: null, sortBy: 'name',
})

export const filteredFacilities = derived([facilities, filters], ([$facilities, $filters]) => {
  let results = $facilities.filter(f => {
    if ($filters.fcfsOnly  && f.fcfs_total === 0)           return false
    if ($filters.water     && !f.amenities.potableWater)    return false
    if ($filters.toilets   && f.amenities.toiletType === 'none') return false
    if ($filters.bearBoxes && !f.amenities.bearBoxes)       return false
    if ($filters.petsAllowed && !f.amenities.petsAllowed)   return false
    if ($filters.maxFee != null && f.fee_min != null && f.fee_min > $filters.maxFee) return false
    return true
  })

  if ($filters.sortBy === 'fee') {
    results.sort((a, b) => (a.fee_min ?? 999) - (b.fee_min ?? 999))
  } else if ($filters.sortBy === 'fcfs_count') {
    results.sort((a, b) => b.fcfs_total - a.fcfs_total)
  } else {
    results.sort((a, b) => a.name.localeCompare(b.name))
  }

  return results
})
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/filters/filterStore.ts
git commit -m "feat(frontend): filter and sort store"
```

---

### Task 25: Filter sidebar component

**Files:**
- Create: `frontend/src/lib/filters/FilterSidebar.svelte`

- [ ] **Step 1: Write FilterSidebar.svelte**

```svelte
<!-- frontend/src/lib/filters/FilterSidebar.svelte -->
<script lang="ts">
  import { filters } from './filterStore'
</script>

<aside class="sidebar">
  <h3>Filters</h3>

  <label><input type="checkbox" bind:checked={$filters.fcfsOnly}> First-Come Only</label>
  <label><input type="checkbox" bind:checked={$filters.water}> Potable Water</label>
  <label><input type="checkbox" bind:checked={$filters.toilets}> Has Toilets</label>
  <label><input type="checkbox" bind:checked={$filters.bearBoxes}> Bear Boxes</label>
  <label><input type="checkbox" bind:checked={$filters.petsAllowed}> Pets Allowed</label>

  <div class="field">
    <label>Max fee/night</label>
    <input type="number" min="0" step="5" placeholder="Any"
      value={$filters.maxFee ?? ''}
      on:input={e => filters.update(f => ({ ...f, maxFee: e.currentTarget.value ? +e.currentTarget.value : null }))} />
  </div>

  <div class="field">
    <label>Sort by</label>
    <select bind:value={$filters.sortBy}>
      <option value="name">Name</option>
      <option value="fee">Fee (low to high)</option>
      <option value="fcfs_count">FCFS sites (most first)</option>
    </select>
  </div>
</aside>

<style>
  .sidebar { width: 220px; padding: 1rem; background: #fafafa; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: .65rem; }
  h3 { margin: 0 0 .5rem; font-size: .95rem; }
  label { display: flex; align-items: center; gap: .5rem; font-size: .875rem; cursor: pointer; }
  .field { display: flex; flex-direction: column; gap: .25rem; font-size: .875rem; }
  input[type=number], select { border: 1px solid #d1d5db; border-radius: 6px; padding: .35rem .5rem; font-size: .875rem; }

  @media (max-width: 640px) {
    .sidebar { width: 100%; border-right: none; border-bottom: 1px solid #e5e7eb; flex-direction: row; flex-wrap: wrap; }
  }
</style>
```

- [ ] **Step 2: Wire FilterSidebar into +page.svelte and update renderPins to use filteredFacilities**

Modify `frontend/src/routes/+page.svelte` — replace `$facilities` references in pin rendering with `$filteredFacilities`:

```svelte
<script lang="ts">
  // Add to existing imports:
  import FilterSidebar from '$lib/filters/FilterSidebar.svelte'
  import { filteredFacilities } from '$lib/filters/filterStore'

  // Update: whenever filteredFacilities changes, re-render pins
  $: if (campMap) campMap.renderPins($filteredFacilities)
</script>

<!-- Add to template before map-wrap: -->
<FilterSidebar />
```

- [ ] **Step 3: Verify filters work in browser**

Load the map, search an area, then toggle "First-Come Only" — pins should filter reactively.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/filters/ frontend/src/routes/+page.svelte
git commit -m "feat(frontend): filter sidebar with reactive pin updates"
```

---

## Phase 5: Compare View

### Task 26: Compare store (URL-synced, max 4)

**Files:**
- Create: `frontend/src/lib/compare/compareStore.ts`

- [ ] **Step 1: Write compareStore.ts**

```typescript
// frontend/src/lib/compare/compareStore.ts
import { writable, derived } from 'svelte/store'
import { browser } from '$app/environment'
import { page } from '$app/stores'

const MAX = 4

function createCompareStore() {
  const { subscribe, set, update } = writable<string[]>([])

  return {
    subscribe,
    add(id: string) {
      update(ids => ids.includes(id) || ids.length >= MAX ? ids : [...ids, id])
    },
    remove(id: string) {
      update(ids => ids.filter(i => i !== id))
    },
    clear() { set([]) },
    getShareUrl(ids: string[]) {
      if (!browser) return ''
      return `${window.location.origin}/compare?ids=${ids.join(',')}`
    },
  }
}

export const compareIds = createCompareStore()
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/compare/compareStore.ts
git commit -m "feat(frontend): compare store (max 4 campgrounds)"
```

---

### Task 27: Compare page

**Files:**
- Create: `frontend/src/routes/compare/+page.svelte`
- Create: `frontend/src/routes/compare/+page.server.ts`
- Create: `frontend/src/lib/compare/CompareView.svelte`

- [ ] **Step 1: Write +page.server.ts**

```typescript
// frontend/src/routes/compare/+page.server.ts
import PocketBase from 'pocketbase'
import { PUBLIC_PB_URL } from '$env/static/public'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ url }) => {
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4)
  if (ids.length === 0) return { facilities: [] }

  const pb = new PocketBase(PUBLIC_PB_URL)
  const filter = ids.map(id => `id = "${id}"`).join(' || ')
  const facilities = await pb.collection('facilities').getFullList({ filter })

  return { facilities }
}
```

- [ ] **Step 2: Write CompareView.svelte**

```svelte
<!-- frontend/src/lib/compare/CompareView.svelte -->
<script lang="ts">
  import type { Facility } from '$lib/types'
  export let facilities: Facility[]

  const rows: Array<{ label: string; key: (f: Facility) => string }> = [
    { label: 'Forest',       key: f => f.forest || '—' },
    { label: 'FCFS Sites',   key: f => f.fcfs_total > 0 ? `${f.fcfs_total}/${f.fcfs_total + f.reservable_total}` : 'None' },
    { label: 'Fee/night',    key: f => f.fee_min == null ? '?' : f.fee_min === 0 ? 'Free' : `$${f.fee_min}` },
    { label: 'Water',        key: f => f.amenities.potableWater ? '✓' : '—' },
    { label: 'Toilet',       key: f => f.amenities.toiletType === 'unknown' ? '?' : f.amenities.toiletType },
    { label: 'Bear Boxes',   key: f => f.amenities.bearBoxes ? '✓' : '—' },
    { label: 'Pets',         key: f => f.amenities.petsAllowed ? '✓' : '—' },
    { label: 'Max RV',       key: f => f.amenities.maxRvLength ? `${f.amenities.maxRvLength}ft` : '—' },
    { label: 'Electric',     key: f => f.amenities.electricHookups ? '✓' : '—' },
    { label: 'Fire Rings',   key: f => f.amenities.fireRings ? '✓' : '—' },
    { label: 'Accessible',   key: f => f.amenities.accessible ? '✓' : '—' },
  ]
</script>

<div class="compare-wrap">
  <table>
    <thead>
      <tr>
        <th></th>
        {#each facilities as f}
          <th><a href={f.fs_url || '#'} target="_blank">{f.name}</a></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        {@const values = facilities.map(f => row.key(f))}
        {@const allSame = new Set(values).size === 1}
        <tr class:highlight={!allSame}>
          <td class="row-label">{row.label}</td>
          {#each values as v}
            <td>{v}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .compare-wrap { overflow-x: auto; padding: 1rem; }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; }
  th, td { padding: .6rem .85rem; border: 1px solid #e5e7eb; text-align: left; }
  th { background: #f9fafb; font-weight: 600; }
  .row-label { color: #6b7280; font-weight: 500; white-space: nowrap; }
  tr.highlight td { background: #fefce8; }
</style>
```

- [ ] **Step 3: Write +page.svelte**

```svelte
<!-- frontend/src/routes/compare/+page.svelte -->
<script lang="ts">
  import CompareView from '$lib/compare/CompareView.svelte'
  import type { PageData } from './$types'
  export let data: PageData
</script>

<svelte:head><title>Compare Campgrounds — CampFinder</title></svelte:head>

<main style="max-width: 900px; margin: 0 auto; padding: 1rem">
  <a href="/" style="font-size:.875rem; color:#16a34a">← Back to map</a>
  <h1 style="font-size:1.25rem; margin:.75rem 0">Compare Campgrounds</h1>

  {#if data.facilities.length === 0}
    <p>No campgrounds selected. Add campgrounds to compare from the map.</p>
  {:else}
    <CompareView facilities={data.facilities} />
  {/if}
</main>
```

- [ ] **Step 4: Add "Add to Compare" button to DetailPanel**

In `DetailPanel.svelte`, add after the FCFS badge:

```svelte
<script lang="ts">
  import { compareIds } from '$lib/compare/compareStore'
  // ...existing imports
  $: isComparing = $compareIds.includes(facility.id)
</script>

<!-- Add after FCFSBadge: -->
<button
  class="compare-btn"
  on:click={() => isComparing ? compareIds.remove(facility.id) : compareIds.add(facility.id)}
>
  {isComparing ? '✓ In Compare' : '+ Compare'}
</button>

{#if $compareIds.length >= 2}
  <a class="compare-link" href="/compare?ids={$compareIds.join(',')}">
    View comparison ({$compareIds.length} campgrounds) →
  </a>
{/if}
```

Add to `DetailPanel.svelte` `<style>`:
```css
.compare-btn { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: .4rem .85rem; cursor: pointer; font-size: .85rem; }
.compare-link { display: block; color: #16a34a; font-size: .875rem; margin: .5rem 0; }
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/compare/ frontend/src/lib/compare/ frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(frontend): compare view with shareable URL"
```

---

## Phase 6: Auth + Saved Campgrounds

### Task 28: Auth store

**Files:**
- Create: `frontend/src/lib/auth/authStore.ts`

Teenybase auth returns a JWT + refresh token. We store the JWT in localStorage and attach it as `Authorization: Bearer <token>` on privileged requests. The cookie (`teeny_auth`) is set automatically by the auth extension for SSR use.

- [ ] **Step 1: Write authStore.ts**

```typescript
// frontend/src/lib/auth/authStore.ts
import { writable, derived } from 'svelte/store'
import { browser } from '$app/environment'
import { PUBLIC_TB_URL } from '$env/static/public'

interface AuthModel { id: string; email: string; name?: string }
interface AuthState { model: AuthModel | null; token: string | null }

function loadStored(): AuthState {
  if (!browser) return { model: null, token: null }
  try {
    const raw = localStorage.getItem('cf_auth')
    return raw ? JSON.parse(raw) : { model: null, token: null }
  } catch { return { model: null, token: null } }
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(loadStored())

  function persist(state: AuthState) {
    if (browser) localStorage.setItem('cf_auth', JSON.stringify(state))
    set(state)
  }

  async function authRequest(path: string, body: Record<string, string>) {
    const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/users/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json() as { message?: string }
      throw new Error(err.message ?? 'Authentication failed')
    }
    return res.json() as Promise<{ token: string; record: AuthModel }>
  }

  return {
    subscribe,
    async login(email: string, password: string) {
      const data = await authRequest('login-password', { identity: email, password })
      persist({ model: data.record, token: data.token })
    },
    async register(email: string, password: string) {
      await authRequest('sign-up', { email, password, passwordConfirm: password })
      const data = await authRequest('login-password', { identity: email, password })
      persist({ model: data.record, token: data.token })
    },
    logout() {
      if (browser) localStorage.removeItem('cf_auth')
      set({ model: null, token: null })
    },
    getToken(): string | null {
      let t: string | null = null
      update(s => { t = s.token; return s })
      return t
    },
  }
}

export const auth = createAuthStore()
export const isLoggedIn = derived(auth, $auth => $auth.model != null)
export const currentUser = derived(auth, $auth => $auth.model)
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/auth/authStore.ts
git commit -m "feat(frontend): JWT auth store for Teenybase"
```

---

### Task 29: Auth modal + saved campgrounds

**Files:**
- Create: `frontend/src/lib/auth/AuthModal.svelte`
- Create: `frontend/src/lib/saved/SaveButton.svelte`
- Create: `frontend/src/routes/api/saved/+server.ts`

- [ ] **Step 1: Write AuthModal.svelte**

```svelte
<!-- frontend/src/lib/auth/AuthModal.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { auth } from './authStore'

  const dispatch = createEventDispatcher()
  let mode: 'login' | 'register' = 'login'
  let email = '', password = '', error = ''

  async function submit() {
    error = ''
    try {
      if (mode === 'login') await auth.login(email, password)
      else await auth.register(email, password)
      dispatch('close')
    } catch (e: any) {
      error = e?.message ?? 'Authentication failed'
    }
  }
</script>

<div class="overlay" on:click|self={() => dispatch('close')}>
  <div class="modal">
    <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>

    <input type="email"    bind:value={email}    placeholder="Email" />
    <input type="password" bind:value={password} placeholder="Password" />

    {#if error}<p class="error">{error}</p>{/if}

    <button on:click={submit}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>

    <button class="toggle" on:click={() => mode = mode === 'login' ? 'register' : 'login'}>
      {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
    </button>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 3000; display: grid; place-items: center; }
  .modal { background: white; border-radius: 12px; padding: 2rem; width: min(380px, 90vw); display: flex; flex-direction: column; gap: .75rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  input { border: 1px solid #d1d5db; border-radius: 8px; padding: .6rem .85rem; font-size: .95rem; }
  button { background: #16a34a; color: white; border: none; border-radius: 8px; padding: .65rem; cursor: pointer; font-size: .95rem; font-weight: 600; }
  .toggle { background: none; color: #6b7280; font-weight: 400; font-size: .875rem; padding: 0; }
  .error { color: #dc2626; font-size: .85rem; margin: 0; }
</style>
```

- [ ] **Step 2: Write SaveButton.svelte**

```svelte
<!-- frontend/src/lib/saved/SaveButton.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { auth, isLoggedIn, currentUser } from '$lib/auth/authStore'
  import AuthModal from '$lib/auth/AuthModal.svelte'
  import { PUBLIC_TB_URL } from '$env/static/public'

  export let facilityId: string

  let saved = false
  let savedRecordId: string | null = null
  let showAuth = false

  onMount(async () => {
    if (!$isLoggedIn || !$currentUser) return
    const token = auth.getToken()
    const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/saved_campgrounds/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ where: `user_id == '${$currentUser.id}' && facility_id == '${facilityId}'`, limit: 1 }),
    })
    const data = await res.json() as { items?: Array<{ id: string }> }
    saved = (data.items?.length ?? 0) > 0
    savedRecordId = data.items?.[0]?.id ?? null
  })

  async function toggle() {
    if (!$isLoggedIn) { showAuth = true; return }
    const token = auth.getToken()
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

    if (saved && savedRecordId) {
      await fetch(`${PUBLIC_TB_URL}/api/v1/table/saved_campgrounds/delete`, {
        method: 'POST', headers,
        body: JSON.stringify({ where: `id == '${savedRecordId}'` }),
      })
      saved = false; savedRecordId = null
    } else {
      const rec = await fetch(`${PUBLIC_TB_URL}/api/v1/table/saved_campgrounds/insert`, {
        method: 'POST', headers,
        body: JSON.stringify({ values: { user_id: $currentUser!.id, facility_id: facilityId } }),
      }).then(r => r.json()) as { id: string }
      saved = true; savedRecordId = rec.id
    }
  }
</script>

<button class="save-btn" class:saved on:click={toggle}>
  {saved ? '★ Saved' : '☆ Save'}
</button>

{#if showAuth}
  <AuthModal on:close={() => showAuth = false} />
{/if}

<style>
  .save-btn { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: .4rem .85rem; cursor: pointer; font-size: .85rem; }
  .save-btn.saved { background: #fef9c3; border-color: #fbbf24; }
</style>
```

- [ ] **Step 3: Add SaveButton to DetailPanel**

In `frontend/src/lib/detail/DetailPanel.svelte`, import and add:

```svelte
<script lang="ts">
  import SaveButton from '$lib/saved/SaveButton.svelte'
  // ...
</script>

<!-- Add in the header section, after .fee: -->
<SaveButton facilityId={facility.id} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/auth/ frontend/src/lib/saved/ frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(frontend): auth modal and save campground button"
```

---

## Phase 7: Ratings & Reviews

### Task 30: Ratings API route

**Files:**
- Create: `frontend/src/routes/api/ratings/[facilityId]/+server.ts`

For GET (public reads), no auth needed. For POST, forward the user's JWT to Teenybase — row-level security (`createRule: 'auth.uid != null'`) validates it server-side.

- [ ] **Step 1: Write the ratings route**

```typescript
// frontend/src/routes/api/ratings/[facilityId]/+server.ts
import { json } from '@sveltejs/kit'
import { PUBLIC_TB_URL } from '$env/static/public'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/ratings/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      where: `facility_id == '${params.facilityId}'`,
      order: 'created desc',
      limit: 50,
    }),
  })
  const data = await res.json() as { items?: unknown[] }
  return json(data.items ?? [])
}

export const POST: RequestHandler = async ({ params, request }) => {
  // Forward the user's JWT — Teenybase enforces createRule: 'auth.uid != null'
  const token = request.headers.get('Authorization')
  if (!token) return json({ error: 'Unauthenticated' }, { status: 401 })

  const { score, notes, visited_at, user_id } = await request.json() as Record<string, unknown>
  if (!score || Number(score) < 1 || Number(score) > 5) {
    return json({ error: 'Score must be 1–5' }, { status: 400 })
  }

  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/ratings/insert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({
      values: {
        facility_id: params.facilityId,
        user_id,
        score: Number(score),
        notes: notes ?? '',
        visited_at: visited_at ?? '',
      },
    }),
  })

  const data = await res.json()
  return json(data, { status: res.ok ? 201 : res.status })
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/routes/api/ratings/
git commit -m "feat(frontend): ratings GET/POST API route (auth required for POST)"
```

---

### Task 31: Ratings display + submit form

**Files:**
- Create: `frontend/src/lib/detail/RatingsSection.svelte`

- [ ] **Step 1: Write RatingsSection.svelte**

```svelte
<!-- frontend/src/lib/detail/RatingsSection.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { auth } from '$lib/auth/authStore'
  import AuthModal from '$lib/auth/AuthModal.svelte'
  import type { Rating } from '$lib/types'

  export let facilityId: string

  let ratings: Rating[] = []
  let showAuth = false
  let score = 0
  let notes = ''
  let visited_at = ''
  let submitting = false

  onMount(loadRatings)

  async function loadRatings() {
    const res = await fetch(`/api/ratings/${facilityId}`)
    ratings = await res.json()
  }

  $: avgScore = ratings.length
    ? (ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1)
    : null

  async function submit() {
    if (!$auth) { showAuth = true; return }
    if (score < 1 || score > 5) return
    submitting = true
    await fetch(`/api/ratings/${facilityId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, notes, visited_at }),
    })
    score = 0; notes = ''; visited_at = ''
    await loadRatings()
    submitting = false
  }
</script>

<section class="ratings">
  <h3>
    Community Ratings
    {#if avgScore}<span class="avg">★ {avgScore} ({ratings.length})</span>{/if}
  </h3>

  {#each ratings as r}
    <div class="rating-row">
      <span class="stars">{'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}</span>
      {#if r.visited_at}<span class="date">{r.visited_at}</span>{/if}
      {#if r.notes}<p class="notes">{r.notes}</p>{/if}
    </div>
  {/each}

  {#if ratings.length === 0}<p class="empty">No reviews yet.</p>{/if}

  <div class="form">
    <p class="form-label">Leave a review</p>
    <div class="star-pick">
      {#each [1,2,3,4,5] as s}
        <button class:active={s <= score} on:click={() => score = s}>{s <= score ? '★' : '☆'}</button>
      {/each}
    </div>
    <input type="date" bind:value={visited_at} placeholder="Date visited" />
    <textarea bind:value={notes} placeholder="Notes (optional)" rows="2"></textarea>
    <button class="submit-btn" on:click={submit} disabled={submitting || score === 0}>
      {$auth ? (submitting ? 'Submitting…' : 'Submit review') : 'Sign in to review'}
    </button>
  </div>
</section>

{#if showAuth}
  <AuthModal on:close={() => showAuth = false} />
{/if}

<style>
  .ratings { margin: 1rem 0; }
  h3 { font-size: .95rem; margin: 0 0 .5rem; display: flex; align-items: center; gap: .5rem; }
  .avg { color: #ca8a04; font-size: .85rem; }
  .rating-row { border-bottom: 1px solid #f3f4f6; padding: .5rem 0; font-size: .85rem; }
  .stars { color: #f59e0b; }
  .date { color: #9ca3af; font-size: .8rem; margin-left: .5rem; }
  .notes { margin: .25rem 0 0; color: #374151; }
  .empty { color: #9ca3af; font-size: .85rem; }
  .form { margin-top: 1rem; display: flex; flex-direction: column; gap: .5rem; }
  .form-label { font-size: .85rem; font-weight: 600; margin: 0; }
  .star-pick { display: flex; gap: .25rem; }
  .star-pick button { background: none; border: none; font-size: 1.4rem; cursor: pointer; color: #d1d5db; padding: 0; }
  .star-pick button.active { color: #f59e0b; }
  textarea, input[type=date] { border: 1px solid #d1d5db; border-radius: 8px; padding: .5rem .75rem; font-size: .875rem; resize: vertical; }
  .submit-btn { background: #16a34a; color: white; border: none; border-radius: 8px; padding: .55rem; cursor: pointer; font-size: .875rem; font-weight: 600; }
  .submit-btn:disabled { opacity: .6; cursor: default; }
</style>
```

- [ ] **Step 2: Add RatingsSection to DetailPanel**

In `DetailPanel.svelte`, after the links section:

```svelte
<script lang="ts">
  import RatingsSection from './RatingsSection.svelte'
</script>

<!-- Add after .links div: -->
<RatingsSection facilityId={facility.id} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/detail/RatingsSection.svelte frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(frontend): ratings display and submission form (auth required)"
```

---

## Deployment Checklist

### Teenybase backend (Cloudflare Workers + D1)

- [ ] `teeny register` — create free Teenybase Cloud account (no credit card)
- [ ] Copy `.dev.vars` → `.prod.vars`, replace all values with strong secrets
- [ ] `teeny secrets --remote --upload` — push `.prod.vars` to production
- [ ] `teeny deploy --remote` — deploys to Cloudflare Workers
- [ ] `teeny status` — note the deployed URL (e.g. `https://campfinder.your-account.workers.dev`)
- [ ] Update ETL `.env`: set `TB_API_URL` and `TB_SERVICE_TOKEN` to production values
- [ ] Run ETL against production: `cd etl && pnpm sync`

### Cloudflare Pages (frontend)

- [ ] Push repo to GitHub
- [ ] Connect repo in Cloudflare Pages dashboard
- [ ] Build command: `cd frontend && pnpm build`
- [ ] Build output: `frontend/.svelte-kit/cloudflare`
- [ ] Add environment variables:
  - `PUBLIC_TB_URL=https://campfinder.your-account.workers.dev`
  - `TB_SERVICE_TOKEN=<same value as .prod.vars ADMIN_SERVICE_TOKEN>`

---

## Self-Review Against Spec

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Map-first UI | Task 17, 18 |
| "Search this area" button | Task 18 |
| Campground pins, FCFS colors | Task 17 |
| FCFS breakdown per campground | Tasks 8, 21 |
| Amenity icon grid | Task 21 |
| Fee display | Task 20 |
| Link to fs.usda.gov | Task 20 |
| On-demand alert scraping | Tasks 22, 23 |
| Low data quality warning | Task 21 |
| Responsive + mobile-first | Tasks 20, 21 (CSS media queries) |
| Nearby Activities Google Maps link | Task 20 |
| Filter/sort sidebar | Tasks 24, 25 |
| URL-shareable compare | Tasks 26, 27 |
| Compare view | Task 27 |
| User auth | Tasks 28, 29 |
| Saved campgrounds | Task 29 |
| Ratings/reviews | Tasks 30, 31 |
| PWA | Task 19 |
| ETL pipeline | Tasks 1–12 |
| Pin clustering | Task 17 |

**Gaps identified and resolved:**
- Pin clustering: included in Task 17 via `leaflet.markercluster`
- USGS topo WMS layer: spec lists as "nice to have" — omitted from this plan; add as a toggleable layer by adding a second `L.tileLayer` for `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}` when desired
- List view alongside map: mentioned in Phase 4 spec item but not fully implemented — add a toggleable `<ul>` of `$filteredFacilities` in `+page.svelte` when ready
