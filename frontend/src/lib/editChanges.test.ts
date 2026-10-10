import { describe, it, expect } from "vitest";
import { buildEditChanges, type EditForm } from "./editChanges";
import { EDITABLE_AMENITIES } from "./fields";
import type { Facility, TriState } from "./types";

const facility = {
  id: "f1",
  lat: 38.123456,
  lng: -105.654321,
  fee_min: 10,
  fee_max: null,
  season_start: "May",
  season_end: "",
  fcfs_total: 5,
  reservable_total: null,
  is_closed: false,
  amenities: { potableWater: true, toiletType: "vault" },
  cell_coverage: { verizon: true, att: null, tmobile: false, as_of: "2025-12" },
} as unknown as Facility;

const amenities = (potableWater: TriState): EditForm["amenityValues"] => ({
  ...(Object.fromEntries(
    EDITABLE_AMENITIES.map(({ key }) => [key, "unknown"]),
  ) as EditForm["amenityValues"]),
  potableWater,
});

/** The form exactly as SuggestEditModal opens it for `facility`. */
const unchanged = (): EditForm => ({
  feeMin: "10",
  feeMax: "",
  seasonStart: "May",
  seasonEnd: "",
  fcfsTotal: "5",
  reservableTotal: "",
  closed: false,
  lat: facility.lat.toFixed(5),
  lng: facility.lng.toFixed(5),
  amenityValues: amenities("yes"),
  toiletType: "vault",
  carrierValues: { verizon: "yes", att: "unknown", tmobile: "no" },
});

describe("buildEditChanges", () => {
  it("returns nothing for an untouched form", () => {
    expect(buildEditChanges(facility, unchanged())).toEqual({});
  });

  it("treats whitespace-only numbers as blank, never 0", () => {
    const c = buildEditChanges(facility, {
      ...unchanged(),
      feeMin: "  ",
      feeMax: "   ",
      reservableTotal: " ",
    });
    expect(c).toEqual({ fee_min: null });
  });

  it("parses padded numbers", () => {
    expect(buildEditChanges(facility, { ...unchanged(), fcfsTotal: " 12 " })).toEqual({
      fcfs_total: 12,
    });
  });

  it("clearing a set fee proposes null", () => {
    expect(buildEditChanges(facility, { ...unchanged(), feeMin: "" })).toEqual({ fee_min: null });
  });

  it("trims seasons; whitespace-only is no change from empty", () => {
    expect(
      buildEditChanges(facility, { ...unchanged(), seasonStart: " May ", seasonEnd: "  " }),
    ).toEqual({});
    expect(buildEditChanges(facility, { ...unchanged(), seasonEnd: " Oct " })).toEqual({
      season_end: "Oct",
    });
  });

  it("emits lat/lng together, rounded, only when moved", () => {
    expect(buildEditChanges(facility, { ...unchanged(), lat: "38.2000049" })).toEqual({
      lat: 38.2,
      lng: -105.65432,
    });
  });

  it("diffs closed status, amenities, toilet and carriers", () => {
    const c = buildEditChanges(facility, {
      ...unchanged(),
      closed: true,
      amenityValues: amenities("unknown"),
      toiletType: "flush",
      carrierValues: { verizon: "yes", att: "yes", tmobile: "unknown" },
    });
    expect(c).toEqual({
      is_closed: true,
      amenities: { potableWater: null, toiletType: "flush" },
      cell_coverage: { att: true, tmobile: null },
    });
  });
});
