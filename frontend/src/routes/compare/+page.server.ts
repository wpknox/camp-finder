// frontend/src/routes/compare/+page.server.ts
import { tbFetch } from '$lib/server/tbFetch'
import type { PageServerLoad } from './$types'
import type { CellCoverage, Facility } from '$lib/types'

function parseCellCoverage(v: Facility['cell_coverage'] | string): CellCoverage | null {
  if (typeof v !== 'string') return v ?? null
  try { return JSON.parse(v) } catch { return null }
}

export const load: PageServerLoad = async ({ url }) => {
  const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 4)
  if (ids.length === 0) return { facilities: [] }

  // Teenybase rejects compound WHERE expressions (`||` and `&&` both fail to
  // parse), so we can't query several ids at once. Fetch the full set and
  // filter in-process — the same workaround used by /api/facilities. Fine at
  // ~592 records. Preserve the requested id order so columns match selection.
  const res = await tbFetch(`/api/v1/table/facilities/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 10000 }),
  })

  const data = await res.json() as { items?: Facility[] }
  // Teenybase stores `amenities` as a JSON string; CompareView reads it as an
  // object, so parse on the way out.
  const parsed: Facility[] = (data.items ?? []).map(f => ({
    ...f,
    amenities: typeof f.amenities === 'string' ? JSON.parse(f.amenities) : f.amenities,
    cell_coverage: parseCellCoverage(f.cell_coverage),
  }))
  const byId = new Map(parsed.map(f => [f.id, f]))
  const facilities = ids.map(id => byId.get(id)).filter((f): f is Facility => f != null)
  return { facilities }
}
