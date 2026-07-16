import { describe, expect, it } from "vitest";
import { mapProjectionsEqual, projectMap } from "./map-projection";
import type { MapLike } from "./map-projection";

const base: MapLike = {
  generatedAt: "2026-07-16T00:00:00Z",
  cacheKey: "abc",
  dimensions: [
    {
      key: "calma",
      value: 0.72,
      measured: true,
      evidence: { modelId: "OU-GT", n: 21 },
    },
    {
      key: "claridad",
      value: 0.6,
      measured: true,
      evidence: { modelId: "CHK-S1", n: 5 },
    },
  ],
};

describe("content-core · map-projection (semantic firewall comparison)", () => {
  it("projects axis value + provenance, sorted by key", () => {
    const p = projectMap(base);
    expect(p.map((a) => a.key)).toEqual(["calma", "claridad"]);
    expect(p[0]).toEqual({
      key: "calma",
      value: 0.72,
      measured: true,
      modelId: "OU-GT",
      n: 21,
    });
  });

  it("is EQUAL when only incidental fields differ (timestamp, cache key)", () => {
    const other: MapLike = {
      ...base,
      generatedAt: "2026-07-16T12:34:56Z",
      cacheKey: "zzz",
    };
    expect(mapProjectionsEqual(base, other)).toBe(true);
  });

  it("is EQUAL regardless of dimension ordering", () => {
    const reordered: MapLike = {
      dimensions: [base.dimensions![1], base.dimensions![0]],
    };
    expect(mapProjectionsEqual(base, reordered)).toBe(true);
  });

  it("is NOT EQUAL when an axis value moves", () => {
    const moved: MapLike = {
      dimensions: [{ ...base.dimensions![0], value: 0.9 }, base.dimensions![1]],
    };
    expect(mapProjectionsEqual(base, moved)).toBe(false);
  });

  it("is NOT EQUAL when provenance (modelId / n) changes", () => {
    const provenance: MapLike = {
      dimensions: [
        { ...base.dimensions![0], evidence: { modelId: "H1", n: 21 } },
        base.dimensions![1],
      ],
    };
    expect(mapProjectionsEqual(base, provenance)).toBe(false);
  });

  it("is NOT EQUAL when measured flips", () => {
    const measured: MapLike = {
      dimensions: [
        { ...base.dimensions![0], measured: false },
        base.dimensions![1],
      ],
    };
    expect(mapProjectionsEqual(base, measured)).toBe(false);
  });
});
