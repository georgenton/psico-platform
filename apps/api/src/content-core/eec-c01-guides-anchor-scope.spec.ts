import { describe, expect, it } from "vitest";
import { planGuides } from "./eec-c01-guides-cli";
import type { GuideManifest } from "./eec-c01-guides-cli";

/**
 * The anchor counter must look at the PUBLISHED unit version, not at every
 * version the unit has ever had.
 *
 * The bug this pins: `plan` scoped its heading/fingerprint counts by `unitId`
 * alone, so every historical `ContentUnitVersion` contributed rows. A unit
 * re-ingested once — which is every PQP unit after the printed edition
 * replaced the OCR one — reported a sentence twice when that sentence survived
 * the re-ingest unchanged, and a perfectly unambiguous anchor failed the
 * 1/1 gate. The three PQP-C01 anchors whose wording differed between editions
 * still read 1, which is exactly why this stayed invisible until an anchor
 * that did not move met a unit that had.
 */

const PUBLISHED_UNIT_VERSION = "uv-published";
const OLD_UNIT_VERSION = "uv-ocr";

const manifest = {
  editionKey: "parejas-que-perduran-1e",
  unitKey: "unit-key",
  chapterOrder: 2,
  guideKey: "pqp-c1-presencia-sin-acuerdo",
  guideVersion: 1,
  experienceKey: "pqp-c1-presencia-sin-acuerdo",
  experienceVersion: 1,
  conceptKey: "pqp-c1-presencia-sin-acuerdo",
  practiceKey: "pqp-c1-practice-lo-que-se-y-lo-que-supongo",
  recallKey: "pqp-c1-recall-presencia-sin-acuerdo",
  anchors: {
    primary: {
      heading: "El Cerebro Enamorado",
      fingerprint: "una frase que sobrevivió a la reingesta",
      expectedMatchCount: 1 as const,
    },
  },
} as unknown as GuideManifest;

/**
 * A unit with TWO versions. The same sentence sits in both, so a query scoped
 * only by unit counts two and a query scoped by the published version counts
 * one.
 */
function stubDb(seenWhere: Record<string, unknown>[]) {
  return {
    edition: {
      findUnique: async () => ({ id: "ed-1", publishedRevisionId: "rev-10" }),
    },
    revision: { findUnique: async () => ({ number: 10 }) },
    contentUnit: { findFirst: async () => ({ id: "unit-1" }) },
    revisionUnit: {
      findFirst: async () => ({
        unitId: "unit-1",
        unitVersionId: PUBLISHED_UNIT_VERSION,
      }),
    },
    blockVersion: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        seenWhere.push(where);
        const rows = [
          { unitVersionId: PUBLISHED_UNIT_VERSION },
          { unitVersionId: OLD_UNIT_VERSION },
        ];
        return rows.filter((r) => r.unitVersionId === where.unitVersionId)
          .length;
      },
    },
    concept: { findUnique: async () => null },
    exercise: { findUnique: async () => null },
    chapterExperienceVersion: {
      findUnique: async () => null,
      findMany: async () => [],
    },
  } as never;
}

describe("planGuides · anchor counts are scoped to what the reader is served", () => {
  it("counts a surviving sentence once, not once per unit version", async () => {
    const seen: Record<string, unknown>[] = [];
    const plan = await planGuides(stubDb(seen), [manifest], "test", false);

    expect(plan.anchors).toHaveLength(1);
    expect(plan.anchors[0].headingMatches).toBe(1);
    expect(plan.anchors[0].fingerprintMatches).toBe(1);
  });

  it("asks the database for the published version, not the whole unit", async () => {
    const seen: Record<string, unknown>[] = [];
    await planGuides(stubDb(seen), [manifest], "test", false);

    expect(seen).toHaveLength(2);
    for (const where of seen) {
      expect(where.unitVersionId).toBe(PUBLISHED_UNIT_VERSION);
      // The old shape scoped by the block's unit, which is what let historical
      // versions in.
      expect(where.contentBlock).toBeUndefined();
    }
  });
});
