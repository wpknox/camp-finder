import { describe, it, expect } from "vitest";
import {
  feeError,
  countError,
  latError,
  lngError,
  feeRangeError,
  validateEditChanges,
} from "./validation";

describe("field helpers", () => {
  it("feeError", () => {
    expect(feeError("")).toBe("");
    expect(feeError("   ")).toBe("");
    expect(feeError("12.5")).toBe("");
    expect(feeError("abc")).toBe("Enter a valid number.");
    expect(feeError("-1")).toBe("Enter a valid number.");
  });
  it("countError", () => {
    expect(countError("")).toBe("");
    expect(countError("0")).toBe("");
    expect(countError("3")).toBe("");
    expect(countError("1.5")).toBe("Enter a whole number (0 or more).");
    expect(countError("-2")).toBe("Enter a whole number (0 or more).");
    expect(countError("x")).toBe("Enter a whole number (0 or more).");
  });
  it("latError / lngError respect required", () => {
    expect(latError("", { required: false })).toBe("");
    expect(latError("  ", { required: true })).toBe("Latitude must be -90 to 90.");
    expect(latError("45", { required: true })).toBe("");
    expect(latError("91", { required: false })).toBe("Latitude must be -90 to 90.");
    expect(latError("x", { required: false })).toBe("Latitude must be -90 to 90.");
    expect(lngError("", { required: false })).toBe("");
    expect(lngError("", { required: true })).toBe("Longitude must be -180 to 180.");
    expect(lngError("-180", { required: true })).toBe("");
    expect(lngError("181", { required: false })).toBe("Longitude must be -180 to 180.");
  });
  it("feeRangeError", () => {
    expect(feeRangeError("10", "5")).toBe("Max fee must be at least the min fee.");
    expect(feeRangeError("5", "5")).toBe("");
    expect(feeRangeError("", "5")).toBe("");
    expect(feeRangeError("10", "")).toBe("");
    expect(feeRangeError("x", "5")).toBe("");
    expect(feeRangeError("10", "-5")).toBe("");
  });
});

describe("validateEditChanges", () => {
  it("rejects unknown keys", () => {
    expect(validateEditChanges({ name: "x" })).toBe("Unknown field: name");
  });
  it("validates counts", () => {
    expect(validateEditChanges({ fcfs_total: -1 })).toBe(
      "fcfs_total must be a non-negative integer",
    );
    expect(validateEditChanges({ reservable_total: 1.5 })).toBe(
      "reservable_total must be a non-negative integer",
    );
    expect(validateEditChanges({ fcfs_total: null })).toBeNull();
  });
  it("validates is_closed", () => {
    expect(validateEditChanges({ is_closed: "yes" })).toBe("is_closed must be a boolean");
  });
  it("validates lat/lng", () => {
    expect(validateEditChanges({ lat: 91, lng: 0 })).toBe("lat must be between -90 and 90");
    expect(validateEditChanges({ lat: 0, lng: 181 })).toBe("lng must be between -180 and 180");
    expect(validateEditChanges({ lat: 10 })).toBe("lat and lng must be provided together");
    expect(validateEditChanges({ lng: 10 })).toBe("lat and lng must be provided together");
  });
  it("validates toiletType", () => {
    expect(validateEditChanges({ amenities: { toiletType: "vault" } })).toBeNull();
    expect(validateEditChanges({ amenities: { toiletType: "pit" } })).toBe(
      "toiletType must be flush, vault, none or unknown",
    );
  });
  it("validates cell_coverage", () => {
    expect(validateEditChanges({ cell_coverage: "x" })).toBe("cell_coverage must be an object");
    expect(validateEditChanges({ cell_coverage: null })).toBe("cell_coverage must be an object");
    expect(validateEditChanges({ cell_coverage: { sprint: true } })).toBe(
      "Unknown carrier: sprint",
    );
    expect(validateEditChanges({ cell_coverage: { att: "yes" } })).toBe(
      "carrier values must be boolean or null",
    );
  });
  it("accepts a valid full change set", () => {
    expect(
      validateEditChanges({
        fee_min: 10,
        fee_max: 20,
        season_start: "May",
        season_end: "Sep",
        fcfs_total: 5,
        reservable_total: 0,
        is_closed: false,
        lat: 44.1,
        lng: -110.2,
        amenities: { potableWater: true, toiletType: "flush" },
        cell_coverage: { verizon: true, att: null, tmobile: false },
      }),
    ).toBeNull();
  });
});
