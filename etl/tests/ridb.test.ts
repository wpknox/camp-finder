import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RidbClient } from '../src/ridb.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makePageResponse(data: unknown[], total: number) {
  return {
    ok: true,
    json: async () => ({ RECDATA: data, METADATA: { RESULTS: { CURRENT_COUNT: data.length, TOTAL_COUNT: total } } })
  }
}

describe('RidbClient', () => {
  const client = new RidbClient('test-key')
  beforeEach(() => mockFetch.mockReset())

  it('fetches all pages when total > page size', async () => {
    mockFetch
      .mockResolvedValueOnce(makePageResponse([{ FacilityID: '1' }], 2))
      .mockResolvedValueOnce(makePageResponse([{ FacilityID: '2' }], 2))

    const results = await client.getAllFacilities({ state: 'CO', activity: 'CAMPING' }, 1)
    expect(results).toHaveLength(2)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('includes API key in every request', async () => {
    mockFetch.mockResolvedValue(makePageResponse([], 0))
    await client.getAllFacilities({ state: 'CO' })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('apikey=test-key')
  })

  it('fetches campsites for a facility', async () => {
    mockFetch.mockResolvedValue(makePageResponse([{ CampsiteID: 'c1' }], 1))
    const sites = await client.getCampsites('10165691')
    expect(sites[0].CampsiteID).toBe('c1')
  })
})
