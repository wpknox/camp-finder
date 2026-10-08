import type { Amenities, DataQuality } from "./types";

/** Matches the ETL default (normalizeAmenities([])): everything off/unknown. Fresh object each call. */
export function defaultAmenities(): Amenities {
  return {
    potableWater: false,
    toiletType: "unknown",
    bearBoxes: false,
    driveUp: false,
    maxRvLength: null,
    electricHookups: false,
    waterHookups: false,
    sewerHookups: false,
    petsAllowed: false,
    horsesAllowed: false,
    picnicTables: false,
    fireRings: false,
    accessible: false,
  };
}

/** Copy of etl/src/normalize.ts scoreDataQuality. MUST stay in lockstep with the ETL —
 * enforced by fixtures/data-quality.json (lockstep.test.ts in both packages). */
export function scoreDataQuality(amenities: Amenities): DataQuality {
  const populated = Object.entries(amenities).filter(([k, v]) => {
    if (k === "toiletType") return v !== "unknown";
    if (typeof v === "boolean") return v === true;
    return v !== null;
  }).length;
  if (populated === 0) return "unknown";
  if (populated < 5) return "sparse";
  return "rich";
}
