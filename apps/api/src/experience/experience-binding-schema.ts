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
 * ── What is deliberately NOT a predicate ────────────────────────────────────
 *
 * An earlier version refused any schema where EITHER table carried a dropped
 * column, on the reasoning that a tombstone means the table was rebuilt. That
 * was a false positive, and a dangerous one: `ALTER TABLE … DROP COLUMN` leaves
 * an `attisdropped` tombstone forever, so ONE unrelated column — a `scratch`
 * added and removed by a migration years before this contract existed — would
 * have made this detector report `FAIL_CLOSED` over a perfectly correct schema,
 * with the CMS refusing every write and no predicate naming the reason.
 *
 * It also proved nothing it was meant to prove. Every predicate here resolves
 * columns through `pg_attribute` BY NAME and excludes dropped ones, and a
 * dropped column's name is mangled to `........pg.dropped.N........`, so a
 * tombstone cannot masquerade as a governed column. And a governed column that
 * really had been dropped and re-added would take its constraints and indexes
 * with it on the way out: the type, the nullability, the primary key, both
 * uniques, all three foreign keys and the CHECK are re-verified structurally
 * below, so the recreation is caught by what it changed rather than by a
 * fossil that records only that something once happened.
 *
 * The rule this leaves is narrower and truer: decide from the governed
 * structure, and from nothing else. Altering any governed column, index or
 * constraint still fails closed.
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
  /**
   * All SIX governed columns are `text` — `contentUnitId`, `experienceKey` and
   * `guideKey`, on BOTH tables — so a foreign key built on them compares what
   * it appears to.
   *
   * Six, not five. An earlier version counted five and omitted
   * `ExperienceGuideReservation.experienceKey`, which is half of the primary
   * key and one of the three columns the composite foreign key resolves
   * against: the one column of the six whose type a fingerprint had no excuse
   * to leave unpinned.
   */
  columnTypes: boolean;
  /**
   * All three reservation columns are NOT NULL.
   *
   * The one that matters most is `guideKey`. Nullable, the row would mean "this
   * lineage reserves nothing", the unique index would allow one such row per
   * chapter, and the composite key would stop being evaluated for it — the
   * bijection would have a hole the names and the indexes would still hide.
   */
  reservationNotNull: boolean;
  /** Every unique index in the contract is a btree. */
  indexMethod: boolean;
  /**
   * `ChapterExperienceVersion.contentUnitId` is NOT NULL.
   *
   * Phase-dependent, and in BOTH directions. Under BRIDGE it must be nullable —
   * legacy rows have no identity yet, and a premature `SET NOT NULL` is half of
   * C.3C applied without its CHECK. Under STRUCTURAL it must be NOT NULL.
   */
  identityNotNull: boolean;
  /**
   * `ChapterExperienceVersion.guideKey` is NULLABLE, in both phases.
   *
   * Not an oversight to be tightened later: archiving RELEASES the guide by
   * setting this column to null, which is what stops the row holding its
   * reservation. A `SET NOT NULL` here would make ARCHIVED unreachable — and
   * would do it silently, at the first archive an editor attempted.
   */
  versionGuideNullable: boolean;
  /**
   * `ChapterExperienceVersion.experienceKey` is NOT NULL, in both phases.
   *
   * It is the lineage. Nullable, a row could exist belonging to no experience
   * while still naming a unit and a guide, and the composite foreign key —
   * `MATCH SIMPLE` — would stop being evaluated for exactly that row.
   */
  versionExperienceKeyNotNull: boolean;
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
  SELECT a.attrelid AS rel, a.attname::text AS name, a.attnotnull,
         format_type(a.atttypid, a.atttypmod) AS typ
    FROM pg_attribute a WHERE a.attnum > 0 AND NOT a.attisdropped
)
SELECT
  (rel.ver IS NOT NULL)  AS "versionTable",
  (rel.res IS NOT NULL)  AS "reservationTable",
  (rel.unit IS NOT NULL) AS "unitTable",
  (EXISTS (SELECT 1 FROM att WHERE rel = rel.ver AND name = 'contentUnitId')
   AND EXISTS (SELECT 1 FROM att WHERE rel = rel.ver AND name = 'guideKey')) AS "bindingColumns",
  -- Exact types, on both tables, all SIX of them. A foreign key over columns of
  -- different types would need a cast PostgreSQL will not silently supply, but
  -- a widened or narrowed type on ONE side is a schema nobody designed either
  -- way.
  (SELECT count(*) = 6 FROM att
    WHERE rel IN (rel.ver, rel.res)
      AND name IN ('contentUnitId','experienceKey','guideKey')
      AND typ = 'text') AS "columnTypes",
  (SELECT count(*) = 3 FROM att
    WHERE rel = rel.res
      AND name IN ('contentUnitId','experienceKey','guideKey')
      AND attnotnull) AS "reservationNotNull",
  (SELECT bool_and(am.amname = 'btree') FROM pg_index i
     JOIN pg_class ic ON ic.oid = i.indexrelid
     JOIN pg_am am ON am.oid = ic.relam
    WHERE i.indrelid = rel.res AND i.indisunique) AS "indexMethod",
  COALESCE((SELECT attnotnull FROM att WHERE rel = rel.ver AND name = 'contentUnitId'), false)
    AS "identityNotNull",
  COALESCE((SELECT NOT attnotnull FROM att WHERE rel = rel.ver AND name = 'guideKey'), false)
    AS "versionGuideNullable",
  COALESCE((SELECT attnotnull FROM att WHERE rel = rel.ver AND name = 'experienceKey'), false)
    AS "versionExperienceKeyNotNull",
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
      columnTypes: false,
      reservationNotNull: false,
      indexMethod: false,
      identityNotNull: false,
      versionGuideNullable: false,
      versionExperienceKeyNotNull: false,
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
    probe.columnTypes &&
    probe.reservationNotNull &&
    probe.indexMethod &&
    probe.reservationPk &&
    probe.guideUnique &&
    probe.tripleUnique &&
    probe.versionUnitFk &&
    probe.reservationUnitFk &&
    probe.compositeFk;
  if (!bridge) return "FAIL_CLOSED";

  // Nullability that does NOT move between phases. `guideKey` nullable is what
  // makes archiving expressible; `experienceKey` NOT NULL is what stops a row
  // belonging to no lineage while still naming a unit and a guide.
  if (!probe.versionGuideNullable || !probe.versionExperienceKeyNotNull) {
    return "FAIL_CLOSED";
  }

  // A constraint wearing the cutover's name has to BE the cutover's constraint.
  if (probe.finalCheckNamePresent && !probe.finalCheckNameIsExact) {
    return "FAIL_CLOSED";
  }

  // Nullability that DOES move between phases, pinned in both directions.
  //
  // Without the CHECK, `contentUnitId` must still be nullable: the cutover's
  // two halves land in ONE migration, so a schema carrying the `SET NOT NULL`
  // and not the CHECK is that migration stopped in the middle — the same
  // half-applied state read from the other side. Reporting BRIDGE there would
  // hand a writer a schema whose rules nobody had finished installing.
  if (!probe.finalCheckExactPresent) {
    return probe.identityNotNull ? "FAIL_CLOSED" : "BRIDGE";
  }

  // And with the CHECK, the NOT NULL has to be there too.
  return probe.identityNotNull ? "STRUCTURAL" : "FAIL_CLOSED";
}
