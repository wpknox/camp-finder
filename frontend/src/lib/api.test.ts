import { describe, it, expect, vi, afterEach } from "vitest";
import { submitJson, GENERIC_ERROR } from "./api";

function mockFetch(res: Response | Error) {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("submitJson", () => {
  it("returns data on 201", async () => {
    const f = mockFetch(new Response(JSON.stringify({ id: "a" }), { status: 201 }));
    const r = await submitJson<{ id: string }>("/api/x", { a: 1 });
    expect(r).toMatchObject({ ok: true, status: 201, data: { id: "a" } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/x");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe('{"a":1}');
  });

  it("returns ok on 200", async () => {
    mockFetch(new Response(JSON.stringify({ duplicate: true }), { status: 200 }));
    const r = await submitJson<{ duplicate?: boolean }>("/api/x", {});
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.data?.duplicate).toBe(true);
  });

  it("surfaces server error on 400", async () => {
    mockFetch(new Response(JSON.stringify({ error: "Bad input" }), { status: 400 }));
    const r = await submitJson("/api/x", {});
    expect(r).toMatchObject({ ok: false, status: 400, error: "Bad input" });
  });

  it("falls back on non-JSON 500", async () => {
    mockFetch(new Response("<html>oops</html>", { status: 500 }));
    const r = await submitJson("/api/x", {});
    expect(r).toMatchObject({ ok: false, status: 500, data: null, error: GENERIC_ERROR });
  });

  it("uses custom fallbackError", async () => {
    mockFetch(new Response("nope", { status: 500 }));
    const r = await submitJson("/api/x", {}, { fallbackError: "Custom" });
    expect(r.error).toBe("Custom");
  });

  it("maps network failure to status 0", async () => {
    mockFetch(new TypeError("failed"));
    const r = await submitJson("/api/x", {});
    expect(r).toEqual({ ok: false, status: 0, data: null, error: GENERIC_ERROR });
  });

  it("sends no header or body when body is undefined", async () => {
    const f = mockFetch(new Response("{}", { status: 200 }));
    await submitJson("/api/x");
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it("supports DELETE", async () => {
    const f = mockFetch(new Response("{}", { status: 200 }));
    await submitJson("/api/x", { id: "1" }, { method: "DELETE" });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("DELETE");
  });
});
