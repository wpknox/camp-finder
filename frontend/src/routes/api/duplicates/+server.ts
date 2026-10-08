import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { guardSubmission, insertRow, listPending } from '$lib/server/moderation'

// Deliberately uses the service token (see $lib/server/tb) — don't "fix" this to the
// per-request user-token pattern of sibling routes (api/saved, api/ratings).

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  const blocked = guardSubmission(locals, getClientAddress)
  if (blocked) return blocked

  const { facility_a, facility_b, note } = (await request.json()) as Record<string, string>
  if (!facility_a || !facility_b)
    return json({ error: 'facility_a and facility_b required' }, { status: 400 })
  if (facility_a === facility_b)
    return json({ error: "A campground can't be a duplicate of itself" }, { status: 400 })

  // Dedupe on the unordered pair (no compound WHERE — fetch pending and filter in JS).
  // 1000-row pending ceiling: fine at current scale, revisit if the queue ever grows.
  const existing = await listPending<{ facility_a: string; facility_b: string }>('merge_suggestions')
  // Set pair-check is safe because self-pairs (a === b) are rejected above.
  const pair = new Set([facility_a, facility_b])
  if (existing.some((s) => pair.has(s.facility_a) && pair.has(s.facility_b)))
    return json({ duplicate: true }, { status: 200 })

  return insertRow('merge_suggestions', {
    facility_a,
    facility_b,
    user_id: locals.user!.id,
    note: (note ?? '').slice(0, 1000),
    status: 'pending',
  })
}
