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

/** Fields the admin can explicitly choose winner/loser for during a merge. */
export type ChoiceField =
  | "name"
  | "location"
  | "forest"
  | "district"
  | "description"
  | "fee_min"
  | "fee_max"
  | "season_start"
  | "season_end"
  | "fcfs"
  | "fs_url";

export const CHOICE_FIELDS: readonly ChoiceField[] = [
  "name",
  "location",
  "forest",
  "district",
  "description",
  "fee_min",
  "fee_max",
  "season_start",
  "season_end",
  "fcfs",
  "fs_url",
];

export type FieldChoices = Partial<Record<ChoiceField, "winner" | "loser">>;

/** Winner's data wins; loser fills gaps. `choices` lets the admin explicitly
 * pick a side per field — that choice applies even for empty values, overriding
 * gap-fill. Fields absent from `choices` keep the default gap-fill behavior. */
export function mergeFacilityFields(
  winner: Facility,
  loser: Facility,
  choices?: FieldChoices,
): Facility {
  // merged starts as the winner, so a field only ever needs writing when the
  // loser's value should be taken: an explicit 'loser' choice, or no choice
  // and the winner's value is empty (gap-fill).
  const merged: Facility = { ...winner };

  if (choices?.name === "loser") merged.name = loser.name;

  if (choices?.location === "loser") {
    merged.lat = loser.lat;
    merged.lng = loser.lng;
  }

  for (const f of SCALAR_FIELDS) {
    const choice = choices?.[f as ChoiceField];
    const takeLoser =
      choice === "loser" ||
      (choice === undefined && isEmpty(merged[f]) && !isEmpty(loser[f]));
    if (takeLoser) {
      (merged as unknown as Record<string, unknown>)[f] = loser[f];
    }
  }

  // FCFS counts travel as a unit; default gap-fill only when the winner has
  // none at all (scraped records often lack counts entirely).
  const takeLoserFcfs =
    choices?.fcfs === "loser" ||
    (choices?.fcfs === undefined &&
      merged.fcfs_total == null &&
      merged.reservable_total == null);
  if (takeLoserFcfs) {
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
