import { describe, it, expect } from "vitest";
import { defaultAmenities, scoreDataQuality } from "./amenities";
import { buildFacilityValues } from "./campgroundSubmission";

describe("defaultAmenities", () => {
  it("is all off/unknown and a fresh object each call", () => {
    const a = defaultAmenities();
    expect(a.toiletType).toBe("unknown");
    expect(a.maxRvLength).toBeNull();
    expect(scoreDataQuality(a)).toBe("unknown");
    a.potableWater = true;
    expect(defaultAmenities().potableWater).toBe(false);
  });
});

describe("scoreDataQuality", () => {
  it("matches ETL thresholds", () => {
    const base = buildFacilityValues({ name: "a", lat: 0, lng: 0 }, "x", null, "");
    expect(base.ridb_data_quality).toBe("unknown");
    const five = buildFacilityValues(
      {
        name: "a",
        lat: 0,
        lng: 0,
        amenities: {
          potableWater: true,
          bearBoxes: true,
          petsAllowed: true,
          fireRings: true,
          accessible: true,
        },
      },
      "x",
      null,
      "",
    );
    expect(five.ridb_data_quality).toBe("rich");
    expect(scoreDataQuality(JSON.parse(five.amenities))).toBe("rich");
  });
  it("is sparse under five populated fields", () => {
    expect(scoreDataQuality({ ...defaultAmenities(), potableWater: true })).toBe("sparse");
  });
});
