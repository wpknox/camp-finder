import 'dotenv/config'
import { TbClient } from './teenybase.js'
import { scrapeForestCampgroundUrls, scrapeCampgroundPage } from './fsScraper.js'
import { normalizeAmenities, parseDescriptionAmenities, scoreDataQuality } from './normalize.js'
import type { NormalizedFacility } from './types.js'

const TB_API_URL       = process.env.TB_API_URL ?? 'http://localhost:8787'
const TB_SERVICE_TOKEN = process.env.TB_SERVICE_TOKEN!

if (!TB_SERVICE_TOKEN) throw new Error('TB_SERVICE_TOKEN is required')

const tb = new TbClient(TB_API_URL, TB_SERVICE_TOKEN)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const CO_FORESTS: Array<{ slug: string; name: string }> = [
  { slug: 'arp',        name: 'Arapaho and Roosevelt National Forests' },
  { slug: 'psicc',      name: 'Pike and San Isabel National Forests' },
  { slug: 'riogrande',  name: 'Rio Grande National Forest' },
  { slug: 'sanjuan',    name: 'San Juan National Forest' },
  { slug: 'gmug',       name: 'Grand Mesa, Uncompahgre and Gunnison National Forests' },
  { slug: 'whiteriver', name: 'White River National Forest' },
  { slug: 'mbrtb',      name: 'Medicine Bow-Routt National Forests' },
]

const BASE = 'https://www.fs.usda.gov'
const HEADERS = { 'User-Agent': 'CampFinder/1.0 (campground info aggregator)' }

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) { console.warn(`  HTTP ${res.status}: ${url}`); return null }
    return res.text()
  } catch (e) {
    console.warn(`  Fetch failed: ${url}: ${e}`)
    return null
  }
}

async function collectCampgroundUrls(slug: string): Promise<string[]> {
  const paths: string[] = []
  for (let page = 0; ; page++) {
    const url = `${BASE}/r02/${slug}/recreation/camping-cabins?page=%2C${page}`
    const html = await fetchHtml(url)
    if (!html) break
    const found = scrapeForestCampgroundUrls(html)
    if (found.length === 0) break
    paths.push(...found)
    await sleep(500)
  }
  return [...new Set(paths)]
}

async function main() {
  console.log(`Connecting to Teenybase at ${TB_API_URL}...`)

  const discovered: NormalizedFacility[] = []

  for (const forest of CO_FORESTS) {
    console.log(`\nEnumerating ${forest.name} (${forest.slug})...`)
    const paths = await collectCampgroundUrls(forest.slug)
    console.log(`  Found ${paths.length} campground URLs`)

    for (const path of paths) {
      const url = `${BASE}${path}`
      const slug = path.split('/').pop() ?? path
      process.stdout.write(`  Scraping: ${slug.slice(0, 50).padEnd(50)}\r`)

      const html = await fetchHtml(url)
      if (!html) { await sleep(300); continue }

      const campground = scrapeCampgroundPage(html, url)
      if (!campground) { await sleep(300); continue } // RIDB campground — skip

      const amenities = {
        ...normalizeAmenities([]),
        ...parseDescriptionAmenities(campground.description),
      }

      const ridb_id = `fs-${forest.slug}-${slug}`

      discovered.push({
        ridb_id,
        name: campground.name,
        lat: campground.lat,
        lng: campground.lng,
        forest: forest.name,
        district: '',
        description: campground.description,
        fee_min: campground.fee_min,
        fee_max: campground.fee_max,
        season_start: '',
        season_end: '',
        fcfs_total: campground.fcfs_total,
        reservable_total: 0,
        is_fully_fcfs: true,
        is_partial_fcfs: false,
        amenities: JSON.stringify(amenities) as any,
        ridb_data_quality: scoreDataQuality(amenities),
        fs_url: campground.fs_url,
        last_synced: new Date().toISOString(),
      })

      await sleep(300)
    }
  }

  console.log(`\n\nDiscovered ${discovered.length} FCFS-only campgrounds. Upserting...`)
  await tb.upsertFacilities(discovered, (i, total) => {
    process.stdout.write(`\rUpserted ${i}/${total}`)
  })
  console.log('\nDiscover complete.')
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
