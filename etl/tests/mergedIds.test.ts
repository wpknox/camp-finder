import { describe, it, expect } from "vitest";
import { buildRidbIndex } from "../src/teenybase.js";

describe("buildRidbIndex", () => {
  const rows = [
    { id: "w", ridb_id: "233847", merged_ridb_ids: ["fs-gmug-east-portal", "nps-cure-1"] },
    { id: "x", ridb_id: "fs-pike-lost-park", merged_ridb_ids: [] },
  ];
  it("maps primary ridb_ids to their row id", () => {
    expect(buildRidbIndex(rows).get("233847")).toBe("w");
  });
  it("maps absorbed ridb_ids to the surviving row id", () => {
    expect(buildRidbIndex(rows).get("fs-gmug-east-portal")).toBe("w");
    expect(buildRidbIndex(rows).get("nps-cure-1")).toBe("w");
  });
});
