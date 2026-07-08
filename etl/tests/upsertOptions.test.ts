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

function mockListThen(...writes: unknown[]) {
  mockFetch.mockResolvedValueOnce(
    okJson({
      items: [
        {
          id: "row1",
          ridb_id: "232157",
          name: "Rosy Lane Campground - Gunnison RD",
          lat: 38.73,
          lng: -106.74,
          fee_min: 15,
          fs_url: "https://fs.usda.gov/existing",
          merged_ridb_ids: "[]",
        },
      ],
    }),
  );
  for (const w of writes) mockFetch.mockResolvedValueOnce(okJson(w));
}

function lastWriteBody(): Record<string, unknown> {
  const call = mockFetch.mock.calls.at(-1)!;
  return JSON.parse(call[1].body);
}

describe("upsertFacilities options", () => {
  const tb = new TbClient("http://tb", "token");
  beforeEach(() => mockFetch.mockReset());

  it("omitOnUpdate drops fields from update patches", async () => {
    mockListThen({});
    await tb.upsertFacilities([facility({})], undefined, {
      omitOnUpdate: ["is_closed"],
    });
    const body = lastWriteBody();
    expect(body).not.toHaveProperty("is_closed");
    expect(body).not.toHaveProperty("ridb_id");
    expect(body.name).toBe("ROSY LANE");
  });

  it("omitEmptyOnUpdate drops only null/empty fields", async () => {
    mockListThen({});
    await tb.upsertFacilities(
      [facility({ fee_min: null, fee_max: null, fs_url: "" })],
      undefined,
      { omitEmptyOnUpdate: ["fee_min", "fee_max", "fs_url", "description"] },
    );
    const body = lastWriteBody();
    expect(body).not.toHaveProperty("fee_min");
    expect(body).not.toHaveProperty("fee_max");
    expect(body).not.toHaveProperty("fs_url");
    expect(body.description).toBe("desc"); // non-empty survives
  });

  it("inserts still carry all fields", async () => {
    mockListThen({});
    await tb.upsertFacilities([facility({ ridb_id: "999999" })], undefined, {
      omitOnUpdate: ["is_closed"],
      omitEmptyOnUpdate: ["fs_url"],
    });
    const body = lastWriteBody();
    expect(mockFetch.mock.calls.at(-1)![0]).toContain("/insert");
    expect(body.values).toHaveProperty("is_closed", false);
    expect(body.values).toHaveProperty("ridb_id", "999999");
  });
});
