import { describe, it, expect } from "vitest";
import {
  canonicalName,
  groupByCanonicalName,
  findDuplicate,
  isNonRidbSourceId,
} from "../src/dedupe.js";

describe("canonicalName", () => {
  it("matches RIDB all-caps names against fs district-suffixed names", () => {
    expect(canonicalName("ALMONT")).toBe(canonicalName("Almont Campground - Gunnison RD"));
  });

  it("strips parentheticals", () => {
    expect(canonicalName("Cold Spring (CO)")).toBe(
      canonicalName("Cold Spring Campground - Gunnison RD"),
    );
    expect(canonicalName("Lodgepole (Taylor River Canyon near Gunnison, COLORADO)")).toBe(
      canonicalName("Lodgepole Campground - Gunnison RD"),
    );
  });

  it("strips campground/camping area suffix words", () => {
    expect(canonicalName("LOTTIS CREEK CAMPGROUND")).toBe(
      canonicalName("Lottis Creek Campground - Gunnison RD"),
    );
    expect(canonicalName("Winfield Camping Area")).toBe("winfield");
  });

  it("does not conflate genuinely different names", () => {
    expect(canonicalName("ONE MILE")).not.toBe(canonicalName("ROSY LANE"));
    expect(canonicalName("North Bank (CO)")).not.toBe(
      canonicalName("North Fork Campground (Salida, CO)"),
    );
  });

  it("survives hyphens inside names", () => {
    // no spaced " - " so the district-suffix strip must not fire
    expect(canonicalName("Maroon Bells-Snowmass Wilderness")).toContain("snowmass");
  });
});

describe("findDuplicate", () => {
  const rows = [
    { name: "Almont Campground - Gunnison RD", lat: 38.6553, lng: -106.8556 },
    { name: "Almont Campground - Somewhere Else", lat: 39.9, lng: -105.0 },
  ];
  const byName = groupByCanonicalName(rows);

  it("matches by canonical name + proximity", () => {
    const m = findDuplicate(byName, "ALMONT", 38.6555, -106.8558);
    expect(m).toBe(rows[0]);
  });

  it("rejects same name when too far away", () => {
    expect(findDuplicate(byName, "ALMONT", 38.9, -106.8556)).toBeUndefined();
  });

  it("rejects nearby facility with different name", () => {
    expect(findDuplicate(byName, "ROSY LANE", 38.6553, -106.8556)).toBeUndefined();
  });
});

describe("isNonRidbSourceId", () => {
  it("is true for fs-, nps- and user- prefixed ids", () => {
    expect(isNonRidbSourceId("fs-psicc-almont")).toBe(true);
    expect(isNonRidbSourceId("nps-curecanti-elk-creek")).toBe(true);
    expect(isNonRidbSourceId("user-abc123")).toBe(true);
  });

  it("is false for numeric RIDB ids", () => {
    expect(isNonRidbSourceId("232456")).toBe(false);
  });

  it("requires the hyphen, so look-alike prefixes are not matched", () => {
    expect(isNonRidbSourceId("users123")).toBe(false);
    expect(isNonRidbSourceId("fsx")).toBe(false);
    expect(isNonRidbSourceId("npsfoo")).toBe(false);
  });
});
