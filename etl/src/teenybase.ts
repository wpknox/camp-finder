// etl/src/teenybase.ts
import type { NormalizedFacility } from './types.js'

export class TbClient {
  constructor(
    private baseUrl: string,
    private serviceToken: string,
  ) {}

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.serviceToken}`,
    }
  }

  private async tbFetch(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Teenybase ${path} ${res.status}: ${text}`)
    }
    return res.json()
  }

  async upsertFacility(facility: NormalizedFacility): Promise<void> {
    const list = await this.tbFetch('/table/facilities/list', {
      where: `ridb_id == '${facility.ridb_id}'`,
      limit: 1,
    }) as { items: Array<{ id: string }> }

    if (list.items.length > 0) {
      await this.tbFetch(`/table/facilities/edit/${list.items[0].id}`, facility)
    } else {
      await this.tbFetch('/table/facilities/insert', { values: facility })
    }
  }

  async upsertFacilities(
    facilities: NormalizedFacility[],
    onProgress?: (i: number, total: number) => void,
  ): Promise<void> {
    for (let i = 0; i < facilities.length; i++) {
      await this.upsertFacility(facilities[i])
      onProgress?.(i + 1, facilities.length)
    }
  }
}
