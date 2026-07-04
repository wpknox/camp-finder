import type { Facility, Amenities } from "$lib/types";

/** Source richness: numeric RIDB record > NPS > fs.usda.gov scrape. */
function sourceRank(ridbId: string): number {
  if (ridbId.startsWith("fs-")) return 0;
  if (ridbId.startsWith("nps-")) return 1;
  return 2;
}

export function pickWinner(a: Facility, b: Facility): Facility {
  return sourceRank(b.ridb_id) > sourceRank(a.ridb_id) ? b : a;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || v === "unknown";
}

const SCALAR_FIELDS = [
  "forest",
  "district",
  "description",
  "fee_min",
  "fee_max",
  "season_start",
  "season_end",
  "fs_url",
] as const;

/** Winner's data wins; loser fills gaps. Never touches id/ridb_id/name/lat/lng. */
export function mergeFacilityFields(winner: Facility, loser: Facility): Facility {
  const merged: Facility = { ...winner };

  for (const f of SCALAR_FIELDS) {
    if (isEmpty(merged[f]) && !isEmpty(loser[f])) {
      (merged as unknown as Record<string, unknown>)[f] = loser[f];
    }
  }

  // FCFS counts travel as a unit; only fill if winner has none at all
  // (scraped records often lack counts entirely).
  if (merged.fcfs_total == null && merged.reservable_total == null) {
    merged.fcfs_total = loser.fcfs_total;
    merged.reservable_total = loser.reservable_total;
    merged.is_fully_fcfs = loser.is_fully_fcfs;
    merged.is_partial_fcfs = loser.is_partial_fcfs;
  }

  const wa = (winner.amenities ?? {}) as unknown as Record<string, unknown>;
  const la = (loser.amenities ?? {}) as unknown as Record<string, unknown>;
  const amenities: Record<string, unknown> = { ...wa };
  for (const key of new Set([...Object.keys(wa), ...Object.keys(la)])) {
    if (isEmpty(amenities[key]) && !isEmpty(la[key])) amenities[key] = la[key];
  }
  merged.amenities = amenities as unknown as Amenities;

  merged.merged_ridb_ids = [
    ...new Set([
      ...(winner.merged_ridb_ids ?? []),
      loser.ridb_id,
      ...(loser.merged_ridb_ids ?? []),
    ]),
  ];
  return merged;
}
