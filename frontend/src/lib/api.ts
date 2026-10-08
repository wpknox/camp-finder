export const GENERIC_ERROR = "Something went wrong";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string;
}

/**
 * JSON request to our own /api routes. Never throws: network errors resolve to
 * `{ ok: false, status: 0 }`. `error` is the server's `{ error }` message when
 * present, else `fallbackError` (default GENERIC_ERROR).
 */
export async function submitJson<T = unknown>(
  url: string,
  body?: unknown,
  opts: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; fallbackError?: string } = {},
): Promise<ApiResult<T>> {
  const { method = "POST", fallbackError = GENERIC_ERROR } = opts;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => null)) as T | null;
    const serverError = (data as { error?: unknown } | null)?.error;
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: typeof serverError === "string" ? serverError : fallbackError,
    };
  } catch {
    return { ok: false, status: 0, data: null, error: fallbackError };
  }
}
