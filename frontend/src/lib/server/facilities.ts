import { tbFetch } from "./tbFetch";
import { tb } from "./tb";
import { parseJson } from "../json";
import type { Facility } from "../types";

// "Public" facility = not admin-tombstoned (is_deleted). This module is the
// single place that filter lives; every public read of facilities goes here.
// Reads are unauthenticated on purpose: facilities has public list/view rules.
const publicHeaders = { "Content-Type": "application/json" };

/** Parse Teenybase JSON-string columns on a raw facility row. */
export function parseFacility(raw: Record<string, unknown>): Facility {
  return {
    ...raw,
    amenities: parseJson(raw.amenities, {}),
    cell_coverage: parseJson(raw.cell_coverage, null),
    merged_ridb_ids: parseJson(raw.merged_ridb_ids, []),
  } as unknown as Facility;
}

/** True for admin-tombstoned rows (SQLite booleans may arrive as true or 1). */
export const isTombstoned = (raw: Record<string, unknown>): boolean =>
  !!raw.is_deleted;

/**
 * All non-tombstoned facilities, parsed. Teenybase can't do compound WHERE, so
 * callers filter further in-process. Limit 10000 (bbox used 2000, compare 10000).
 */
export async function listPublicFacilities(): Promise<Facility[]> {
  const res = await tbFetch(tb("facilities/list"), {
    method: "POST",
    headers: publicHeaders,
    body: JSON.stringify({ limit: 10000 }),
  });
  const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
  return (data.items ?? []).filter((f) => !isTombstoned(f)).map(parseFacility);
}

/** One non-tombstoned facility by id, or null if missing/tombstoned. */
export async function getPublicFacility(id: string): Promise<Facility | null> {
  const res = await tbFetch(tb(`facilities/view/${id}`), {
    headers: publicHeaders,
  });
  if (!res.ok) return null;
  const raw = (await res.json()) as Record<string, unknown> | null;
  if (!raw || isTombstoned(raw)) return null;
  return parseFacility(raw);
}

/** Ids get interpolated into Teenybase WHERE strings; reject quote characters. */
export const isSafeId = (id: string): boolean => !/['"]/.test(id);
