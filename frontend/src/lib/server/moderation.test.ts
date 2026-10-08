import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/static/public", () => ({ PUBLIC_TB_URL: "http://tb.test" }));
vi.mock("$env/static/private", () => ({ TB_SERVICE_TOKEN: "test-token" }));
vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("./tbFetch", () => ({ tbFetch: vi.fn() }));

const check = vi.fn();
vi.mock("./auth/limiters", () => ({ suggestionLimiter: { check: (k: string) => check(k) } }));

import { tbFetch } from "./tbFetch";
import {
  loadPendingRow,
  parseResolveBody,
  resolveRow,
  guardSubmission,
  insertRow,
} from "./moderation";

const mockFetch = vi.mocked(tbFetch);
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  mockFetch.mockReset();
  check.mockReset();
});

describe("loadPendingRow", () => {
  it("404s with the noun when the view fails", async () => {
    mockFetch.mockReturnValueOnce(reply({}, 404));
    const res = (await loadPendingRow("edit_suggestions", "x", "Flag")) as Response;
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Flag not found" });
  });
  it("409s when already resolved", async () => {
    mockFetch.mockReturnValueOnce(reply({ id: "x", status: "approved" }));
    const res = (await loadPendingRow("edit_suggestions", "x", "Suggestion")) as Response;
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Suggestion already resolved" });
  });
  it("returns the row when pending", async () => {
    mockFetch.mockReturnValueOnce(reply({ id: "x", status: "pending" }));
    expect(await loadPendingRow("edit_suggestions", "x", "Suggestion")).toEqual({
      id: "x",
      status: "pending",
    });
  });
});

describe("parseResolveBody", () => {
  const req = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });
  it("400s on bad action or missing id", async () => {
    for (const b of [{ id: "a", action: "nope" }, { action: "approve" }, {}]) {
      const res = (await parseResolveBody(req(b))) as Response;
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "id and action (approve|reject) required" });
    }
  });
  it("returns the body incl. extras", async () => {
    const body = await parseResolveBody(req({ id: "a", action: "reject", winner_id: "w" }));
    expect(body).toMatchObject({ id: "a", action: "reject", winner_id: "w" });
  });
});

describe("resolveRow", () => {
  it("posts status, reviewer, truncated note and extras", async () => {
    mockFetch.mockReturnValueOnce(reply({}));
    await resolveRow("merge_suggestions", "m1", "admin1", "approve", "x".repeat(1500), {
      created_facility_id: "f1",
    });
    const [path, init] = mockFetch.mock.calls[0];
    expect(path).toBe("/api/v1/table/merge_suggestions/edit/m1");
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      status: "approved",
      reviewed_by: "admin1",
      created_facility_id: "f1",
    });
    expect(body.admin_note).toHaveLength(1000);
    expect(Number.isNaN(Date.parse(body.reviewed_at))).toBe(false);
  });
  it("defaults note to empty and maps reject", async () => {
    mockFetch.mockReturnValueOnce(reply({}));
    await resolveRow("t", "i", "a", "reject", undefined);
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.status).toBe("rejected");
    expect(body.admin_note).toBe("");
  });
});

describe("guardSubmission", () => {
  const locals = { user: { id: "u" } } as unknown as App.Locals;
  it("401s before touching the limiter", async () => {
    const res = guardSubmission({ user: null } as unknown as App.Locals, () => "1.1.1.1")!;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthenticated" });
    expect(check).not.toHaveBeenCalled();
  });
  it("429s when rate limited", async () => {
    check.mockReturnValue({ allowed: false });
    const res = guardSubmission(locals, () => "1.1.1.1")!;
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many submissions — try again later" });
    expect(check).toHaveBeenCalledWith("1.1.1.1");
  });
  it("returns null when allowed", () => {
    check.mockReturnValue({ allowed: true });
    expect(guardSubmission(locals, () => "1.1.1.1")).toBeNull();
  });
});

describe("insertRow", () => {
  it("returns 201 on success and wraps values", async () => {
    mockFetch.mockReturnValueOnce(reply({ id: "n" }, 200));
    const res = await insertRow("delete_suggestions", { a: 1 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "n" });
    const [path, init] = mockFetch.mock.calls[0];
    expect(path).toBe("/api/v1/table/delete_suggestions/insert");
    expect(JSON.parse(init!.body as string)).toEqual({ values: { a: 1 } });
  });
  it("passes through error status", async () => {
    mockFetch.mockReturnValueOnce(reply({ error: "bad" }, 400));
    const res = await insertRow("t", {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad" });
  });
});
