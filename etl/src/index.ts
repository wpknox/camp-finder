// etl/src/index.ts
import "dotenv/config";
import { RidbClient } from "./ridb.js";
import { TbClient, buildRidbIndex } from "./teenybase.js";
import {
  CAMPGROUND_QUERY_PARAMS,
  GRID_RADIUS_MILES,
  buildCoGrid,
  inCoBbox,
  parentOrgToAgency,
} from "./forests.js";
import { groupByCanonicalName, findDuplicate } from "./dedupe.js";
import {
  normalizeAmenities,
  parseDescriptionAmenities,
  aggregateFcfs,
  scoreDataQuality,
  extractFees,
  extractFeesFromDescription,
  extractFsUrl,
} from "./normalize.js";
import { scrapeFsPage } from "./fsScraper.js";
import type {
  NormalizedFacility,
  RidbAttribute,
  RidbCampsite,
  RidbFacility,
} from "./types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RIDB_API_KEY = process.env.RIDB_API_KEY!;
const TB_API_URL = process.env.TB_API_URL ?? "http://localhost:8787";
const TB_SERVICE_TOKEN = process.env.TB_SERVICE_TOKEN!;

if (!RIDB_API_KEY) throw new Error("RIDB_API_KEY is required");
if (!TB_SERVICE_TOKEN) throw new Error("TB_SERVICE_TOKEN is required");

const ridb = new RidbClient(RIDB_API_KEY);
const tb = new TbClient(TB_API_URL, TB_SERVICE_TOKEN);

// RIDB's `state=CO` filter matches on the facility address record and misses
// every facility without one (e.g. ROSY LANE 232157), so coverage comes from
// a grid of ~25mi radius queries over the Colorado bbox instead. Overlapping
// circles return duplicates — collapse by FacilityID — and edge circles bleed
// into neighboring states — filter by coordinates.
async function fetchCoFacilitiesByGrid(): Promise<RidbFacility[]> {
  const grid = buildCoGrid();
  const byId = new Map<string, RidbFacility>();
  for (let i = 0; i < grid.length; i++) {
    const point = grid[i];
    process.stdout.write(`\rQuerying grid point ${i + 1}/${grid.length}...`);
    const batch = await ridb.getAllFacilities({
      ...CAMPGROUND_QUERY_PARAMS,
      latitude: String(point.lat),
      longitude: String(point.lng),
      radius: String(GRID_RADIUS_MILES),
    });
    for (const f of batch) {
      if (!inCoBbox(f.FacilityLatitude, f.FacilityLongitude)) continue;
      byId.set(f.FacilityID, f);
    }
    await sleep(200);
  }
  process.stdout.write("\n");
  return [...byId.values()];
}

async function main() {
  console.log(`Connecting to Teenybase at ${TB_API_URL}...`);

  console.log("Fetching Colorado campground facilities from RIDB (grid sweep)...");
  const allFacilities = await fetchCoFacilitiesByGrid();
  console.log(`Found ${allFacilities.length} candidate facilities in the CO bbox`);

  const normalized: NormalizedFacility[] = [];
  let skippedNoCampsites = 0;

  for (let i = 0; i < allFacilities.length; i++) {
    const f = allFacilities[i];
    process.stdout.write(
      `\rProcessing ${i + 1}/${allFacilities.length}: ${f.FacilityName.slice(0, 40).padEnd(40)}`,
    );

    let detail = f;
    let campsites: RidbCampsite[] = [];
    let campsitesFetched = false;
    try {
      [detail, campsites] = await Promise.all([
        ridb.getFacilityDetail(f.FacilityID),
        ridb.getCampsites(f.FacilityID),
      ]);
      campsitesFetched = true;
    } catch (e) {
      console.warn(`\nCould not fetch detail for ${f.FacilityID}: ${e}`);
    }

    // RIDB mislabels trailheads, day-use areas, and interpretive sites as
    // facilitytype=Campground. Every real campground checked has >=1 overnight
    // campsite record; junk has none. Only skip when the campsite fetch
    // actually succeeded, so a transient error can't silently drop a facility.
    const overnightSites = campsites.filter((c) => c.TypeOfUse !== "Day");
    if (campsitesFetched && overnightSites.length === 0) {
      skippedNoCampsites++;
      await sleep(150);
      continue;
    }

    // Facility-level ATTRIBUTES are empty in RIDB. Use campsite attributes for
    // structured fields, then fill gaps (water, toilets, bear boxes) from description text.
    const campsiteAttrs: RidbAttribute[] = campsites.flatMap(
      (c) => c.ATTRIBUTES ?? [],
    );
    const amenities = {
      ...normalizeAmenities(campsiteAttrs),
      ...parseDescriptionAmenities(detail.FacilityDescription ?? ""),
    };
    const fcfs = aggregateFcfs(campsites);
    let fees = extractFees(f.FacilityUseFeeDescription);

    if (fees.fee_min === null) {
      fees = extractFeesFromDescription(detail.FacilityDescription ?? "");
    }

    const fsUrl = extractFsUrl(detail.LINK ?? []);

    if (fees.fee_min === null && fsUrl) {
      fees = await scrapeFsPage(fsUrl);
      await sleep(300);
    }

    normalized.push({
      ridb_id: f.FacilityID,
      name: f.FacilityName,
      lat: f.FacilityLatitude,
      lng: f.FacilityLongitude,
      forest: parentOrgToAgency(f.ParentOrgID),
      district: "",
      description: detail.FacilityDescription,
      fee_min: fees.fee_min,
      fee_max: fees.fee_max,
      season_start: "",
      season_end: "",
      ...fcfs,
      amenities: JSON.stringify(amenities) as any,
      ridb_data_quality: scoreDataQuality(amenities),
      fs_url: fsUrl,
      is_closed: false,
      last_synced: new Date().toISOString(),
    });

    await sleep(150);
  }
  console.log(
    `\nSkipped ${skippedNoCampsites} facilities with no overnight campsites (trailheads/day-use)`,
  );

  // A facility new to the RIDB sync may already exist as an fs.usda.gov- or
  // NPS-sourced row (those sources ran against the old, smaller RIDB set).
  // Absorb the RIDB id into the existing row's merged_ridb_ids so the upsert
  // below routes to it — enriching the row instead of inserting a duplicate.
  console.log("Checking new RIDB facilities against fs-/nps- records...");
  const rows = await tb.listAllWithMerged();
  const index = buildRidbIndex(rows);
  const scrapedRows = rows.filter(
    (r) => r.ridb_id.startsWith("fs-") || r.ridb_id.startsWith("nps-"),
  );
  const scrapedByName = groupByCanonicalName(scrapedRows);
  let absorbed = 0;
  for (const f of normalized) {
    if (index.has(f.ridb_id)) continue;
    const match = findDuplicate(scrapedByName, f.name, f.lat, f.lng);
    if (!match) continue;
    match.merged_ridb_ids.push(f.ridb_id);
    await tb.patchFacility(match.id, {
      merged_ridb_ids: JSON.stringify(match.merged_ridb_ids),
    });
    absorbed++;
  }
  if (absorbed > 0) {
    console.log(`Absorbed ${absorbed} RIDB ids into existing scraped records`);
  }

  console.log("Writing to Teenybase...");
  await tb.upsertFacilities(
    normalized,
    (i, total) => {
      process.stdout.write(`\rUpserted ${i}/${total}`);
    },
    {
      // RIDB has no closure data — is_closed:false must not reopen a
      // campground the fs scrape or an admin marked closed.
      omitOnUpdate: ["is_closed"],
      // Don't wipe values another source already derived just because RIDB
      // came up empty this run.
      omitEmptyOnUpdate: ["fs_url", "fee_min", "fee_max", "description"],
    },
  );
  console.log("\nSync complete.");
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
