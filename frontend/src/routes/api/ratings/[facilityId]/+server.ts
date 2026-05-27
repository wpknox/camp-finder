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
