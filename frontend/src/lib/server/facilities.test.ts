import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/static/public", () => ({ PUBLIC_TB_URL: "http://tb.test" }));
vi.mock("$env/static/private", () => ({ TB_SERVICE_TOKEN: "test-token" }));
vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("./tbFetch", () => ({ tbFetch: vi.fn() }));

import { tbFetch } from "./tbFetch";
import {
  parseFacility,
  isTombstoned,
  listPublicFacilities,
  getPublicFacility,
  isSafeId,
} from "./facilities";

const mockFetch = vi.mocked(tbFetch);
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => mockFetch.mockReset());

describe("parseFacility", () => {
  it("parses JSON strings", () => {
    const f = parseFacility({
      id: "a",
      amenities: '{"toilets":"vault"}',
      cell_coverage: '{"verizon":"good"}',
      merged_ridb_ids: '["1","2"]',
    });
    expect(f.amenities).toEqual({ toilets: "vault" });
    expect(f.cell_coverage).toEqual({ verizon: "good" });
    expect(f.merged_ridb_ids).toEqual(["1", "2"]);
  });
  it("passes objects through and defaults missing values", () => {
    const f = parseFacility({ id: "a", amenities: { x: 1 }, cell_coverage: { y: 2 } });
    expect(f.amenities).toEqual({ x: 1 });
    expect(f.cell_coverage).toEqual({ y: 2 });
    expect(f.merged_ridb_ids).toEqual([]);
    expect(parseFacility({ id: "b" }).cell_coverage).toBeNull();
  });
});

describe("isTombstoned", () => {
  it("covers true and 1", () => {
    expect(isTombstoned({ is_deleted: true })).toBe(true);
    expect(isTombstoned({ is_deleted: 1 })).toBe(true);
    expect(isTombstoned({ is_deleted: false })).toBe(false);
    expect(isTombstoned({})).toBe(false);
  });
});

describe("listPublicFacilities", () => {
  it("drops tombstones, parses JSON, sends no auth header", async () => {
    mockFetch.mockReturnValue(
      reply({
        items: [
          { id: "a", amenities: '{"k":1}' },
          { id: "b", is_deleted: true },
          { id: "c", is_deleted: 1 },
        ],
      }),
    );
    const out = await listPublicFacilities();
    expect(out.map((f) => f.id)).toEqual(["a"]);
    expect(out[0].amenities).toEqual({ k: 1 });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("Authorization");
  });
});

describe("getPublicFacility", () => {
  it("returns null for missing row", async () => {
    mockFetch.mockReturnValue(reply({}, 404));
    expect(await getPublicFacility("x")).toBeNull();
  });
  it("returns null for tombstones (true and 1)", async () => {
    mockFetch.mockReturnValueOnce(reply({ id: "x", is_deleted: true }));
    expect(await getPublicFacility("x")).toBeNull();
    mockFetch.mockReturnValueOnce(reply({ id: "x", is_deleted: 1 }));
    expect(await getPublicFacility("x")).toBeNull();
  });
  it("returns parsed facility otherwise", async () => {
    mockFetch.mockReturnValue(reply({ id: "x", amenities: '{"a":1}', is_deleted: false }));
    const f = await getPublicFacility("x");
    expect(f?.amenities).toEqual({ a: 1 });
  });
});

describe("isSafeId", () => {
  it("rejects quotes", () => {
    expect(isSafeId("abc123")).toBe(true);
    expect(isSafeId("a'b")).toBe(false);
    expect(isSafeId('a"b')).toBe(false);
  });
});
