// etl/src/index.ts
import 'dotenv/config'
import { RidbClient } from './ridb.js'
import { TbClient } from './teenybase.js'
import { CO_QUERY_PARAMS, parentOrgToAgency } from './forests.js'
import { normalizeAmenities, parseDescriptionAmenities, aggregateFcfs, scoreDataQuality, extractFees, extractFeesFromDescription, extractFsUrl } from './normalize.js'
import { scrapeFsPage } from './fsScraper.js'
import type { NormalizedFacility, RidbAttribute, RidbCampsite } from './types.js'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const RIDB_API_KEY  = process.env.RIDB_API_KEY!
const TB_API_URL    = process.env.TB_API_URL ?? 'http://localhost:8787'
const TB_SERVICE_TOKEN = process.env.TB_SERVICE_TOKEN!

if (!RIDB_API_KEY)      throw new Error('RIDB_API_KEY is required')
if (!TB_SERVICE_TOKEN)  throw new Error('TB_SERVICE_TOKEN is required')

const ridb = new RidbClient(RIDB_API_KEY)
const tb   = new TbClient(TB_API_URL, TB_SERVICE_TOKEN)

async function main() {
  console.log(`Connecting to Teenybase at ${TB_API_URL}...`)

  console.log('Fetching Colorado campground facilities from RIDB...')
  const allFacilities = await ridb.getAllFacilities(CO_QUERY_PARAMS)
  console.log(`Found ${allFacilities.length} Colorado campgrounds`)

  const normalized: NormalizedFacility[] = []

  for (let i = 0; i < allFacilities.length; i++) {
    const f = allFacilities[i]
    process.stdout.write(`\rProcessing ${i + 1}/${allFacilities.length}: ${f.FacilityName.slice(0, 40).padEnd(40)}`)

    let detail = f
    let campsites: RidbCampsite[] = []
    try {
      ;[detail, campsites] = await Promise.all([
        ridb.getFacilityDetail(f.FacilityID),
        ridb.getCampsites(f.FacilityID),
      ])
    } catch (e) {
      console.warn(`\nCould not fetch detail for ${f.FacilityID}: ${e}`)
    }

    // Facility-level ATTRIBUTES are empty in RIDB. Use campsite attributes for
    // structured fields, then fill gaps (water, toilets, bear boxes) from description text.
    const campsiteAttrs: RidbAttribute[] = campsites.flatMap(c => c.ATTRIBUTES ?? [])
    const amenities = {
      ...normalizeAmenities(campsiteAttrs),
      ...parseDescriptionAmenities(detail.FacilityDescription ?? ''),
    }
    const fcfs      = aggregateFcfs(campsites)
    let fees = extractFees(f.FacilityUseFeeDescription)

    if (fees.fee_min === null) {
      fees = extractFeesFromDescription(detail.FacilityDescription ?? '')
    }

    const fsUrl = extractFsUrl(detail.LINK ?? [])

    if (fees.fee_min === null && fsUrl) {
      fees = await scrapeFsPage(fsUrl)
      await sleep(300)
    }

    normalized.push({
      ridb_id: f.FacilityID,
      name: f.FacilityName,
      lat: f.FacilityLatitude,
      lng: f.FacilityLongitude,
      forest: parentOrgToAgency(f.ParentOrgID),
      district: '',
      description: detail.FacilityDescription,
      fee_min: fees.fee_min,
      fee_max: fees.fee_max,
      season_start: '',
      season_end: '',
      ...fcfs,
      amenities: JSON.stringify(amenities) as any,
      ridb_data_quality: scoreDataQuality(amenities),
      fs_url: fsUrl,
      last_synced: new Date().toISOString(),
    })
  }

  console.log('\nWriting to Teenybase...')
  await tb.upsertFacilities(normalized, (i, total) => {
    process.stdout.write(`\rUpserted ${i}/${total}`)
  })
  console.log('\nSync complete.')
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
