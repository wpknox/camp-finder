// etl/src/enrich-elevation.ts — backfill facilities.elevation_m from Open-Meteo.
// Keyless API; batches of 100 coords; never overwrites a non-null elevation.
import "dotenv/config";
import { TbClient } from "./teenybase.js";

const BATCH = 100;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchElevations(
  coords: Array<{ lat: number; lng: number }>,
  fetchFn: typeof fetch = fetch,
): Promise<number[]> {
  const lats = coords.map((c) => c.lat).join(",");
  const lngs = coords.map((c) => c.lng).join(",");
  const res = await fetchFn(
    `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`,
  );
  if (!res.ok) throw new Error(`Open-Meteo elevation ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation;
}

async function main() {
  const TB_API_URL = process.env.TB_API_URL ?? "http://localhost:8787";
  const TB_SERVICE_TOKEN = process.env.TB_SERVICE_TOKEN!;
  if (!TB_SERVICE_TOKEN) throw new Error("TB_SERVICE_TOKEN is required");

  const tb = new TbClient(TB_API_URL, TB_SERVICE_TOKEN);
  console.log(`Connecting to Teenybase at ${TB_API_URL}...`);
  const all = await tb.listForEnrichment();
  const missing = all.filter((f) => f.elevation_m == null && !f.is_deleted);
  console.log(`${missing.length} facilities missing elevation (of ${all.length})`);
  let patched = 0;
  for (const batch of chunk(missing, BATCH)) {
    const elevations = await fetchElevations(batch);
    for (let i = 0; i < batch.length; i++) {
      await tb.patchFacility(batch[i].id, { elevation_m: Math.round(elevations[i]) });
      patched++;
    }
    console.log(`patched ${patched}/${missing.length}`);
  }
  console.log(`patched ${patched} facilities`);
}

// Only run as a script, not when imported by tests.
if (process.argv[1]?.endsWith("enrich-elevation.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
