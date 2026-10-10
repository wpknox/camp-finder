// Single-point elevation lookup for admin approvals. Same keyless Open-Meteo
// endpoint and finite-number guard as the ETL's bulk backfill
// (etl/src/enrich-elevation.ts), which fills anything this misses.

const TIMEOUT_MS = 3000;

/** Elevation in whole metres, or null on any failure. Never throws. */
export async function fetchElevationM(
  lat: number,
  lng: number,
  fetchFn: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const res = await fetchFn(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const v = ((await res.json()) as { elevation?: unknown[] }).elevation?.[0];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`no elevation (got ${v})`);
    return Math.round(v);
  } catch (e) {
    console.warn(`[elevation] lookup failed for ${lat},${lng}:`, e);
    return null;
  }
}
