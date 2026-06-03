import "dotenv/config";
import { TbClient } from "./teenybase.js";
import { NpsClient, CO_NPS_PARKS, normalizeNpsCampground } from "./nps.js";
import type { NormalizedFacility } from "./types.js";

const NPS_API_KEY = process.env.NPS_API_KEY!;
const TB_API_URL = process.env.TB_API_URL ?? "http://localhost:8787";
const TB_SERVICE_TOKEN = process.env.TB_SERVICE_TOKEN!;

if (!NPS_API_KEY) throw new Error("NPS_API_KEY is required");
if (!TB_SERVICE_TOKEN) throw new Error("TB_SERVICE_TOKEN is required");

const nps = new NpsClient(NPS_API_KEY);
const tb = new TbClient(TB_API_URL, TB_SERVICE_TOKEN);

type DedupeEntry = { id: string; ridb_id: string; name: string; lat: number; lng: number };
type DedupeIndex = Map<string, DedupeEntry[]>;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function fcfsLabel(f: NormalizedFacility): string {
  if (f.is_fully_fcfs) return "fully FCFS";
  if (f.is_partial_fcfs) return "partial FCFS";
  return "reservable";
}

function feeLabel(f: NormalizedFacility): string {
  if (f.fee_min === null) return "unknown";
  return `$${f.fee_min}`;
}

async function buildDedupeIndex(): Promise<DedupeIndex> {
  console.log("Loading existing facilities for dedup...");
  const existing = await tb.listAll();
  const byName: DedupeIndex = new Map();
  for (const r of existing) {
    const key = normalizeName(r.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(r);
  }
  console.log(`  Loaded ${existing.length} existing records`);
  return byName;
}

function isNearMatch(
  byName: DedupeIndex,
  name: string,
  lat: number,
  lng: number,
): string | null {
  const candidates = byName.get(normalizeName(name)) ?? [];
  const match = candidates.find(
    (r) => Math.abs(r.lat - lat) < 0.01 && Math.abs(r.lng - lng) < 0.01,
  );
  return match?.ridb_id ?? null;
}

function classifyCampgrounds(
  raw: Array<NormalizedFacility | null>,
  byName: DedupeIndex,
): { toUpsert: NormalizedFacility[]; skippedOutOfState: number; skippedDupes: string[] } {
  const toUpsert: NormalizedFacility[] = [];
  const skippedDupes: string[] = [];
  let skippedOutOfState = 0;

  for (const normalized of raw) {
    if (!normalized) {
      skippedOutOfState++;
      continue;
    }
    const existingId = isNearMatch(byName, normalized.name, normalized.lat, normalized.lng);
    if (existingId) {
      skippedDupes.push(`${normalized.name} (matches existing ${existingId})`);
      continue;
    }
    toUpsert.push(normalized);
  }

  return { toUpsert, skippedOutOfState, skippedDupes };
}

async function main() {
  console.log(`Connecting to Teenybase at ${TB_API_URL}...`);

  const byName = await buildDedupeIndex();

  const parkCodes = Object.keys(CO_NPS_PARKS);
  console.log(`\nFetching NPS campgrounds for: ${parkCodes.join(", ")}...`);
  const raw = await nps.getCampgrounds(parkCodes);
  console.log(`  API returned ${raw.length} campground records`);

  const normalized = raw.map((c) =>
    normalizeNpsCampground(c, CO_NPS_PARKS[c.parkCode] ?? c.parkCode),
  );
  const { toUpsert, skippedOutOfState, skippedDupes } = classifyCampgrounds(normalized, byName);

  if (skippedOutOfState > 0) {
    console.log(`\nSkipped ${skippedOutOfState} campgrounds outside Colorado bounding box`);
  }
  if (skippedDupes.length > 0) {
    console.log(`\nSkipped ${skippedDupes.length} duplicates of existing records:`);
    for (const d of skippedDupes) console.log(`  - ${d}`);
  }

  if (toUpsert.length === 0) {
    console.log("\nNo new NPS campgrounds to upsert.");
    return;
  }

  console.log(`\nUpserting ${toUpsert.length} NPS campgrounds...`);
  await tb.upsertFacilities(toUpsert, (i, total) => {
    process.stdout.write(`\r  Upserted ${i}/${total}`);
  });
  process.stdout.write("\n");

  console.log("\nNPS sync complete.");
  for (const f of toUpsert) {
    console.log(`  + ${f.name} (${f.forest}) [${fcfsLabel(f)}] fee: ${feeLabel(f)}`);
  }
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
