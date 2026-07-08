import { describe, it, expect } from "vitest";
import {
  CO_BBOX,
  GRID_RADIUS_MILES,
  buildCoGrid,
  inCoBbox,
  CAMPGROUND_QUERY_PARAMS,
} from "../src/forests.js";

function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe("CAMPGROUND_QUERY_PARAMS", () => {
  it("has no state or activity filter (both silently drop real campgrounds)", () => {
    expect(CAMPGROUND_QUERY_PARAMS).not.toHaveProperty("state");
    expect(CAMPGROUND_QUERY_PARAMS).not.toHaveProperty("activity");
    expect(CAMPGROUND_QUERY_PARAMS.facilitytype).toBe("Campground");
  });
});

describe("inCoBbox", () => {
  it("accepts Colorado points and rejects neighbors", () => {
    expect(inCoBbox(38.7305556, -106.7466667)).toBe(true); // Rosy Lane
    expect(inCoBbox(39.7392, -104.9903)).toBe(true); // Denver
    expect(inCoBbox(43.0, -107.0)).toBe(false); // Wyoming
    expect(inCoBbox(38.5, -110.0)).toBe(false); // Utah
  });
});

describe("buildCoGrid", () => {
  const grid = buildCoGrid();

  it("covers every point in the CO bbox within the query radius", () => {
    // sample the bbox densely; every sample must be within GRID_RADIUS_MILES
    // of some grid point, with margin for RIDB's distance math
    for (let lat = CO_BBOX.south; lat <= CO_BBOX.north; lat += 0.1) {
      for (let lng = CO_BBOX.west; lng <= CO_BBOX.east; lng += 0.1) {
        const nearest = Math.min(
          ...grid.map((p) => milesBetween(p, { lat, lng })),
        );
        expect(nearest).toBeLessThan(GRID_RADIUS_MILES - 2);
      }
    }
  });

  it("stays a tractable number of queries", () => {
    expect(grid.length).toBeGreaterThan(50);
    expect(grid.length).toBeLessThan(250);
  });
});
