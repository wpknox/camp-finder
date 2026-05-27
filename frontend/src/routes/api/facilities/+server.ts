import { json } from '@sveltejs/kit'
import { PUBLIC_TB_URL } from '$env/static/public'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const north = parseFloat(url.searchParams.get('north') ?? '')
  const south = parseFloat(url.searchParams.get('south') ?? '')
  const east  = parseFloat(url.searchParams.get('east')  ?? '')
  const west  = parseFloat(url.searchParams.get('west')  ?? '')

  if ([north, south, east, west].some(isNaN)) {
    return json({ error: 'bbox params required: north, south, east, west' }, { status: 400 })
  }

  const where = `lat >= ${south} && lat <= ${north} && lng >= ${west} && lng <= ${east}`

  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/facilities/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where, limit: 500 }),
  })

  const data = await res.json() as { items?: Array<Record<string, unknown>> }
  const items = (data.items ?? []).map(f => ({
    ...f,
    amenities: typeof f.amenities === 'string' ? JSON.parse(f.amenities) : f.amenities,
  }))
  return json(items)
}
