# Moderation Wishlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the two owner-requested wishlist items from `docs/handoff.md`: (A) expand suggest-an-edit to cover site counts, location (with a map picker), and closed status; (B) add a suggest-a-deletion flow with soft-delete tombstoning that the ETL respects.

**Architecture:** Item A extends the existing `edit_suggestions` pipeline end-to-end (modal → `/api/suggestions` → admin approve route → `/admin` diff display) — no schema change needed since `changes` is a free JSON patch. Item B mirrors the `merge_suggestions` pattern: a new `delete_suggestions` Teenybase table (ALL rules `'false'`, service-token-only), a new `is_deleted` tombstone column on `facilities`, user + admin server routes, a flag modal, and an ETL change so syncs never update (resurrect) tombstoned rows.

**Tech Stack:** SvelteKit + Svelte 5 runes (mandatory — no legacy syntax), Teenybase (Workers + D1), vanilla Leaflet (dynamic import), Vitest.

**User decisions (already made):**
- Work happens on a new branch (owner: "This should be done on another branch").
- Deletion reason is **required** free text (handoff, 2026-07-09).
- Deletion approval **soft-deletes** (tombstone flag), never hard-deletes, so ETL can't resurrect the row (handoff).
- Location editing gets a **map pin picker**, not just lat/lng text inputs (handoff, 2026-07-07).
- Deletion entry point sits next to the existing report-duplicate action; admin review lives on `/admin` alongside edits and merges (handoff).

---

## Critical codebase rules (read before every task)

1. **Svelte 5 runes only**: `$state`, `$derived`, `$props()`, `$effect`, `onclick={fn}`. Never `export let`, `$:`, `on:click`, `createEventDispatcher`.
2. **Teenybase quirks**: JSON fields must be `JSON.stringify`-ed on write and parsed on read. No compound WHERE (`&&`/`AND` fail) — fetch with a high `limit` and filter in JS.
3. **Suggestion tables use `TB_SERVICE_TOKEN`** (all Teenybase rules are `'false'`). Do not "fix" routes to use the user's JWT.
4. **Server routes derive `user_id` from `locals.user`** — never from the client body.
5. **Pages functions are not Node** — web APIs only in `frontend/src/lib/server` and routes (no `Buffer` etc.).
6. **Design language**: match existing modal/card styles (`docs/design-language.md`); the new UI in this plan copies styles from `SuggestEditModal.svelte` / `admin/+page.svelte` verbatim, so no new design work is needed.
7. **Verification before every commit**: `cd frontend && pnpm check` must report 0 errors / 0 warnings, and `pnpm test` must pass. ETL tasks: `cd etl && pnpm test`.

## File structure overview

```
frontend/src/lib/types.ts                              # modify: EditChanges + Facility.is_deleted (T1, T5)
frontend/src/routes/api/suggestions/+server.ts         # modify: allowlist + validation (T1)
frontend/src/lib/fcfs.ts                               # create: shared FCFS flag derivation (T2)
frontend/src/lib/fcfs.test.ts                          # create: tests (T2)
frontend/src/routes/api/admin/suggestions/+server.ts   # modify: recompute flags on approve (T2)
frontend/src/routes/admin/+page.svelte                 # modify: labels (T2), deletion queue (T9)
frontend/src/lib/detail/SuggestEditModal.svelte        # modify: counts + closed (T3), location (T4)
frontend/src/lib/detail/LocationPicker.svelte          # create: Leaflet mini-map (T4)
backend/teenybase.ts                                   # modify: delete_suggestions + is_deleted (T5)
etl/src/teenybase.ts                                   # modify: tombstone skip (T6)
etl/tests/tombstone.test.ts                            # create: tests (T6)
frontend/src/routes/api/facilities/+server.ts          # modify: filter tombstones (T7)
frontend/src/routes/api/deletions/+server.ts           # create: user flag route (T7)
frontend/src/lib/detail/FlagDeletionModal.svelte       # create: flag modal (T8)
frontend/src/lib/detail/DetailPanel.svelte             # modify: entry point (T8)
frontend/src/routes/api/admin/deletions/+server.ts     # create: admin review route (T9)
frontend/src/routes/admin/+page.server.ts              # modify: load deletions (T9)
```

Task dependencies: T1 → T2, T3, T4. T5 → T6, T7. T7 → T8. T5+T7 → T9. (T3 and T4 both edit `SuggestEditModal.svelte` — run T3 before T4.)

---

### Task 1: Branch + EditChanges type + suggestion API allowlist/validation

**Goal:** Create the feature branch and teach the type system and the user-facing suggestion route about the five new editable fields (`fcfs_total`, `reservable_total`, `is_closed`, `lat`, `lng`).

**Files:**
- Modify: `frontend/src/lib/types.ts` (EditChanges interface, ~line 59)
- Modify: `frontend/src/routes/api/suggestions/+server.ts`

**Acceptance Criteria:**
- [ ] Branch `feat/moderation-wishlist` exists and is checked out (created from `main`)
- [ ] `EditChanges` includes the five new optional fields
- [ ] `POST /api/suggestions` accepts the new keys and rejects malformed values (non-integer counts, out-of-range lat/lng, non-boolean is_closed) with 400
- [ ] `cd frontend && pnpm check` → 0 errors 0 warnings; `pnpm test` passes

**Verify:** `cd frontend && pnpm check && pnpm test` → all green

**Steps:**

- [ ] **Step 1: Create the branch**

```bash
cd /Users/wpknox/Projects/camp-finder
git checkout main && git checkout -b feat/moderation-wishlist
```

Note: `main` has two pre-existing dirty files (`docs/handoff.md`, `frontend/src/lib/filters/FilterSidebar.svelte`) and an untracked `eslint.sonar.config.mjs`. Leave them alone — do not commit, stage, or revert them at any point in this plan.

- [ ] **Step 2: Extend `EditChanges` in `frontend/src/lib/types.ts`**

Replace the existing interface:

```ts
export interface EditChanges {
  fee_min?: number | null;
  fee_max?: number | null;
  season_start?: string;
  season_end?: string;
  fcfs_total?: number | null;
  reservable_total?: number | null;
  is_closed?: boolean;
  lat?: number;
  lng?: number;
  amenities?: Partial<Amenities>;
}
```

- [ ] **Step 3: Extend allowlist + add value validation in `frontend/src/routes/api/suggestions/+server.ts`**

Replace the `ALLOWED_KEYS` line and add a validator; then call it after the `badKey` check inside `POST`:

```ts
// Top-level keys only; inner `amenities` keys are deliberately not validated here —
// admin review is the gate, and malformed submissions get rejected there.
const ALLOWED_KEYS = new Set([
  'fee_min', 'fee_max', 'season_start', 'season_end', 'amenities',
  'fcfs_total', 'reservable_total', 'is_closed', 'lat', 'lng',
])

/** Light shape validation for the new structured fields. Returns an error
 * message or null. Fees/seasons/amenities keep their existing looseness. */
function validateChanges(changes: EditChanges): string | null {
  for (const key of ['fcfs_total', 'reservable_total'] as const) {
    const v = changes[key]
    if (v === undefined || v === null) continue
    if (!Number.isInteger(v) || v < 0) return `${key} must be a non-negative integer`
  }
  if (changes.is_closed !== undefined && typeof changes.is_closed !== 'boolean')
    return 'is_closed must be a boolean'
  if (changes.lat !== undefined && (typeof changes.lat !== 'number' || changes.lat < -90 || changes.lat > 90))
    return 'lat must be between -90 and 90'
  if (changes.lng !== undefined && (typeof changes.lng !== 'number' || changes.lng < -180 || changes.lng > 180))
    return 'lng must be between -180 and 180'
  // lat/lng travel together — a half-updated location is never intended.
  if ((changes.lat === undefined) !== (changes.lng === undefined))
    return 'lat and lng must be provided together'
  return null
}
```

Inside `POST`, directly after the existing `badKey` check:

```ts
  const invalid = validateChanges(changes)
  if (invalid) return json({ error: invalid }, { status: 400 })
```

- [ ] **Step 4: Verify and commit**

```bash
cd frontend && pnpm check && pnpm test
git add src/lib/types.ts src/routes/api/suggestions/+server.ts
git commit -m "feat(suggestions): accept site counts, closed status, and location in edit suggestions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: FCFS flag helper + admin approve recompute + admin diff labels

**Goal:** On approval of a suggestion that changes site counts, recompute the derived `is_fully_fcfs`/`is_partial_fcfs` flags (the handoff explicitly requires this); label the new fields in the admin diff view.

**Files:**
- Create: `frontend/src/lib/fcfs.ts`
- Create: `frontend/src/lib/fcfs.test.ts`
- Modify: `frontend/src/routes/api/admin/suggestions/+server.ts` (RawFacility interface ~line 21, approve branch ~line 105)
- Modify: `frontend/src/routes/admin/+page.svelte` (`FIELD_LABELS`, ~line 146)

**Acceptance Criteria:**
- [ ] `deriveFcfsFlags` matches the ETL's derivation exactly (`etl/src/normalize.ts:142`): fully = `reservable === 0 && fcfs > 0`; partial = `fcfs > 0 && reservable > 0`
- [ ] Approving a suggestion containing `fcfs_total` and/or `reservable_total` patches the facility with recomputed flags, using the facility's current value for whichever count the suggestion omitted
- [ ] Admin diff rows show human labels for the five new fields
- [ ] `cd frontend && pnpm check && pnpm test` green (new tests included)

**Verify:** `cd frontend && pnpm test -- fcfs` → new tests pass; `pnpm check` → 0/0

**Steps:**

- [ ] **Step 1: Write the failing test — `frontend/src/lib/fcfs.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { deriveFcfsFlags } from './fcfs'

describe('deriveFcfsFlags', () => {
  it('fully FCFS when reservable is 0 and fcfs > 0', () => {
    expect(deriveFcfsFlags(12, 0)).toEqual({ is_fully_fcfs: true, is_partial_fcfs: false })
  })
  it('partial FCFS when both counts > 0', () => {
    expect(deriveFcfsFlags(5, 18)).toEqual({ is_fully_fcfs: false, is_partial_fcfs: true })
  })
  it('neither flag when fcfs is 0', () => {
    expect(deriveFcfsFlags(0, 20)).toEqual({ is_fully_fcfs: false, is_partial_fcfs: false })
  })
  it('neither flag when both are 0', () => {
    expect(deriveFcfsFlags(0, 0)).toEqual({ is_fully_fcfs: false, is_partial_fcfs: false })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && pnpm test -- fcfs`
Expected: FAIL — cannot resolve `./fcfs`

- [ ] **Step 3: Implement — `frontend/src/lib/fcfs.ts`**

```ts
/** Derive the FCFS marker flags from site counts. MUST stay in lockstep with
 * the ETL's derivation in etl/src/normalize.ts (is_fully_fcfs / is_partial_fcfs). */
export function deriveFcfsFlags(
  fcfsTotal: number,
  reservableTotal: number,
): { is_fully_fcfs: boolean; is_partial_fcfs: boolean } {
  return {
    is_fully_fcfs: reservableTotal === 0 && fcfsTotal > 0,
    is_partial_fcfs: fcfsTotal > 0 && reservableTotal > 0,
  }
}
```

Run: `cd frontend && pnpm test -- fcfs` → PASS

- [ ] **Step 4: Recompute flags on approval in `frontend/src/routes/api/admin/suggestions/+server.ts`**

Add the import at the top:

```ts
import { deriveFcfsFlags } from "$lib/fcfs";
```

Extend `RawFacility` (the route views the facility before patching) with the counts:

```ts
interface RawFacility {
  id: string;
  name: string;
  amenities: string | Record<string, unknown>;
  fcfs_total: number | null;
  reservable_total: number | null;
}
```

In the approve branch, after `const patch: Record<string, unknown> = { ...scalarChanges };` and the amenities block, add:

```ts
    // Site counts drive derived flags (and marker colors) — recompute whenever
    // either count changes, using the facility's current value for the other.
    if ("fcfs_total" in changes || "reservable_total" in changes) {
      const fcfs = (changes.fcfs_total ?? facility.fcfs_total ?? 0) as number;
      const reservable = (changes.reservable_total ?? facility.reservable_total ?? 0) as number;
      Object.assign(patch, deriveFcfsFlags(fcfs, reservable));
    }
```

- [ ] **Step 5: Label the new fields in `frontend/src/routes/admin/+page.svelte`**

Extend `FIELD_LABELS`:

```ts
  const FIELD_LABELS: Record<string, string> = {
    fee_min: "Fee min ($/night)",
    fee_max: "Fee max ($/night)",
    season_start: "Season start",
    season_end: "Season end",
    fcfs_total: "FCFS sites",
    reservable_total: "Reservable sites",
    is_closed: "Closed",
    lat: "Latitude",
    lng: "Longitude",
  };
```

(No other display change needed — the generic diff row already renders scalar values via `fmtValue`, which formats booleans as Yes/No.)

- [ ] **Step 6: Verify and commit**

```bash
cd frontend && pnpm check && pnpm test
git add src/lib/fcfs.ts src/lib/fcfs.test.ts src/routes/api/admin/suggestions/+server.ts src/routes/admin/+page.svelte
git commit -m "feat(admin): recompute FCFS flags when approving site-count edits

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: SuggestEditModal — site counts + closed status

**Goal:** Let users propose FCFS/reservable site counts and closed status from the suggest-an-edit modal.

**Files:**
- Modify: `frontend/src/lib/detail/SuggestEditModal.svelte`

**Acceptance Criteria:**
- [ ] Two integer inputs ("FCFS sites", "Reservable sites") with blur-triggered inline validation (non-negative integer), matching the existing fee-field pattern
- [ ] A segmented Open/Closed control initialized from `facility.is_closed`
- [ ] `changes` includes each field only when it differs from the facility's current value; submit stays disabled when nothing changed or a field is invalid
- [ ] Svelte 5 runes only; `pnpm check` 0/0

**Verify:** `cd frontend && pnpm check && pnpm test` → green. Manual: `pnpm dev`, open a campground → "Suggest an edit" → change FCFS sites to `7`, submit → row appears pending in `/admin` with "FCFS sites" diff.

**Steps:**

- [ ] **Step 1: Add state, validation, and diff logic in the `<script>` block**

After the `seasonEnd` state line, add:

```ts
  let fcfsTotal = $state(initial.fcfs_total?.toString() ?? '')
  let reservableTotal = $state(initial.reservable_total?.toString() ?? '')
  let closedStatus = $state<'open' | 'closed'>(initial.is_closed ? 'closed' : 'open')
```

Extend the `touched` object and add count validators next to the fee validators:

```ts
  let touched = $state({ feeMin: false, feeMax: false, fcfsTotal: false, reservableTotal: false })
```

```ts
  function countError(v: string): string {
    if (v === '') return ''
    const n = Number(v)
    return !Number.isInteger(n) || n < 0 ? 'Enter a whole number (0 or more).' : ''
  }
  const fcfsTotalError = $derived(countError(fcfsTotal))
  const reservableTotalError = $derived(countError(reservableTotal))
  const countsValid = $derived(!fcfsTotalError && !reservableTotalError)
```

In the `changes` `$derived.by`, change the early return to `if (!feesValid || !countsValid) return c` and add before the amenities block:

```ts
    const ft = fcfsTotal === '' ? null : Number(fcfsTotal)
    if (ft !== (facility.fcfs_total ?? null)) c.fcfs_total = ft
    const rt = reservableTotal === '' ? null : Number(reservableTotal)
    if (rt !== (facility.reservable_total ?? null)) c.reservable_total = rt
    if ((closedStatus === 'closed') !== !!facility.is_closed) c.is_closed = closedStatus === 'closed'
```

In `submit()`, update the touch-all line and guard:

```ts
    touched = { feeMin: true, feeMax: true, fcfsTotal: true, reservableTotal: true }
    if (!hasChanges || submitting || !feesValid || !countsValid) return
```

- [ ] **Step 2: Add the markup**

After the season `row-2` div and before the amenities div, insert (copies the fee-field pattern exactly):

```svelte
        <div class="row-2">
          <div class="field">
            <label for="fcfs-total">FCFS sites</label>
            <input
              id="fcfs-total"
              type="text"
              inputmode="numeric"
              bind:value={fcfsTotal}
              onblur={() => touch('fcfsTotal')}
              placeholder="e.g. 12"
              class:invalid={touched.fcfsTotal && fcfsTotalError}
              aria-invalid={touched.fcfsTotal && !!fcfsTotalError}
            />
            {#if touched.fcfsTotal && fcfsTotalError}<p class="field-error">{fcfsTotalError}</p>{/if}
          </div>
          <div class="field">
            <label for="reservable-total">Reservable sites</label>
            <input
              id="reservable-total"
              type="text"
              inputmode="numeric"
              bind:value={reservableTotal}
              onblur={() => touch('reservableTotal')}
              placeholder="e.g. 18"
              class:invalid={touched.reservableTotal && reservableTotalError}
              aria-invalid={touched.reservableTotal && !!reservableTotalError}
            />
            {#if touched.reservableTotal && reservableTotalError}<p class="field-error">{reservableTotalError}</p>{/if}
          </div>
        </div>

        <div class="amenity-row">
          <span class="amenity-label">Campground status</span>
          <div class="segmented">
            <button type="button" class:active={closedStatus === 'open'}
                    onclick={() => (closedStatus = 'open')}>Open</button>
            <button type="button" class:active={closedStatus === 'closed'}
                    onclick={() => (closedStatus = 'closed')}>Closed</button>
          </div>
        </div>
```

(The `.amenity-row`/`.segmented` classes already exist in this component's styles — no CSS changes.)

- [ ] **Step 3: Verify and commit**

```bash
cd frontend && pnpm check && pnpm test
git add src/lib/detail/SuggestEditModal.svelte
git commit -m "feat(frontend): suggest edits for site counts and closed status

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: SuggestEditModal — location map picker

**Goal:** Let users propose a corrected campground location by dragging a pin on a mini Leaflet map (with lat/lng text inputs kept in sync).

**Files:**
- Create: `frontend/src/lib/detail/LocationPicker.svelte`
- Modify: `frontend/src/lib/detail/SuggestEditModal.svelte`

**Acceptance Criteria:**
- [ ] "Adjust location" toggle in the modal reveals a ~240px Leaflet map centered on the facility, with a draggable marker; clicking the map also moves the marker
- [ ] Lat/lng text inputs stay in sync with the marker both ways; values rounded to 5 decimals
- [ ] `changes.lat`/`changes.lng` appear only when the location actually moved, and always together
- [ ] Leaflet is dynamically imported (same pattern as `CampMap.svelte:20`) — no SSR breakage; `pnpm check` 0/0

**Verify:** `cd frontend && pnpm check && pnpm test` → green. Manual: `pnpm dev`, open modal → "Adjust location" → drag pin → lat/lng inputs update → submit → `/admin` shows Latitude/Longitude diff rows.

**Steps:**

- [ ] **Step 1: Create `frontend/src/lib/detail/LocationPicker.svelte`**

```svelte
<script lang="ts">
  import { untrack } from 'svelte'

  let { lat, lng, onchange }: {
    lat: number
    lng: number
    onchange: (lat: number, lng: number) => void
  } = $props()

  let mapEl: HTMLDivElement
  // Leaflet handles live outside runes — the map is imperative, not reactive state.
  let map: import('leaflet').Map | null = null
  let marker: import('leaflet').Marker | null = null

  function report(pos: { lat: number; lng: number }) {
    onchange(Number(pos.lat.toFixed(5)), Number(pos.lng.toFixed(5)))
  }

  $effect(() => {
    // untrack the initial center: this effect must run ONCE (mount/unmount),
    // not tear the map down on every lat/lng keystroke — the second effect
    // below handles subsequent position changes.
    const initLat = untrack(() => lat)
    const initLng = untrack(() => lng)
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled) return
      map = L.map(mapEl, { center: [initLat, initLng], zoom: 13 })
      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
      }).addTo(map)
      marker = L.marker([initLat, initLng], { draggable: true }).addTo(map)
      marker.on('dragend', () => report(marker!.getLatLng()))
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        marker!.setLatLng(e.latlng)
        report(e.latlng)
      })
    })()
    return () => {
      cancelled = true
      map?.remove()
      map = null
      marker = null
    }
  })

  // Typed lat/lng edits move the pin. Guard against feedback loops: only move
  // when the position meaningfully differs from where the marker already is.
  $effect(() => {
    if (!map || !marker) return
    const cur = marker.getLatLng()
    if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6) {
      marker.setLatLng([lat, lng])
      map.panTo([lat, lng])
    }
  })
</script>

<div class="picker" bind:this={mapEl}></div>

<style>
  .picker {
    height: 240px;
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    overflow: hidden;
  }
</style>
```

- [ ] **Step 2: Wire it into `SuggestEditModal.svelte`**

Script additions (below the closedStatus state from Task 3):

```ts
  import LocationPicker from './LocationPicker.svelte'
```

```ts
  let showLocation = $state(false)
  let latStr = $state(initial.lat.toFixed(5))
  let lngStr = $state(initial.lng.toFixed(5))
  const latNum = $derived(Number(latStr))
  const lngNum = $derived(Number(lngStr))
  const latError = $derived(
    latStr !== '' && (Number.isNaN(latNum) || latNum < -90 || latNum > 90) ? 'Latitude must be -90 to 90.' : '',
  )
  const lngError = $derived(
    lngStr !== '' && (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) ? 'Longitude must be -180 to 180.' : '',
  )
  const locationValid = $derived(!latError && !lngError && latStr !== '' && lngStr !== '')

  function onPinMove(newLat: number, newLng: number) {
    latStr = newLat.toFixed(5)
    lngStr = newLng.toFixed(5)
  }
```

In the `changes` `$derived.by`, extend the early return to `if (!feesValid || !countsValid || !locationValid) return c` and add (lat/lng always travel together, matching the server rule from Task 1):

```ts
    const latRounded = Number(latNum.toFixed(5))
    const lngRounded = Number(lngNum.toFixed(5))
    const origLat = Number(facility.lat.toFixed(5))
    const origLng = Number(facility.lng.toFixed(5))
    if (latRounded !== origLat || lngRounded !== origLng) {
      c.lat = latRounded
      c.lng = lngRounded
    }
```

In `submit()`, extend the guard: `if (!hasChanges || submitting || !feesValid || !countsValid || !locationValid) return`.

Markup — insert after the closed-status `amenity-row` (from Task 3), before the amenities section:

```svelte
        <div class="field">
          <button type="button" class="cancel location-toggle" onclick={() => (showLocation = !showLocation)}>
            {showLocation ? 'Hide location editor ▾' : 'Adjust location ▸'}
          </button>
          {#if showLocation}
            <div class="row-2">
              <div class="field">
                <label for="loc-lat">Latitude</label>
                <input id="loc-lat" type="text" inputmode="decimal" bind:value={latStr}
                       class:invalid={!!latError} aria-invalid={!!latError} />
                {#if latError}<p class="field-error">{latError}</p>{/if}
              </div>
              <div class="field">
                <label for="loc-lng">Longitude</label>
                <input id="loc-lng" type="text" inputmode="decimal" bind:value={lngStr}
                       class:invalid={!!lngError} aria-invalid={!!lngError} />
                {#if lngError}<p class="field-error">{lngError}</p>{/if}
              </div>
            </div>
            {#if locationValid}
              <LocationPicker lat={latNum} lng={lngNum} onchange={onPinMove} />
            {/if}
            <p class="ink-faint picker-hint">Drag the pin (or tap the map) to the campground's true location.</p>
          {/if}
        </div>
```

Style additions (inside the existing `<style>` block):

```css
  .location-toggle { align-self: flex-start; font-size: 0.82rem; padding: 0.4rem 0.7rem; }
  .picker-hint { font-size: 0.78rem; margin: 0; }
```

- [ ] **Step 3: Verify and commit**

```bash
cd frontend && pnpm check && pnpm test
git add src/lib/detail/LocationPicker.svelte src/lib/detail/SuggestEditModal.svelte
git commit -m "feat(frontend): map pin picker for suggesting location corrections

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Backend schema — delete_suggestions table + facilities.is_deleted tombstone

**Goal:** Add the `delete_suggestions` moderation table (mirroring `merge_suggestions`) and the `is_deleted` tombstone flag on `facilities`; apply migrations.

**Files:**
- Modify: `backend/teenybase.ts`
- Modify: `frontend/src/lib/types.ts` (Facility)

**Acceptance Criteria:**
- [ ] `facilities` gains `is_deleted` (bool); `delete_suggestions` exists with `facility_id` (SET NULL), `user_id` (CASCADE), and the shared `moderationFields`; ALL rules `'false'`
- [ ] `cd backend && pnpm generate && pnpm migrate` runs clean against local dev DB
- [ ] `Facility` type gains `is_deleted?: boolean`

**Verify:** `cd backend && pnpm generate && pnpm migrate` → completes without error; then with `pnpm dev` running, `curl -s -X POST http://localhost:8787/api/v1/table/delete_suggestions/list -H "Authorization: Bearer $TB_SERVICE_TOKEN" -H "Content-Type: application/json" -d '{"limit":1}'` (token from `frontend/.env`) → `{"items":[]}` not "Table not found"

**Steps:**

- [ ] **Step 1: Add `is_deleted` to the facilities table in `backend/teenybase.ts`**

After the `merged_ridb_ids` field (~line 111), add:

```ts
        // Soft-delete tombstone set by admin-approved deletion flags. The row
        // stays so the ETL's ridb_id index keeps resolving it (never
        // resurrected); the public facilities route filters it out.
        { name: "is_deleted", type: "bool", sqlType: "boolean" },
```

- [ ] **Step 2: Add the `delete_suggestions` table**

After the `merge_suggestions` table object (before the closing `],`), add:

```ts
    {
      name: "delete_suggestions",
      autoSetUid: true,
      fields: [
        ...baseFields,
        // SET NULL (not CASCADE), matching merge_suggestions: if the facility
        // is removed by a merge, the flag survives as an audit record.
        {
          name: "facility_id",
          type: "relation",
          sqlType: "text",
          foreignKey: {
            table: "facilities",
            column: "id",
            onDelete: "SET NULL",
          },
        },
        {
          name: "user_id",
          type: "relation",
          sqlType: "text",
          foreignKey: { table: "users", column: "id", onDelete: "CASCADE" },
        },
        // The required deletion reason is stored in moderationFields' `note`.
        ...moderationFields,
      ],
      triggers: [createdTrigger, updatedTrigger],
      extensions: [
        {
          name: "rules",
          listRule: "false",
          viewRule: "false",
          createRule: "false",
          updateRule: "false",
          deleteRule: "false",
        } satisfies TableRulesExtensionData,
      ],
    },
```

- [ ] **Step 3: Generate + apply migrations**

```bash
cd backend && pnpm generate && pnpm migrate
```

Expected: new migration created and applied to the local dev DB without error. (Prod migration is a deploy-time step — out of scope for this plan; do NOT run `pnpm deploy` or touch `--remote`.)

- [ ] **Step 4: Add `is_deleted` to the `Facility` interface in `frontend/src/lib/types.ts`**

After `merged_ridb_ids?: string[];`:

```ts
  is_deleted?: boolean;
```

- [ ] **Step 5: Verify and commit**

Run the curl check from **Verify** above (backend `pnpm dev` must be running).

```bash
cd frontend && pnpm check && pnpm test
git add ../backend/teenybase.ts src/lib/types.ts
git commit -m "feat(backend): delete_suggestions table and is_deleted tombstone on facilities

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(If `backend/migrations/` is gitignored, the generated SQL won't be staged — that matches the existing setup; do not force-add it.)

---

### Task 6: ETL respects tombstones

**Goal:** Make ETL syncs skip updates to tombstoned facilities so approved deletions are never refreshed or resurrected by `pnpm sync` / `pnpm discover` / `pnpm sync-nps`.

**Files:**
- Modify: `etl/src/teenybase.ts`
- Create: `etl/tests/tombstone.test.ts`

**Acceptance Criteria:**
- [ ] `listAllWithMerged` surfaces `is_deleted`
- [ ] `upsertFacilities` never PATCHes a row whose `is_deleted` is truthy (and never inserts a duplicate for its ridb_id — the existing index already guarantees that; the test proves both)
- [ ] `cd etl && pnpm test` green (existing 127 + new)

**Verify:** `cd etl && pnpm test` → all pass, including `tombstone.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test — `etl/tests/tombstone.test.ts`** (mirrors `upsertOptions.test.ts`'s fetch-mock pattern)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TbClient } from "../src/teenybase.js";
import type { NormalizedFacility } from "../src/types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function facility(overrides: Partial<NormalizedFacility>): NormalizedFacility {
  return {
    ridb_id: "232157",
    name: "ROSY LANE",
    lat: 38.73,
    lng: -106.74,
    forest: "USDA Forest Service",
    district: "",
    description: "desc",
    fee_min: 20,
    fee_max: 24,
    season_start: "",
    season_end: "",
    fcfs_total: 5,
    reservable_total: 18,
    is_fully_fcfs: false,
    is_partial_fcfs: true,
    amenities: "{}" as any,
    ridb_data_quality: "rich",
    fs_url: "https://fs.usda.gov/x",
    is_closed: false,
    last_synced: "2026-07-08T00:00:00Z",
    ...overrides,
  };
}

function okJson(body: unknown) {
  return { ok: true, json: async () => body, text: async () => "" };
}

describe("tombstoned facilities", () => {
  const tb = new TbClient("http://tb", "token");
  beforeEach(() => mockFetch.mockReset());

  it("skips updates to rows with is_deleted set", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        items: [
          { id: "row1", ridb_id: "232157", name: "Rosy Lane", lat: 38.73, lng: -106.74,
            fee_min: 15, fs_url: "", merged_ridb_ids: "[]", is_deleted: true },
        ],
      }),
    );
    await tb.upsertFacilities([facility({})]);
    // Only the list call happened — no edit, and no insert either.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/list");
  });

  it("still updates live rows and inserts unknown ridb_ids", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        items: [
          { id: "row1", ridb_id: "232157", name: "Rosy Lane", lat: 38.73, lng: -106.74,
            fee_min: 15, fs_url: "", merged_ridb_ids: "[]", is_deleted: false },
        ],
      }),
    );
    mockFetch.mockResolvedValueOnce(okJson({}));
    mockFetch.mockResolvedValueOnce(okJson({}));
    await tb.upsertFacilities([facility({}), facility({ ridb_id: "999999" })]);
    expect(mockFetch.mock.calls[1][0]).toContain("/edit/row1");
    expect(mockFetch.mock.calls[2][0]).toContain("/insert");
  });

  it("skips updates resolved through an absorbed merged_ridb_id on a tombstoned row", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        items: [
          { id: "row1", ridb_id: "fs-old-scrape", name: "Rosy Lane", lat: 38.73, lng: -106.74,
            fee_min: 15, fs_url: "", merged_ridb_ids: '["232157"]', is_deleted: true },
        ],
      }),
    );
    await tb.upsertFacilities([facility({})]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd etl && pnpm test -- tombstone`
Expected: FAIL — an `/edit/row1` call happens for tombstoned rows

- [ ] **Step 3: Implement in `etl/src/teenybase.ts`**

In `listAllWithMerged`, add `is_deleted` to both the return type and the raw item type, and pass it through:

```ts
  async listAllWithMerged(): Promise<
    Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number; fee_min: number | null; fs_url: string; merged_ridb_ids: string[]; is_deleted: boolean }>
  > {
    // limit: 10000 — well above current scale (~600 campgrounds). If the table ever
    // grows past this, add cursor/offset pagination here.
    const res = (await this.tbFetch("/table/facilities/list", { limit: 10000 })) as {
      items: Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number; fee_min: number | null; fs_url: string; merged_ridb_ids?: string | string[] | null; is_deleted?: boolean | null }>;
    };
    return res.items.map((f) => ({
      ...f,
      merged_ridb_ids: typeof f.merged_ridb_ids === "string" ? JSON.parse(f.merged_ridb_ids) : (f.merged_ridb_ids ?? []),
      is_deleted: !!f.is_deleted,
    }));
  }
```

In `upsertFacilities`, build a tombstone set and thread it through:

```ts
    const rows = await this.listAllWithMerged();
    const index = buildRidbIndex(rows);
    const deletedIds = new Set(rows.filter((r) => r.is_deleted).map((r) => r.id));
    for (let i = 0; i < facilities.length; i++) {
      await this.upsertFacilityWithIndex(facilities[i], index, deletedIds, opts);
      onProgress?.(i + 1, facilities.length);
    }
```

Update `upsertFacilityWithIndex`'s signature and add the skip as the first check inside the `existingId` branch:

```ts
  private async upsertFacilityWithIndex(
    facility: NormalizedFacility,
    index: Map<string, string>,
    deletedIds: Set<string>,
    opts?: UpsertOptions,
  ): Promise<void> {
    const existingId = index.get(facility.ridb_id);
    if (existingId) {
      // Admin-tombstoned rows are frozen: never refresh them, never let a
      // sync make them look alive again. (No insert either — the index
      // already resolves this ridb_id to the tombstoned row.)
      if (deletedIds.has(existingId)) return;
```

(Rest of the method unchanged.)

- [ ] **Step 4: Verify and commit**

```bash
cd etl && pnpm test
git add src/teenybase.ts tests/tombstone.test.ts
git commit -m "feat(etl): never update or resurrect tombstoned facilities

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Public API tombstone filter + user deletion-flag route

**Goal:** Hide tombstoned facilities from the public bbox endpoint, and add the authenticated `POST /api/deletions` route (required reason, rate-limited, dedupes pending flags per facility).

**Files:**
- Modify: `frontend/src/routes/api/facilities/+server.ts`
- Create: `frontend/src/routes/api/deletions/+server.ts`

**Acceptance Criteria:**
- [ ] Facilities with truthy `is_deleted` never appear in `GET /api/facilities` results
- [ ] `POST /api/deletions` → 401 unauthenticated; 400 on missing `facility_id` or blank `reason`; 200 `{duplicate:true}` when a pending flag for the same facility exists; 201 on insert
- [ ] `user_id` comes from `locals.user`, writes use `TB_SERVICE_TOKEN`, reason stored in `note` (≤1000 chars)
- [ ] `pnpm check` 0/0, `pnpm test` green

**Verify:** `cd frontend && pnpm check && pnpm test` → green. Manual: with both dev servers running and a tombstoned row (`sqlite3` `UPDATE facilities SET is_deleted=1 WHERE ...`), `curl "http://localhost:5173/api/facilities?north=90&south=-90&east=180&west=-180"` omits it.

**Steps:**

- [ ] **Step 1: Filter tombstones in `frontend/src/routes/api/facilities/+server.ts`**

Extend the existing `.filter` callback — add a tombstone check as the first line:

```ts
    .filter((f) => {
      if (f.is_deleted) return false; // admin-tombstoned: hidden everywhere public
      const lat = f.lat as number;
      const lng = f.lng as number;
      return lat >= south && lat <= north && lng >= west && lng <= east;
    })
```

- [ ] **Step 2: Create `frontend/src/routes/api/deletions/+server.ts`** (modeled line-for-line on `api/duplicates/+server.ts`)

```ts
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { tbFetch } from '$lib/server/tbFetch'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import { suggestionLimiter } from '$lib/server/auth/limiters'

const TB = `/api/v1/table/delete_suggestions`
// Deliberately uses TB_SERVICE_TOKEN: delete_suggestions has ALL Teenybase rules set to
// 'false', so the service token is the only way in. Unlike sibling routes (api/saved,
// api/ratings) which use the user's own JWT — don't "fix" this to the per-request
// user-token pattern.
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
}

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  if (!locals.user) return json({ error: 'Unauthenticated' }, { status: 401 })
  if (!suggestionLimiter.check(getClientAddress()).allowed)
    return json({ error: 'Too many submissions — try again later' }, { status: 429 })

  const { facility_id, reason } = (await request.json()) as Record<string, string>
  if (!facility_id) return json({ error: 'facility_id required' }, { status: 400 })
  // Reason is REQUIRED for deletion flags (owner decision) — unlike the
  // optional notes on edit/duplicate suggestions.
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0)
    return json({ error: 'A reason is required' }, { status: 400 })

  // Dedupe pending flags per facility (no compound WHERE — fetch pending and
  // filter in JS; 1000-row ceiling is fine at current scale).
  const existingRes = await tbFetch(`${TB}/list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ where: `status == 'pending'`, limit: 1000 }),
  })
  const existing = (await existingRes.json()) as { items?: Array<{ facility_id: string }> }
  if (existing.items?.some((s) => s.facility_id === facility_id))
    return json({ duplicate: true }, { status: 200 })

  const res = await tbFetch(`${TB}/insert`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      values: {
        facility_id,
        user_id: locals.user.id,
        note: reason.trim().slice(0, 1000),
        status: 'pending',
      },
    }),
  })
  const data = await res.json()
  return json(data, { status: res.ok ? 201 : res.status })
}
```

- [ ] **Step 3: Verify and commit**

```bash
cd frontend && pnpm check && pnpm test
git add src/routes/api/facilities/+server.ts src/routes/api/deletions/+server.ts
git commit -m "feat(api): deletion-flag route and tombstone filtering

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: FlagDeletionModal + DetailPanel entry point

**Goal:** Give users a "flag for deletion" action next to report-duplicate, with a required-reason modal.

**Files:**
- Create: `frontend/src/lib/detail/FlagDeletionModal.svelte`
- Modify: `frontend/src/lib/detail/DetailPanel.svelte`

**Acceptance Criteria:**
- [ ] New link under the report-duplicate link: "Not a real campground? Flag for deletion", auth-gated exactly like the existing suggest/duplicate actions (`pendingAction` pattern)
- [ ] Modal requires a non-empty reason before submit enables; shows success, already-flagged, and error states
- [ ] Svelte 5 runes only; `pnpm check` 0/0

**Verify:** `cd frontend && pnpm check && pnpm test` → green. Manual: `pnpm dev` → open campground → flag with reason → success message; `/admin` deletion queue (Task 9) shows it; flag same campground again → "Already flagged".

**Steps:**

- [ ] **Step 1: Create `frontend/src/lib/detail/FlagDeletionModal.svelte`**

The overlay/modal/actions/spinner styles are copied verbatim from `ReportDuplicateModal.svelte` — reuse its `<style>` block for `.overlay, .modal, .modal::before, @keyframes modal-in, .eyebrow, h2, .edit-form, .field, label, .ink-faint, input/textarea rules, .actions, .cancel, .primary, .danger-accent (new), .spinner, @keyframes spin, .error, .success, @media` and change only what's below. Accent: use `var(--rust)` for the modal's left accent bar (`.modal::before { background: var(--rust); }`) to signal a destructive action.

```svelte
<script lang="ts">
  import { untrack } from 'svelte'
  import type { Facility } from '$lib/types'

  let { facility, onclose }: { facility: Facility; onclose: () => void } = $props()

  // Snapshot the facility once at open — mirrors SuggestEditModal's pattern.
  const initial = untrack(() => facility)

  let reason = $state('')
  let submitting = $state(false)
  let submitted = $state(false)
  let alreadyFlagged = $state(false)
  let errorMsg = $state('')
  const reasonValid = $derived(reason.trim().length > 0)

  async function submit() {
    if (!reasonValid || submitting) return
    submitting = true
    errorMsg = ''
    try {
      const res = await fetch('/api/deletions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ facility_id: initial.id, reason }),
      })
      if (res.status === 201) {
        submitted = true
      } else if (res.ok) {
        const data = (await res.json()) as { duplicate?: boolean }
        if (data.duplicate) alreadyFlagged = true
        else submitted = true
      } else {
        errorMsg = ((await res.json()) as { error?: string }).error ?? 'Something went wrong'
      }
    } catch {
      errorMsg = 'Something went wrong'
    } finally {
      submitting = false
    }
  }
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label={`Flag for deletion — ${initial.name}`}>
    <span class="eyebrow">Deletion flag</span>
    <h2>Flag for deletion — {initial.name}</h2>

    {#if submitted}
      <p class="success">Thanks — an admin will review this flag.</p>
      <button class="primary" type="button" onclick={onclose}>Close</button>
    {:else if alreadyFlagged}
      <p class="success">Already flagged — thanks!</p>
      <button class="primary" type="button" onclick={onclose}>Close</button>
    {:else}
      <form class="edit-form" onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <p class="hint">
          Use this if this record isn't a real campground (bad data import, day-use
          area, trailhead…). An admin reviews every flag before anything is removed.
        </p>
        <div class="field">
          <label for="reason">Why should this be removed? <span class="ink-faint">(required)</span></label>
          <textarea
            id="reason"
            bind:value={reason}
            maxlength="1000"
            rows="4"
            placeholder="e.g. This is a trailhead, not a campground — no overnight sites"
          ></textarea>
        </div>

        {#if errorMsg}<p class="error" role="alert">{errorMsg}</p>{/if}

        <div class="actions">
          <button class="cancel" type="button" onclick={onclose}>Cancel</button>
          <button class="primary" type="submit" disabled={!reasonValid || submitting}>
            {#if submitting}<span class="spinner" aria-hidden="true"></span>{/if}
            {submitting ? 'Submitting…' : 'Flag for deletion'}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
```

Plus the copied `<style>` block described above, with `.modal::before { background: var(--rust); }` and one addition:

```css
  .hint { margin: 0; font-size: 0.85rem; color: var(--ink-soft); line-height: 1.45; }
```

- [ ] **Step 2: Wire the entry point in `frontend/src/lib/detail/DetailPanel.svelte`**

Script — extend the existing modal plumbing (near lines 10–33):

```ts
  import FlagDeletionModal from './FlagDeletionModal.svelte'
```

```ts
  let deletionOpen = $state(false)
```

Widen the pending-action union and add the handler + auth-success branch:

```ts
  let pendingAction: 'suggest' | 'duplicate' | 'deletion' | null = $state(null)
```

```ts
  function onFlagDeletionClick() {
    if (!$isLoggedIn) { pendingAction = 'deletion'; showAuth = true; return; }
    deletionOpen = true
  }
```

In the existing auth-success function, add:

```ts
    else if (pendingAction === 'deletion') deletionOpen = true
```

Markup — directly after the report-duplicate button (line ~137):

```svelte
      <button class="report-duplicate-link" type="button" onclick={onFlagDeletionClick}>
        Not a real campground? Flag for deletion
      </button>
```

And with the other modals at the bottom:

```svelte
{#if deletionOpen}
  <FlagDeletionModal {facility} onclose={() => (deletionOpen = false)} />
{/if}
```

- [ ] **Step 3: Verify and commit**

```bash
cd frontend && pnpm check && pnpm test
git add src/lib/detail/FlagDeletionModal.svelte src/lib/detail/DetailPanel.svelte
git commit -m "feat(frontend): flag-for-deletion modal and detail-panel entry point

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Admin deletions API + /admin review queue

**Goal:** Admins see pending deletion flags on `/admin` and approve (tombstone the facility) or reject them.

**Files:**
- Create: `frontend/src/routes/api/admin/deletions/+server.ts`
- Modify: `frontend/src/routes/admin/+page.server.ts`
- Modify: `frontend/src/routes/admin/+page.svelte`

**Acceptance Criteria:**
- [ ] `GET /api/admin/deletions` (requireAdmin) returns pending flags joined with facility name and user email
- [ ] `POST` approve → facility patched `is_deleted: true`, flag resolved with reviewer fields; reject → flag resolved only; 409 when already resolved; 404 on missing suggestion/facility
- [ ] `/admin` shows a "Deletion flags" queue with facility name, reason, approve ("Delete campground", danger-styled) and reject actions, matching the existing queues' interaction pattern (busy state, reject-note form, success banner)
- [ ] Approving removes the campground from the public map on next search

**Verify:** `cd frontend && pnpm check && pnpm test` → green. Manual end-to-end: flag a campground (Task 8) → `/admin` → approve → success banner → `curl "http://localhost:5173/api/facilities?north=90&south=-90&east=180&west=-180"` no longer contains it → `cd etl && pnpm sync` (local env) does not resurrect it.

**Steps:**

- [ ] **Step 1: Create `frontend/src/routes/api/admin/deletions/+server.ts`** (modeled on `api/admin/suggestions/+server.ts`)

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$lib/server/auth/admin";
import { tb, tbHeaders, tbList } from "$lib/server/admin/tb";
import { tbFetch } from "$lib/server/tbFetch";

interface RawDeletion {
  id: string;
  facility_id: string | null;
  user_id: string;
  note: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created: string;
}

interface RawFacility {
  id: string;
  name: string;
  ridb_id: string;
}

interface RawUser {
  id: string;
  email: string;
}

/** GET /api/admin/deletions → pending deletion flags, joined to facility + user. */
export const GET: RequestHandler = async ({ locals }) => {
  await requireAdmin(locals);

  const [deletions, facilities, users] = await Promise.all([
    tbList<RawDeletion>("delete_suggestions", {
      where: "status == 'pending'",
      order: "created asc",
      limit: 500,
    }),
    tbList<RawFacility>("facilities", { limit: 10000 }),
    tbList<RawUser>("users", { limit: 10000 }),
  ]);

  const facById = new Map(facilities.map((f) => [f.id, f]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const result = deletions.map((d) => {
    const fac = d.facility_id ? facById.get(d.facility_id) : undefined;
    return {
      ...d,
      facility_name: fac?.name ?? "(deleted)",
      facility_ridb_id: fac?.ridb_id ?? "",
      user_email: userById.get(d.user_id)?.email ?? "(deleted)",
    };
  });

  return json(result);
};

/** POST /api/admin/deletions → approve (tombstone facility) / reject one flag. */
export const POST: RequestHandler = async ({ locals, request }) => {
  const admin = await requireAdmin(locals);

  const body = (await request.json()) as {
    id?: string;
    action?: string;
    admin_note?: string;
  };
  const { id, action } = body;
  if (!id || (action !== "approve" && action !== "reject")) {
    return json({ error: "id and action (approve|reject) required" }, { status: 400 });
  }

  const viewRes = await tbFetch(tb(`delete_suggestions/view/${id}`), {
    headers: tbHeaders,
  });
  if (!viewRes.ok) return json({ error: "Flag not found" }, { status: 404 });
  const flag = (await viewRes.json()) as RawDeletion;
  if (flag.status !== "pending") {
    return json({ error: "Flag already resolved" }, { status: 409 });
  }

  let tombstoned: { id: string; name: string } | null = null;

  if (action === "approve") {
    if (!flag.facility_id) {
      return json({ error: "Facility no longer exists" }, { status: 404 });
    }
    const facRes = await tbFetch(tb(`facilities/view/${flag.facility_id}`), {
      headers: tbHeaders,
    });
    if (!facRes.ok) return json({ error: "Facility not found" }, { status: 404 });
    const facility = (await facRes.json()) as RawFacility;

    // Soft-delete: the row stays so the ETL's ridb_id index keeps absorbing
    // this id (see etl tombstone handling) — never hard-delete here.
    const editRes = await tbFetch(tb(`facilities/edit/${facility.id}`), {
      method: "POST",
      headers: tbHeaders,
      body: JSON.stringify({ is_deleted: true }),
    });
    if (!editRes.ok) {
      return json(
        { error: "Failed to tombstone facility", detail: await editRes.text() },
        { status: 502 },
      );
    }
    tombstoned = { id: facility.id, name: facility.name };
  }

  const resolveRes = await tbFetch(tb(`delete_suggestions/edit/${id}`), {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: (body.admin_note ?? "").slice(0, 1000),
    }),
  });
  if (!resolveRes.ok) {
    return json(
      { error: "Failed to update flag", detail: await resolveRes.text() },
      { status: 502 },
    );
  }

  return json(
    tombstoned
      ? { ok: true, facility_id: tombstoned.id, facility_name: tombstoned.name }
      : { ok: true },
  );
};
```

- [ ] **Step 2: Load deletions in `frontend/src/routes/admin/+page.server.ts`**

Add the fetch to the existing `Promise.all` and return it:

```ts
  const [editsRes, mergesRes, facilitiesRes, deletionsRes] = await Promise.all([
    fetch("/api/admin/suggestions"),
    fetch("/api/admin/merges"),
    // World bbox: reuse the existing public bbox-filtered endpoint (no new
    // route) to build a facility_id → current-values map for edit diffs.
    fetch("/api/facilities?north=90&south=-90&east=180&west=-180"),
    fetch("/api/admin/deletions"),
  ]);
```

```ts
  const deletions = deletionsRes.ok ? await deletionsRes.json() : [];
```

```ts
  return { edits: editsWithCurrent, merges, deletions };
```

- [ ] **Step 3: Add the queue to `frontend/src/routes/admin/+page.svelte`**

Script additions:

```ts
  interface DeletionRow {
    id: string;
    facility_id: string | null;
    facility_name: string;
    facility_ridb_id: string;
    user_email: string;
    note: string;
    created: string;
  }
```

Extend the props type: `let { data }: { data: { edits: EditRow[]; merges: MergeRow[]; deletions: DeletionRow[] } } = $props();`

Next to the `edits`/`merges` snapshots:

```ts
  let deletions = $state(untrack(() => [...data.deletions]));
```

Next to the other success arrays:

```ts
  let deletionSuccesses = $state<SuccessNotice[]>([]);
```

Extend `dismissSuccess`:

```ts
  function dismissSuccess(id: string) {
    mergeSuccesses = mergeSuccesses.filter((s) => s.id !== id);
    editSuccesses = editSuccesses.filter((s) => s.id !== id);
    deletionSuccesses = deletionSuccesses.filter((s) => s.id !== id);
  }
```

Add the resolver (mirrors `resolveEdit`; shares `busy`/`errors`/`notes`/`rejecting` maps since ids are unique):

```ts
  async function resolveDeletion(row: DeletionRow, action: "approve" | "reject") {
    if (busy[row.id]) return;
    busy = { ...busy, [row.id]: true };
    errors = { ...errors, [row.id]: "" };
    try {
      const res = await fetch("/api/admin/deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          action,
          admin_note: notes[row.id] ?? "",
        }),
      });
      if (res.ok) {
        deletions = deletions.filter((d) => d.id !== row.id);
        if (action === "approve") {
          deletionSuccesses = [
            ...deletionSuccesses,
            { id: row.id, facility_id: "", facility_name: row.facility_name },
          ];
        }
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        errors = { ...errors, [row.id]: body.error ?? "Something went wrong" };
      }
    } catch {
      errors = { ...errors, [row.id]: "Something went wrong" };
    } finally {
      busy = { ...busy, [row.id]: false };
    }
  }
```

(`facility_id: ""` on the success notice is deliberate — the campground is now tombstoned, so a "View campground →" link would dead-end; the banner renders without a link when the id is empty.)

Markup — a third `<section class="queue">` after the duplicate-reports section, before `</main>`:

```svelte
  <section class="queue">
    <h2>Deletion flags <span class="count">{deletions.length}</span></h2>

    {#each deletionSuccesses as success (success.id)}
      {@render successBanner(success, "Removed")}
    {/each}

    {#if deletions.length === 0}
      <p class="empty">No pending deletion flags — the queue is clear.</p>
    {:else}
      <div class="cards">
        {#each deletions as row (row.id)}
          <article class="card">
            <div class="card-head">
              <h3>{row.facility_name}</h3>
              <span class="meta">
                {#if row.facility_ridb_id}
                  <span class="badge">{ridbSourceBadge(row.facility_ridb_id)}</span> ·
                {/if}
                {row.user_email} · {fmtDate(row.created)}
              </span>
            </div>

            <p class="note">"{row.note}"</p>

            {#if !row.facility_id}
              <p class="winner-hint error-hint">
                This facility was already removed (merge or prior deletion) — reject to clear the flag.
              </p>
            {/if}

            {#if errors[row.id]}
              <p class="error" role="alert">{errors[row.id]}</p>
            {/if}

            {#if rejecting[row.id]}
              <div class="reject-form">
                <input
                  type="text"
                  placeholder="Optional note to the submitter…"
                  bind:value={notes[row.id]}
                  maxlength="1000"
                />
                <div class="actions">
                  <button
                    class="cancel"
                    type="button"
                    onclick={() => (rejecting = { ...rejecting, [row.id]: false })}
                  >
                    Back
                  </button>
                  <button
                    class="danger"
                    type="button"
                    disabled={busy[row.id]}
                    onclick={() => resolveDeletion(row, "reject")}
                  >
                    Confirm reject
                  </button>
                </div>
              </div>
            {:else}
              <div class="actions">
                <button
                  class="cancel"
                  type="button"
                  disabled={busy[row.id]}
                  onclick={() => (rejecting = { ...rejecting, [row.id]: true })}
                >
                  Reject
                </button>
                <button
                  class="danger"
                  type="button"
                  disabled={busy[row.id] || !row.facility_id}
                  onclick={() => resolveDeletion(row, "approve")}
                >
                  Delete campground
                </button>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
```

(All classes used — `.queue`, `.card`, `.note`, `.badge`, `.danger`, `.winner-hint.error-hint`, `.reject-form` — already exist in this page's styles; no CSS additions.)

- [ ] **Step 4: Verify and commit**

Run the full manual end-to-end from **Verify** above, then:

```bash
cd frontend && pnpm check && pnpm test
git add src/routes/api/admin/deletions/+server.ts src/routes/admin/+page.server.ts src/routes/admin/+page.svelte
git commit -m "feat(admin): deletion-flag review queue with soft-delete approval

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Out of scope (deliberate)

- Prod deploy of the schema change (`backend pnpm deploy` + Teenybase remote-migration quirks in `docs/handoff.md:34`) — the owner does deploys.
- Filtering tombstones from `GET /api/facilities/[id]` — direct deep links to a tombstoned facility still resolve; harmless, and admin tooling benefits.
- An "undelete" admin action — trivially done via `wrangler d1 execute` if ever needed (YAGNI).
- Editing `forest`/`district`/`name`/`description` via suggest-an-edit — not in the owner's wishlist.

## Final integration check (after Task 9)

1. `cd frontend && pnpm check && pnpm test` — 0/0 and all tests green.
2. `cd etl && pnpm test` — all green.
3. Full manual pass with `backend pnpm dev` + `frontend pnpm dev`: suggest an edit changing counts + closed + location → approve in `/admin` → detail panel and marker color reflect it; flag a campground for deletion → approve → gone from map → `etl pnpm sync` doesn't bring it back.
4. Update `docs/handoff.md`: mark both wishlist items done (move to a "Session 2026-07-11" entry), note the new `delete_suggestions` table and `is_deleted` column, and that prod needs a backend migration deploy before the frontend hits it. **Prod deploy order matters:** the backend schema (Task 5) must be deployed before the frontend from this branch, or `/api/deletions` will 500 on the missing table.
