import type { Prisma } from "@prisma/client";

/**
 * C.3A (#639) — what shape the binding schema is in, decided from `pg_catalog`
 * and from nothing else.
 *
 * ── Why this is not a name check ────────────────────────────────────────────
 *
 * The first version of this asked three questions: does the table exist, is
 * there a foreign key with three columns, is there a constraint with the final
 * CHECK's name. Every one of those can be true of a schema that guarantees
 * nothing:
 *
 *   - a three-column foreign key can point at the WRONG three columns, or the
 *     right three in the wrong order — `(unit, guide, experience)` referencing
 *     an index built the same way is a valid constraint that permits exactly
 *     the collision the real one forbids;
 *   - a unique index can be PARTIAL, so it enforces uniqueness for some rows
 *     and not for the ones that matter, or carry INCLUDE columns so its key is
 *     narrower than its column list suggests;
 *   - a constraint can be `NOT VALID`, which means present and proving nothing
 *     about the rows already there;
 *   - a CHECK can be named `..._binding_shape_check` and say `true`.
 *
 * A detector satisfied by any of those would report STRUCTURAL over a schema
 * that had quietly stopped enforcing the rule — and the whole point of moving
 * the bijection into the database was to stop trusting descriptions of it.
 *
 * So every predicate below is read from the catalog by STRUCTURE: exact column
 * lists in exact order on both sides of every foreign key, match type, both
 * referential actions, validation state, and index soundness. Anything that
 * does not match exactly is not "close enough" — it is `FAIL_CLOSED`.
 *
 * ── Measured, not assumed ───────────────────────────────────────────────────
 *
 * The catalog codes (`confmatchtype='s'`, `confupdtype='c'`, `confdeltype='r'`)
 * and the canonical rendering of the CHECK were read off PostgreSQL 18.4, the
 * version these suites and production run. If a future PostgreSQL rendered the
 * expression differently this detector would report `FAIL_CLOSED` rather than
 * `STRUCTURAL` — refusing to write, which is the safe direction for a mistake
 * to fall in.
 */

/** The shape, in one place, so tests and migrations cannot drift from it. */
export const EXPERIENCE_BINDING_SHAPE = {
  versionTable: "ChapterExperienceVersion",
  reservationTable: "ExperienceGuideReservation",
  unitTable: "ContentUnit",
  /** One guide per experience. */
  reservationPk: ["contentUnitId", "experienceKey"],
  /** One experience per guide. */
  guideUnique: ["contentUnitId", "guideKey"],
  /** The composite foreign key's target, and nothing else. */
  tripleUnique: ["contentUnitId", "experienceKey", "guideKey"],
  finalCheckName: "ChapterExperienceVersion_binding_shape_check",
  /**
   * `pg_get_constraintdef` with runs of whitespace collapsed, as PostgreSQL
   * 18.4 renders the constraint C.3C creates. Compared as structure, not as a
   * name: a differently-named constraint carrying this exact expression proves
   * the same thing, and a correctly-named one carrying anything else proves
   * nothing.
   */
  finalCheckDefinition:
    `CHECK ((((status = 'ARCHIVED'::"ExperienceVersionStatus") AND ("contentUnitId" IS NOT NULL) AND ("guideKey" IS NULL)) ` +
    `OR ((status <> 'ARCHIVED'::"ExperienceVersionStatus") AND ("contentUnitId" IS NOT NULL) AND ("guideKey" IS NOT NULL))))`,
} as const;

export type ReservationAuthority =
  | "LEGACY_SCAN"
  | "BRIDGE"
  | "STRUCTURAL"
  | "FAIL_CLOSED";

/** Every predicate the decision is made of, so a test can name which one failed. */
export interface BindingSchemaProbe {
  versionTable: boolean;
  reservationTable: boolean;
  unitTable: boolean;
  /** The two promoted columns exist at all. */
  bindingColumns: boolean;
  /** `contentUnitId` is NOT NULL — the cutover's half of the final shape. */
  identityNotNull: boolean;
  reservationPk: boolean;
  guideUnique: boolean;
  tripleUnique: boolean;
  versionUnitFk: boolean;
  reservationUnitFk: boolean;
  compositeFk: boolean;
  /** A CHECK carrying the canonical name exists — whatever it says. */
  finalCheckNamePresent: boolean;
  /** The canonically-named CHECK is validated and says exactly the right thing. */
  finalCheckNameIsExact: boolean;
  /** SOME validated CHECK says exactly the right thing. */
  finalCheckExactPresent: boolean;
}

/**
 * One round trip, inside the caller's transaction.
 *
 * Nothing is memoised. A cached answer would outlive the migration that changed
 * it, and the one moment this has to be right is exactly the moment it changes.
 */
export async function probeBindingSchema(
  tx: Prisma.TransactionClient,
): Promise<BindingSchemaProbe> {
  const rows = await tx.$queryRaw<BindingSchemaProbe[]>`
WITH rel AS (
  SELECT to_regclass('public."ChapterExperienceVersion"')  AS ver,
         to_regclass('public."ExperienceGuideReservation"') AS res,
         to_regclass('public."ContentUnit"')                AS unit
),
-- An index is SOUND when it enforces what its column list appears to promise:
-- unique, live, and neither partial (indpred), nor over expressions
-- (indexprs), nor carrying INCLUDE columns (indnatts > indnkeyatts).
ix AS (
  SELECT i.indrelid AS rel,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS cols,
         (i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
          AND i.indpred IS NULL AND i.indexprs IS NULL
          AND i.indnatts = i.indnkeyatts) AS sound
    FROM pg_index i
),
-- conkey and confkey are PARALLEL arrays: position n of one pairs with
-- position n of the other. Comparing them as ordered lists is what catches a
-- foreign key over the right columns in the wrong order.
co AS (
  SELECT c.conrelid AS rel, c.confrelid AS frel, c.contype, c.conname::text AS name,
         c.convalidated, c.confmatchtype, c.confupdtype, c.confdeltype,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS fcols,
         btrim(regexp_replace(pg_get_constraintdef(c.oid), '\\s+', ' ', 'g')) AS def
    FROM pg_constraint c
),
att AS (
  SELECT a.attrelid AS rel, a.attname::text AS name, a.attnotnull
    FROM pg_attribute a WHERE a.attnum > 0 AND NOT a.attisdropped
)
SELECT
  (rel.ver IS NOT NULL)  AS "versionTable",
  (rel.res IS NOT NULL)  AS "reservationTable",
  (rel.unit IS NOT NULL) AS "unitTable",
  (EXISTS (SELECT 1 FROM att WHERE rel = rel.ver AND name = 'contentUnitId')
   AND EXISTS (SELECT 1 FROM att WHERE rel = rel.ver AND name = 'guideKey')) AS "bindingColumns",
  COALESCE((SELECT attnotnull FROM att WHERE rel = rel.ver AND name = 'contentUnitId'), false)
    AS "identityNotNull",
  EXISTS (SELECT 1 FROM co WHERE rel = rel.res AND contype = 'p' AND convalidated
            AND cols = ARRAY['contentUnitId','experienceKey']
            AND EXISTS (SELECT 1 FROM ix WHERE ix.rel = rel.res AND ix.sound
                          AND ix.cols = ARRAY['contentUnitId','experienceKey']))
    AS "reservationPk",
  EXISTS (SELECT 1 FROM ix WHERE rel = rel.res AND sound
            AND cols = ARRAY['contentUnitId','guideKey']) AS "guideUnique",
  EXISTS (SELECT 1 FROM ix WHERE rel = rel.res AND sound
            AND cols = ARRAY['contentUnitId','experienceKey','guideKey']) AS "tripleUnique",
  EXISTS (SELECT 1 FROM co WHERE rel = rel.ver AND contype = 'f' AND frel = rel.unit
            AND cols = ARRAY['contentUnitId'] AND fcols = ARRAY['id']
            AND confmatchtype = 's' AND confdeltype = 'r' AND confupdtype = 'c'
            AND convalidated) AS "versionUnitFk",
  EXISTS (SELECT 1 FROM co WHERE rel = rel.res AND contype = 'f' AND frel = rel.unit
            AND cols = ARRAY['contentUnitId'] AND fcols = ARRAY['id']
            AND confmatchtype = 's' AND confdeltype = 'r' AND confupdtype = 'c'
            AND convalidated) AS "reservationUnitFk",
  EXISTS (SELECT 1 FROM co WHERE rel = rel.ver AND contype = 'f' AND frel = rel.res
            AND cols  = ARRAY['contentUnitId','experienceKey','guideKey']
            AND fcols = ARRAY['contentUnitId','experienceKey','guideKey']
            AND confmatchtype = 's' AND confdeltype = 'r' AND confupdtype = 'c'
            AND convalidated) AS "compositeFk",
  EXISTS (SELECT 1 FROM co WHERE rel = rel.ver AND contype = 'c'
            AND name = ${EXPERIENCE_BINDING_SHAPE.finalCheckName})
    AS "finalCheckNamePresent",
  EXISTS (SELECT 1 FROM co WHERE rel = rel.ver AND contype = 'c' AND convalidated
            AND name = ${EXPERIENCE_BINDING_SHAPE.finalCheckName}
            AND def = ${EXPERIENCE_BINDING_SHAPE.finalCheckDefinition})
    AS "finalCheckNameIsExact",
  EXISTS (SELECT 1 FROM co WHERE rel = rel.ver AND contype = 'c' AND convalidated
            AND def = ${EXPERIENCE_BINDING_SHAPE.finalCheckDefinition})
    AS "finalCheckExactPresent"
FROM rel`;

  const probe = rows[0];
  if (!probe) {
    // A one-row query returning nothing is not a schema state. Refuse.
    return {
      versionTable: false,
      reservationTable: false,
      unitTable: false,
      bindingColumns: false,
      identityNotNull: false,
      reservationPk: false,
      guideUnique: false,
      tripleUnique: false,
      versionUnitFk: false,
      reservationUnitFk: false,
      compositeFk: false,
      finalCheckNamePresent: true, // forces FAIL_CLOSED below
      finalCheckNameIsExact: false,
      finalCheckExactPresent: false,
    };
  }
  return probe;
}

/**
 * Probe → authority.
 *
 * Pure, so the whole decision table can be exercised without a database and the
 * database tests can concentrate on whether the PROBE reads the catalog right.
 *
 *   LEGACY_SCAN  nothing from C.3A is here, and no fragment of it either.
 *   BRIDGE       the C.3A shape, complete, without the cutover CHECK.
 *   STRUCTURAL   the C.3C shape, complete: CHECK validated AND identity NOT NULL.
 *   FAIL_CLOSED  everything else, including every partial rollout.
 */
export function decideReservationAuthority(
  probe: BindingSchemaProbe,
): ReservationAuthority {
  // The application's own table missing is not a rollout state.
  if (!probe.versionTable || !probe.unitTable) return "FAIL_CLOSED";

  if (!probe.reservationTable) {
    // No table. LEGACY_SCAN only if NOTHING else from C.3A/C.3C landed:
    // columns, the direct foreign key or a CHECK by that name without the
    // table they belong to is a half-applied migration, not a legacy schema.
    const residue =
      probe.bindingColumns ||
      probe.versionUnitFk ||
      probe.finalCheckNamePresent ||
      probe.finalCheckExactPresent;
    return residue ? "FAIL_CLOSED" : "LEGACY_SCAN";
  }

  // With the table present, the ENTIRE bridge shape is required. Each of these
  // carries a rule on its own: without the primary key a lineage could hold two
  // guides, without the unique two lineages could hold one guide, without the
  // composite key a row could name a reservation that does not exist, and
  // without either foreign key to `ContentUnit` a chapter could be deleted from
  // under a row that names it.
  const bridge =
    probe.bindingColumns &&
    probe.reservationPk &&
    probe.guideUnique &&
    probe.tripleUnique &&
    probe.versionUnitFk &&
    probe.reservationUnitFk &&
    probe.compositeFk;
  if (!bridge) return "FAIL_CLOSED";

  // A constraint wearing the cutover's name has to BE the cutover's constraint.
  if (probe.finalCheckNamePresent && !probe.finalCheckNameIsExact) {
    return "FAIL_CLOSED";
  }
  if (!probe.finalCheckExactPresent) return "BRIDGE";

  // The CHECK and the NOT NULL are one migration and land together. A schema
  // carrying one without the other is a cutover that stopped halfway, and this
  // binary will not write into it.
  return probe.identityNotNull ? "STRUCTURAL" : "FAIL_CLOSED";
}
