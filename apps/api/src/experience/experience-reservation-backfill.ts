import type { Prisma, PrismaClient } from "@prisma/client";

import {
  acquireBindingLock,
  globalBindingLockKey,
} from "./experience-binding-lock";
import { resolveChapterIdentity } from "./experience-chapter-identity";
import {
  codeOwnedClaimsByUnit,
  productionCodeOwnedCatalog,
  resolveUnitForGuidePin,
  type CodeOwnedCatalog,
} from "./experience-code-owned-identity";
import { validateExperienceDefinition } from "./experience-catalog";
import { readReservationAuthority } from "./experience-binding-reservation";

/**
 * C.3B (#639) — materialising the reservations that already exist implicitly.
 *
 * Every DRAFT or PUBLISHED row written before C.3A holds a guide: its
 * `definitionJson.guidePin` says so, and readers act on it. What it does not
 * have is a reservation row or the promoted columns, so nothing structural
 * knows about the claim. This makes the existing claims explicit WITHOUT
 * changing a single one of them.
 *
 * ── Four different things, kept apart ───────────────────────────────────────
 *
 *   measure       read-only. Counts, groups, conflicts. Writes nothing.
 *   validate      decides whether the whole set can be materialised at all.
 *   materialise   inserts reservation rows and fills two columns. This IS a
 *                 write, and calling it "zero writes" would be a lie — it is
 *                 the write the new model requires.
 *   rewrite       changing an editorial binding. NEVER happens here.
 *
 * The fourth one is the whole discipline. A row that is HALF materialised, or
 * whose columns disagree with its own definition, or whose reservation names a
 * different guide, is not something to repair on the way past. Repairing it
 * would mean this command decided what an editor meant — and it would do so
 * silently, in a transaction nobody is watching, over the one table whose
 * contradictions the new model exists to surface. Every one of those is an
 * anomaly, every anomaly aborts the whole run, and nothing is written.
 *
 * ── Why it is a command and not a Prisma migration ──────────────────────────
 *
 * Because it can legitimately abort. A data migration that fails leaves
 * `_prisma_migrations` with `finished_at` null, and from that point every
 * `migrate deploy` fails — the exact incident of 2026-06-01, recovered only
 * with `migrate resolve`. A step whose correct behaviour includes "stop and ask
 * a human" must not be able to block every future deployment. As a command it
 * aborts, leaves nothing applied, and is re-run once the data is fixed.
 *
 * ── Why the global lock, and why it is not enough ───────────────────────────
 *
 * `--apply` takes `GLOBAL_COMPAT_BINDING_LOCK` BEFORE reading and holds it for
 * the whole transaction. Every C.3A writer takes the same key, so no bridge
 * write can land between the read and the insert. It does nothing about the
 * PREVIOUS binary, which takes no lock at all — which is precisely why this may
 * only run once V0 is proven extinct by its boot marker.
 *
 * The global key is taken FIRST and edition row locks come after, which is the
 * same relative order every binding write uses. That is not a coincidence to
 * preserve casually: reversing it here would let this command and a bridge
 * writer build a wait cycle.
 */

export const BACKFILL_ANOMALY = {
  /** `definitionJson` no longer validates. Its claim cannot be read at all. */
  invalidDefinition: "INVALID_DEFINITION",
  /**
   * The row's EXACT `guidePin` names no chapter.
   *
   * Either the pin is not in the guide registry, or its targets are not
   * ingested, or they disagree about which unit they live in. Whichever it is,
   * the row's stable identity cannot be established — and the position it
   * carries is not a substitute for it.
   */
  guideContextUnresolved: "ROW_GUIDE_CONTEXT_UNRESOLVED",
  /**
   * A materialised row's stored `contentUnitId` is not the one its own guide
   * resolves to. Two descriptions of the same fact disagree; this command does
   * not pick a winner.
   */
  guideContextIdentityMismatch: "ROW_GUIDE_CONTEXT_IDENTITY_MISMATCH",
  /** Two lineages claim one guide inside one chapter. */
  guideOwnedByTwoLineages: "GUIDE_OWNED_BY_TWO_LINEAGES",
  /** One lineage claims two guides inside one chapter. */
  lineageOwnsTwoGuides: "LINEAGE_OWNS_TWO_GUIDES",
  /** One binding column is set and the other is not. */
  halfMaterialised: "ROW_HALF_MATERIALISED",
  /** `guideKey` and `definitionJson.guidePin.guideKey` disagree. */
  columnsDisagreeWithDefinition: "ROW_COLUMNS_DISAGREE_WITH_DEFINITION",
  /** The definition's own key, version, book, chapter or status is not the row's. */
  definitionDisagreesWithRow: "DEFINITION_DISAGREES_WITH_ROW",
  /** `contentUnitId` names a unit belonging to a different edition. */
  identityCrossEdition: "ROW_IDENTITY_CROSS_EDITION",
  /** `contentUnitId` names a unit that does not exist. */
  identityUnknownUnit: "ROW_IDENTITY_UNKNOWN_UNIT",
  /** The row's `bookSlug` matches no edition at all. */
  bookHasNoEdition: "ROW_BOOK_HAS_NO_EDITION",
  /** A row claims to be materialised and has no reservation behind it. */
  reservationMissing: "RESERVATION_MISSING",
  /** A reservation exists and names a different guide for this lineage. */
  reservationConflict: "RESERVATION_CONFLICT",
  /** A reservation gives this chapter's guide to a different lineage. */
  reservationReverseConflict: "RESERVATION_REVERSE_CONFLICT",
  /** A definition this build SHIPS already holds the guide a row claims. */
  codeOwnedCollision: "CODE_OWNED_GUIDE_COLLISION",
} as const;

export type BackfillAnomalyKind =
  (typeof BACKFILL_ANOMALY)[keyof typeof BACKFILL_ANOMALY];

/**
 * One problem, described without quoting content.
 *
 * `bookSlug` and `chapterOrder` are catalog coordinates an operator needs to
 * act; `experienceKey` and `guideKey` are catalog keys, not user data. No row
 * id, no definition, no driver text.
 */
export interface BackfillAnomaly {
  kind: BackfillAnomalyKind;
  bookSlug: string;
  chapterOrder: number;
  experienceKey?: string;
  guideKey?: string;
}

export interface BackfillReport {
  rowsConsidered: number;
  /** Rows with BOTH binding columns null — the only ones `--apply` writes to. */
  rowsLegacy: number;
  /** Rows that already carry identity and lineage. Verified, never rewritten. */
  rowsAlreadyMaterialised: number;
  /**
   * Materialised rows whose `chapterOrder` no longer matches where their unit
   * sits. Counted, never treated as an anomaly — see `classify`.
   */
  rowsWithPositionDrift: number;
  /**
   * Rows whose chapter was established from their own guide's targets.
   *
   * This replaces `rowsAdoptingCurrentPosition`, and the change is not
   * cosmetic. That counter existed because a legacy row's chapter was INFERRED
   * from the number it carried, which is irreversible once written and wrong
   * whenever a reorder happened in between. Nothing infers any more: identity
   * comes from the exact `guidePin`, so there is no adoption to count and no
   * irreversible guess to warn about.
   */
  rowsIdentityFromGuideContext: number;
  /**
   * Rows where the position ALSO points at the same unit.
   *
   * Corroboration, and only that. It is reported because a mismatch between
   * two independent descriptions is worth seeing, never because the position
   * had a vote.
   */
  rowsPositionCorroborated: number;
  /** Rows whose `(bookSlug, chapterOrder)` no longer resolves to any unit. */
  rowsWithUnresolvedPosition: number;
  groups: number;
  /** Lineages whose reservation already exists. */
  reservationsExisting: number;
  /** Lineages that would get a NEW reservation row. */
  reservationsToCreate: number;
  reservationsCreated: number;
  reservationsReplayed: number;
  columnsFilled: number;
  anomalies: BackfillAnomaly[];
  applied: boolean;
}

/** One lineage inside one stable chapter, and the rows that make it up. */
interface Group {
  contentUnitId: string;
  bookSlug: string;
  chapterOrder: number;
  experienceKey: string;
  guideKey: string;
  /** Rows with both columns null — the only ones this command ever writes to. */
  legacyRowIds: string[];
  /** Rows that already carry identity and lineage. Verified, never rewritten. */
  materialisedRowIds: string[];
}

type BackfillDb = Prisma.TransactionClient;

interface StoredRow {
  id: string;
  experienceKey: string;
  experienceVersion: number;
  bookSlug: string;
  chapterOrder: number;
  status: string;
  contentUnitId: string | null;
  guideKey: string | null;
  definitionJson: unknown;
}

/**
 * The EXACT guide pin a stored row states.
 *
 * Both halves matter. `guideKey` alone would resolve whichever version happens
 * to be current, and two versions of one guide can name different targets — so
 * a key-only lookup answers a question nobody asked.
 *
 * `null` when the definition does not validate; `classify` turns that into the
 * INVALID_DEFINITION anomaly, so this returns rather than throws.
 */
function pinOf(
  row: StoredRow,
): { guideKey: string; guideVersion: number } | null {
  try {
    const { guidePin } = validateExperienceDefinition(row.definitionJson);
    return {
      guideKey: guidePin.guideKey,
      guideVersion: guidePin.guideVersion,
    };
  } catch {
    return null;
  }
}

/** What a single row turned out to be, once read against its own definition. */
type Classified =
  | {
      kind: "row";
      contentUnitId: string;
      guideKey: string;
      materialised: boolean;
      /** Observation only: position points somewhere else than identity. */
      positionDrift: boolean;
      /** Observation only: position no longer resolves to any unit. */
      positionUnresolved: boolean;
      /** Observation only: position agrees with identity. */
      positionCorroborated: boolean;
    }
  | { kind: "anomaly"; anomaly: BackfillAnomaly };

function anomaly(
  kind: BackfillAnomalyKind,
  row: Pick<StoredRow, "bookSlug" | "chapterOrder" | "experienceKey">,
  guideKey?: string,
): Classified {
  return {
    kind: "anomaly",
    anomaly: {
      kind,
      bookSlug: row.bookSlug,
      chapterOrder: row.chapterOrder,
      experienceKey: row.experienceKey,
      ...(guideKey === undefined ? {} : { guideKey }),
    },
  };
}

/**
 * One row → its identity and its guide, or the contradiction that stops the run.
 *
 * ── The one thing that is NOT an anomaly ────────────────────────────────────
 *
 * A materialised row whose `chapterOrder` no longer matches where its unit sits
 * is EXPECTED, not broken. `chapterOrder` is a locator this codebase never
 * updates, so a reorder between the C.3A deploy and this command leaves exactly
 * that state — and identity is the column that stayed right. Aborting on it
 * would be a gate with no remedy: there is no CMS action an operator could take
 * to make the stale number agree again. So identity for a materialised row is
 * read from the row's OWN `contentUnitId`, the drift is counted and reported,
 * and only a genuine contradiction stops the run.
 *
 * This is deliberately narrower than "the columns differ from the identity
 * resolved for this position". That formulation would have made a normal
 * editorial reorder block the cutover.
 */
function classify(
  row: StoredRow,
  resolvedForPosition: string | null,
  /** The chapter this row's OWN exact guide pin names. Identity, not a hint. */
  resolvedForGuide: { unitId: string; editionId: string } | null,
  unitEdition: Map<string, string>,
  editionOfBook: Map<string, string>,
): Classified {
  let claimed: string;
  try {
    const def = validateExperienceDefinition(row.definitionJson);
    // The definition has to be describing THIS row. A stored definition whose
    // own identity has drifted from its columns is not something to pick a
    // winner between.
    if (
      def.experienceKey !== row.experienceKey ||
      def.experienceVersion !== row.experienceVersion ||
      def.bookSlug !== row.bookSlug ||
      def.chapterOrder !== row.chapterOrder ||
      def.status !== row.status
    ) {
      return anomaly(BACKFILL_ANOMALY.definitionDisagreesWithRow, row);
    }
    claimed = def.guidePin.guideKey;
  } catch {
    return anomaly(BACKFILL_ANOMALY.invalidDefinition, row);
  }

  const hasUnit = row.contentUnitId !== null;
  const hasGuide = row.guideKey !== null;
  if (hasUnit !== hasGuide) {
    // Half a binding. The composite key does not see it (MATCH SIMPLE skips a
    // row with a null column), which is exactly why it has to be caught here.
    return anomaly(BACKFILL_ANOMALY.halfMaterialised, row, claimed);
  }

  if (hasUnit) {
    if (row.guideKey !== claimed) {
      return anomaly(
        BACKFILL_ANOMALY.columnsDisagreeWithDefinition,
        row,
        claimed,
      );
    }
    const unitId = row.contentUnitId as string;

    // The edition check runs ALWAYS, and that is the correction.
    //
    // It used to be skipped whenever `resolveChapterIdentity(bookSlug,
    // chapterOrder)` had failed — because the edition id came from that
    // resolution. So exactly the rows most worth checking went unchecked: one
    // whose old position no longer exists, one outside the published manifest,
    // one whose number another unit has taken. Those are not reasons to trust a
    // `contentUnitId`; they are reasons to look at it.
    //
    // The edition now comes from the book directly, so "does this row's unit
    // belong to this row's book" is answerable whatever happened to its
    // position.
    const edition = editionOfBook.get(row.bookSlug);
    if (edition === undefined) {
      return anomaly(BACKFILL_ANOMALY.bookHasNoEdition, row, claimed);
    }
    const unitsEdition = unitEdition.get(unitId);
    if (unitsEdition === undefined) {
      // The direct foreign key makes this unreachable while it exists. Checked
      // anyway: this command is the last thing to look at the data before the
      // constraint that assumes it is sound.
      return anomaly(BACKFILL_ANOMALY.identityUnknownUnit, row, claimed);
    }
    if (unitsEdition !== edition) {
      return anomaly(BACKFILL_ANOMALY.identityCrossEdition, row, claimed);
    }

    // The stored identity and the guide's own context are two descriptions of
    // one fact. If they disagree, this command does NOT pick a winner: a row
    // pointing somewhere its guide does not live is a question for an editor,
    // and completing the set around it would bake the disagreement in.
    //
    // An unresolvable pin is a separate anomaly, not silent agreement — the
    // check would otherwise pass by being unable to run.
    if (resolvedForGuide === null) {
      return anomaly(BACKFILL_ANOMALY.guideContextUnresolved, row, claimed);
    }
    if (resolvedForGuide.unitId !== unitId) {
      return anomaly(
        BACKFILL_ANOMALY.guideContextIdentityMismatch,
        row,
        claimed,
      );
    }

    return {
      kind: "row",
      contentUnitId: unitId,
      guideKey: claimed,
      materialised: true,
      positionDrift:
        resolvedForPosition !== null && resolvedForPosition !== unitId,
      positionUnresolved: resolvedForPosition === null,
      positionCorroborated: resolvedForPosition === unitId,
    };
  }

  // Fully legacy — and its chapter is NOT the number it carries.
  //
  // The row states which guide it pins, exactly; that guide's targets name one
  // editorial context; that context names a unit. `chapterOrder` is where the
  // row happened to be written, which a single editorial reorder makes wrong
  // while leaving the pin correct. Using it would have written an inference
  // that the cutover's CHECK then makes permanent and indistinguishable from a
  // choice an editor made.
  if (resolvedForGuide === null) {
    return anomaly(BACKFILL_ANOMALY.guideContextUnresolved, row, claimed);
  }
  const guideUnit = resolvedForGuide.unitId;

  // The same edition check materialised rows get, for the same reason: a unit
  // that belongs to another book is not this row's chapter however it resolved.
  const edition = editionOfBook.get(row.bookSlug);
  if (edition === undefined) {
    return anomaly(BACKFILL_ANOMALY.bookHasNoEdition, row, claimed);
  }
  if (resolvedForGuide.editionId !== edition) {
    return anomaly(BACKFILL_ANOMALY.identityCrossEdition, row, claimed);
  }

  return {
    kind: "row",
    contentUnitId: guideUnit,
    guideKey: claimed,
    materialised: false,
    // Position is now purely observational, on legacy rows too.
    positionDrift:
      resolvedForPosition !== null && resolvedForPosition !== guideUnit,
    positionUnresolved: resolvedForPosition === null,
    positionCorroborated: resolvedForPosition === guideUnit,
  };
}

interface Plan {
  groups: Group[];
  anomalies: BackfillAnomaly[];
  rowsConsidered: number;
  rowsLegacy: number;
  rowsAlreadyMaterialised: number;
  rowsWithPositionDrift: number;
  rowsIdentityFromGuideContext: number;
  rowsPositionCorroborated: number;
  rowsWithUnresolvedPosition: number;
  reservationsExisting: number;
}

/**
 * Read every reserving row, classify it, and group it — without writing.
 *
 * Collects EVERY anomaly rather than throwing at the first: an operator fixing
 * a catalog wants the whole list, not one item at a time. The caller decides
 * that a non-empty list means "do not apply".
 */
async function planReservations(
  db: BackfillDb,
  catalog: CodeOwnedCatalog = productionCodeOwnedCatalog,
): Promise<Plan> {
  const rows = (await db.chapterExperienceVersion.findMany({
    where: { status: { in: ["DRAFT", "PUBLISHED"] } },
    select: {
      id: true,
      experienceKey: true,
      experienceVersion: true,
      bookSlug: true,
      chapterOrder: true,
      status: true,
      contentUnitId: true,
      guideKey: true,
      definitionJson: true,
    },
    orderBy: [{ bookSlug: "asc" }, { chapterOrder: "asc" }, { id: "asc" }],
  })) as StoredRow[];

  const anomalies: BackfillAnomaly[] = [];
  const byGroup = new Map<string, Group>();
  // Both halves of the bijection, checked per stable chapter.
  const guideOwner = new Map<string, string>();
  const lineageGuide = new Map<string, string>();
  let legacy = 0;
  let materialised = 0;
  let drifted = 0;
  let fromGuideContext = 0;
  let corroborated = 0;
  let positionUnresolved = 0;
  /** `guideKey@guideVersion` → the chapter that exact pin names, once. */
  const guideCache = new Map<
    string,
    { unitId: string; editionId: string } | null
  >();

  // Editions FIRST, by slug, independent of any position.
  //
  // `resolveChapterIdentity` used to be the only source of an edition id, which
  // meant a row whose position no longer resolved got no edition check at all.
  // Reading the editions up front separates the two questions: "which book is
  // this row in" has an answer even when "which chapter" does not.
  const editionOfBook = new Map<string, string>();
  for (const edition of await db.edition.findMany({
    where: { slug: { in: [...new Set(rows.map((r) => r.bookSlug))] } },
    select: { id: true, slug: true },
  })) {
    editionOfBook.set(edition.slug, edition.id);
  }

  // Every unit any row names, in one read.
  const unitEdition = new Map<string, string>();
  const namedUnits = [
    ...new Set(
      rows
        .map((r) => r.contentUnitId)
        .filter((id): id is string => id !== null),
    ),
  ];
  for (const unit of await db.contentUnit.findMany({
    where: { id: { in: namedUnits } },
    select: { id: true, editionId: true },
  })) {
    unitEdition.set(unit.id, unit.editionId);
  }

  // Chapter identity is resolved once per `(bookSlug, chapterOrder)`: the
  // lookup is the same for every row of a chapter, and doing it per row would
  // multiply the cost by the number of versions.
  //
  // `lock: "none"`, deliberately. Under `--measure` this transaction is READ
  // ONLY and PostgreSQL would refuse a `FOR UPDATE` outright; under `--apply`
  // every edition is ALREADY locked, in id order, before this function is
  // called. Taking row locks here as a side effect of resolution would acquire
  // them in whatever order the rows happen to arrive in — which is the shape
  // deadlocks come in.
  const identityCache = new Map<string, string | null>();

  for (const row of rows) {
    const cacheKey = `${row.bookSlug}#${row.chapterOrder}`;
    if (!identityCache.has(cacheKey)) {
      try {
        const resolved = await resolveChapterIdentity(db, {
          bookSlug: row.bookSlug,
          chapterOrder: row.chapterOrder,
          lock: "none",
        });
        identityCache.set(cacheKey, resolved.contentUnitId);
      } catch {
        identityCache.set(cacheKey, null);
      }
    }

    // The row's OWN identity, from the exact pin it stores. Cached per pin
    // rather than per chapter: the pin is the question, and two rows pinning
    // different guide versions are two different questions.
    //
    // Resolved with THIS transaction client, so it lands on the same snapshot
    // as every other read in the plan. A resolution taken outside would
    // describe a manifest this plan never saw.
    const pin = pinOf(row);
    if (pin !== null) {
      const pinKey = `${pin.guideKey}@${pin.guideVersion}`;
      if (!guideCache.has(pinKey)) {
        guideCache.set(pinKey, await resolveUnitForGuidePin(db, pin, catalog));
      }
    }

    const verdict = classify(
      row,
      identityCache.get(cacheKey) ?? null,
      pin === null
        ? null
        : (guideCache.get(`${pin.guideKey}@${pin.guideVersion}`) ?? null),
      unitEdition,
      editionOfBook,
    );
    if (verdict.kind === "anomaly") {
      anomalies.push(verdict.anomaly);
      continue;
    }

    if (verdict.materialised) materialised += 1;
    else legacy += 1;
    // Every row's chapter came from its guide's targets — materialised rows
    // have it verified against their stored column, legacy rows get it as
    // their identity. Nothing is inferred from a number any more.
    fromGuideContext += 1;
    if (verdict.positionCorroborated) corroborated += 1;
    if (verdict.positionUnresolved) positionUnresolved += 1;
    if (verdict.positionDrift) drifted += 1;

    const guideScope = `${verdict.contentUnitId}#${verdict.guideKey}`;
    const owner = guideOwner.get(guideScope);
    if (owner !== undefined && owner !== row.experienceKey) {
      anomalies.push({
        kind: BACKFILL_ANOMALY.guideOwnedByTwoLineages,
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
        guideKey: verdict.guideKey,
      });
      continue;
    }
    guideOwner.set(guideScope, row.experienceKey);

    const lineageScope = `${verdict.contentUnitId}#${row.experienceKey}`;
    const held = lineageGuide.get(lineageScope);
    if (held !== undefined && held !== verdict.guideKey) {
      anomalies.push({
        kind: BACKFILL_ANOMALY.lineageOwnsTwoGuides,
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
        experienceKey: row.experienceKey,
      });
      continue;
    }
    lineageGuide.set(lineageScope, verdict.guideKey);

    const existing = byGroup.get(lineageScope);
    const group =
      existing ??
      ({
        contentUnitId: verdict.contentUnitId,
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
        experienceKey: row.experienceKey,
        guideKey: verdict.guideKey,
        legacyRowIds: [],
        materialisedRowIds: [],
      } satisfies Group);
    if (verdict.materialised) group.materialisedRowIds.push(row.id);
    else group.legacyRowIds.push(row.id);
    if (!existing) byGroup.set(lineageScope, group);
  }

  const groups = [...byGroup.values()];
  anomalies.push(...(await codeOwnedCollisions(db, groups)));
  anomalies.push(...(await reservationDisagreements(db, groups)));

  // How many of these lineages already HAVE their reservation. It was reported
  // as a hard-coded zero, which made `reservationsToCreate` — the number an
  // operator reads before authorising a write — the count of every lineage
  // rather than of the ones that need one.
  const existing = await db.experienceGuideReservation.findMany({
    where: {
      contentUnitId: { in: [...new Set(groups.map((g) => g.contentUnitId))] },
    },
    select: { contentUnitId: true, experienceKey: true },
  });
  const held = new Set(
    existing.map((r) => `${r.contentUnitId}#${r.experienceKey}`),
  );
  const reservationsExisting = groups.filter((g) =>
    held.has(`${g.contentUnitId}#${g.experienceKey}`),
  ).length;

  return {
    groups,
    anomalies,
    rowsConsidered: rows.length,
    rowsLegacy: legacy,
    rowsAlreadyMaterialised: materialised,
    rowsWithPositionDrift: drifted,
    rowsIdentityFromGuideContext: fromGuideContext,
    rowsPositionCorroborated: corroborated,
    rowsWithUnresolvedPosition: positionUnresolved,
    reservationsExisting,
  };
}

/**
 * Definitions this build SHIPS hold their guide too, and they are not rows.
 *
 * The hybrid repository serves them to readers today, so a legacy row claiming
 * a guide a published code-owned experience already uses is a real collision —
 * it would surface the day a deploy replaced the catalog, which is the worst
 * possible moment to find it. The same `experienceKey` on the same guide is not
 * a collision: that is a code-owned definition and its database successor, the
 * intended migration path.
 *
 * They are never MATERIALISED, and not for the reason this comment used to
 * give: `RESTRICT` refuses a delete only while something REFERENCES the row, so
 * a reservation nothing references deletes perfectly well. The reason is
 * ownership — a reservation records an editorial decision, and a shipped
 * definition is a fact about the build that changes with a deploy rather than
 * with a button. See `readChapterBindings` for the full reconciliation story.
 */
async function codeOwnedCollisions(
  db: BackfillDb,
  groups: readonly Group[],
): Promise<BackfillAnomaly[]> {
  const out: BackfillAnomaly[] = [];
  // By stable chapter, not by number. The comparison used to key both sides on
  // `(bookSlug, chapterOrder)` — and for a stored row that number is the
  // position it was CREATED at, so after a reorder the check compared a shipped
  // definition placed today against a row placed months ago.
  const byUnit = await codeOwnedClaimsByUnit(db);
  for (const g of groups) {
    const owner = (byUnit.get(g.contentUnitId) ?? []).find(
      (claim) => claim.guideKey === g.guideKey,
    );
    if (owner !== undefined && owner.experienceKey !== g.experienceKey) {
      out.push({
        kind: BACKFILL_ANOMALY.codeOwnedCollision,
        bookSlug: g.bookSlug,
        chapterOrder: g.chapterOrder,
        experienceKey: g.experienceKey,
        guideKey: g.guideKey,
      });
    }
  }
  return out;
}

/** Reservations that already exist and do not say what the rows say. */
async function reservationDisagreements(
  db: BackfillDb,
  groups: readonly Group[],
): Promise<BackfillAnomaly[]> {
  const out: BackfillAnomaly[] = [];
  const units = [...new Set(groups.map((g) => g.contentUnitId))];
  const existing = await db.experienceGuideReservation.findMany({
    where: { contentUnitId: { in: units } },
    select: { contentUnitId: true, experienceKey: true, guideKey: true },
  });
  const byLineage = new Map<string, string>();
  const byGuide = new Map<string, string>();
  for (const r of existing) {
    byLineage.set(`${r.contentUnitId}#${r.experienceKey}`, r.guideKey);
    byGuide.set(`${r.contentUnitId}#${r.guideKey}`, r.experienceKey);
  }

  for (const g of groups) {
    const held = byLineage.get(`${g.contentUnitId}#${g.experienceKey}`);
    if (held !== undefined && held !== g.guideKey) {
      out.push({
        kind: BACKFILL_ANOMALY.reservationConflict,
        bookSlug: g.bookSlug,
        chapterOrder: g.chapterOrder,
        experienceKey: g.experienceKey,
        guideKey: g.guideKey,
      });
      continue;
    }
    const owner = byGuide.get(`${g.contentUnitId}#${g.guideKey}`);
    if (owner !== undefined && owner !== g.experienceKey) {
      out.push({
        kind: BACKFILL_ANOMALY.reservationReverseConflict,
        bookSlug: g.bookSlug,
        chapterOrder: g.chapterOrder,
        experienceKey: g.experienceKey,
        guideKey: g.guideKey,
      });
      continue;
    }
    // A row that says it is materialised and has no reservation behind it is a
    // contradiction the composite foreign key should have made impossible.
    // Checked anyway: this command is the last thing to look at the data before
    // the constraint that assumes it is sound.
    if (held === undefined && g.materialisedRowIds.length > 0) {
      out.push({
        kind: BACKFILL_ANOMALY.reservationMissing,
        bookSlug: g.bookSlug,
        chapterOrder: g.chapterOrder,
        experienceKey: g.experienceKey,
        guideKey: g.guideKey,
      });
    }
  }
  return out;
}

function measuredReport(plan: Plan): BackfillReport {
  return {
    rowsConsidered: plan.rowsConsidered,
    rowsLegacy: plan.rowsLegacy,
    rowsAlreadyMaterialised: plan.rowsAlreadyMaterialised,
    rowsWithPositionDrift: plan.rowsWithPositionDrift,
    rowsIdentityFromGuideContext: plan.rowsIdentityFromGuideContext,
    rowsPositionCorroborated: plan.rowsPositionCorroborated,
    rowsWithUnresolvedPosition: plan.rowsWithUnresolvedPosition,
    groups: plan.groups.length,
    reservationsExisting: plan.reservationsExisting,
    // What a run would CREATE, not how many lineages there are. The two differ
    // by exactly the reservations that already exist, and an operator reads
    // this number to decide whether to authorise a write.
    reservationsToCreate: plan.groups.length - plan.reservationsExisting,
    reservationsCreated: 0,
    reservationsReplayed: 0,
    columnsFilled: 0,
    anomalies: plan.anomalies,
    applied: false,
  };
}

/**
 * Read-only, and the database is what enforces it.
 *
 * `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, issued as the
 * FIRST statement so it applies to everything after it — PostgreSQL refuses the
 * `SET` once any other statement has run in the transaction.
 *
 * Both halves earn their place:
 *
 *   REPEATABLE READ  every row, manifest, reservation and catalog lookup in the
 *                    report describes ONE instant. Under READ COMMITTED a
 *                    reorder mid-scan would produce a report that never
 *                    corresponded to any state of the database, which is the
 *                    worst possible thing to hand an operator deciding whether
 *                    to authorise a write.
 *   READ ONLY        the guarantee stops being a promise. PostgreSQL rejects
 *                    every write AND every `SELECT … FOR UPDATE` in such a
 *                    transaction — measured: `cannot execute SELECT FOR UPDATE
 *                    in a read-only transaction`. So "measure takes no locks
 *                    and writes nothing" is not a claim a future edit can
 *                    quietly break; it fails at the statement.
 *
 * No advisory lock either. Measuring is something an operator should be able to
 * do at any time, including while the CMS is being used, and a report that
 * blocked editorial writes to describe them would be its own small outage.
 */
export async function measureReservations(
  prisma: PrismaClient,
): Promise<BackfillReport> {
  return measuredReport(
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      return planReservations(tx);
    }),
  );
}

/**
 * Materialise, or change nothing at all.
 *
 * ── The order, and why nothing may be read before it finishes ──────────────
 *
 *   1. `GLOBAL_COMPAT_BINDING_LOCK`   excludes every C.3A writer.
 *   2. EVERY `Edition`, `FOR UPDATE`, in id order.
 *   3. only now: rows, manifests, reservations, catalog.
 *   4. write; the locks are held to commit or rollback.
 *
 * Step 2 is the correction. The global key excludes binding writers and nothing
 * else — Content Studio takes no advisory key at all, so a publish or a reorder
 * could land between reading a row and resolving the position it carries, and
 * the reservation written from that resolution would name the wrong unit
 * PERMANENTLY. The row has no identity of its own to check it against; that is
 * what makes it legacy.
 *
 * ALL editions rather than the relevant ones, and in id order. Working out
 * which editions matter means reading the rows, which is the very thing that
 * must not happen before the locks are held — the narrower version would open
 * the window it exists to close. Id order gives a total order, so this command
 * and anything else taking several edition rows cannot build a cycle. This is
 * an exceptional, offline, once-per-migration command: being correct is worth
 * more than being narrow, and the cost is one `SELECT … FOR UPDATE` over a
 * table with as many rows as the platform has books.
 */
export async function applyReservations(
  prisma: PrismaClient,
): Promise<BackfillReport> {
  try {
    return await prisma.$transaction(async (tx) => {
      await acquireBindingLock(tx, globalBindingLockKey());

      // Every edition, in id order, BEFORE anything is read.
      await tx.$executeRaw`SELECT "id" FROM "Edition" ORDER BY "id" FOR UPDATE`;

      // The schema has to be the bridge or the cutover. Running this against a
      // schema without the reservation table would fail statement by statement;
      // refusing up front is a better answer than a driver error.
      const authority = await readReservationAuthority(tx);
      if (authority !== "BRIDGE" && authority !== "STRUCTURAL") {
        throw new BackfillFailure("EXPERIENCE_BINDING_AUTHORITY_UNAVAILABLE");
      }

      // Re-read UNDER the locks. A plan built before them could describe rows a
      // bridge writer has since changed, or a position a reorder has since
      // moved.
      const plan = await planReservations(tx);
      if (plan.anomalies.length > 0) {
        // Abort whole. A partial materialisation would leave the chapter half
        // structural and half scanned, which is the one state the authority
        // detector treats as a contradiction.
        throw new BackfillAbort(plan.anomalies);
      }

      let created = 0;
      let replayed = 0;
      let filled = 0;
      for (const group of plan.groups) {
        const existing = await tx.experienceGuideReservation.findUnique({
          where: {
            contentUnitId_experienceKey: {
              contentUnitId: group.contentUnitId,
              experienceKey: group.experienceKey,
            },
          },
          select: { guideKey: true },
        });
        if (existing) {
          // A replay is an EXACT match of owner, chapter and guide. The plan
          // already refused anything else; this is the same check under the
          // lock, because between planning and writing is exactly where a race
          // would live.
          if (existing.guideKey !== group.guideKey) {
            throw new BackfillAbort([
              {
                kind: BACKFILL_ANOMALY.reservationConflict,
                bookSlug: group.bookSlug,
                chapterOrder: group.chapterOrder,
                experienceKey: group.experienceKey,
                guideKey: group.guideKey,
              },
            ]);
          }
          replayed += 1;
        } else {
          // No `ON CONFLICT DO NOTHING`. Suppressing a conflict here would bury
          // the one thing this table exists to surface.
          await tx.experienceGuideReservation.create({
            data: {
              contentUnitId: group.contentUnitId,
              experienceKey: group.experienceKey,
              guideKey: group.guideKey,
            },
          });
          created += 1;
        }

        // LEGACY rows only, and columns only. A materialised row is verified
        // and left exactly as it is — writing to it would be the "repair" this
        // command refuses to do. `definitionJson` is never touched: the claim it
        // records is what the whole command is preserving.
        if (group.legacyRowIds.length > 0) {
          // Raw SQL, for the same reason the bridge tests insert with it: this
          // binary's Prisma client may be generated from the CUTOVER schema,
          // where `contentUnitId` is NOT NULL — so `contentUnitId: null` is
          // not a filter it will send. The guard is the point of the statement
          // and cannot be dropped to satisfy a client that describes a schema
          // this command may not be running against.
          const updated = await tx.$executeRaw`
            UPDATE "ChapterExperienceVersion"
               SET "contentUnitId" = ${group.contentUnitId},
                   "guideKey"      = ${group.guideKey},
                   "updatedAt"     = now()
             WHERE "id" = ANY(${group.legacyRowIds}::text[])
               -- Still legacy at write time. If a bridge writer materialised it
               -- between the plan and here, this matches zero rows and the count
               -- check below aborts rather than overwriting their work.
               AND "contentUnitId" IS NULL
               AND "guideKey" IS NULL`;
          if (updated !== group.legacyRowIds.length) {
            throw new BackfillAbort([
              {
                kind: BACKFILL_ANOMALY.halfMaterialised,
                bookSlug: group.bookSlug,
                chapterOrder: group.chapterOrder,
                experienceKey: group.experienceKey,
                guideKey: group.guideKey,
              },
            ]);
          }
          filled += updated;
        }
      }

      return {
        ...measuredReport(plan),
        reservationsCreated: created,
        reservationsReplayed: replayed,
        columnsFilled: filled,
        applied: true,
      };
    });
  } catch (err) {
    if (err instanceof BackfillAbort) throw err;
    if (err instanceof BackfillFailure) throw err;
    // Everything else becomes a canonical code. A driver message can carry a
    // connection string, a row's contents or a constraint's internals, and this
    // command's output is read and pasted by operators. A unique violation on
    // the reservation table means a writer got in despite the lock; the ONLY
    // safe reading of that is a race, and the transaction is already rolled
    // back by the time this runs.
    throw new BackfillFailure(canonicalFailureCode(err));
  }
}

/** Prisma's error codes, mapped to ours. Never its message. */
function canonicalFailureCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "P2002") return "EXPERIENCE_RESERVATION_RACE";
  if (code === "P2003") return "EXPERIENCE_RESERVATION_FOREIGN_KEY";
  return "EXPERIENCE_RESERVATION_BACKFILL_FAILED";
}

/** Aborting is a result, not a crash: the anomalies are the point. */
export class BackfillAbort extends Error {
  constructor(readonly anomalies: BackfillAnomaly[]) {
    super("EXPERIENCE_RESERVATION_BACKFILL_ABORTED");
    this.name = "BackfillAbort";
  }
}

/** A failure that is not an editorial verdict, reported as a code and nothing else. */
export class BackfillFailure extends Error {
  constructor(readonly code: string) {
    // The message IS the code: see `canonicalFailureCode`.
    super(code);
    this.name = "BackfillFailure";
  }
}
