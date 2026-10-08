import { describe, it, expect } from "vitest";
import { distanceMiles, findNearby } from "./geo";

describe("distanceMiles", () => {
  it("is zero for the same point", () => {
    expect(distanceMiles({ lat: 39.7392, lng: -104.9903 }, { lat: 39.7392, lng: -104.9903 })).toBe(
      0,
    );
  });

  it("measures Denver to Boulder at roughly 24.3 miles", () => {
    const d = distanceMiles({ lat: 39.7392, lng: -104.9903 }, { lat: 40.015, lng: -105.2705 });
    expect(d).toBeCloseTo(24.3, 0);
  });
});

describe("findNearby", () => {
  const list = [
    { id: "far", name: "Far", lat: 45, lng: -110 },
    { id: "b", name: "B", lat: 44.01, lng: -110 },
    { id: "a", name: "A", lat: 44.005, lng: -110 },
  ];
  it("sorts by distance, applies cutoff and rounds km", () => {
    const r = findNearby(list, 44, -110, 1.5);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r[0].km).toBe(0.56);
    expect(findNearby(list, 44, -110, 0.1)).toEqual([]);
  });
});
