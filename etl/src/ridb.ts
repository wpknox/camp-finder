import type { RidbFacility, RidbCampsite, RidbListResponse } from "./types.js";

const BASE_URL = "https://ridb.recreation.gov/api/v1";
const PAGE_SIZE = 50;

export class RidbClient {
  constructor(private readonly apiKey: string) {}

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
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`RIDB error ${res.status}: ${await res.text()}`);

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
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RIDB error ${res.status}`);
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
      const res = await fetch(url);
      if (!res.ok) throw new Error(`RIDB error ${res.status}`);

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
