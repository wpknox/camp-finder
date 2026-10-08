import { describe, it, expect } from "vitest";
import { facilityStatus, fcfsTier, STATUS_META } from "./status";

const f = (c: boolean, full: boolean, part: boolean) => ({
  is_closed: c,
  is_fully_fcfs: full,
  is_partial_fcfs: part,
});

describe("status", () => {
  it("derives status with closed taking priority", () => {
    expect(facilityStatus(f(true, true, false))).toBe("closed");
    expect(facilityStatus(f(false, true, false))).toBe("fully");
    expect(facilityStatus(f(false, false, true))).toBe("partial");
    expect(facilityStatus(f(false, false, false))).toBe("reservable");
  });
  it("pins colors and labels", () => {
    expect(STATUS_META.closed).toEqual({ cssVar: "var(--rust)", hex: "#a23a17", label: "Closed" });
    expect(STATUS_META.fully).toEqual({
      cssVar: "var(--moss)",
      hex: "#5f7d34",
      label: "Fully first-come, first-served",
    });
    expect(STATUS_META.partial).toEqual({
      cssVar: "var(--ochre)",
      hex: "#c8932f",
      label: "Partially first-come, first-served",
    });
    expect(STATUS_META.reservable).toEqual({
      cssVar: "var(--lake)",
      hex: "#356b7d",
      label: "Reservable only",
    });
  });
  it("fcfsTier matches badge logic", () => {
    expect(fcfsTier(5, true)).toBe("fully");
    expect(fcfsTier(2, false)).toBe("partial");
    expect(fcfsTier(0, false)).toBe("reservable");
  });
});
