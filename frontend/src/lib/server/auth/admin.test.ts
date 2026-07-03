import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/static/public", () => ({ PUBLIC_TB_URL: "http://tb.test" }));
vi.mock("$env/static/private", () => ({ TB_SERVICE_TOKEN: "test-token" }));

import { requireAdmin } from "./admin";

const adminRecord = { id: "u1", email: "a@x.com", role: "admin" };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("requireAdmin", () => {
  it("throws 401 when unauthenticated", async () => {
    await expect(requireAdmin({ user: null } as never)).rejects.toMatchObject(
      { status: 401 },
    );
  });

  it("throws 403 when role is not admin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...adminRecord, role: null }), {
          status: 200,
        }),
      ),
    );
    await expect(
      requireAdmin({ user: { id: "u1" } } as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns the record for an admin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(adminRecord), { status: 200 }),
      ),
    );
    await expect(
      requireAdmin({ user: { id: "u1" } } as never),
    ).resolves.toMatchObject({ role: "admin" });
  });
});
