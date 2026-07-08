// frontend/src/routes/api/alerts/[id]/+server.ts
import { json } from '@sveltejs/kit'
import { parse } from 'node-html-parser'
import { tbFetch } from '$lib/server/tbFetch'
import { TB_SERVICE_TOKEN } from '$env/static/private'
import type { RequestHandler } from './$types'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const tbHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TB_SERVICE_TOKEN}`,
}

export const GET: RequestHandler = async ({ params }) => {
  const facilityId = params.id
  const cutoff = Date.now() - CACHE_TTL_MS

  const cacheRes = await tbFetch(`/api/v1/table/alerts/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: `facility_id == '${facilityId}'`, limit: 1 }),
  })
  const cache = await cacheRes.json() as { items?: Array<{ content: string; scraped_at: string }> }
  const fresh = cache.items?.find(i => new Date(i.scraped_at).getTime() >= cutoff)

  if (fresh) {
    return json({ content: fresh.content, scraped_at: fresh.scraped_at, cached: true })
  }

  const facRes = await tbFetch(`/api/v1/table/facilities/view/${facilityId}`)
  const facility = facRes.ok ? await facRes.json() as { fs_url?: string } : null

  if (!facility?.fs_url) return json({ content: null, scraped_at: null })

  let content: string | null = null
  try {
    const res = await fetch(facility.fs_url, {
      headers: { 'User-Agent': 'CampFinder/1.0 (campground info aggregator)' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const root = parse(await res.text())
      root.querySelectorAll('nav, footer, script, style, header').forEach(el => el.remove())

      const texts = [
        ...root.querySelectorAll('.usa-alert__text'),
        ...root.querySelectorAll('[class*="alert"]'),
        ...root.querySelectorAll('[class*="closure"]'),
        ...root.querySelectorAll('[class*="notice"]'),
      ]
        .map(el => el.text
          .split('\n')
          .filter(line => !/view\s+all\s+alerts/i.test(line))
          .join('\n')
          .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n\n').trim()
        )
        .filter(t => t.replace(/\s/g, '').length > 15)
        .filter((t, i, a) => a.indexOf(t) === i)

      content = texts.join('\n\n') || null
    }
  } catch { /* fail gracefully */ }

  const scraped_at = new Date().toISOString()

  const existingRes = await tbFetch(`/api/v1/table/alerts/list`, {
    method: 'POST',
    headers: tbHeaders,
    body: JSON.stringify({ where: `facility_id == '${facilityId}'`, limit: 1 }),
  })
  const existing = await existingRes.json() as { items?: Array<{ id: string }> }

  if (existing.items?.length) {
    await tbFetch(`/api/v1/table/alerts/edit/${existing.items[0].id}`, {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ content, scraped_at }),
    })
  } else {
    await tbFetch(`/api/v1/table/alerts/insert`, {
      method: 'POST', headers: tbHeaders,
      body: JSON.stringify({ values: { facility_id: facilityId, content, scraped_at } }),
    })
  }

  return json({ content, scraped_at, cached: false })
}
