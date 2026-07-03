import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { PUBLIC_TB_URL } from '$env/static/public'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import { suggestionLimiter } from '$lib/server/auth/limiters'
import type { EditChanges } from '$lib/types'

const TB = `${PUBLIC_TB_URL}/api/v1/table/edit_suggestions`
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
}

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

  const res = await fetch(`${TB}/insert`, {
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
