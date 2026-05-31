import { parse } from "node-html-parser";

export interface ScrapedCampground {
  name: string;
  lat: number;
  lng: number;
  description: string;
  fee_min: number | null;
  fee_max: number | null;
  fcfs_total: number;
  fs_url: string;
}

export function isRidbCampground(html: string): boolean {
  return html.includes("cdn.recreation.gov/widget/fs/camping/index.html?id=");
}

export function scrapeForestCampgroundUrls(html: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  const re = /href="(\/r02\/[^"\/]+\/recreation\/[^"\/]*campground[^"\/]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    if (!seen.has(path)) {
      seen.add(path);
      results.push(path);
    }
  }
  return results;
}

export interface ScrapedFsData {
  fee_min: number | null;
  fee_max: number | null;
}

export function parseFsPageFees(html: string): ScrapedFsData {
  const root = parse(html);

  // Remove chrome — fees are in the main content
  root
    .querySelectorAll("nav, header, footer, script, style")
    .forEach((el) => el.remove());

  const text = root.text.replace(/\s+/g, " ").toLowerCase();

  if (
    /no fee|free of charge|no charge|\bfree\b.*(?:camp|site)|(?:camp|site).*\bfree\b/.test(
      text,
    )
  ) {
    return { fee_min: 0, fee_max: 0 };
  }

  const feeContext = /fee|per night|camping cost|nightly rate/;
  const sentences = text.split(/[.!?]/);
  const dollars: number[] = [];

  for (const sentence of sentences) {
    if (!feeContext.test(sentence)) continue;
    const matches = [...sentence.matchAll(/\$(\d+(?:\.\d+)?)/g)];
    for (const m of matches) dollars.push(Number.parseFloat(m[1]));
  }

  if (dollars.length === 0) return { fee_min: null, fee_max: null };
  return { fee_min: Math.min(...dollars), fee_max: Math.max(...dollars) };
}

export function scrapeCampgroundPage(
  html: string,
  url: string,
): ScrapedCampground | null {
  if (isRidbCampground(html)) return null;

  const latMatch = html.match(/<b>Latitude:\s*<\/b>\s*([\d.-]+)/);
  const lngMatch = html.match(/<b>Longitude:\s*<\/b>\s*([\d.-]+)/);
  if (!latMatch || !lngMatch) return null;

  const lat = parseFloat(latMatch[1]);
  const lng = parseFloat(lngMatch[1]);
  if (isNaN(lat) || isNaN(lng)) return null;

  const titleMatch = html.match(
    /<title>[^|]+\|\s*([^|]+)\|\s*Forest Service<\/title>/,
  );
  const name = titleMatch
    ? titleMatch[1].trim()
    : (url.split("/").pop()?.replace(/-/g, " ") ?? "Unknown");

  const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
  const description = descMatch ? descMatch[1] : "";

  const hasFeeSection =
    html.includes('id="rec_acc_fees"') ||
    html.includes("id='rec_acc_fees'");
  const fees = hasFeeSection
    ? parseFsPageFees(html)
    : { fee_min: null, fee_max: null };

  const fcfsMatch = description.match(/(\d+)\s+first.come/i);
  const fcfs_total = fcfsMatch ? parseInt(fcfsMatch[1], 10) : 0;

  return {
    name,
    lat,
    lng,
    description,
    fee_min: fees.fee_min,
    fee_max: fees.fee_max,
    fcfs_total,
    fs_url: url,
  };
}

export async function scrapeFsPage(url: string): Promise<ScrapedFsData> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "CampFinder/1.0 (campground info aggregator)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`fsScraper: ${res.status} fetching ${url}`);
      return { fee_min: null, fee_max: null };
    }
    return parseFsPageFees(await res.text());
  } catch (e) {
    console.warn(`fsScraper: failed to fetch ${url}: ${e}`);
    return { fee_min: null, fee_max: null };
  }
}
