import { describe, it, expect } from "vitest";
import { refsFacility } from "./queues";

describe("refsFacility", () => {
  it("matches facility_id, facility_a and facility_b", () => {
    expect(refsFacility({ facility_id: "x" }, "x")).toBe(true);
    expect(refsFacility({ facility_a: "x", facility_b: "y" }, "x")).toBe(true);
    expect(refsFacility({ facility_a: "y", facility_b: "x" }, "x")).toBe(true);
  });
  it("ignores other ids and nulls", () => {
    expect(refsFacility({ facility_id: "y" }, "x")).toBe(false);
    expect(refsFacility({ facility_a: "y", facility_b: null }, "x")).toBe(false);
    expect(refsFacility({ facility_id: null }, "x")).toBe(false);
  });
});
