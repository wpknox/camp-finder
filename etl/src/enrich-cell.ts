// etl/src/enrich-cell.ts — FCC BDC mobile-coverage lookup for facilities.
// Input: manually downloaded per-carrier H3 res-9 hex CSVs (see etl/README.md).
// Usage: pnpm enrich-cell --as-of 2026-06
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { latLngToCell } from "h3-js";
import { TbClient } from "./teenybase.js";

export type Carrier = "verizon" | "att" | "tmobile";
export const CARRIERS: Carrier[] = ["verizon", "att", "tmobile"];

export interface CellCoverage {
  verizon: boolean | null;
  att: boolean | null;
  tmobile: boolean | null;
  as_of: string | null;
  user_edited?: string[];
}

export function parseHexFile(content: string): Set<string> {
  const lines = content.split("\n").filter((l) => l.trim());
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  let col = header.findIndex((h) => /h3/.test(h));
  if (col === -1) col = 0;
  const set = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(",")[col]?.trim();
    if (v) set.add(v);
  }
  return set;
}

export function coverageFor(
  lat: number,
  lng: number,
  sets: Record<Carrier, Set<string>>,
): Record<Carrier, boolean> {
  const cell = latLngToCell(lat, lng, 9);
  return {
    verizon: sets.verizon.has(cell),
    att: sets.att.has(cell),
    tmobile: sets.tmobile.has(cell),
  };
}

/** Merge computed FCC values into an existing record, never touching carriers a
 * user override owns. Returns null when the result equals the existing record. */
export function mergeCoverage(
  existing: CellCoverage | null,
  computed: Record<Carrier, boolean>,
  asOf: string,
): CellCoverage | null {
  const userEdited = existing?.user_edited ?? [];
  const merged: CellCoverage = {
    verizon: userEdited.includes("verizon") ? (existing?.verizon ?? null) : computed.verizon,
    att: userEdited.includes("att") ? (existing?.att ?? null) : computed.att,
    tmobile: userEdited.includes("tmobile") ? (existing?.tmobile ?? null) : computed.tmobile,
    as_of: asOf,
  };
  if (userEdited.length) merged.user_edited = userEdited;
  if (
    existing &&
    existing.verizon === merged.verizon &&
    existing.att === merged.att &&
    existing.tmobile === merged.tmobile &&
    existing.as_of === merged.as_of
  ) {
    return null;
  }
  return merged;
}

async function main() {
  const asOfIdx = process.argv.indexOf("--as-of");
  const asOf = asOfIdx !== -1 ? process.argv[asOfIdx + 1] : null;
  if (!asOf || !/^\d{4}-\d{2}$/.test(asOf)) {
    console.error("Usage: pnpm enrich-cell --as-of YYYY-MM  (FCC data vintage)");
    process.exit(1);
  }
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "fcc");
  const sets = Object.fromEntries(
    CARRIERS.map((c) => [c, parseHexFile(readFileSync(join(dataDir, `${c}.csv`), "utf8"))]),
  ) as Record<Carrier, Set<string>>;
  CARRIERS.forEach((c) => console.log(`${c}: ${sets[c].size} hexes`));

  const TB_API_URL = process.env.TB_API_URL ?? "http://localhost:8787";
  const TB_SERVICE_TOKEN = process.env.TB_SERVICE_TOKEN!;
  if (!TB_SERVICE_TOKEN) throw new Error("TB_SERVICE_TOKEN is required");

  const tb = new TbClient(TB_API_URL, TB_SERVICE_TOKEN);
  const facilities = await tb.listForEnrichment();
  let patched = 0;
  for (const f of facilities) {
    if (f.is_deleted) continue;
    const merged = mergeCoverage(
      f.cell_coverage as CellCoverage | null,
      coverageFor(f.lat, f.lng, sets),
      asOf,
    );
    if (!merged) continue;
    await tb.patchFacility(f.id, { cell_coverage: JSON.stringify(merged) });
    patched++;
  }
  console.log(`patched ${patched}/${facilities.length} facilities`);
}

// Only run as a script, not when imported by tests.
if (process.argv[1]?.endsWith("enrich-cell.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
