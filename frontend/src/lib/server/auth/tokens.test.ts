import { describe, it, expect, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { AUTH_TOKEN_SECRET: "test-secret" } }));

import { signToken, verifyToken, decodeToken, RESET_TTL_MS } from "./tokens";

const STAMP = "2026-07-05 12:00:00";

describe("auth tokens", () => {
  it("round-trips a valid reset token", async () => {
    const token = await signToken({ uid: "u1", purpose: "reset" }, STAMP, RESET_TTL_MS);
    const payload = await verifyToken(token, "reset", STAMP);
    expect(payload?.uid).toBe("u1");
    expect(payload?.purpose).toBe("reset");
  });

  it("decodeToken reads the uid without verifying", async () => {
    const token = await signToken({ uid: "u1", purpose: "verify" }, STAMP, RESET_TTL_MS);
    expect(decodeToken(token)?.uid).toBe("u1");
  });

  it("rejects wrong purpose", async () => {
    const token = await signToken({ uid: "u1", purpose: "verify" }, STAMP, RESET_TTL_MS);
    expect(await verifyToken(token, "reset", STAMP)).toBeNull();
  });

  it("rejects a stale updated stamp (record changed since issue)", async () => {
    const token = await signToken({ uid: "u1", purpose: "reset" }, STAMP, RESET_TTL_MS);
    expect(await verifyToken(token, "reset", "2026-07-05 12:00:01")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signToken({ uid: "u1", purpose: "reset" }, STAMP, -1000);
    expect(await verifyToken(token, "reset", STAMP)).toBeNull();
  });

  it("rejects tampered payload and garbage", async () => {
    const token = await signToken({ uid: "u1", purpose: "reset" }, STAMP, RESET_TTL_MS);
    const [body, sig] = token.split(".");
    const evil = btoa(JSON.stringify({ uid: "u2", purpose: "reset", exp: Date.now() + 9e6 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyToken(`${evil}.${sig}`, "reset", STAMP)).toBeNull();
    expect(await verifyToken("not-a-token", "reset", STAMP)).toBeNull();
    expect(await verifyToken(`${body}.AAAA`, "reset", STAMP)).toBeNull();
  });
});
