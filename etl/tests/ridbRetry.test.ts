import { describe, it, expect, vi, beforeEach } from "vitest";
import { RidbClient } from "../src/ridb.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makePageResponse(data: unknown[], total: number) {
  return {
    ok: true,
    json: async () => ({
      RECDATA: data,
      METADATA: { RESULTS: { CURRENT_COUNT: data.length, TOTAL_COUNT: total } },
    }),
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    headers: new Headers(),
    text: async () => `err ${status}`,
  };
}

describe("RidbClient retry", () => {
  const client = new RidbClient("test-key");
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
    return () => vi.useRealTimers();
  });

  it("retries 429 with backoff and succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makePageResponse([{ FacilityID: "1" }], 1));

    const promise = client.getAllFacilities({ facilitytype: "Campground" });
    await vi.runAllTimersAsync();
    const results = await promise;
    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx", async () => {
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(503))
      .mockResolvedValueOnce(makePageResponse([], 0));

    const promise = client.getAllFacilities({ facilitytype: "Campground" });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual([]);
  });

  it("does not retry 4xx client errors", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(401));
    const promise = client.getFacilityDetail("232157");
    promise.catch(() => {}); // avoid unhandled rejection while timers run
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("RIDB error 401");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(429));
    const promise = client.getFacilityDetail("232157");
    promise.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("RIDB error 429");
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 try + 3 retries
  });
});
