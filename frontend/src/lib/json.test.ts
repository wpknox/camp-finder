import { describe, it, expect } from "vitest";
import { parseJson } from "./json";

describe("parseJson", () => {
  it("returns fallback for null and undefined", () => {
    expect(parseJson(null, { a: 1 })).toEqual({ a: 1 });
    expect(parseJson(undefined, [])).toEqual([]);
  });
  it("parses valid JSON strings", () => {
    expect(parseJson<string[]>('["x","y"]', [])).toEqual(["x", "y"]);
  });
  it("returns fallback for invalid JSON strings", () => {
    expect(parseJson("{nope", { ok: false })).toEqual({ ok: false });
  });
  it("passes objects through", () => {
    const o = { a: 1 };
    expect(parseJson(o, {})).toBe(o);
  });
});
