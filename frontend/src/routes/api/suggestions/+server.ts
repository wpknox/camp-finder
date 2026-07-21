import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { tbFetch } from '$lib/server/tbFetch'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import { suggestionLimiter } from '$lib/server/auth/limiters'
import type { EditChanges } from '$lib/types'

const TB = `/api/v1/table/edit_suggestions`
// Deliberately uses TB_SERVICE_TOKEN: edit_suggestions has ALL Teenybase rules set to
// 'false', so the service token is the only way in. Unlike sibling routes (api/saved,
// api/ratings) which use the user's own JWT — don't "fix" this to the per-request
// user-token pattern.
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
}

// Top-level keys only; inner `amenities` keys are deliberately not validated here —
// admin review is the gate, and malformed submissions get rejected there.
const ALLOWED_KEYS = new Set([
  'fee_min', 'fee_max', 'season_start', 'season_end', 'amenities',
  'fcfs_total', 'reservable_total', 'is_closed', 'lat', 'lng', 'cell_coverage',
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
  if (changes.cell_coverage !== undefined) {
    if (typeof changes.cell_coverage !== 'object' || changes.cell_coverage === null)
      return 'cell_coverage must be an object'
    for (const [k, v] of Object.entries(changes.cell_coverage)) {
      if (!['verizon', 'att', 'tmobile'].includes(k)) return `Unknown carrier: ${k}`
      if (v !== null && typeof v !== 'boolean') return 'carrier values must be boolean or null'
    }
  }
  return null
}

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  if (!locals.user) return json({ error: 'Unauthenticated' }, { status: 401 })
  if (!suggestionLimiter.check(getClientAddress()).allowed)
    return json({ error: 'Too many submissions — try again later' }, { status: 429 })

  const { facility_id, changes, note } = (await request.json()) as {
    facility_id?: string
    changes?: EditChanges
    note?: string
  }
  if (!facility_id) return json({ error: 'facility_id required' }, { status: 400 })
  if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0)
    return json({ error: 'changes required' }, { status: 400 })
  const badKey = Object.keys(changes).find((k) => !ALLOWED_KEYS.has(k))
  if (badKey) return json({ error: `Unknown field: ${badKey}` }, { status: 400 })

  const invalid = validateChanges(changes)
  if (invalid) return json({ error: invalid }, { status: 400 })

  const res = await tbFetch(`${TB}/insert`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      values: {
        facility_id,
        user_id: locals.user.id,
        changes: JSON.stringify(changes), // Teenybase quirk: JSON fields stringified on write
        note: (note ?? '').slice(0, 1000),
        status: 'pending',
      },
    }),
  })
  const data = await res.json()
  return json(data, { status: res.ok ? 201 : res.status })
}
