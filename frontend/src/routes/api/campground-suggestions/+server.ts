import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { tbFetch } from '$lib/server/tbFetch'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import { suggestionLimiter } from '$lib/server/auth/limiters'
import { validateSubmission, validateSourceUrl } from '$lib/campgroundSubmission'

const TB = `/api/v1/table/campground_suggestions`
// Deliberately uses TB_SERVICE_TOKEN: campground_suggestions has ALL Teenybase rules set
// to 'false', so the service token is the only way in. Unlike sibling routes (api/saved,
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

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return json({ error: 'Invalid request body' }, { status: 400 })

  // source_url / note are optional: non-strings are treated as empty.
  const sourceUrl = typeof body.source_url === 'string' ? body.source_url.trim() : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''

  const submissionError = validateSubmission(body.submission)
  if (submissionError) return json({ error: submissionError }, { status: 400 })
  const urlError = validateSourceUrl(sourceUrl)
  if (urlError) return json({ error: urlError }, { status: 400 })

  const res = await tbFetch(`${TB}/insert`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      values: {
        user_id: locals.user.id,
        submission: JSON.stringify(body.submission),
        source_url: sourceUrl || null,
        note: note || null,
        status: 'pending',
      },
    }),
  })
  const data = await res.json()
  return json(data, { status: res.ok ? 201 : res.status })
}
