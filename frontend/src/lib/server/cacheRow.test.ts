import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("$env/static/public", () => ({ PUBLIC_TB_URL: "http://tb.test" }));
vi.mock("$env/static/private", () => ({ TB_SERVICE_TOKEN: "test-token" }));
vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("./tbFetch", () => ({ tbFetch: vi.fn() }));

import { tbFetch } from "./tbFetch";
import { readCacheRow, writeCacheRow, isFresh } from "./cacheRow";

const mockFetch = vi.mocked(tbFetch);
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => mockFetch.mockReset());

describe("readCacheRow", () => {
  it("lists limit 1 by facility_id without an Authorization header", async () => {
    mockFetch.mockReturnValueOnce(reply({ items: [{ id: "r1", x: 1 }] }));
    const row = await readCacheRow("alerts", "f1");
    expect(row).toEqual({ id: "r1", x: 1 });
    const [path, init] = mockFetch.mock.calls[0];
    expect(path).toBe("/api/v1/table/alerts/list");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ where: "facility_id == 'f1'", limit: 1 });
  });
  it("returns null when there is no row", async () => {
    mockFetch.mockReturnValueOnce(reply({ items: [] }));
    expect(await readCacheRow("alerts", "f1")).toBeNull();
    mockFetch.mockReturnValueOnce(reply({}));
    expect(await readCacheRow("alerts", "f1")).toBeNull();
  });
});

describe("writeCacheRow", () => {
  it("edits the existing row with raw values and the service token", async () => {
    mockFetch.mockReturnValueOnce(reply({}));
    await writeCacheRow("nearby_pois", "r1", "f1", { a: 1 });
    const [path, init] = mockFetch.mock.calls[0];
    expect(path).toBe("/api/v1/table/nearby_pois/edit/r1");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init?.body as string)).toEqual({ a: 1 });
  });
  it("inserts with facility_id when there is no existing row", async () => {
    mockFetch.mockReturnValueOnce(reply({}));
    await writeCacheRow("alerts", null, "f1", { content: "c" });
    const [path, init] = mockFetch.mock.calls[0];
    expect(path).toBe("/api/v1/table/alerts/insert");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init?.body as string)).toEqual({
      values: { facility_id: "f1", content: "c" },
    });
  });
});

describe("isFresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("is fresh exactly at the ttl boundary", () => {
    expect(isFresh("2026-01-09T00:00:00Z", 24 * 3600_000)).toBe(true);
  });
  it("is stale just past the boundary", () => {
    expect(isFresh("2026-01-08T23:59:59.999Z", 24 * 3600_000)).toBe(false);
  });
  it("is fresh for recent timestamps", () => {
    expect(isFresh("2026-01-09T23:00:00Z", 24 * 3600_000)).toBe(true);
  });
});
