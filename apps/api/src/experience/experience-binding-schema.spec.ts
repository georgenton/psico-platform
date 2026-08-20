import { describe, expect, it } from "vitest";

import {
  decideReservationAuthority,
  EXPERIENCE_BINDING_SHAPE,
  type BindingSchemaProbe,
} from "./experience-binding-schema";

/**
 * C.3A (#639) — the decision table, exhaustively.
 *
 * The probe is the half only a real PostgreSQL can check, and
 * `experience-binding-bridge.pg-spec.ts` checks it there. This file is the
 * other half: given what the catalog said, what does this binary do? Every
 * branch matters, and most of them describe a schema a migration can only
 * reach by going WRONG — a half-applied cutover, a constraint added `NOT
 * VALID`, a unique index someone rebuilt as partial. Those are exactly the
 * states no database fixture will produce for us on purpose, and exactly the
 * ones where "close enough" would be a data-loss bug.
 */

/** The C.3A shape, complete. */
const BRIDGE: BindingSchemaProbe = {
  versionTable: true,
  reservationTable: true,
  unitTable: true,
  bindingColumns: true,
  columnTypes: true,
  reservationNotNull: true,
  noDroppedBindingColumns: true,
  indexMethod: true,
  identityNotNull: false,
  reservationPk: true,
  guideUnique: true,
  tripleUnique: true,
  versionUnitFk: true,
  reservationUnitFk: true,
  compositeFk: true,
  finalCheckNamePresent: false,
  finalCheckNameIsExact: false,
  finalCheckExactPresent: false,
};

/** The C.3C shape, complete. */
const STRUCTURAL: BindingSchemaProbe = {
  ...BRIDGE,
  identityNotNull: true,
  finalCheckNamePresent: true,
  finalCheckNameIsExact: true,
  finalCheckExactPresent: true,
};

/** A schema that predates C.3A entirely. */
const LEGACY: BindingSchemaProbe = {
  versionTable: true,
  reservationTable: false,
  unitTable: true,
  bindingColumns: false,
  columnTypes: false,
  reservationNotNull: false,
  noDroppedBindingColumns: true,
  indexMethod: false,
  identityNotNull: false,
  reservationPk: false,
  guideUnique: false,
  tripleUnique: false,
  versionUnitFk: false,
  reservationUnitFk: false,
  compositeFk: false,
  finalCheckNamePresent: false,
  finalCheckNameIsExact: false,
  finalCheckExactPresent: false,
};

describe("decideReservationAuthority — the three good shapes", () => {
  it("reads a pre-C.3A schema as LEGACY_SCAN", () => {
    expect(decideReservationAuthority(LEGACY)).toBe("LEGACY_SCAN");
  });

  it("reads the complete C.3A shape as BRIDGE", () => {
    expect(decideReservationAuthority(BRIDGE)).toBe("BRIDGE");
  });

  it("reads the complete C.3C shape as STRUCTURAL", () => {
    expect(decideReservationAuthority(STRUCTURAL)).toBe("STRUCTURAL");
  });
});

describe("decideReservationAuthority — every missing piece fails closed", () => {
  // Each of these carries a rule ON ITS OWN. Dropping any one of them leaves a
  // schema that still looks assembled and no longer enforces the bijection, so
  // none of them may be treated as decoration.
  const required = [
    ["reservationPk", "a lineage could hold two guides"],
    ["guideUnique", "two lineages could hold one guide"],
    ["tripleUnique", "the composite key would have no target"],
    ["versionUnitFk", "an archived row's chapter could be deleted"],
    ["reservationUnitFk", "a reservation's chapter could be deleted"],
    ["compositeFk", "a row could name a reservation that does not exist"],
    ["bindingColumns", "there would be nothing to constrain"],
    ["columnTypes", "a key could compare columns of different types"],
    [
      "reservationNotNull",
      "a nullable guideKey would leave the bijection a hole the indexes hide",
    ],
    ["noDroppedBindingColumns", "the table has been rebuilt underneath us"],
    ["indexMethod", "a non-btree unique index is not the contract"],
  ] as const;

  for (const [key, why] of required) {
    it(`without ${key}, ${why}`, () => {
      expect(decideReservationAuthority({ ...BRIDGE, [key]: false })).toBe(
        "FAIL_CLOSED",
      );
      expect(decideReservationAuthority({ ...STRUCTURAL, [key]: false })).toBe(
        "FAIL_CLOSED",
      );
    });
  }

  it("refuses when the application's own tables are missing", () => {
    expect(decideReservationAuthority({ ...BRIDGE, versionTable: false })).toBe(
      "FAIL_CLOSED",
    );
    expect(decideReservationAuthority({ ...BRIDGE, unitTable: false })).toBe(
      "FAIL_CLOSED",
    );
  });
});

describe("decideReservationAuthority — the cutover CHECK", () => {
  it("a constraint wearing the cutover's NAME must be the cutover's constraint", () => {
    // The negative control this exists for: `CHECK (true)` named
    // `ChapterExperienceVersion_binding_shape_check`. Present, harmless-looking,
    // and it guarantees nothing.
    expect(
      decideReservationAuthority({
        ...BRIDGE,
        finalCheckNamePresent: true,
        finalCheckNameIsExact: false,
      }),
    ).toBe("FAIL_CLOSED");
  });

  it("an unvalidated CHECK is not the cutover", () => {
    // `NOT VALID` is present and proves nothing about the rows already stored,
    // which is the whole reason the backfill has to run BEFORE the constraint.
    // The probe only reports `finalCheck*Exact` for validated constraints, so
    // an unvalidated one arrives here as name-without-exactness.
    expect(
      decideReservationAuthority({
        ...STRUCTURAL,
        finalCheckNameIsExact: false,
        finalCheckExactPresent: false,
      }),
    ).toBe("FAIL_CLOSED");
  });

  it("the CHECK without the NOT NULL is a cutover that stopped halfway", () => {
    // The two land in one migration. A schema carrying one without the other
    // is not a shape anyone designed.
    expect(
      decideReservationAuthority({ ...STRUCTURAL, identityNotNull: false }),
    ).toBe("FAIL_CLOSED");
  });

  it("the NOT NULL without the CHECK is not STRUCTURAL either", () => {
    expect(
      decideReservationAuthority({ ...BRIDGE, identityNotNull: true }),
    ).toBe("BRIDGE");
  });

  it("the guarantee counts, not the label", () => {
    // A validated constraint with the exact expression under a different name
    // enforces exactly the same thing. Structure is the authority.
    expect(
      decideReservationAuthority({
        ...STRUCTURAL,
        finalCheckNamePresent: false,
        finalCheckNameIsExact: false,
      }),
    ).toBe("STRUCTURAL");
  });
});

describe("decideReservationAuthority — a missing table is not automatically legacy", () => {
  const residues = [
    "bindingColumns",
    "versionUnitFk",
    "finalCheckNamePresent",
    "finalCheckExactPresent",
  ] as const;

  for (const key of residues) {
    it(`${key} without the reservation table is a half-applied migration`, () => {
      expect(decideReservationAuthority({ ...LEGACY, [key]: true })).toBe(
        "FAIL_CLOSED",
      );
    });
  }
});

describe("the shape constants", () => {
  it("pins the canonical CHECK expression", () => {
    // Measured on PostgreSQL 18.4 from the constraint C.3C creates, not
    // hand-written. The bridge pg-spec asserts a real database renders it this
    // way; if a future PostgreSQL renders it differently, the detector reports
    // FAIL_CLOSED and refuses to write — the safe direction.
    expect(EXPERIENCE_BINDING_SHAPE.finalCheckDefinition).toContain(
      `'ARCHIVED'::"ExperienceVersionStatus"`,
    );
    expect(EXPERIENCE_BINDING_SHAPE.finalCheckDefinition).toContain(
      `("guideKey" IS NULL)`,
    );
    expect(EXPERIENCE_BINDING_SHAPE.finalCheckDefinition).not.toMatch(/\s{2,}/);
  });

  it("pins both halves of the bijection as distinct constraints", () => {
    expect(EXPERIENCE_BINDING_SHAPE.reservationPk).toEqual([
      "contentUnitId",
      "experienceKey",
    ]);
    expect(EXPERIENCE_BINDING_SHAPE.guideUnique).toEqual([
      "contentUnitId",
      "guideKey",
    ]);
    // The triple is the foreign key's target and NOT a third rule.
    expect(EXPERIENCE_BINDING_SHAPE.tripleUnique).toEqual([
      "contentUnitId",
      "experienceKey",
      "guideKey",
    ]);
  });
});
