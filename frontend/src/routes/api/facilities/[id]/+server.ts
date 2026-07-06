import { json, error } from '@sveltejs/kit'
import { tbFetch } from '$lib/server/tbFetch'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ params }) => {
  const res = await tbFetch(`/api/v1/table/facilities/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `id == '${params.id}'`, limit: 1 }),
  })
  const data = (await res.json()) as { items?: Array<Record<string, unknown>> }
  const f = data.items?.[0]
  if (!f) throw error(404, 'Not found')
  if (typeof f.amenities === 'string') {
    try { f.amenities = JSON.parse(f.amenities) } catch { /* leave as-is */ }
  }
  return json(f)
}
