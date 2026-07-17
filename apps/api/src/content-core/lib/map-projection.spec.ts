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
      confidence: 0.8,
      hasSignal: true,
      status: "measured",
      evidence: { modelId: "OU-GT", n: 21 },
    },
    {
      key: "claridad",
      value: 0.6,
      measured: true,
      confidence: 0.5,
      hasSignal: true,
      status: "measured",
      evidence: { modelId: "CHK-S1", n: 5 },
    },
  ],
};

describe("content-core · map-projection (semantic firewall comparison)", () => {
  it("projects value + measured + confidence + hasSignal + status + provenance", () => {
    const p = projectMap(base);
    expect(p.map((a) => a.key)).toEqual(["calma", "claridad"]);
    expect(p[0]).toEqual({
      key: "calma",
      value: 0.72,
      measured: true,
      confidence: 0.8,
      hasSignal: true,
      status: "measured",
      modelId: "OU-GT",
      n: 21,
    });
  });

  it("applies null/false defaults for missing fields", () => {
    const bare: MapLike = { dimensions: [{ key: "x", value: null }] };
    expect(projectMap(bare)[0]).toEqual({
      key: "x",
      value: null,
      measured: false,
      confidence: null,
      hasSignal: false,
      status: null,
      modelId: null,
      n: null,
    });
  });

  it("is EQUAL when only incidental fields differ (timestamp, cache key)", () => {
    expect(
      mapProjectionsEqual(base, {
        ...base,
        generatedAt: "later",
        cacheKey: "zzz",
      }),
    ).toBe(true);
  });

  it("is EQUAL regardless of dimension ordering", () => {
    expect(
      mapProjectionsEqual(base, {
        dimensions: [base.dimensions![1], base.dimensions![0]],
      }),
    ).toBe(true);
  });

  it("is NOT EQUAL when an axis value moves", () => {
    expect(
      mapProjectionsEqual(base, {
        dimensions: [
          { ...base.dimensions![0], value: 0.9 },
          base.dimensions![1],
        ],
      }),
    ).toBe(false);
  });

  it("is NOT EQUAL when confidence changes", () => {
    expect(
      mapProjectionsEqual(base, {
        dimensions: [
          { ...base.dimensions![0], confidence: 0.1 },
          base.dimensions![1],
        ],
      }),
    ).toBe(false);
  });

  it("is NOT EQUAL when hasSignal changes", () => {
    expect(
      mapProjectionsEqual(base, {
        dimensions: [
          { ...base.dimensions![0], hasSignal: false },
          base.dimensions![1],
        ],
      }),
    ).toBe(false);
  });

  it("is NOT EQUAL when status changes", () => {
    expect(
      mapProjectionsEqual(base, {
        dimensions: [
          { ...base.dimensions![0], status: "gathering" },
          base.dimensions![1],
        ],
      }),
    ).toBe(false);
  });

  it("is NOT EQUAL when provenance (modelId / n) changes", () => {
    expect(
      mapProjectionsEqual(base, {
        dimensions: [
          { ...base.dimensions![0], evidence: { modelId: "H1", n: 21 } },
          base.dimensions![1],
        ],
      }),
    ).toBe(false);
  });
});
