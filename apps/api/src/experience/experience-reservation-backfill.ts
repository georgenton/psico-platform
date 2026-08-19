import type { Prisma, PrismaClient } from "@prisma/client";

import {
  acquireBindingLock,
  globalBindingLockKey,
} from "./experience-binding-lock";
import { resolveChapterIdentity } from "./experience-chapter-identity";
import { guideKeyFromDefinition } from "./experience-binding-reservation";

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
 */

export const BACKFILL_ANOMALY = {
  invalidDefinition: "INVALID_DEFINITION",
  identityUnresolved: "CHAPTER_IDENTITY_UNRESOLVED",
  guideOwnedByTwoLineages: "GUIDE_OWNED_BY_TWO_LINEAGES",
  lineageOwnsTwoGuides: "LINEAGE_OWNS_TWO_GUIDES",
  reservationConflict: "RESERVATION_CONFLICT",
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
  rowsAlreadyMaterialised: number;
  groups: number;
  reservationsToCreate: number;
  reservationsCreated: number;
  columnsFilled: number;
  anomalies: BackfillAnomaly[];
  applied: boolean;
}

interface Group {
  contentUnitId: string;
  bookSlug: string;
  chapterOrder: number;
  experienceKey: string;
  guideKey: string;
  rowIds: string[];
}

type BackfillDb = Prisma.TransactionClient;

/**
 * Read every reserving row, resolve it, and group it — without writing.
 *
 * Collects EVERY anomaly rather than throwing at the first: an operator fixing
 * a catalog wants the whole list, not one item at a time. The caller decides
 * that a non-empty list means "do not apply".
 */
async function planReservations(db: BackfillDb): Promise<{
  groups: Group[];
  anomalies: BackfillAnomaly[];
  rowsConsidered: number;
  rowsAlreadyMaterialised: number;
}> {
  const rows = await db.chapterExperienceVersion.findMany({
    where: { status: { in: ["DRAFT", "PUBLISHED"] } },
    select: {
      id: true,
      experienceKey: true,
      bookSlug: true,
      chapterOrder: true,
      contentUnitId: true,
      guideKey: true,
      definitionJson: true,
    },
    orderBy: [{ bookSlug: "asc" }, { chapterOrder: "asc" }, { id: "asc" }],
  });

  const anomalies: BackfillAnomaly[] = [];
  const byGroup = new Map<string, Group>();
  // Both halves of the bijection, checked across the whole chapter.
  const guideOwner = new Map<string, string>();
  const lineageGuide = new Map<string, string>();
  let alreadyMaterialised = 0;

  // Chapter identity is resolved once per `(bookSlug, chapterOrder)`: the
  // lookup is the same for every row of a chapter, and doing it per row would
  // multiply the cost by the number of versions.
  const identityCache = new Map<string, string | null>();

  for (const row of rows) {
    const guideKey = guideKeyFromDefinition(row.definitionJson);
    if (guideKey === null) {
      anomalies.push({
        kind: BACKFILL_ANOMALY.invalidDefinition,
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
        experienceKey: row.experienceKey,
      });
      continue;
    }

    const chapterCacheKey = `${row.bookSlug}#${row.chapterOrder}`;
    if (!identityCache.has(chapterCacheKey)) {
      try {
        const resolved = await resolveChapterIdentity(db, {
          bookSlug: row.bookSlug,
          chapterOrder: row.chapterOrder,
        });
        identityCache.set(chapterCacheKey, resolved.contentUnitId);
      } catch {
        identityCache.set(chapterCacheKey, null);
      }
    }
    const contentUnitId = identityCache.get(chapterCacheKey) ?? null;
    if (contentUnitId === null) {
      anomalies.push({
        kind: BACKFILL_ANOMALY.identityUnresolved,
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
        experienceKey: row.experienceKey,
      });
      continue;
    }

    if (row.contentUnitId !== null && row.guideKey !== null)
      alreadyMaterialised += 1;

    const guideScope = `${contentUnitId}#${guideKey}`;
    const owner = guideOwner.get(guideScope);
    if (owner !== undefined && owner !== row.experienceKey) {
      anomalies.push({
        kind: BACKFILL_ANOMALY.guideOwnedByTwoLineages,
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
        guideKey,
      });
      continue;
    }
    guideOwner.set(guideScope, row.experienceKey);

    const lineageScope = `${contentUnitId}#${row.experienceKey}`;
    const held = lineageGuide.get(lineageScope);
    if (held !== undefined && held !== guideKey) {
      anomalies.push({
        kind: BACKFILL_ANOMALY.lineageOwnsTwoGuides,
        bookSlug: row.bookSlug,
        chapterOrder: row.chapterOrder,
        experienceKey: row.experienceKey,
      });
      continue;
    }
    lineageGuide.set(lineageScope, guideKey);

    const existing = byGroup.get(lineageScope);
    if (existing) {
      existing.rowIds.push(row.id);
      continue;
    }
    byGroup.set(lineageScope, {
      contentUnitId,
      bookSlug: row.bookSlug,
      chapterOrder: row.chapterOrder,
      experienceKey: row.experienceKey,
      guideKey,
      rowIds: [row.id],
    });
  }

  return {
    groups: [...byGroup.values()],
    anomalies,
    rowsConsidered: rows.length,
    rowsAlreadyMaterialised: alreadyMaterialised,
  };
}

/** Read-only. Nothing here writes, and nothing here takes a lock it does not need. */
export async function measureReservations(
  prisma: PrismaClient,
): Promise<BackfillReport> {
  const plan = await prisma.$transaction(async (tx) => planReservations(tx));
  return {
    rowsConsidered: plan.rowsConsidered,
    rowsAlreadyMaterialised: plan.rowsAlreadyMaterialised,
    groups: plan.groups.length,
    reservationsToCreate: plan.groups.length,
    reservationsCreated: 0,
    columnsFilled: 0,
    anomalies: plan.anomalies,
    applied: false,
  };
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
  return prisma.$transaction(async (tx) => {
    await acquireBindingLock(tx, globalBindingLockKey());

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
        // A replay is an EXACT match of owner, chapter and guide. Anything else
        // is a contradiction, and `ON CONFLICT DO NOTHING` would bury it — the
        // one thing this table exists to surface.
        if (existing.guideKey !== group.guideKey) {
          throw new BackfillAbort([
            {
              kind: BACKFILL_ANOMALY.reservationConflict,
              bookSlug: group.bookSlug,
              chapterOrder: group.chapterOrder,
              experienceKey: group.experienceKey,
            },
          ]);
        }
      } else {
        await tx.experienceGuideReservation.create({
          data: {
            contentUnitId: group.contentUnitId,
            experienceKey: group.experienceKey,
            guideKey: group.guideKey,
          },
        });
        created += 1;
      }

      // Columns only. `definitionJson` is never touched: the claim it records
      // is what this whole command is preserving.
      const updated = await tx.chapterExperienceVersion.updateMany({
        where: { id: { in: group.rowIds } },
        data: {
          contentUnitId: group.contentUnitId,
          guideKey: group.guideKey,
        },
      });
      filled += updated.count;
    }

    return {
      rowsConsidered: plan.rowsConsidered,
      rowsAlreadyMaterialised: plan.rowsAlreadyMaterialised,
      groups: plan.groups.length,
      reservationsToCreate: plan.groups.length,
      reservationsCreated: created,
      columnsFilled: filled,
      anomalies: [],
      applied: true,
    };
  });
}

/** Aborting is a result, not a crash: the anomalies are the point. */
export class BackfillAbort extends Error {
  constructor(readonly anomalies: BackfillAnomaly[]) {
    super("EXPERIENCE_RESERVATION_BACKFILL_ABORTED");
    this.name = "BackfillAbort";
  }
}
