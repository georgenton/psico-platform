import { describe, expect, it } from "vitest";
import {
  circleAllowedSizes,
  circleSizeIsAllowed,
  productionCircleTemplateRegistry,
} from "@psico/types";

/**
 * How many people an activity may be for — asked of the REAL catalogue.
 *
 * The API and the Web both decide size by calling these two functions on the
 * resolved template, so this is the rule itself and not a restatement of it.
 * A suite total does not prove any of this: the whole point of the range is
 * that a single predicate refuses three on a Dúo and seven on a group, and the
 * only way to show that is to ask it about both.
 */

const duo = productionCircleTemplateRegistry.getExact("duo-lo-que-me-ayuda", 2);
const duoArchived = productionCircleTemplateRegistry.getExact(
  "duo-lo-que-me-ayuda",
  1,
);
const group = productionCircleTemplateRegistry.getExact(
  "grupo-lo-que-nos-ayuda",
  1,
);

describe("circles · the Dúo is still exactly two", () => {
  it("offers one size and no choice", () => {
    expect(circleAllowedSizes(duo)).toEqual([2]);
    expect(duo.participants).toEqual({ min: 2, max: 2, required: 2 });
  });

  it("refuses three, which is the size groups made possible", () => {
    // The regression this guards: groups exist now, so "3" is a number the
    // engine understands. It must still be refused HERE, on a Dúo template.
    expect(circleSizeIsAllowed(duo, 3)).toBe(false);
    expect(circleSizeIsAllowed(duo, 4)).toBe(false);
    expect(circleSizeIsAllowed(duo, 6)).toBe(false);
  });

  it("refuses one, zero and negatives", () => {
    for (const size of [-1, 0, 1]) {
      expect(circleSizeIsAllowed(duo, size)).toBe(false);
    }
  });

  it("applies the same rule to the archived predecessor", () => {
    // @1 is ARCHIVED, not deleted: an activity created on it is still running.
    // Its shape must not have drifted when @2 was published.
    expect(circleAllowedSizes(duoArchived)).toEqual([2]);
    expect(circleSizeIsAllowed(duoArchived, 3)).toBe(false);
  });
});

describe("circles · a group is three to six, and nothing else", () => {
  it("offers exactly three, four, five and six", () => {
    expect(circleAllowedSizes(group)).toEqual([3, 4, 5, 6]);
  });

  it("refuses two, which would be a Dúo wearing a group template", () => {
    // Two people is a Dúo. Letting a group template produce one would give two
    // people an activity whose editorial copy addresses a room.
    expect(circleSizeIsAllowed(group, 2)).toBe(false);
  });

  it("refuses seven, and every larger number", () => {
    for (const size of [7, 8, 12, 100]) {
      expect(circleSizeIsAllowed(group, size)).toBe(false);
    }
  });

  it("admits both ends of the range, not only the default", () => {
    expect(circleSizeIsAllowed(group, 3)).toBe(true);
    expect(circleSizeIsAllowed(group, 6)).toBe(true);
    expect(group.participants.required).toBe(3);
  });

  it("refuses a size that is not a whole number of people", () => {
    // These arrive as JSON. `3.5` and `NaN` are numbers to a type checker, and
    // a range comparison alone would let `3.5` through as "between 3 and 6".
    for (const size of [3.5, 5.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(circleSizeIsAllowed(group, size)).toBe(false);
    }
  });
});

describe("circles · size comes from the template, not from a mode branch", () => {
  it("answers both audiences with the same predicate", () => {
    // Stated as a property rather than two examples: for every template in the
    // catalogue, the allowed sizes are exactly its own range — so no audience
    // has a special case that a later edit could forget to update.
    for (const definition of [duo, duoArchived, group]) {
      const { min, max } = definition.participants;
      for (let size = 0; size <= max + 2; size++) {
        expect(circleSizeIsAllowed(definition, size)).toBe(
          size >= min && size <= max,
        );
      }
    }
  });

  it("keeps every published template inside its audience's shape", () => {
    for (const definition of productionCircleTemplateRegistry.listPublished()) {
      const sizes = circleAllowedSizes(definition);
      expect(sizes.length).toBeGreaterThan(0);
      expect(sizes).toContain(definition.participants.required);
      if (definition.audience === "DUO_ADULT") expect(sizes).toEqual([2]);
      if (definition.audience === "GROUP_ADULT") {
        expect(sizes[0]).toBe(3);
        expect(sizes[sizes.length - 1]).toBeLessThanOrEqual(6);
      }
    }
  });
});
