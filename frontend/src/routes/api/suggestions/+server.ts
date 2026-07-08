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
const ALLOWED_KEYS = new Set(['fee_min', 'fee_max', 'season_start', 'season_end', 'amenities'])

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
