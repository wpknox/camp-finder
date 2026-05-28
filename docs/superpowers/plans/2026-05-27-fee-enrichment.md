# Fee Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich existing campground records with fee data by scanning all available RIDB text fields first, then scraping fs.usda.gov pages for facilities that have a URL stored.

**Architecture:** Three-tier fallback in the ETL: (1) `FacilityUseFeeDescription` via existing `extractFees`, (2) `FacilityDescription` text via new `extractFeesFromDescription` in `normalize.ts`, (3) fs.usda.gov HTML scrape via new `fsScraper.ts` module. A new pure function `parseFsPageFees(html)` keeps the scraper testable without HTTP. The frontend detail panel gains a "check recreation.gov" link when fees are still unknown.

**Tech Stack:** Node/TypeScript, `node-html-parser` (new ETL dep), vitest (existing), SvelteKit (frontend hint)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `etl/package.json` | Modify | Add `node-html-parser` runtime dep |
| `etl/src/normalize.ts` | Modify | Add `extractFeesFromDescription(description: string)` |
| `etl/tests/normalize.test.ts` | Modify | Tests for `extractFeesFromDescription` |
| `etl/src/fsScraper.ts` | Create | `parseFsPageFees(html)` + `scrapeFsPage(url)` |
| `etl/tests/fsScraper.test.ts` | Create | Tests for `parseFsPageFees` with fixture HTML |
| `etl/src/index.ts` | Modify | Wire three-tier fee fallback into sync loop |
| `frontend/src/lib/detail/DetailPanel.svelte` | Modify | "Fee unknown — check recreation.gov" link |

---

### Task 1: Add node-html-parser to ETL

`node-html-parser` is already used in the frontend for the alerts scraper. The ETL doesn't have it yet.

**Files:**
- Modify: `etl/package.json`

- [ ] **Step 1: Add the dependency**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm add node-html-parser
```

Expected: `node-html-parser` appears in `etl/package.json` dependencies.

- [ ] **Step 2: Verify install**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test
```

Expected: existing tests still pass (normalize and ridb tests).

- [ ] **Step 3: Commit**

```bash
git add etl/package.json etl/pnpm-lock.yaml
git commit -m "chore(etl): add node-html-parser for fs.usda.gov fee scraping"
```

---

### Task 2: extractFeesFromDescription in normalize.ts

The RIDB `FacilityDescription` is a rich HTML blob. It often mentions fees in sentences like "The camping fee is $20 per night" or "Fees range from $18–$24." We scan for dollar amounts that appear near fee-related keywords.

**Files:**
- Modify: `etl/src/normalize.ts`
- Modify: `etl/tests/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `etl/tests/normalize.test.ts` (import `extractFeesFromDescription` alongside other imports):

```typescript
import { normalizeAmenities, aggregateFcfs, scoreDataQuality, extractFees, extractFsUrl, extractFeesFromDescription } from '../src/normalize.js'
```

Then add the test suite at the bottom of the file:

```typescript
describe('extractFeesFromDescription', () => {
  it('extracts fee from a sentence with "per night"', () => {
    expect(extractFeesFromDescription('<p>The camping fee is $20 per night.</p>'))
      .toEqual({ fee_min: 20, fee_max: 20 })
  })

  it('extracts fee range from description', () => {
    expect(extractFeesFromDescription('<p>Fees range from $18 to $24 per night.</p>'))
      .toEqual({ fee_min: 18, fee_max: 24 })
  })

  it('returns free when description mentions "no fee"', () => {
    expect(extractFeesFromDescription('<p>There is no fee to camp here.</p>'))
      .toEqual({ fee_min: 0, fee_max: 0 })
  })

  it('returns null when no fee context found', () => {
    expect(extractFeesFromDescription('<p>Beautiful campground near the river.</p>'))
      .toEqual({ fee_min: null, fee_max: null })
  })

  it('returns null for empty description', () => {
    expect(extractFeesFromDescription('')).toEqual({ fee_min: null, fee_max: null })
  })

  it('ignores dollar amounts with no fee context', () => {
    // A description that mentions a dollar amount but not in a fee context
    expect(extractFeesFromDescription('<p>Over $1 million in improvements were made.</p>'))
      .toEqual({ fee_min: null, fee_max: null })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test
```

Expected: 6 new failures referencing `extractFeesFromDescription is not a function`.

- [ ] **Step 3: Implement extractFeesFromDescription in normalize.ts**

Add this function to `etl/src/normalize.ts` (after `extractFees`, before `extractFsUrl`):

```typescript
export function extractFeesFromDescription(description: string): { fee_min: number | null; fee_max: number | null } {
  if (!description) return { fee_min: null, fee_max: null }

  const text = stripHtml(description)

  // "no fee" / "free" — check before dollar extraction
  if (/no fee|free of charge|no charge/i.test(text)) return { fee_min: 0, fee_max: 0 }

  // Fee-context keywords that must appear near a dollar amount
  const feeContext = /fee|per night|camping cost|nightly rate/i

  // Split into sentences and find ones with both a dollar amount and fee context
  const sentences = text.split(/[.!?]/)
  const dollars: number[] = []

  for (const sentence of sentences) {
    if (!feeContext.test(sentence)) continue
    const matches = [...sentence.matchAll(/\$(\d+(?:\.\d+)?)/g)]
    for (const m of matches) dollars.push(parseFloat(m[1]))
  }

  if (dollars.length === 0) return { fee_min: null, fee_max: null }
  return { fee_min: Math.min(...dollars), fee_max: Math.max(...dollars) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test
```

Expected: all tests pass including the 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add etl/src/normalize.ts etl/tests/normalize.test.ts
git commit -m "feat(etl): extractFeesFromDescription scans RIDB description for fee context"
```

---

### Task 3: fsScraper.ts — parseFsPageFees and scrapeFsPage

The fs.usda.gov campground pages are static HTML. Fees typically appear in a "Fees & Reservations" section or in table cells. We extract dollar amounts that appear in fee context, mirroring the description approach but from scraped HTML.

`parseFsPageFees` is a pure function (easy to test). `scrapeFsPage` adds the HTTP fetch layer.

**Files:**
- Create: `etl/src/fsScraper.ts`
- Create: `etl/tests/fsScraper.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `etl/tests/fsScraper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseFsPageFees } from '../src/fsScraper.js'

describe('parseFsPageFees', () => {
  it('extracts fee from a table cell near "fee" heading', () => {
    const html = `
      <html><body>
        <h2>Fees &amp; Reservations</h2>
        <table>
          <tr><th>Camping Fee</th><td>$22 per night</td></tr>
        </table>
      </body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: 22, fee_max: 22 })
  })

  it('extracts fee range from prose text', () => {
    const html = `
      <html><body>
        <div class="usa-prose">
          <p>Camping fees range from $18 to $28 per night depending on site type.</p>
        </div>
      </body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: 18, fee_max: 28 })
  })

  it('returns free when page says "no fee"', () => {
    const html = `
      <html><body><p>There is no fee to use this campground.</p></body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: 0, fee_max: 0 })
  })

  it('returns nulls when no fee info found', () => {
    const html = `
      <html><body><p>Beautiful campground in the national forest.</p></body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: null, fee_max: null })
  })

  it('ignores nav/header/footer content', () => {
    const html = `
      <html><body>
        <nav><a href="#">$0 membership</a></nav>
        <header>National Forest</header>
        <main><p>Primitive camping, no fee.</p></main>
        <footer>Contact: $1-800-555-1234</footer>
      </body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: 0, fee_max: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test
```

Expected: 5 failures referencing `parseFsPageFees`.

- [ ] **Step 3: Implement fsScraper.ts**

Create `etl/src/fsScraper.ts`:

```typescript
import { parse } from 'node-html-parser'

export interface ScrapedFsData {
  fee_min: number | null
  fee_max: number | null
}

export function parseFsPageFees(html: string): ScrapedFsData {
  const root = parse(html)

  // Remove chrome — fees are in the main content
  root.querySelectorAll('nav, header, footer, script, style').forEach(el => el.remove())

  const text = root.text.replace(/\s+/g, ' ').toLowerCase()

  if (/no fee|free of charge|no charge/i.test(text)) {
    return { fee_min: 0, fee_max: 0 }
  }

  const feeContext = /fee|per night|camping cost|nightly rate/i
  const sentences = text.split(/[.!?\n]/)
  const dollars: number[] = []

  for (const sentence of sentences) {
    if (!feeContext.test(sentence)) continue
    const matches = [...sentence.matchAll(/\$(\d+(?:\.\d+)?)/g)]
    for (const m of matches) dollars.push(parseFloat(m[1]))
  }

  if (dollars.length === 0) return { fee_min: null, fee_max: null }
  return { fee_min: Math.min(...dollars), fee_max: Math.max(...dollars) }
}

export async function scrapeFsPage(url: string): Promise<ScrapedFsData> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CampFinder/1.0 (campground info aggregator)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { fee_min: null, fee_max: null }
    return parseFsPageFees(await res.text())
  } catch {
    return { fee_min: null, fee_max: null }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add etl/src/fsScraper.ts etl/tests/fsScraper.test.ts
git commit -m "feat(etl): fsScraper — parseFsPageFees and scrapeFsPage for fee extraction"
```

---

### Task 4: Wire three-tier fee fallback into ETL index.ts

The ETL loop already calls `extractFees(f.FacilityUseFeeDescription)`. We extend it: if that returns null, try `extractFeesFromDescription(detail.FacilityDescription)`. If still null and `fs_url` exists, call `scrapeFsPage`. Add a 300ms sleep between scrape calls to be polite to fs.usda.gov.

**Files:**
- Modify: `etl/src/index.ts`

- [ ] **Step 1: Update imports and add sleep helper in index.ts**

At the top of `etl/src/index.ts`, update the normalize import and add fsScraper:

```typescript
import { normalizeAmenities, parseDescriptionAmenities, aggregateFcfs, scoreDataQuality, extractFees, extractFeesFromDescription, extractFsUrl } from './normalize.js'
import { scrapeFsPage } from './fsScraper.js'
```

Add a sleep helper after the imports (before `const RIDB_API_KEY`):

```typescript
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
```

- [ ] **Step 2: Replace the fee extraction block in the main loop**

Find this block in `index.ts` (currently around line 51):

```typescript
    const fees      = extractFees(f.FacilityUseFeeDescription)
```

Replace it with:

```typescript
    let fees = extractFees(f.FacilityUseFeeDescription)

    if (fees.fee_min === null) {
      fees = extractFeesFromDescription(detail.FacilityDescription ?? '')
    }

    const fsUrl = extractFsUrl(detail.LINK ?? [])

    if (fees.fee_min === null && fsUrl) {
      fees = await scrapeFsPage(fsUrl)
      await sleep(300)
    }
```

- [ ] **Step 3: Update the normalized.push call to use fsUrl**

The `fs_url` field is currently computed inline in the push. Since we already computed `fsUrl` above, update the push block to use it (find `fs_url: extractFsUrl(detail.LINK ?? [])` and replace):

```typescript
      fs_url: fsUrl,
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add etl/src/index.ts
git commit -m "feat(etl): three-tier fee fallback — RIDB fee desc → description scan → fs.usda.gov scrape"
```

---

### Task 5: UI hint for unknown fees in DetailPanel.svelte

When `fee_min` is null the panel shows "Fee unknown" as plain text. Replace it with a link to recreation.gov so users can look up fees themselves.

**Files:**
- Modify: `frontend/src/lib/detail/DetailPanel.svelte`

- [ ] **Step 1: Update the feeStr derived value**

Find in `DetailPanel.svelte` (around line 15):

```typescript
  let feeStr = $derived(
    facility.fee_min == null ? 'Fee unknown'
    : facility.fee_min === 0   ? 'Free'
    : facility.fee_min === facility.fee_max ? `$${facility.fee_min}/night`
    : `$${facility.fee_min}–$${facility.fee_max}/night`
  )
```

Replace with:

```typescript
  let feeStr = $derived(
    facility.fee_min === 0   ? 'Free'
    : facility.fee_min != null && facility.fee_min === facility.fee_max ? `$${facility.fee_min}/night`
    : facility.fee_min != null ? `$${facility.fee_min}–$${facility.fee_max}/night`
    : null
  )
```

- [ ] **Step 2: Update the fee display in the template**

Find in the template (around line 32):

```svelte
      <p class="fee">{feeStr}</p>
```

Replace with:

```svelte
      {#if feeStr}
        <p class="fee">{feeStr}</p>
      {:else}
        <p class="fee fee-unknown">
          Fee unknown —
          <a href="https://www.recreation.gov/camping/campgrounds/{facility.ridb_id}" target="_blank" rel="noopener">
            check recreation.gov
          </a>
        </p>
      {/if}
```

- [ ] **Step 3: Add style for the fee-unknown link**

In the `<style>` block, add after `.fee { ... }`:

```css
  .fee-unknown { color: #6b7280; }
  .fee-unknown a { color: #6b7280; text-decoration: underline; }
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd /Users/wpknox/Projects/camp-finder/frontend && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/detail/DetailPanel.svelte
git commit -m "feat(frontend): fee unknown links to recreation.gov for manual lookup"
```

---

### Task 6: Smoke test the full ETL (optional — requires local backend running)

This confirms the three-tier fee fallback works end-to-end on real data. Skip if you don't want to wait the 3-5 minutes.

**Files:** none (verification only)

- [ ] **Step 1: Ensure backend is running**

In a separate terminal:
```bash
cd /Users/wpknox/Projects/camp-finder/backend && pnpm dev
```

- [ ] **Step 2: Run ETL sync**

```bash
cd /Users/wpknox/Projects/camp-finder/etl && pnpm sync
```

Expected: runs to completion, shows "Sync complete."

- [ ] **Step 3: Spot-check fee data**

```bash
curl http://localhost:8787/api/v1/table/facilities/list -X POST \
  -H 'Content-Type: application/json' \
  -d '{"limit": 20}' | npx -y jq '[.items[] | {name: .name, fee_min: .fee_min, fee_max: .fee_max}]'
```

Expected: mix of null fees (no source found), $0 fees (free), and dollar amounts. Not all 270 will have fees — that's expected given RIDB data gaps.
