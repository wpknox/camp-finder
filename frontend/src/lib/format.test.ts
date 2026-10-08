import { describe, it, expect } from "vitest";
import { formatFeeRange, formatFeeShort, formatDate } from "./format";

describe("formatFeeRange", () => {
  it("handles all cases", () => {
    expect(formatFeeRange({ fee_min: 0, fee_max: 0 })).toBe("Free");
    expect(formatFeeRange({ fee_min: null, fee_max: null })).toBeNull();
    expect(formatFeeRange({ fee_min: 15, fee_max: 15 })).toBe("$15/night");
    expect(formatFeeRange({ fee_min: 10, fee_max: 25 })).toBe("$10–$25/night");
  });
});
describe("formatFeeShort", () => {
  it("handles all cases", () => {
    expect(formatFeeShort({ fee_min: 0 }, "—")).toBe("Free");
    expect(formatFeeShort({ fee_min: 12 }, "—")).toBe("$12");
    expect(formatFeeShort({ fee_min: null }, "—")).toBe("—");
    expect(formatFeeShort({ fee_min: null }, "?")).toBe("?");
  });
});
describe("formatDate", () => {
  it("uses plain locale date without opts", () => {
    const iso = "2026-03-04T12:00:00Z";
    expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString());
  });
  it("uses opts when given", () => {
    const iso = "2026-03-04T12:00:00Z";
    const o: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
    expect(formatDate(iso, o)).toBe(new Date(iso).toLocaleDateString(undefined, o));
  });
});
