import { describe, it, expect, vi, beforeEach } from "vitest";
import { TbClient } from "../src/teenybase.js";
import type { NormalizedFacility } from "../src/types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function facility(overrides: Partial<NormalizedFacility>): NormalizedFacility {
  return {
    ridb_id: "232157",
    name: "ROSY LANE",
    lat: 38.73,
    lng: -106.74,
    forest: "USDA Forest Service",
    district: "",
    description: "desc",
    fee_min: 20,
    fee_max: 24,
    season_start: "",
    season_end: "",
    fcfs_total: 5,
    reservable_total: 18,
    is_fully_fcfs: false,
    is_partial_fcfs: true,
    amenities: "{}" as any,
    ridb_data_quality: "rich",
    fs_url: "https://fs.usda.gov/x",
    is_closed: false,
    last_synced: "2026-07-08T00:00:00Z",
    ...overrides,
  };
}

function okJson(body: unknown) {
  return { ok: true, json: async () => body, text: async () => "" };
}

describe("tombstoned facilities", () => {
  const tb = new TbClient("http://tb", "token");
  beforeEach(() => mockFetch.mockReset());

  it("skips updates to rows with is_deleted set", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        items: [
          { id: "row1", ridb_id: "232157", name: "Rosy Lane", lat: 38.73, lng: -106.74,
            fee_min: 15, fs_url: "", merged_ridb_ids: "[]", is_deleted: true },
        ],
      }),
    );
    await tb.upsertFacilities([facility({})]);
    // Only the list call happened — no edit, and no insert either.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("/list");
  });

  it("still updates live rows and inserts unknown ridb_ids", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        items: [
          { id: "row1", ridb_id: "232157", name: "Rosy Lane", lat: 38.73, lng: -106.74,
            fee_min: 15, fs_url: "", merged_ridb_ids: "[]", is_deleted: false },
        ],
      }),
    );
    mockFetch.mockResolvedValueOnce(okJson({}));
    mockFetch.mockResolvedValueOnce(okJson({}));
    await tb.upsertFacilities([facility({}), facility({ ridb_id: "999999" })]);
    expect(mockFetch.mock.calls[1][0]).toContain("/edit/row1");
    expect(mockFetch.mock.calls[2][0]).toContain("/insert");
  });

  it("skips updates resolved through an absorbed merged_ridb_id on a tombstoned row", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        items: [
          { id: "row1", ridb_id: "fs-old-scrape", name: "Rosy Lane", lat: 38.73, lng: -106.74,
            fee_min: 15, fs_url: "", merged_ridb_ids: '["232157"]', is_deleted: true },
        ],
      }),
    );
    await tb.upsertFacilities([facility({})]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
