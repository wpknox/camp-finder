import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { PUBLIC_TB_URL } from '$env/static/public'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import { suggestionLimiter } from '$lib/server/auth/limiters'

const TB = `${PUBLIC_TB_URL}/api/v1/table/merge_suggestions`
// Deliberately uses TB_SERVICE_TOKEN: merge_suggestions has ALL Teenybase rules set to
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

  const { facility_a, facility_b, note } = (await request.json()) as Record<string, string>
  if (!facility_a || !facility_b)
    return json({ error: 'facility_a and facility_b required' }, { status: 400 })
  if (facility_a === facility_b)
    return json({ error: "A campground can't be a duplicate of itself" }, { status: 400 })

  // Dedupe on the unordered pair (no compound WHERE — fetch pending and filter in JS).
  // 1000-row pending ceiling: fine at current scale, revisit if the queue ever grows.
  const existingRes = await fetch(`${TB}/list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ where: `status == 'pending'`, limit: 1000 }),
  })
  const existing = (await existingRes.json()) as {
    items?: Array<{ facility_a: string; facility_b: string }>
  }
  // Set pair-check is safe because self-pairs (a === b) are rejected above.
  const pair = new Set([facility_a, facility_b])
  if (existing.items?.some((s) => pair.has(s.facility_a) && pair.has(s.facility_b)))
    return json({ duplicate: true }, { status: 200 })

  const res = await fetch(`${TB}/insert`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      values: {
        facility_a,
        facility_b,
        user_id: locals.user.id,
        note: (note ?? '').slice(0, 1000),
        status: 'pending',
      },
    }),
  })
  const data = await res.json()
  return json(data, { status: res.ok ? 201 : res.status })
}
