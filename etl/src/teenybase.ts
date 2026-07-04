// etl/src/teenybase.ts
import type { NormalizedFacility } from "./types.js";

export class TbClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
  ) {}

  private get headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.serviceToken}`,
    };
  }

  private async tbFetch(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Teenybase ${path} ${res.status}: ${text}`);
    }
    return res.json();
  }

  async upsertFacility(facility: NormalizedFacility): Promise<void> {
    const rows = await this.listAllWithMerged();
    const index = buildRidbIndex(rows);
    await this.upsertFacilityWithIndex(facility, index);
  }

  private async upsertFacilityWithIndex(
    facility: NormalizedFacility,
    index: Map<string, string>,
  ): Promise<void> {
    const existingId = index.get(facility.ridb_id);
    if (existingId) {
      // Never overwrite the survivor's ridb_id — a merged/absorbed ridb_id must
      // keep resolving to the surviving record's identity, not clobber it.
      const { ridb_id: _drop, ...patch } = facility as unknown as Record<string, unknown>;
      await this.tbFetch(`/table/facilities/edit/${existingId}`, patch);
    } else {
      await this.tbFetch("/table/facilities/insert", { values: facility });
    }
  }

  async upsertFacilities(
    facilities: NormalizedFacility[],
    onProgress?: (i: number, total: number) => void,
  ): Promise<void> {
    // Build the ridb_id -> row id index ONCE per run (rather than one lookup per
    // facility) so merges (merged_ridb_ids) are resolved consistently and cheaply.
    const rows = await this.listAllWithMerged();
    const index = buildRidbIndex(rows);
    for (let i = 0; i < facilities.length; i++) {
      await this.upsertFacilityWithIndex(facilities[i], index);
      onProgress?.(i + 1, facilities.length);
    }
  }

  async listAllRidb(): Promise<Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number; fee_min: number | null; fs_url: string }>> {
    const res = await this.tbFetch("/table/facilities/list", { limit: 10000 }) as {
      items: Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number; fee_min: number | null; fs_url: string }>
    };
    return res.items.filter(f => !f.ridb_id.startsWith("fs-") && !f.ridb_id.startsWith("nps-"));
  }

  async listAll(): Promise<Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number }>> {
    // limit: 10000 — well above current scale (~600 campgrounds). If the table ever
    // grows past this, add cursor/offset pagination here.
    const res = await this.tbFetch("/table/facilities/list", { limit: 10000 }) as {
      items: Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number }>
    };
    return res.items;
  }

  async listAllWithMerged(): Promise<
    Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number; fee_min: number | null; fs_url: string; merged_ridb_ids: string[] }>
  > {
    // limit: 10000 — well above current scale (~600 campgrounds). If the table ever
    // grows past this, add cursor/offset pagination here.
    const res = (await this.tbFetch("/table/facilities/list", { limit: 10000 })) as {
      items: Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number; fee_min: number | null; fs_url: string; merged_ridb_ids?: string | string[] | null }>;
    };
    return res.items.map((f) => ({
      ...f,
      merged_ridb_ids: typeof f.merged_ridb_ids === "string" ? JSON.parse(f.merged_ridb_ids) : (f.merged_ridb_ids ?? []),
    }));
  }

  async patchFacility(id: string, patch: Record<string, unknown>): Promise<void> {
    await this.tbFetch(`/table/facilities/edit/${id}`, patch);
  }
}

// Maps every ridb_id — including ones absorbed via an admin duplicate-merge
// (stored in merged_ridb_ids) — to the row id that should now be treated as
// its owner. Re-running ETL syncs must resolve absorbed ridb_ids through this
// index rather than inserting a fresh duplicate row.
export function buildRidbIndex(
  rows: Array<{ id: string; ridb_id: string; merged_ridb_ids?: string[] | null }>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(row.ridb_id, row.id);
    for (const absorbed of row.merged_ridb_ids ?? []) index.set(absorbed, row.id);
  }
  return index;
}
