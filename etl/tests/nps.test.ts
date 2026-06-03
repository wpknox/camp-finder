import { describe, it, expect } from "vitest";
import {
  normalizeNpsCampground,
  normalizeNpsAmenities,
  extractNpsFees,
  detectIsClosed,
  isInColorado,
} from "../src/nps.js";
import type { NpsCampground } from "../src/nps.js";

// Minimal valid campground in Colorado (Rocky Mountain NP area)
function makeCampground(overrides: Partial<NpsCampground> = {}): NpsCampground {
  return {
    id: "test-123",
    url: "https://www.nps.gov/romo/campgrounds/test",
    name: "Test Campground",
    parkCode: "romo",
    description: "A beautiful campground near the lake.",
    latitude: "40.3",
    longitude: "-105.6",
    reservationInfo: "",
    reservationUrl: "",
    regulationsOverview: "",
    amenities: {
      toilets: [],
      potableWater: [],
      foodStorageLockers: "No",
      showers: [],
      trashRecyclingCollection: "No",
      internetConnectivity: "No",
      cellPhoneReception: "No",
      laundry: "No",
      amphitheater: "No",
      dumpStation: "No",
      campStore: "No",
      staffOrVolunteerHostOnsite: "No",
      iceAvailableForSale: "No",
      firewoodForSale: "No",
    },
    fees: [],
    numberOfSitesReservable: "0",
    numberOfSitesFirstComeFirstServe: "10",
    campsites: {
      totalSites: "10",
      group: "0",
      horse: "0",
      tentOnly: "0",
      electricalHookups: "0",
      rvOnly: "0",
      walkBoatTo: "0",
      other: "10",
    },
    accessibility: {
      wheelchairAccess: "",
      rvAllowed: "0",
      rvInfo: "",
      rvMaxLength: "0",
      trailerMaxLength: "0",
      adaInfo: "",
      trailerAllowed: "0",
      accessRoads: [],
      classifications: [],
      internetInfo: "",
      cellPhoneInfo: "",
      fireStovePolicy: "",
      additionalInfo: "",
    },
    operatingHours: [],
    ...overrides,
  };
}

// ─── isInColorado ────────────────────────────────────────────────────────────

describe("isInColorado", () => {
  it("accepts coordinates inside Colorado", () => {
    expect(isInColorado(40.3, -105.6)).toBe(true); // Rocky Mountain NP
    expect(isInColorado(40.727, -108.888)).toBe(true); // Gates of Lodore (the motivating case)
    expect(isInColorado(37.2, -107.8)).toBe(true); // Mesa Verde area
  });

  it("rejects coordinates outside Colorado", () => {
    expect(isInColorado(40.7128, -74.006)).toBe(false); // New York
    expect(isInColorado(35.0, -106.7)).toBe(false); // New Mexico
    expect(isInColorado(41.5, -112.0)).toBe(false); // Utah (west of CO)
  });

  it("accepts coordinates on the border buffer", () => {
    expect(isInColorado(36.95, -105.0)).toBe(true); // just inside southern buffer
  });
});

// ─── normalizeNpsCampground ───────────────────────────────────────────────────

describe("normalizeNpsCampground", () => {
  it("returns null for empty/missing latitude string", () => {
    expect(normalizeNpsCampground(makeCampground({ latitude: "" }), "Test Park")).toBeNull();
  });

  it("returns null for non-numeric latitude string", () => {
    expect(normalizeNpsCampground(makeCampground({ latitude: "N/A" }), "Test Park")).toBeNull();
  });

  it("returns null for campground outside Colorado bounding box", () => {
    const result = normalizeNpsCampground(
      makeCampground({ latitude: "35.0", longitude: "-106.7" }),
      "Test Park",
    );
    expect(result).toBeNull();
  });

  it("returns a record for a campground inside Colorado", () => {
    const result = normalizeNpsCampground(makeCampground(), "Rocky Mountain National Park");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Test Campground");
    expect(result!.lat).toBe(40.3);
    expect(result!.lng).toBe(-105.6);
    expect(result!.forest).toBe("Rocky Mountain National Park");
  });

  it("uses nps- prefix in ridb_id", () => {
    const result = normalizeNpsCampground(makeCampground(), "Rocky Mountain National Park");
    expect(result!.ridb_id).toBe("nps-romo-test-123");
  });

  it("stores amenities as a JSON string", () => {
    const result = normalizeNpsCampground(makeCampground(), "Rocky Mountain National Park");
    expect(typeof result!.amenities).toBe("string");
    expect(() => JSON.parse(result!.amenities as unknown as string)).not.toThrow();
    const parsed = JSON.parse(result!.amenities as unknown as string);
    expect(parsed).toHaveProperty("toiletType");
  });

  it("sets is_fully_fcfs when all sites are first-come", () => {
    const result = normalizeNpsCampground(
      makeCampground({ numberOfSitesFirstComeFirstServe: "10", numberOfSitesReservable: "0" }),
      "Rocky Mountain National Park",
    );
    expect(result!.is_fully_fcfs).toBe(true);
    expect(result!.is_partial_fcfs).toBe(false);
    expect(result!.fcfs_total).toBe(10);
    expect(result!.reservable_total).toBe(0);
  });

  it("sets is_partial_fcfs when mix of reservable and FCFS", () => {
    const result = normalizeNpsCampground(
      makeCampground({ numberOfSitesFirstComeFirstServe: "5", numberOfSitesReservable: "10" }),
      "Rocky Mountain National Park",
    );
    expect(result!.is_partial_fcfs).toBe(true);
    expect(result!.is_fully_fcfs).toBe(false);
    expect(result!.fcfs_total).toBe(5);
    expect(result!.reservable_total).toBe(10);
  });

  it("handles non-numeric site count strings without throwing", () => {
    const result = normalizeNpsCampground(
      makeCampground({ numberOfSitesFirstComeFirstServe: "N/A", numberOfSitesReservable: "" }),
      "Rocky Mountain National Park",
    );
    expect(result!.fcfs_total).toBe(0);
    expect(result!.reservable_total).toBe(0);
  });

  it("stores the NPS page url in fs_url", () => {
    const result = normalizeNpsCampground(makeCampground(), "Rocky Mountain National Park");
    expect(result!.fs_url).toBe("https://www.nps.gov/romo/campgrounds/test");
  });

  it("includes regulationsOverview in description", () => {
    const result = normalizeNpsCampground(
      makeCampground({ regulationsOverview: "Campfires allowed in fire rings only." }),
      "Rocky Mountain National Park",
    );
    expect(result!.description).toContain("Campfires allowed in fire rings only.");
  });
});

// ─── normalizeNpsAmenities ────────────────────────────────────────────────────

describe("normalizeNpsAmenities", () => {
  it("classifies flush toilets", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ amenities: { ...makeCampground().amenities, toilets: ["Flush Toilets - year round"] } }),
    );
    expect(result.toiletType).toBe("flush");
  });

  it("classifies vault toilets", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ amenities: { ...makeCampground().amenities, toilets: ["Vault Toilets - seasonal"] } }),
    );
    expect(result.toiletType).toBe("vault");
  });

  it("classifies pit toilets as vault", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ amenities: { ...makeCampground().amenities, toilets: ["Pit Toilets"] } }),
    );
    expect(result.toiletType).toBe("vault");
  });

  it("classifies None toilets as none", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ amenities: { ...makeCampground().amenities, toilets: ["None"] } }),
    );
    expect(result.toiletType).toBe("none");
  });

  it("classifies no toilet facilities phrasing as none", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ amenities: { ...makeCampground().amenities, toilets: ["No toilet facilities"] } }),
    );
    expect(result.toiletType).toBe("none");
  });

  it("returns unknown toilet type for empty array", () => {
    const result = normalizeNpsAmenities(makeCampground());
    expect(result.toiletType).toBe("unknown");
  });

  it("detects potable water from structured field", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ amenities: { ...makeCampground().amenities, potableWater: ["Tap Water - year round"] } }),
    );
    expect(result.potableWater).toBe(true);
  });

  it("returns false for potable water when field is None", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ amenities: { ...makeCampground().amenities, potableWater: ["None"] } }),
    );
    expect(result.potableWater).toBe(false);
  });

  it("returns false for potable water when array is empty", () => {
    const result = normalizeNpsAmenities(makeCampground());
    expect(result.potableWater).toBe(false);
  });

  it("detects bear boxes from foodStorageLockers Yes", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ amenities: { ...makeCampground().amenities, foodStorageLockers: "Yes - year round" } }),
    );
    expect(result.bearBoxes).toBe(true);
  });

  it("returns false for bear boxes when No", () => {
    const result = normalizeNpsAmenities(makeCampground());
    expect(result.bearBoxes).toBe(false);
  });

  it("parses RV max length as a number", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ accessibility: { ...makeCampground().accessibility, rvMaxLength: "35" } }),
    );
    expect(result.maxRvLength).toBe(35);
  });

  it("returns null for RV length of 0", () => {
    const result = normalizeNpsAmenities(makeCampground());
    expect(result.maxRvLength).toBeNull();
  });

  it('returns null for RV length of "N/A"', () => {
    const result = normalizeNpsAmenities(
      makeCampground({ accessibility: { ...makeCampground().accessibility, rvMaxLength: "N/A" } }),
    );
    expect(result.maxRvLength).toBeNull();
  });

  it("detects electric hookups from campsite count", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ campsites: { ...makeCampground().campsites, electricalHookups: "10" } }),
    );
    expect(result.electricHookups).toBe(true);
  });

  it("returns false for electric hookups when count is 0", () => {
    const result = normalizeNpsAmenities(makeCampground());
    expect(result.electricHookups).toBe(false);
  });

  it("detects horse sites from campsite count", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ campsites: { ...makeCampground().campsites, horse: "3" } }),
    );
    expect(result.horsesAllowed).toBe(true);
  });

  it('detects driveUp from rvAllowed "1"', () => {
    const result = normalizeNpsAmenities(
      makeCampground({ accessibility: { ...makeCampground().accessibility, rvAllowed: "1" } }),
    );
    expect(result.driveUp).toBe(true);
  });

  it('detects driveUp from rvAllowed "Yes"', () => {
    const result = normalizeNpsAmenities(
      makeCampground({ accessibility: { ...makeCampground().accessibility, rvAllowed: "Yes" } }),
    );
    expect(result.driveUp).toBe(true);
  });

  it("detects ADA accessible from wheelchairAccess field", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ accessibility: { ...makeCampground().accessibility, wheelchairAccess: "Partially accessible" } }),
    );
    expect(result.accessible).toBe(true);
  });

  it('returns false for accessible when wheelchairAccess is "None"', () => {
    const result = normalizeNpsAmenities(
      makeCampground({ accessibility: { ...makeCampground().accessibility, wheelchairAccess: "None" } }),
    );
    expect(result.accessible).toBe(false);
  });

  it("does not throw when amenities/accessibility/campsites are missing", () => {
    const c = makeCampground();
    (c as any).amenities = undefined;
    (c as any).accessibility = undefined;
    (c as any).campsites = undefined;
    expect(() => normalizeNpsAmenities(c)).not.toThrow();
    const result = normalizeNpsAmenities(c);
    expect(result.toiletType).toBe("unknown");
    expect(result.bearBoxes).toBe(false);
    expect(result.maxRvLength).toBeNull();
  });

  it("pulls picnic tables and pets from description text", () => {
    const result = normalizeNpsAmenities(
      makeCampground({
        description: "Each site has a picnic table. Dogs must be leashed.",
      }),
    );
    expect(result.picnicTables).toBe(true);
    expect(result.petsAllowed).toBe(true);
  });

  it("pulls fire rings from description text", () => {
    const result = normalizeNpsAmenities(
      makeCampground({ description: "Some sites have a fire pit and a picnic table." }),
    );
    expect(result.fireRings).toBe(true);
  });
});

// ─── extractNpsFees ───────────────────────────────────────────────────────────

describe("extractNpsFees", () => {
  it("extracts single fee from fees array", () => {
    const result = extractNpsFees(
      makeCampground({ fees: [{ cost: "20.00", description: "Per night", title: "Camping" }] }),
    );
    expect(result).toEqual({ fee_min: 20, fee_max: 20 });
  });

  it("finds min and max across multiple fees", () => {
    const result = extractNpsFees(
      makeCampground({
        fees: [
          { cost: "15.00", description: "", title: "" },
          { cost: "25.00", description: "", title: "" },
        ],
      }),
    );
    expect(result).toEqual({ fee_min: 15, fee_max: 25 });
  });

  it("includes free (cost 0) as a valid fee", () => {
    const result = extractNpsFees(
      makeCampground({ fees: [{ cost: "0", description: "Free", title: "" }] }),
    );
    expect(result).toEqual({ fee_min: 0, fee_max: 0 });
  });

  it("falls back to description text when fees array is empty", () => {
    const result = extractNpsFees(
      makeCampground({ description: "The camping fee is $18 per night." }),
    );
    expect(result).toEqual({ fee_min: 18, fee_max: 18 });
  });

  it("returns null when fees array is empty and no fee in description", () => {
    const result = extractNpsFees(makeCampground());
    expect(result).toEqual({ fee_min: null, fee_max: null });
  });

  it("ignores non-numeric cost strings without throwing", () => {
    const result = extractNpsFees(
      makeCampground({
        fees: [
          { cost: "TBD", description: "", title: "" },
          { cost: "", description: "", title: "" },
        ],
      }),
    );
    expect(result).toEqual({ fee_min: null, fee_max: null });
  });
});

// ─── detectIsClosed ───────────────────────────────────────────────────────────

describe("detectIsClosed", () => {
  const closed = (text: string) =>
    detectIsClosed(makeCampground({ description: text }));

  it("detects 'temporarily closed'", () => {
    expect(closed("This campground is temporarily closed for repairs.")).toBe(true);
  });

  it("detects 'closed indefinitely'", () => {
    expect(closed("The campground is closed indefinitely.")).toBe(true);
  });

  it("detects 'campground closed'", () => {
    expect(closed("Campground closed due to fire damage.")).toBe(true);
  });

  it("detects 'campground is closed'", () => {
    expect(closed("The campground is closed through October.")).toBe(true);
  });

  it("detects 'closed for the season'", () => {
    expect(closed("Closed for the season; reopens in May.")).toBe(true);
  });

  it("does not fire on 'road is closed'", () => {
    expect(closed("The access road is closed due to snow. Campground is open.")).toBe(false);
  });

  it("does not fire on 'gate closed at 10pm'", () => {
    expect(closed("Entry gate closed at 10pm nightly.")).toBe(false);
  });

  it("returns false for a normal open campground description", () => {
    expect(closed("Beautiful campground near the lake. Sites have fire pits and picnic tables.")).toBe(false);
  });

  it("checks reservationInfo and regulationsOverview as well", () => {
    const c = makeCampground({
      description: "A great campground.",
      reservationInfo: "This campground is closed indefinitely.",
    });
    expect(detectIsClosed(c)).toBe(true);
  });
});
