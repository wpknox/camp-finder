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
