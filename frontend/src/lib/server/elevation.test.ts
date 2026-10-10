import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchElevationM } from "./elevation";

const respond = (body: unknown, status = 200) =>
  vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ) as unknown as typeof fetch;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("fetchElevationM", () => {
  it("returns the rounded elevation and queries the point", async () => {
    const fetchFn = respond({ elevation: [2874.6] });
    expect(await fetchElevationM(37.6, -105.5, fetchFn)).toBe(2875);
    expect(vi.mocked(fetchFn).mock.calls[0][0]).toBe(
      "https://api.open-meteo.com/v1/elevation?latitude=37.6&longitude=-105.5",
    );
  });

  it.each([
    ["a null elevation", respond({ elevation: [null] })],
    ["a missing elevation", respond({})],
    ["a non-number", respond({ elevation: ["2875"] })],
    ["an HTTP error", respond({ reason: "x" }, 500)],
    [
      "a thrown fetch",
      vi.fn(() => Promise.reject(new Error("timeout"))) as unknown as typeof fetch,
    ],
  ])("returns null on %s", async (_label, fetchFn) => {
    expect(await fetchElevationM(1, 2, fetchFn)).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});
