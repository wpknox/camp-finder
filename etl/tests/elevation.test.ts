import { describe, it, expect, vi } from "vitest";
import { chunk, fetchElevations, patchBatch } from "../src/enrich-elevation.js";

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

describe("patchBatch", () => {
  it("rounds and patches finite elevations", async () => {
    const patchFn = vi.fn().mockResolvedValue(undefined);
    const patched = await patchBatch(
      [{ id: "a" }, { id: "b" }],
      [2987.4, 3105.6],
      patchFn,
    );
    expect(patched).toBe(2);
    expect(patchFn).toHaveBeenCalledWith("a", { elevation_m: 2987 });
    expect(patchFn).toHaveBeenCalledWith("b", { elevation_m: 3106 });
  });
  it("skips null elements without patching them", async () => {
    const patchFn = vi.fn().mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const patched = await patchBatch(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      [1200, null as unknown as number, 900],
      patchFn,
    );
    expect(patched).toBe(2);
    expect(patchFn).toHaveBeenCalledTimes(2);
    expect(patchFn).not.toHaveBeenCalledWith("b", expect.anything());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it("skips unmatched facilities when the response array is short", async () => {
    const patchFn = vi.fn().mockResolvedValue(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const patched = await patchBatch([{ id: "a" }, { id: "b" }], [1500], patchFn);
    expect(patched).toBe(1);
    expect(patchFn).toHaveBeenCalledTimes(1);
    expect(patchFn).toHaveBeenCalledWith("a", { elevation_m: 1500 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("1 elevations for a batch of 2"));
    warn.mockRestore();
  });
});
