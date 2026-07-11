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
