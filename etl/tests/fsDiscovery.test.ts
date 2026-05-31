import { describe, it, expect } from 'vitest'
import { scrapeForestCampgroundUrls, isRidbCampground, scrapeCampgroundPage } from '../src/fsScraper.js'

describe('scrapeForestCampgroundUrls', () => {
  const listingHtml = `
    <html><body>
      <a href="/r02/whiteriver/recreation/opportunities">Opportunities</a>
      <a href="/r02/whiteriver/recreation/epic-adventures">Epic Adventures</a>
      <a href="/r02/whiteriver/recreation/aspen-sopris-ranger-district-0">Ranger District</a>
      <a href="/r02/whiteriver/recreation/groups/wilderness">Wilderness</a>
      <a href="/r02/whiteriver/recreation/avalanche-campground">Avalanche Campground</a>
      <a href="/r02/whiteriver/recreation/bogan-flats-campground">Bogan Flats</a>
      <a href="/r02/whiteriver/recreation/bogan-flats-group-campground">Bogan Flats Group</a>
    </body></html>
  `

  it('returns campground paths and filters non-campground links', () => {
    expect(scrapeForestCampgroundUrls(listingHtml)).toEqual([
      '/r02/whiteriver/recreation/avalanche-campground',
      '/r02/whiteriver/recreation/bogan-flats-campground',
      '/r02/whiteriver/recreation/bogan-flats-group-campground',
    ])
  })

  it('returns empty array for a page with no campground links', () => {
    expect(scrapeForestCampgroundUrls('<html><body><a href="/about">About</a></body></html>')).toEqual([])
  })

  it('deduplicates repeated links', () => {
    const html = `
      <html><body>
        <a href="/r02/arp/recreation/mirror-lake-campground">Mirror Lake</a>
        <a href="/r02/arp/recreation/mirror-lake-campground">Mirror Lake</a>
      </body></html>
    `
    expect(scrapeForestCampgroundUrls(html)).toEqual([
      '/r02/arp/recreation/mirror-lake-campground',
    ])
  })
})

describe('isRidbCampground', () => {
  it('returns true when page has a specific recreation.gov reservation iframe', () => {
    const html = `
      <html><body>
        <iframe src="https://cdn.recreation.gov/widget/fs/camping/index.html?id=231880"
                width="100%" height="800"></iframe>
      </body></html>
    `
    expect(isRidbCampground(html)).toBe(true)
  })

  it('returns false when page only has the generic recreation.gov link', () => {
    const html = `
      <html><body>
        <a href="https://recreation.gov" class="first">Recreation.gov</a>
      </body></html>
    `
    expect(isRidbCampground(html)).toBe(false)
  })

  it('returns false for a page with no recreation.gov reference at all', () => {
    expect(isRidbCampground('<html><body><p>Primitive camping area.</p></body></html>')).toBe(false)
  })
})

describe('scrapeCampgroundPage', () => {
  const fcfsHtml = `
    <html>
    <head>
      <title>White River National Forest | Avalanche Campground | Forest Service</title>
      <meta name="description" content="Avalanche Campground has 6 first-come first-serve campsites. Located adjacent to Avalanche Creek." />
    </head>
    <body>
      <div class="usa-accordion__content" id="rec_acc_fees">
        <p>Overnight Use:<br />Single Site: $21 per night</p>
      </div>
      <p><b>Latitude: </b> 39.236566</p>
      <p><b>Longitude: </b> -107.203346</p>
      <a href="https://recreation.gov" class="first">Recreation.gov</a>
    </body></html>
  `
  const fcfsUrl = 'https://www.fs.usda.gov/r02/whiteriver/recreation/avalanche-campground'

  it('extracts a full ScrapedCampground from a FCFS page', () => {
    expect(scrapeCampgroundPage(fcfsHtml, fcfsUrl)).toEqual({
      name: 'Avalanche Campground',
      lat: 39.236566,
      lng: -107.203346,
      description: 'Avalanche Campground has 6 first-come first-serve campsites. Located adjacent to Avalanche Creek.',
      fee_min: 21,
      fee_max: 21,
      fcfs_total: 6,
      fs_url: fcfsUrl,
    })
  })

  it('returns null for a RIDB campground page (has reservation iframe)', () => {
    const ridbHtml = `
      <html>
      <head>
        <title>White River National Forest | Difficult Campground | Forest Service</title>
        <meta name="description" content="Difficult Campground offers reservable sites." />
      </head>
      <body>
        <iframe src="https://cdn.recreation.gov/widget/fs/camping/index.html?id=231880"></iframe>
        <p><b>Latitude: </b> 39.14255</p>
        <p><b>Longitude: </b> -106.77365</p>
      </body></html>
    `
    expect(scrapeCampgroundPage(ridbHtml, 'https://www.fs.usda.gov/r02/whiteriver/recreation/difficult-campground')).toBeNull()
  })

  it('returns null when lat/lng are missing', () => {
    const noLatLng = `
      <html>
      <head>
        <title>White River National Forest | Mystery Camp | Forest Service</title>
        <meta name="description" content="Some campground." />
      </head>
      <body><p>No coordinates here.</p></body></html>
    `
    expect(scrapeCampgroundPage(noLatLng, 'https://www.fs.usda.gov/r02/whiteriver/recreation/mystery-camp')).toBeNull()
  })

  it('defaults fcfs_total to 0 when not mentioned in description', () => {
    const noCount = `
      <html>
      <head>
        <title>Rio Grande National Forest | Lost Trail Campground | Forest Service</title>
        <meta name="description" content="Lost Trail offers primitive campsites along the river." />
      </head>
      <body>
        <p><b>Latitude: </b> 37.5</p>
        <p><b>Longitude: </b> -106.8</p>
      </body></html>
    `
    const result = scrapeCampgroundPage(noCount, 'https://www.fs.usda.gov/r02/riogrande/recreation/lost-trail-campground')
    expect(result?.fcfs_total).toBe(0)
  })

  it('extracts fees from an h3-based fee section (no id="rec_acc_fees")', () => {
    const h3FeeHtml = `
      <html>
      <head>
        <title>San Juan National Forest | Lower Piedra Campground | Forest Service</title>
        <meta name="description" content="Lower Piedra Campground is a fee site along the Piedra River." />
      </head>
      <body>
        <h3>Fee Site and Info</h3>
        <p>Overnight Use:<br />Single Site: $28 per night</p>
        <p><b>Latitude: </b> 37.214</p>
        <p><b>Longitude: </b> -107.339</p>
      </body></html>
    `
    const result = scrapeCampgroundPage(h3FeeHtml, 'https://www.fs.usda.gov/r02/sanjuan/recreation/lower-piedra-campground')
    expect(result?.fee_min).toBe(28)
    expect(result?.fee_max).toBe(28)
  })

  it('returns null fee fields when no fee info is present', () => {
    const noFee = `
      <html>
      <head>
        <title>Rio Grande National Forest | Free Camp | Forest Service</title>
        <meta name="description" content="Free Camp has 4 first-come first-serve campsites." />
      </head>
      <body>
        <p><b>Latitude: </b> 37.6</p>
        <p><b>Longitude: </b> -106.9</p>
      </body></html>
    `
    const result = scrapeCampgroundPage(noFee, 'https://www.fs.usda.gov/r02/riogrande/recreation/free-camp')
    expect(result?.fee_min).toBeNull()
    expect(result?.fee_max).toBeNull()
  })
})
