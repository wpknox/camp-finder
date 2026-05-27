// etl/src/index.ts
import 'dotenv/config'
import { RidbClient } from './ridb.js'
import { TbClient } from './teenybase.js'
import { CO_QUERY_PARAMS, isColoradoNationalForest } from './forests.js'
import { normalizeAmenities, aggregateFcfs, scoreDataQuality, extractFees, extractFsUrl } from './normalize.js'
import type { NormalizedFacility } from './types.js'

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

  const nfFacilities = allFacilities.filter(isColoradoNationalForest)
  console.log(`Found ${nfFacilities.length} Colorado National Forest campgrounds`)

  const normalized: NormalizedFacility[] = []

  for (let i = 0; i < nfFacilities.length; i++) {
    const f = nfFacilities[i]
    process.stdout.write(`\rProcessing ${i + 1}/${nfFacilities.length}: ${f.FacilityName.slice(0, 40).padEnd(40)}`)

    let campsites = []
    try {
      campsites = await ridb.getCampsites(f.FacilityID)
    } catch (e) {
      console.warn(`\nCould not fetch campsites for ${f.FacilityID}: ${e}`)
    }

    const amenities = normalizeAmenities(f.ATTRIBUTES)
    const fcfs      = aggregateFcfs(campsites)
    const fees      = extractFees(f.FacilityUseFeeDescription)

    normalized.push({
      ridb_id: f.FacilityID,
      name: f.FacilityName,
      lat: f.FacilityLatitude,
      lng: f.FacilityLongitude,
      forest: '',
      district: '',
      description: f.FacilityDescription,
      fee_min: fees.fee_min,
      fee_max: fees.fee_max,
      season_start: '',
      season_end: '',
      ...fcfs,
      amenities: JSON.stringify(amenities) as any,
      ridb_data_quality: scoreDataQuality(amenities),
      fs_url: extractFsUrl(f.LINK ?? []),
      last_synced: new Date().toISOString(),
    })
  }

  console.log('\nWriting to Teenybase...')
  await tb.upsertFacilities(normalized, (i, total) => {
    process.stdout.write(`\rUpserted ${i}/${total}`)
  })
  console.log('\nSync complete.')
}

main().catch(e => { console.error(e); process.exit(1) })
