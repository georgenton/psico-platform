import type { Prisma, PrismaClient } from "@prisma/client";

import {
  acquireBindingLock,
  globalBindingLockKey,
} from "./experience-binding-lock";
import { resolveChapterIdentity } from "./experience-chapter-identity";
import { validateExperienceDefinition } from "./experience-catalog";
import { productionExperienceRepository } from "./experience-production-catalog";
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
  /** `(bookSlug, chapterOrder)` names no unit in the published structure. */
  identityUnresolved: "CHAPTER_IDENTITY_UNRESOLVED",
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
  rowsLegacy: number;
  rowsAlreadyMaterialised: number;
  /**
   * Materialised rows whose `chapterOrder` no longer matches where their unit
   * sits. Counted, never treated as an anomaly — see `classify`.
   */
  rowsWithPositionDrift: number;
  groups: number;
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

/** What a single row turned out to be, once read against its own definition. */
type Classified =
  | {
      kind: "row";
      contentUnitId: string;
      guideKey: string;
      materialised: boolean;
      positionDrift: boolean;
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
    const edition = editionOfBook.get(row.bookSlug);
    if (edition !== undefined && unitEdition.get(unitId) !== edition) {
      return anomaly(BACKFILL_ANOMALY.identityCrossEdition, row, claimed);
    }
    return {
      kind: "row",
      contentUnitId: unitId,
      guideKey: claimed,
      materialised: true,
      positionDrift:
        resolvedForPosition !== null && resolvedForPosition !== unitId,
    };
  }

  // Fully legacy: position is the only locator it has, so it must resolve.
  if (resolvedForPosition === null) {
    return anomaly(BACKFILL_ANOMALY.identityUnresolved, row, claimed);
  }
  return {
    kind: "row",
    contentUnitId: resolvedForPosition,
    guideKey: claimed,
    materialised: false,
    positionDrift: false,
  };
}

interface Plan {
  groups: Group[];
  anomalies: BackfillAnomaly[];
  rowsConsidered: number;
  rowsLegacy: number;
  rowsAlreadyMaterialised: number;
  rowsWithPositionDrift: number;
  reservationsExisting: number;
}

/**
 * Read every reserving row, classify it, and group it — without writing.
 *
 * Collects EVERY anomaly rather than throwing at the first: an operator fixing
 * a catalog wants the whole list, not one item at a time. The caller decides
 * that a non-empty list means "do not apply".
 */
async function planReservations(db: BackfillDb): Promise<Plan> {
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

  // Chapter identity is resolved once per `(bookSlug, chapterOrder)`: the
  // lookup is the same for every row of a chapter, and doing it per row would
  // multiply the cost by the number of versions.
  //
  // `lock: "for-update"` — this command holds the global key, so it already
  // excludes every bridge writer, but Content Studio takes no advisory key at
  // all. Without the edition row lock a reorder could land between resolving a
  // chapter and writing the columns derived from it.
  const identityCache = new Map<string, string | null>();
  const editionOfBook = new Map<string, string>();
  const unitEdition = new Map<string, string>();

  for (const row of rows) {
    const cacheKey = `${row.bookSlug}#${row.chapterOrder}`;
    if (!identityCache.has(cacheKey)) {
      try {
        const resolved = await resolveChapterIdentity(db, {
          bookSlug: row.bookSlug,
          chapterOrder: row.chapterOrder,
          lock: "for-update",
        });
        identityCache.set(cacheKey, resolved.contentUnitId);
        editionOfBook.set(row.bookSlug, resolved.editionId);
      } catch {
        identityCache.set(cacheKey, null);
      }
    }
    if (row.contentUnitId !== null && !unitEdition.has(row.contentUnitId)) {
      const unit = await db.contentUnit.findUnique({
        where: { id: row.contentUnitId },
        select: { editionId: true },
      });
      if (unit) unitEdition.set(row.contentUnitId, unit.editionId);
    }

    const verdict = classify(
      row,
      identityCache.get(cacheKey) ?? null,
      unitEdition,
      editionOfBook,
    );
    if (verdict.kind === "anomaly") {
      anomalies.push(verdict.anomaly);
      continue;
    }

    if (verdict.materialised) materialised += 1;
    else legacy += 1;
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
  anomalies.push(...(await codeOwnedCollisions(groups)));
  anomalies.push(...(await reservationDisagreements(db, groups)));

  return {
    groups,
    anomalies,
    rowsConsidered: rows.length,
    rowsLegacy: legacy,
    rowsAlreadyMaterialised: materialised,
    rowsWithPositionDrift: drifted,
    reservationsExisting: 0,
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
 * They are never MATERIALISED. A reservation row nothing references could never
 * be released again: the composite foreign key that makes releasing safe is the
 * one that would block it forever. So the authority for a code-owned claim
 * stays where it is — in the catalog the deploy ships — and this command only
 * refuses to let a row take a guide out from under one.
 */
async function codeOwnedCollisions(
  groups: readonly Group[],
): Promise<BackfillAnomaly[]> {
  const out: BackfillAnomaly[] = [];
  const chapters = new Map<
    string,
    { bookSlug: string; chapterOrder: number }
  >();
  for (const g of groups) {
    chapters.set(`${g.bookSlug}#${g.chapterOrder}`, {
      bookSlug: g.bookSlug,
      chapterOrder: g.chapterOrder,
    });
  }
  const shipped = new Map<string, string>(); // `${book}#${order}#${guide}` → key
  for (const chapter of chapters.values()) {
    const defs = await productionExperienceRepository.listPublishedForChapter({
      bookSlug: chapter.bookSlug,
      chapterOrder: chapter.chapterOrder,
    });
    for (const def of defs) {
      shipped.set(
        `${chapter.bookSlug}#${chapter.chapterOrder}#${def.guidePin.guideKey}`,
        def.experienceKey,
      );
    }
  }
  for (const g of groups) {
    const owner = shipped.get(`${g.bookSlug}#${g.chapterOrder}#${g.guideKey}`);
    if (owner !== undefined && owner !== g.experienceKey) {
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

function emptyReport(plan: Plan, applied: boolean): BackfillReport {
  return {
    rowsConsidered: plan.rowsConsidered,
    rowsLegacy: plan.rowsLegacy,
    rowsAlreadyMaterialised: plan.rowsAlreadyMaterialised,
    rowsWithPositionDrift: plan.rowsWithPositionDrift,
    groups: plan.groups.length,
    reservationsToCreate: plan.groups.length,
    reservationsCreated: 0,
    reservationsReplayed: 0,
    columnsFilled: 0,
    anomalies: plan.anomalies,
    applied,
  };
}

/** Read-only. Nothing here writes, and nothing here takes a lock it does not need. */
export async function measureReservations(
  prisma: PrismaClient,
): Promise<BackfillReport> {
  return emptyReport(
    await prisma.$transaction(async (tx) => planReservations(tx)),
    false,
  );
}

/**
 * Materialise, or change nothing at all.
 *
 * One transaction. The global lock is taken FIRST — before the read — and the
 * plan is built after holding it, so what gets written describes the state the
 * lock is protecting rather than one observed before it.
 */
export async function applyReservations(
  prisma: PrismaClient,
): Promise<BackfillReport> {
  try {
    return await prisma.$transaction(async (tx) => {
      await acquireBindingLock(tx, globalBindingLockKey());

      // The schema has to be the bridge or the cutover. Running this against a
      // schema without the reservation table would fail statement by statement;
      // refusing up front is a better answer than a driver error.
      const authority = await readReservationAuthority(tx);
      if (authority !== "BRIDGE" && authority !== "STRUCTURAL") {
        throw new BackfillFailure("EXPERIENCE_BINDING_AUTHORITY_UNAVAILABLE");
      }

      // Re-read UNDER the lock. A plan built before it could describe rows a
      // bridge writer has since changed.
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
          const updated = await tx.chapterExperienceVersion.updateMany({
            where: {
              id: { in: group.legacyRowIds },
              // Still legacy at write time. If a bridge writer materialised it
              // between the plan and here, this matches zero rows and the count
              // check below aborts rather than overwriting their work.
              contentUnitId: null,
              guideKey: null,
            },
            data: {
              contentUnitId: group.contentUnitId,
              guideKey: group.guideKey,
            },
          });
          if (updated.count !== group.legacyRowIds.length) {
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
          filled += updated.count;
        }
      }

      return {
        rowsConsidered: plan.rowsConsidered,
        rowsLegacy: plan.rowsLegacy,
        rowsAlreadyMaterialised: plan.rowsAlreadyMaterialised,
        rowsWithPositionDrift: plan.rowsWithPositionDrift,
        groups: plan.groups.length,
        reservationsToCreate: plan.groups.length,
        reservationsCreated: created,
        reservationsReplayed: replayed,
        columnsFilled: filled,
        anomalies: [],
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
