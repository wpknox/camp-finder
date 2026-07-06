import { describe, it, expect } from "vitest";
import { mergeFacilityFields, pickWinner } from "./merge";

const base = {
  id: "w", ridb_id: "233847", name: "East Portal", lat: 38.5, lng: -107.5,
  forest: "", district: "", description: "", fee_min: null, fee_max: null,
  season_start: "", season_end: "", fcfs_total: 10, reservable_total: 0,
  is_fully_fcfs: true, is_partial_fcfs: false,
  amenities: { potableWater: true, toiletType: "unknown", bearBoxes: false } as never,
  ridb_data_quality: "sparse", fs_url: "", is_closed: false, merged_ridb_ids: [],
};

describe("pickWinner", () => {
  it("prefers numeric RIDB ids over fs- and nps- ids", () => {
    const a = { ...base, ridb_id: "fs-gmug-east-portal" };
    const b = { ...base, id: "b", ridb_id: "233847" };
    expect(pickWinner(a as never, b as never).id).toBe("b");
  });
  it("prefers nps- over fs- when no numeric id", () => {
    const a = { ...base, ridb_id: "fs-x-y" };
    const b = { ...base, id: "b", ridb_id: "nps-blca-1" };
    expect(pickWinner(a as never, b as never).id).toBe("b");
  });
});

describe("mergeFacilityFields", () => {
  it("fills winner nulls/empties from loser", () => {
    const winner = { ...base, fee_min: null, fs_url: "" };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", fee_min: 20, fs_url: "https://fs.usda.gov/x" };
    const merged = mergeFacilityFields(winner as never, loser as never);
    expect(merged.fee_min).toBe(20);
    expect(merged.fs_url).toBe("https://fs.usda.gov/x");
  });
  it("keeps winner values when present", () => {
    const winner = { ...base, fee_min: 15 };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", fee_min: 20 };
    expect(mergeFacilityFields(winner as never, loser as never).fee_min).toBe(15);
  });
  it("merges amenities per-key, loser fills unknown/null", () => {
    const winner = { ...base, amenities: { potableWater: null, toiletType: "unknown" } as never };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b",
      amenities: { potableWater: true, toiletType: "vault" } as never };
    const merged = mergeFacilityFields(winner as never, loser as never);
    expect(merged.amenities.potableWater).toBe(true);
    expect(merged.amenities.toiletType).toBe("vault");
  });
  it("accumulates merged_ridb_ids from loser id and loser history", () => {
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", merged_ridb_ids: ["nps-old-1"] };
    const merged = mergeFacilityFields(base as never, loser as never);
    expect(merged.merged_ridb_ids).toEqual(expect.arrayContaining(["fs-a-b", "nps-old-1"]));
  });

  it("explicit loser choice copies loser value even when empty (name)", () => {
    const winner = { ...base, name: "Winner Name" };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", name: "" };
    const merged = mergeFacilityFields(winner as never, loser as never, { name: "loser" });
    expect(merged.name).toBe("");
  });

  it("explicit loser choice for scalar copies loser value even when empty", () => {
    const winner = { ...base, description: "Winner desc" };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", description: "" };
    const merged = mergeFacilityFields(winner as never, loser as never, { description: "loser" });
    expect(merged.description).toBe("");
  });

  it("location choice sets lat+lng together", () => {
    const winner = { ...base, lat: 1, lng: 2 };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", lat: 3, lng: 4 };
    const merged = mergeFacilityFields(winner as never, loser as never, { location: "loser" });
    expect(merged.lat).toBe(3);
    expect(merged.lng).toBe(4);
  });

  it("location choice defaults to winner when not specified", () => {
    const winner = { ...base, lat: 1, lng: 2 };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", lat: 3, lng: 4 };
    const merged = mergeFacilityFields(winner as never, loser as never);
    expect(merged.lat).toBe(1);
    expect(merged.lng).toBe(2);
  });

  it("fcfs choice sets all four fcfs fields together from loser", () => {
    const winner = {
      ...base,
      fcfs_total: 10,
      reservable_total: 0,
      is_fully_fcfs: true,
      is_partial_fcfs: false,
    };
    const loser = {
      ...base,
      id: "l",
      ridb_id: "fs-a-b",
      fcfs_total: 3,
      reservable_total: 7,
      is_fully_fcfs: false,
      is_partial_fcfs: true,
    };
    const merged = mergeFacilityFields(winner as never, loser as never, { fcfs: "loser" });
    expect(merged.fcfs_total).toBe(3);
    expect(merged.reservable_total).toBe(7);
    expect(merged.is_fully_fcfs).toBe(false);
    expect(merged.is_partial_fcfs).toBe(true);
  });

  it("default gap-fill behavior unchanged when choices is undefined", () => {
    const winner = { ...base, fee_min: null, fs_url: "" };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", fee_min: 20, fs_url: "https://fs.usda.gov/x" };
    const merged = mergeFacilityFields(winner as never, loser as never);
    expect(merged.fee_min).toBe(20);
    expect(merged.fs_url).toBe("https://fs.usda.gov/x");
  });

  it("mixed choices: some explicit, others default gap-fill", () => {
    const winner = { ...base, name: "Winner", fee_min: null, description: "Winner desc" };
    const loser = {
      ...base,
      id: "l",
      ridb_id: "fs-a-b",
      name: "Loser",
      fee_min: 20,
      description: "Loser desc",
    };
    const merged = mergeFacilityFields(winner as never, loser as never, {
      name: "loser",
    });
    expect(merged.name).toBe("Loser");
    expect(merged.fee_min).toBe(20); // default gap-fill, unaffected by choices
    expect(merged.description).toBe("Winner desc"); // winner present, no choice specified
  });

  it("explicit winner choice keeps winner value even if empty (name)", () => {
    const winner = { ...base, name: "" };
    const loser = { ...base, id: "l", ridb_id: "fs-a-b", name: "Loser Name" };
    const merged = mergeFacilityFields(winner as never, loser as never, { name: "winner" });
    expect(merged.name).toBe("");
  });
});
