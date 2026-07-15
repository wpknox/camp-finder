import { describe, it, expect } from "vitest";
import { latLngToCell } from "h3-js";
import { parseHexFile, coverageFor, mergeCoverage } from "../src/enrich-cell.js";

const LAT = 38.87, LNG = -106.99;
const CELL = latLngToCell(LAT, LNG, 9);

describe("parseHexFile", () => {
  it("uses the h3-named column", () => {
    const csv = `state,h3_res9_id,tech\nCO,${CELL},4\nCO,89268cd3273ffff,4\n`;
    const set = parseHexFile(csv);
    expect(set.has(CELL)).toBe(true);
    expect(set.size).toBe(2);
  });
  it("falls back to the first column when no h3 header", () => {
    const csv = `hex,tech\n${CELL},4\n`;
    expect(parseHexFile(csv).has(CELL)).toBe(true);
  });
});

describe("coverageFor", () => {
  it("reports membership per carrier", () => {
    const sets = { verizon: new Set([CELL]), att: new Set<string>(), tmobile: new Set([CELL]) };
    expect(coverageFor(LAT, LNG, sets)).toEqual({ verizon: true, att: false, tmobile: true });
  });
});

describe("mergeCoverage", () => {
  it("builds a fresh record when none exists", () => {
    const merged = mergeCoverage(null, { verizon: true, att: false, tmobile: true }, "2026-06");
    expect(merged).toEqual({ verizon: true, att: false, tmobile: true, as_of: "2026-06" });
  });
  it("preserves user_edited carriers", () => {
    const existing = { verizon: false, att: true, tmobile: false, as_of: "2025-12", user_edited: ["att"] };
    const merged = mergeCoverage(existing, { verizon: true, att: false, tmobile: false }, "2026-06");
    expect(merged).toEqual({ verizon: true, att: true, tmobile: false, as_of: "2026-06", user_edited: ["att"] });
  });
  it("returns null when nothing changed", () => {
    const existing = { verizon: true, att: false, tmobile: true, as_of: "2026-06" };
    expect(mergeCoverage(existing, { verizon: true, att: false, tmobile: true }, "2026-06")).toBeNull();
  });
});
