import { describe, it, expect } from "vitest";
import { deriveUsername } from "./username";

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

describe("deriveUsername", () => {
  it("derives from email local-part and matches the charset rule", () => {
    const u = deriveUsername("Alex.Smith@example.com", "Alex", () => "a3f9");
    expect(u).toBe("alexsmith_a3f9");
    expect(USERNAME_RE.test(u)).toBe(true);
  });
  it("falls back to display name when local-part has no letters/digits", () => {
    const u = deriveUsername("___@example.com", "Trail Boss", () => "b2c1");
    expect(u).toBe("trailboss_b2c1");
    expect(USERNAME_RE.test(u)).toBe(true);
  });
  it("prefixes a letter when the base would start with a digit", () => {
    const u = deriveUsername("123@example.com", "42", () => "zz");
    expect(USERNAME_RE.test(u)).toBe(true);
    expect(u.startsWith("u")).toBe(true);
  });
  it("never exceeds 32 chars", () => {
    const u = deriveUsername(
      "a".repeat(60) + "@example.com",
      "x",
      () => "beef",
    );
    expect(u.length).toBeLessThanOrEqual(32);
    expect(USERNAME_RE.test(u)).toBe(true);
    expect(u.endsWith("_beef")).toBe(true);
  });
  it("always produces a valid username for arbitrary unicode input", () => {
    const u = deriveUsername("日本語@example.com", "日本語", () => "c0de");
    expect(USERNAME_RE.test(u)).toBe(true);
  });
});
