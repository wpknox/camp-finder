import { describe, it, expect } from 'vitest'
import { parseFsPageFees } from '../src/fsScraper.js'

describe('parseFsPageFees', () => {
  it('extracts fee from a table cell near "fee" heading', () => {
    const html = `
      <html><body>
        <h2>Fees &amp; Reservations</h2>
        <table>
          <tr><th>Camping Fee</th><td>$22 per night</td></tr>
        </table>
      </body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: 22, fee_max: 22 })
  })

  it('extracts fee range from prose text', () => {
    const html = `
      <html><body>
        <div class="usa-prose">
          <p>Camping fees range from $18 to $28 per night depending on site type.</p>
        </div>
      </body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: 18, fee_max: 28 })
  })

  it('returns free when page says "no fee"', () => {
    const html = `
      <html><body><p>There is no fee to use this campground.</p></body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: 0, fee_max: 0 })
  })

  it('returns nulls when no fee info found', () => {
    const html = `
      <html><body><p>Beautiful campground in the national forest.</p></body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: null, fee_max: null })
  })

  it('ignores nav/header/footer content', () => {
    const html = `
      <html><body>
        <nav><a href="#">$0 membership</a></nav>
        <header>National Forest</header>
        <main><p>Primitive camping, no fee.</p></main>
        <footer>Contact: $1-800-555-1234</footer>
      </body></html>
    `
    expect(parseFsPageFees(html)).toEqual({ fee_min: 0, fee_max: 0 })
  })
})
