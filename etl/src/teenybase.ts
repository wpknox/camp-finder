// etl/src/teenybase.ts
import type { NormalizedFacility } from "./types.js";

export interface UpsertOptions {
  // Fields never sent when updating an existing row (inserts still get them).
  // Used for fields the source can't actually observe (e.g. RIDB has no
  // closure data, so its hardcoded is_closed:false must not clobber a
  // scrape/admin-set closure).
  omitOnUpdate?: Array<keyof NormalizedFacility>;
  // Fields dropped from an update patch when null/empty, so a source that
  // failed to derive a value doesn't wipe one another source already wrote.
  omitEmptyOnUpdate?: Array<keyof NormalizedFacility>;
}

export class TbClient {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
  ) {}

  private get headers() {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.serviceToken}`,
    };
    if (process.env.TB_SHARED_SECRET) {
      headers["X-TB-Key"] = process.env.TB_SHARED_SECRET;
    }
    if (process.env.TB_ACCESS_CLIENT_ID && process.env.TB_ACCESS_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = process.env.TB_ACCESS_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = process.env.TB_ACCESS_CLIENT_SECRET;
    }
    return headers;
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

  private async upsertFacilityWithIndex(
    facility: NormalizedFacility,
    index: Map<string, string>,
    deletedIds: Set<string>,
    opts?: UpsertOptions,
  ): Promise<void> {
    const existingId = index.get(facility.ridb_id);
    if (existingId) {
      // Admin-tombstoned rows are frozen: never refresh them, never let a
      // sync make them look alive again. (No insert either — the index
      // already resolves this ridb_id to the tombstoned row.)
      if (deletedIds.has(existingId)) return;
      // Never overwrite the survivor's ridb_id — a merged/absorbed ridb_id must
      // keep resolving to the surviving record's identity, not clobber it.
      const { ridb_id: _drop, ...patch } = facility;
      for (const field of opts?.omitOnUpdate ?? []) {
        delete (patch as Record<string, unknown>)[field];
      }
      for (const field of opts?.omitEmptyOnUpdate ?? []) {
        const v = (patch as Record<string, unknown>)[field];
        if (v === null || v === undefined || v === "") {
          delete (patch as Record<string, unknown>)[field];
        }
      }
      await this.tbFetch(`/table/facilities/edit/${existingId}`, patch);
    } else {
      await this.tbFetch("/table/facilities/insert", { values: facility });
    }
  }

  async upsertFacilities(
    facilities: NormalizedFacility[],
    onProgress?: (i: number, total: number) => void,
    opts?: UpsertOptions,
  ): Promise<void> {
    // Build the ridb_id -> row id index ONCE per run (rather than one lookup per
    // facility) so merges (merged_ridb_ids) are resolved consistently and cheaply.
    const rows = await this.listAllWithMerged();
    const index = buildRidbIndex(rows);
    const deletedIds = new Set(rows.filter((r) => r.is_deleted).map((r) => r.id));
    for (let i = 0; i < facilities.length; i++) {
      await this.upsertFacilityWithIndex(facilities[i], index, deletedIds, opts);
      onProgress?.(i + 1, facilities.length);
    }
  }

  async listAllWithMerged(): Promise<
    Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number; fee_min: number | null; fs_url: string; merged_ridb_ids: string[]; is_deleted: boolean }>
  > {
    // limit: 10000 — well above current scale (~600 campgrounds). If the table ever
    // grows past this, add cursor/offset pagination here.
    const res = (await this.tbFetch("/table/facilities/list", { limit: 10000 })) as {
      items: Array<{ id: string; ridb_id: string; name: string; lat: number; lng: number; fee_min: number | null; fs_url: string; merged_ridb_ids?: string | string[] | null; is_deleted?: boolean | null }>;
    };
    return res.items.map((f) => ({
      ...f,
      merged_ridb_ids: typeof f.merged_ridb_ids === "string" ? JSON.parse(f.merged_ridb_ids) : (f.merged_ridb_ids ?? []),
      is_deleted: !!f.is_deleted,
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
