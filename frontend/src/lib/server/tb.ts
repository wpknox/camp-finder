import { TB_SERVICE_TOKEN } from "$env/static/private";
import { tbFetch } from "./tbFetch";

// Service-token access to Teenybase, for server routes only. Used because:
// - the suggestion/moderation tables (edit_suggestions, merge_suggestions,
//   delete_suggestions, campground_suggestions) have ALL Teenybase rules 'false',
// - facility writes are admin-approved patches,
// - alert/nearby cache writes are server-only.
// None of these can use a user token.
export const tbHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TB_SERVICE_TOKEN}`,
};

export const tb = (path: string) => `/api/v1/table/${path}`;

export async function tbList<T>(table: string, body: Record<string, unknown>): Promise<T[]> {
  const res = await tbFetch(tb(`${table}/list`), {
    method: "POST",
    headers: tbHeaders,
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { items?: T[] };
  return data.items ?? [];
}

/** GET a single row by id with the service token; null on non-ok. */
export async function tbView<T>(table: string, id: string): Promise<T | null> {
  const res = await tbFetch(tb(`${table}/view/${id}`), { headers: tbHeaders });
  return res.ok ? ((await res.json()) as T) : null;
}
