import { describe, it, expect, vi } from "vitest";
import { chunk, fetchElevations } from "../src/enrich-elevation.js";

describe("chunk", () => {
  it("splits into batches of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("handles empty input", () => {
    expect(chunk([], 100)).toEqual([]);
  });
});

describe("fetchElevations", () => {
  it("requests comma-separated coords and returns elevations in order", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elevation: [2987.0, 3105.4] }),
    });
    const coords = [
      { lat: 38.87, lng: -106.99 },
      { lat: 39.1, lng: -106.5 },
    ];
    const result = await fetchElevations(coords, fetchFn as unknown as typeof fetch);
    expect(result).toEqual([2987.0, 3105.4]);
    const url = fetchFn.mock.calls[0][0] as string;
    expect(url).toContain("latitude=38.87,39.1");
    expect(url).toContain("longitude=-106.99,-106.5");
  });
  it("throws on non-ok response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(fetchElevations([{ lat: 1, lng: 2 }], fetchFn as unknown as typeof fetch)).rejects.toThrow("429");
  });
});
