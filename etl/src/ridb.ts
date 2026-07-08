import type { RidbFacility, RidbCampsite, RidbListResponse } from "./types.js";

const BASE_URL = "https://ridb.recreation.gov/api/v1";
const PAGE_SIZE = 50;
const MAX_RETRIES = 3;

export class RidbClient {
  constructor(private readonly apiKey: string) {}

  // RIDB rate-limits (429) and intermittently 5xxs under the request volume a
  // full grid sync generates; retry those with exponential backoff instead of
  // aborting the whole run.
  private async fetchWithRetry(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response | null = null;
      try {
        res = await fetch(url);
      } catch (e) {
        if (attempt >= MAX_RETRIES) throw e;
      }
      if (res) {
        if (res.ok) return res;
        if (
          attempt >= MAX_RETRIES ||
          (res.status !== 429 && res.status < 500)
        ) {
          throw new Error(`RIDB error ${res.status}: ${await res.text()}`);
        }
      }
      const retryAfter = Number(res?.headers.get("retry-after"));
      const delay = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await sleep(delay);
    }
  }

  async getAllFacilities(
    params: Record<string, string>,
    pageSize = PAGE_SIZE,
  ): Promise<RidbFacility[]> {
    const all: RidbFacility[] = [];
    let offset = 0;

    while (true) {
      const url = this.buildUrl("/facilities", {
        ...params,
        limit: String(pageSize),
        offset: String(offset),
      });
      const res = await this.fetchWithRetry(url);

      const data: RidbListResponse<RidbFacility> = await res.json();
      all.push(...data.RECDATA);

      if (all.length >= data.METADATA.RESULTS.TOTAL_COUNT) break;
      offset += pageSize;
      await sleep(200);
    }

    return all;
  }

  async getFacilityDetail(facilityId: string): Promise<RidbFacility> {
    const url = this.buildUrl(`/facilities/${facilityId}`, {});
    const res = await this.fetchWithRetry(url);
    return res.json();
  }

  async getCampsites(facilityId: string): Promise<RidbCampsite[]> {
    const all: RidbCampsite[] = [];
    let offset = 0;

    while (true) {
      const url = this.buildUrl(`/facilities/${facilityId}/campsites`, {
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const res = await this.fetchWithRetry(url);

      const data: RidbListResponse<RidbCampsite> = await res.json();
      all.push(...data.RECDATA);

      if (all.length >= data.METADATA.RESULTS.TOTAL_COUNT) break;
      offset += PAGE_SIZE;
      await sleep(200);
    }

    return all;
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const qs = new URLSearchParams({ ...params, apikey: this.apiKey });
    return `${BASE_URL}${path}?${qs}`;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
