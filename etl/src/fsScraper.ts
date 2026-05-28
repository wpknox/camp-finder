import { parse } from 'node-html-parser'

export interface ScrapedFsData {
  fee_min: number | null
  fee_max: number | null
}

export function parseFsPageFees(html: string): ScrapedFsData {
  const root = parse(html)

  // Remove chrome — fees are in the main content
  root.querySelectorAll('nav, header, footer, script, style').forEach(el => el.remove())

  const text = root.text.replace(/\s+/g, ' ').toLowerCase()

  if (/no fee|free of charge|no charge|\bfree\b.*(?:camp|site)|(?:camp|site).*\bfree\b/.test(text)) {
    return { fee_min: 0, fee_max: 0 }
  }

  const feeContext = /fee|per night|camping cost|nightly rate/
  const sentences = text.split(/[.!?\n]/)
  const dollars: number[] = []

  for (const sentence of sentences) {
    if (!feeContext.test(sentence)) continue
    const matches = [...sentence.matchAll(/\$(\d+(?:\.\d+)?)/g)]
    for (const m of matches) dollars.push(parseFloat(m[1]))
  }

  if (dollars.length === 0) return { fee_min: null, fee_max: null }
  return { fee_min: Math.min(...dollars), fee_max: Math.max(...dollars) }
}

export async function scrapeFsPage(url: string): Promise<ScrapedFsData> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CampFinder/1.0 (campground info aggregator)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { fee_min: null, fee_max: null }
    return parseFsPageFees(await res.text())
  } catch {
    return { fee_min: null, fee_max: null }
  }
}
