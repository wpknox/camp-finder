// frontend/src/routes/compare/+page.server.ts
import { PUBLIC_TB_URL } from '$env/static/public'
import type { PageServerLoad } from './$types'
import type { Facility } from '$lib/types'

export const load: PageServerLoad = async ({ url }) => {
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4)
  if (ids.length === 0) return { facilities: [] }

  const where = ids.map(id => `id == '${id}'`).join(' || ')

  const res = await fetch(`${PUBLIC_TB_URL}/api/v1/table/facilities/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where, limit: 4 }),
  })

  const data = await res.json() as { items?: Facility[] }
  return { facilities: data.items ?? [] }
}
