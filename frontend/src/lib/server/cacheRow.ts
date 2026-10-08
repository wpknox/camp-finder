import { tbFetch } from './tbFetch'
import { tb, tbHeaders } from './tb'

// Per-facility cache rows (alerts, nearby_pois): one row per facility_id.

/** Read the cache row for a facility. Unauthenticated: these tables are publicly readable. */
export async function readCacheRow<T extends { id: string }>(
  table: string,
  facilityId: string,
): Promise<T | null> {
  const res = await tbFetch(tb(`${table}/list`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `facility_id == '${facilityId}'`, limit: 1 }),
  })
  const data = await res.json() as { items?: T[] }
  return data.items?.[0] ?? null
}

/** Edit the existing row, or insert a new one when there is none. Service-token write. */
export async function writeCacheRow(
  table: string,
  existingId: string | null,
  facilityId: string,
  values: Record<string, unknown>,
): Promise<void> {
  if (existingId) {
    await tbFetch(tb(`${table}/edit/${existingId}`), {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify(values),
    })
  } else {
    await tbFetch(tb(`${table}/insert`), {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ values: { facility_id: facilityId, ...values } }),
    })
  }
}

/** True when the timestamp is no older than ttlMs. */
export function isFresh(isoTimestamp: string, ttlMs: number): boolean {
  return new Date(isoTimestamp).getTime() >= Date.now() - ttlMs
}
