import type { PrismaClient } from "@prisma/client";
import type { ReaderChapterRef } from "@psico/types";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { legacyChaptersByUnitKey } from "../lector/legacy-placement";

/**
 * The chapters a book CURRENTLY offers a reader.
 *
 * Book detail listed legacy `Chapter` rows, so a chapter created in Content
 * Studio — which has no `Chapter` row at all — was simply absent: unreachable
 * from the one screen whose job is to list what there is to read.
 *
 * ── Legacy-first, exactly like the reader ─────────────────────────────────
 *
 * The rule is not "prefer the manifest". `resolveReaderChapter` and
 * `resolveLocatorRef` both try a `Chapter` row at that position FIRST and only
 * then consult Content Core, so a position answered by a legacy row is a legacy
 * chapter — even when the backfill also minted a unit for it. Listing that
 * position as `u/…` would hand out a link the reader does not honour.
 *
 * So: published native placements, overwritten at any conflicting position by a
 * published legacy chapter. One row per position, never two.
 *
 * ── The unpublished legacy chapter ────────────────────────────────────────
 *
 * A subtlety the parity proof in `reader-locator.pg-spec.ts` caught: detail
 * loads legacy chapters with `isPublished: true`, but `resolveReaderChapter`
 * and `resolveLocatorRef` filter on nothing — ANY `Chapter` row at that
 * position answers for it. `Chapter.isPublished` defaults to false, so this is
 * not a corner case.
 *
 * Listing the native twin at such a position would be the exact failure this
 * repair exists to prevent: a row labelled `u/…` whose link the reader answers
 * with the legacy chapter's content. So a position any legacy row occupies is
 * never native — if the row is unpublished it is not listed at all, which is
 * what a catalogue should say about an unpublished chapter anyway.
 *
 * Making the reader honour `isPublished` instead would be the other way to
 * close the gap, and it is not this change's to make: it would withdraw a
 * chapter somebody may be mid-way through.
 *
 * ── Published only ────────────────────────────────────────────────────────
 *
 * Native rows come from `Edition.publishedRevisionId` and nothing else. A draft
 * revision is editorial work in progress; a chapter that appears in a catalogue
 * before anyone published it is a leak, not a preview.
 */

type Db = Pick<
  PrismaClient,
  "edition" | "revisionUnit" | "chapter" | "contentUnit"
>;

/** A legacy chapter as the detail query already fetched it. */
export interface LegacyChapterRow {
  id: string;
  order: number;
  title: string;
  durationMinutes: number | null;
  partNumber?: number | null;
  partTitle?: string | null;
}

export interface EffectiveChapter {
  order: number;
  readerRef: ReaderChapterRef;
  title: string;
  durationMinutes: number | null;
  partNumber: number | null;
  partTitle: string | null;
}

/**
 * The effective list, ordered.
 *
 * `legacyChapters` are passed in rather than re-queried: the detail request has
 * already loaded them with the user's progress attached, and fetching them twice
 * would risk the two copies disagreeing about what counts as published.
 */
export async function resolveEffectiveChapters(
  db: Db,
  input: {
    bookId: string;
    bookSlug: string;
    legacyChapters: LegacyChapterRow[];
  },
): Promise<EffectiveChapter[]> {
  const edition = await db.edition.findFirst({
    where: { slug: input.bookSlug },
    select: { id: true, publishedRevisionId: true },
  });

  let nativePlacements: NativePlacement[] = [];
  let adoptedUnitKeys = new Set<string>();

  if (edition) {
    const [placements, units] = await Promise.all([
      edition.publishedRevisionId
        ? db.revisionUnit.findMany({
            where: { revisionId: edition.publishedRevisionId },
            orderBy: { order: "asc" },
            select: {
              order: true,
              partNumber: true,
              partTitle: true,
              unit: { select: { id: true, unitKey: true } },
              unitVersion: { select: { title: true, durationMinutes: true } },
            },
          })
        : Promise.resolve([]),
      // Which chapters this edition has adopted at all. It is what separates a
      // chapter that was never ingested from one deliberately removed from the
      // published structure — two states that must not behave alike.
      db.contentUnit.findMany({
        where: { editionId: edition.id },
        select: { unitKey: true },
      }),
    ]);
    nativePlacements = placements;
    adoptedUnitKeys = new Set(units.map((u) => u.unitKey));
  }

  return mergeEffectiveChapters({
    nativePlacements,
    publishedLegacyRows: input.legacyChapters,
    adoptedUnitKeys,
  });
}

/** A published native placement, as the merge rule needs it. */
export interface NativePlacement {
  order: number;
  partNumber: number | null;
  partTitle: string | null;
  unit: { id: string; unitKey: string };
  unitVersion: { title: string; durationMinutes: number | null };
}

/**
 * The legacy-first merge, with no database in it.
 *
 * Pulled out so the per-book resolver above and the page-batched card resolver
 * cannot end up with two readings of the same book. Everything that decides
 * WHICH chapter answers for a position lives here; the callers differ only in
 * how they fetch the rows.
 */
export function mergeEffectiveChapters(input: {
  nativePlacements: NativePlacement[];
  /** The legacy chapters a reader can actually see. */
  publishedLegacyRows: LegacyChapterRow[];
  /** Every unit key this edition holds — how adoption is recognised. */
  adoptedUnitKeys: Set<string>;
}): EffectiveChapter[] {
  const byOrder = new Map<number, EffectiveChapter>();
  const legacyByKey = legacyChaptersByUnitKey(input.publishedLegacyRows);
  const placed = new Set<string>();

  // The manifest decides every position it names.
  for (const p of input.nativePlacements) {
    const backing = legacyByKey.get(p.unit.unitKey);
    if (backing) {
      // Adopted legacy: the placement says WHERE, the Chapter row says WHICH
      // identity serves it. Its own `order` is not consulted — that column is
      // allowed to be stale, which is the whole point of Model A.
      placed.add(backing.id);
      byOrder.set(p.order, {
        order: p.order,
        readerRef: { kind: "chapter", id: backing.id },
        // Title and duration stay legacy for a legacy-backed chapter; this
        // change is about position, not metadata authority.
        title: backing.title,
        durationMinutes: backing.durationMinutes,
        partNumber: p.partNumber,
        partTitle: p.partTitle,
      });
      continue;
    }
    byOrder.set(p.order, {
      order: p.order,
      readerRef: { kind: "unit", id: p.unit.id },
      // The published version's own metadata — a native chapter has no
      // `Chapter` row to borrow a title from, and inventing one would mean
      // two places could disagree about what it is called.
      title: p.unitVersion.title,
      durationMinutes: p.unitVersion.durationMinutes,
      partNumber: p.partNumber,
      partTitle: p.partTitle,
    });
  }

  // Whatever the manifest did not account for. A chapter with no unit at all
  // has never been adopted, so its own order is still the only answer there is
  // — but only where the manifest is silent. Where both name a position, that
  // is a genuine structural conflict, and the published manifest is the
  // authority (Model A): letting the legacy row win here would make this list
  // contradict the reader, which resolves the manifest first.
  //
  // A chapter that IS adopted but has no placement was taken out of the
  // published structure deliberately. It is not unsynced, and reviving it from
  // a stale number would put content back into a book somebody removed it from.
  for (const c of input.publishedLegacyRows) {
    if (placed.has(c.id)) continue;
    const key = unitKeyFromLegacyChapterId(c.id);
    if (input.adoptedUnitKeys.has(key)) continue;
    // Fallback means fallback. If the published manifest already names this
    // position, it keeps it — `byOrder.set` here would overwrite the placement
    // and make this list disagree with the reader, which resolves the manifest
    // first. One position, one occupant, and the same one everywhere.
    if (byOrder.has(c.order)) continue;
    byOrder.set(c.order, {
      order: c.order,
      readerRef: { kind: "chapter", id: c.id },
      title: c.title,
      durationMinutes: c.durationMinutes,
      partNumber: c.partNumber ?? null,
      partTitle: c.partTitle ?? null,
    });
  }

  return [...byOrder.values()].sort((a, b) => a.order - b.order);
}

/**
 * The user's progress for an effective list, by each row's OWN identity.
 *
 * Two batched queries, not one per chapter. Legacy progress is keyed by
 * `chapterId` and native by `contentUnitId`; they are never converted into one
 * another, so a native chapter cannot inherit the status of the legacy chapter
 * that used to occupy its position.
 */
export async function progressForEffectiveChapters(
  db: Pick<PrismaClient, "userProgress">,
  input: { userId: string; chapters: EffectiveChapter[] },
): Promise<Map<string, { completedAt: Date | null }>> {
  const chapterIds = input.chapters
    .filter((c) => c.readerRef.kind === "chapter")
    .map((c) => c.readerRef.id);
  const unitIds = input.chapters
    .filter((c) => c.readerRef.kind === "unit")
    .map((c) => c.readerRef.id);

  const [legacy, native] = await Promise.all([
    chapterIds.length
      ? db.userProgress.findMany({
          where: { userId: input.userId, chapterId: { in: chapterIds } },
          select: { chapterId: true, completedAt: true },
        })
      : Promise.resolve([]),
    unitIds.length
      ? db.userProgress.findMany({
          where: { userId: input.userId, contentUnitId: { in: unitIds } },
          select: { contentUnitId: true, completedAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Keyed by the row's own id — the same id its `readerRef` carries, so a
  // lookup cannot land on the wrong chapter.
  const byId = new Map<string, { completedAt: Date | null }>();
  for (const p of legacy) {
    if (p.chapterId) byId.set(p.chapterId, { completedAt: p.completedAt });
  }
  for (const p of native) {
    if (p.contentUnitId) {
      byId.set(p.contentUnitId, { completedAt: p.completedAt });
    }
  }
  return byId;
}

/**
 * The effective structure for a book we have not already loaded chapters for.
 *
 * `getDetail` passes in the legacy rows it fetched anyway. The lifecycle
 * methods — starting a book, checking review eligibility — have no such query
 * to piggyback on, so this fetches exactly the fields the resolver needs and
 * hands them to the same function.
 *
 * The point is that there is ONE answer to "what chapters does this book
 * offer". A second algorithm here would drift from Book Detail, and the two
 * would disagree about which chapter a reader must finish before reviewing.
 */
export async function loadEffectiveChapters(
  db: Db & Pick<PrismaClient, "chapter">,
  book: { id: string; slug: string },
): Promise<EffectiveChapter[]> {
  const legacyChapters = await db.chapter.findMany({
    // Published only, matching the include Book Detail uses. An unpublished
    // row still BLOCKS its position from going native — that rule lives in
    // `resolveEffectiveChapters`, which reads occupancy separately.
    where: { bookId: book.id, isPublished: true },
    orderBy: { order: "asc" },
    select: {
      id: true,
      order: true,
      title: true,
      durationMinutes: true,
      partNumber: true,
      partTitle: true,
    },
  });
  return resolveEffectiveChapters(db, {
    bookId: book.id,
    bookSlug: book.slug,
    legacyChapters,
  });
}

/**
 * Which of these chapters the user has STARTED.
 *
 * `UserProgress` cannot answer this: `completedAt` is non-null with a default,
 * so a row there means finished, full stop. Started lives in `ReadingSession`,
 * which is what the reader actually writes as somebody scrolls.
 *
 * Same batching and the same keying as `progressForEffectiveChapters` — two
 * queries whatever the length of the book, each row keyed by its own identity
 * so a native chapter cannot inherit the session of the legacy chapter whose
 * position it took.
 */
export async function sessionsForEffectiveChapters(
  db: Pick<PrismaClient, "readingSession">,
  input: { userId: string; chapters: EffectiveChapter[] },
): Promise<Set<string>> {
  const chapterIds = input.chapters
    .filter((c) => c.readerRef.kind === "chapter")
    .map((c) => c.readerRef.id);
  const unitIds = input.chapters
    .filter((c) => c.readerRef.kind === "unit")
    .map((c) => c.readerRef.id);

  const [legacy, native] = await Promise.all([
    chapterIds.length
      ? db.readingSession.findMany({
          where: { userId: input.userId, chapterId: { in: chapterIds } },
          select: { chapterId: true },
        })
      : Promise.resolve([]),
    unitIds.length
      ? db.readingSession.findMany({
          where: { userId: input.userId, contentUnitId: { in: unitIds } },
          select: { contentUnitId: true },
        })
      : Promise.resolve([]),
  ]);

  const started = new Set<string>();
  for (const s of legacy) if (s.chapterId) started.add(s.chapterId);
  for (const s of native) if (s.contentUnitId) started.add(s.contentUnitId);
  return started;
}

/** Where a reader should resume, and what told us so. */
export interface ContinueCandidate {
  readerRef: ReaderChapterRef;
  /** When that chapter was last seen (or completed, on the fallback path). */
  at: Date;
  /** Internal: which table answered. Not exposed publicly. */
  source: "session" | "historical-completion";
}

/**
 * The chapter a reader should resume, by identity.
 *
 * `ReadingSession` is the authority, because it is what "I was reading this"
 * means — written when the reader opens a chapter and refreshed as they go.
 * Recency is `lastSeenAt`, which only tells the truth because the reader now
 * updates it on reopen.
 *
 * `UserProgress` is a fallback and nothing more. It answers "finished", not
 * "was here", so consulting it first would resume the chapter somebody most
 * recently COMPLETED rather than the one they are in. It exists here only for
 * history predating sessions, where it is the sole surviving evidence.
 *
 * Scoped to the chapters the book CURRENTLY offers, so a session pointing at a
 * retired unit is skipped rather than followed — a stale identity must not
 * become a dead link.
 *
 * Never derived from a percentage, a chapter count, or a stored order: none of
 * those name a chapter.
 */
export async function continueCandidateForEffectiveChapters(
  db: Pick<PrismaClient, "readingSession" | "userProgress">,
  input: { userId: string; chapters: EffectiveChapter[] },
): Promise<ContinueCandidate | null> {
  const chapterIds = input.chapters
    .filter((c) => c.readerRef.kind === "chapter")
    .map((c) => c.readerRef.id);
  const unitIds = input.chapters
    .filter((c) => c.readerRef.kind === "unit")
    .map((c) => c.readerRef.id);
  if (chapterIds.length === 0 && unitIds.length === 0) return null;

  const scope = [
    ...(chapterIds.length ? [{ chapterId: { in: chapterIds } }] : []),
    ...(unitIds.length ? [{ contentUnitId: { in: unitIds } }] : []),
  ];

  const [session] = await db.readingSession.findMany({
    where: { userId: input.userId, OR: scope },
    orderBy: { lastSeenAt: "desc" },
    take: 1,
    select: { chapterId: true, contentUnitId: true, lastSeenAt: true },
  });
  if (session) {
    const ref = refOf(session);
    if (ref)
      return { readerRef: ref, at: session.lastSeenAt, source: "session" };
  }

  // Only now, and only for rows that predate sessions entirely.
  const [done] = await db.userProgress.findMany({
    where: { userId: input.userId, OR: scope },
    orderBy: { completedAt: "desc" },
    take: 1,
    select: { chapterId: true, contentUnitId: true, completedAt: true },
  });
  if (done) {
    const ref = refOf(done);
    if (ref) {
      return {
        readerRef: ref,
        at: done.completedAt,
        source: "historical-completion",
      };
    }
  }
  return null;
}

function refOf(row: {
  chapterId: string | null;
  contentUnitId: string | null;
}): ReaderChapterRef | null {
  if (row.chapterId) return { kind: "chapter", id: row.chapterId };
  if (row.contentUnitId) return { kind: "unit", id: row.contentUnitId };
  return null;
}
