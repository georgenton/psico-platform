import { describe, expect, it } from "vitest";
import { buildCoreManifest } from "./content-manifest";

/**
 * CC-6A.1 — the manifest integrity checks are exercised here on hand-crafted
 * corrupt inputs, because the DB constraints/triggers make most of them
 * unreachable through normal inserts. `buildCoreManifest` must fail closed on any
 * inconsistency rather than emit a partial/duplicated manifest.
 */

type Rev = Parameters<typeof buildCoreManifest>[3];

function unit(over: Partial<Rev["units"][number]> = {}): Rev["units"][number] {
  return {
    unitId: "u1",
    order: 1,
    partNumber: null,
    partTitle: null,
    unit: { unitKey: "k1", editionId: "ed1" },
    unitVersion: { id: "v1", unitId: "u1", title: "T", summary: null },
    ...over,
  };
}
const published = (units: Rev["units"]): Rev => ({
  number: 1,
  status: "PUBLISHED",
  units,
});
const throws = /CONTENT_CORE_INTEGRITY_ERROR/;

describe("Content Core · CC-6A.1 buildCoreManifest (fail-closed)", () => {
  it("builds a valid, order-sorted manifest", () => {
    const m = buildCoreManifest(
      "book",
      "book-1e",
      "ed1",
      published([
        unit({
          unitId: "u2",
          order: 2,
          unit: { unitKey: "k2", editionId: "ed1" },
          unitVersion: { id: "v2", unitId: "u2", title: "T2", summary: null },
        }),
        unit(),
      ]),
    );
    expect(m.source).toBe("content-core");
    expect(m.editionKey).toBe("book-1e");
    expect(m.revisionNumber).toBe(1);
    expect(m.units.map((u) => u.order)).toEqual([1, 2]);
  });

  it("rejects a non-PUBLISHED revision", () => {
    expect(() =>
      buildCoreManifest("b", "b-1e", "ed1", {
        number: 2,
        status: "DRAFT",
        units: [unit()],
      }),
    ).toThrow(throws);
  });

  it("rejects a unit/version mismatch", () => {
    expect(() =>
      buildCoreManifest(
        "b",
        "b-1e",
        "ed1",
        published([
          unit({
            unitVersion: {
              id: "v1",
              unitId: "OTHER",
              title: "T",
              summary: null,
            },
          }),
        ]),
      ),
    ).toThrow(throws);
  });

  it("rejects a unit from a different edition", () => {
    expect(() =>
      buildCoreManifest(
        "b",
        "b-1e",
        "ed1",
        published([unit({ unit: { unitKey: "k1", editionId: "OTHER" } })]),
      ),
    ).toThrow(throws);
  });

  it("rejects a missing version", () => {
    expect(() =>
      buildCoreManifest(
        "b",
        "b-1e",
        "ed1",
        published([unit({ unitVersion: null })]),
      ),
    ).toThrow(throws);
  });

  it("rejects a duplicate order", () => {
    expect(() =>
      buildCoreManifest(
        "b",
        "b-1e",
        "ed1",
        published([
          unit(),
          unit({
            unitId: "u2",
            order: 1, // duplicate
            unit: { unitKey: "k2", editionId: "ed1" },
            unitVersion: { id: "v2", unitId: "u2", title: "T", summary: null },
          }),
        ]),
      ),
    ).toThrow(throws);
  });

  it("rejects a duplicate unitKey", () => {
    expect(() =>
      buildCoreManifest(
        "b",
        "b-1e",
        "ed1",
        published([
          unit(),
          unit({
            unitId: "u2",
            order: 2,
            unit: { unitKey: "k1", editionId: "ed1" }, // duplicate key
            unitVersion: { id: "v2", unitId: "u2", title: "T", summary: null },
          }),
        ]),
      ),
    ).toThrow(throws);
  });
});
