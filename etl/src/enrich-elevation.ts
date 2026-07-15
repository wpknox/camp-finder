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

// Patch one batch's facilities with their fetched elevations, skipping any
// element that isn't a finite number (Open-Meteo can return null for off-grid
// coords; Math.round(null) would silently persist a bogus 0 that never gets
// retried, since only null elevations are re-attempted). Warns once if the
// response array is shorter than the batch so misalignment can't be silent —
// unmatched trailing facilities fall through the same skip guard. Returns the
// number of facilities actually patched.
export async function patchBatch(
  batch: Array<{ id: string }>,
  elevations: number[],
  patchFn: (id: string, patch: Record<string, unknown>) => Promise<void>,
): Promise<number> {
  if (elevations.length !== batch.length) {
    console.warn(
      `Open-Meteo returned ${elevations.length} elevations for a batch of ${batch.length}; skipping unmatched facilities`,
    );
  }
  let patched = 0;
  for (let i = 0; i < batch.length; i++) {
    const v = elevations[i];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      console.warn(`skipping facility ${batch[i].id}: no valid elevation (got ${v})`);
      continue;
    }
    await patchFn(batch[i].id, { elevation_m: Math.round(v) });
    patched++;
  }
  return patched;
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
  // No retry/backoff on the Open-Meteo call: a full run is only ~6 requests,
  // and re-running the script is idempotent (only null elevations are fetched).
  for (const batch of chunk(missing, BATCH)) {
    const elevations = await fetchElevations(batch);
    patched += await patchBatch(batch, elevations, (id, patch) => tb.patchFacility(id, patch));
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
