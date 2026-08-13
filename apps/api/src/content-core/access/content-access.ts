import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";

/**
 * CC-6E — content access policy (pure, server-owned, single source of truth).
 *
 * Before CC-6E the `/api/content` Content Core endpoints (manifest, read unit,
 * read marks) only carried JwtAuthGuard — they did NOT apply the FREE/PRO
 * entitlement that `/api/lector` enforces. Since the manifest hands out
 * editionKey + unitKey, a FREE user could use those keys to fetch PRO content
 * directly. This module gives every content surface — lector, Content Core read,
 * marks read, highlight/annotation create — the SAME decision.
 *
 * The gate is exactly the lector gate: the first chapter of every book is a free
 * preview; any later chapter of a PRO book is denied to FREE. There is ONE copy
 * of this condition (`assertContentAccess`) — no surface re-implements it.
 *
 * Decisions are identical for `source=legacy` and `source=content-core`, so
 * there is no path that switches source to dodge a 403.
 *
 * ── #580 ──────────────────────────────────────────────────────────────────
 *
 * Access used to be answered entirely out of legacy rows: the editionKey was
 * assumed to end in `-1e`, the prefix was assumed to be a `Book.slug`, the
 * unitKey was assumed to be `uuidv5(Chapter.id)`, and "free" meant
 * `Chapter.order === 1`. All four are true only while every unit came from a
 * legacy Chapter — which stops being true the moment Content Studio can create
 * one.
 *
 * Content Core now owns both facts itself: `Edition.accessPlan` and
 * `ContentUnit.isFreePreview`. The legacy path survives as a fallback for
 * editions the backfill has not derived yet, and only for those.
 */

/**
 * Where every content surface resolves to for the entitlement decision.
 *
 * `bookId` is nullable since #580: a pure Content Core unit has no legacy Book
 * row, and nothing in the gate ever read it — it is kept only for callers that
 * already had it.
 */
export interface ContentEntitlementTarget {
  bookId: string | null;
  bookPlan: string;
  isFreePreview: boolean;
}

/**
 * THE gate. The only place the FREE/PRO condition lives.
 *
 * It now asks whether the unit IS the free preview rather than whether it sits
 * first. Same decision for every book that exists today — the derivation below
 * makes sure of that — but it no longer breaks when a chapter moves, which is
 * what #580 is clearing the way for.
 */
export function assertContentAccess(input: {
  userPlan: string;
  bookPlan: string;
  isFreePreview: boolean;
}): void {
  if (
    input.bookPlan === "PRO" &&
    !input.isFreePreview &&
    input.userPlan === "FREE"
  ) {
    throw new ForbiddenException("PRO_REQUIRED");
  }
}

/**
 * The ONE place that turns a position into a preview designation.
 *
 * Legacy content has no designation — only an order — so the two have to be
 * reconciled somewhere. Doing it here, once, is what stops `order === 1` from
 * reappearing in the backfill, the ingest and the resolver as three independent
 * copies that can drift.
 *
 * Used when deriving native metadata from existing books, and by the legacy
 * fallback below. Pure-core authoring will set the designation directly and
 * never call this.
 */
export function isFreePreviewByPosition(order: number): boolean {
  return order === 1;
}

/**
 * The narrow Prisma surface the resolvers need — stubbable in unit tests, and
 * satisfied by a `$transaction` client so a caller can gate inside its own
 * transaction (CC-7.4C).
 */
export type AccessDb = Pick<
  PrismaClient,
  | "book"
  | "chapter"
  | "chapterBlock"
  | "contentBlock"
  | "contentUnit"
  | "edition"
>;

/** Resolve `bookId + plan` from a book slug (manifest gate + book-level checks). */
export async function resolveBookTarget(
  db: AccessDb,
  bookSlug: string,
): Promise<{ bookId: string; bookPlan: string }> {
  const book = await db.book.findUnique({
    where: { slug: bookSlug },
    select: { id: true, plan: true },
  });
  if (!book) throw new NotFoundException("BOOK_NOT_FOUND");
  return { bookId: book.id, bookPlan: book.plan };
}

/**
 * Resolve the entitlement target for a Content Core `(editionKey, unitKey)`.
 * Mirrors the legacy read resolution EXACTLY (edition slug → book, unitKey →
 * chapter via uuidv5) so the same keys map to the same book/chapter regardless
 * of `source`. Fail-closed: an unknown edition/unit throws rather than allowing.
 */
export async function resolveUnitTarget(
  db: AccessDb,
  editionKey: string,
  unitKey: string,
): Promise<ContentEntitlementTarget> {
  // The edition is found by its KEY, not by parsing a suffix out of it. That
  // single change is what lets an edition be called anything at all.
  const edition = await db.edition.findUnique({
    where: { editionKey },
    select: { id: true, slug: true, accessPlan: true },
  });
  if (!edition) throw new NotFoundException("EDITION_NOT_FOUND");

  if (edition.accessPlan !== null) {
    // Native path: Content Core answers entirely from its own rows. No Book, no
    // Chapter, no assumption about how the key is spelled.
    const unit = await db.contentUnit.findFirst({
      where: { editionId: edition.id, unitKey },
      select: { isFreePreview: true },
    });
    if (!unit) throw new NotFoundException("UNIT_NOT_FOUND");
    return {
      bookId: null,
      bookPlan: edition.accessPlan,
      isFreePreview: unit.isFreePreview,
    };
  }

  // `accessPlan === null` means Content Core has not taken this edition's
  // entitlement over yet — and plan and preview transfer TOGETHER. Reading
  // `isFreePreview` here would be reading a column that was never derived:
  // it defaults to false, so every chapter of an un-migrated edition would
  // silently lose its free preview. The migration is what flips ownership.
  return resolveUnitTargetFromLegacy(db, edition.slug, unitKey);
}

/**
 * The transitional path, for editions the backfill has not derived yet.
 *
 * Deliberately identical to the pre-#580 behaviour, including the legacy
 * `order === 1` rule, so an un-derived edition decides exactly what it decided
 * before this change. It reads the edition's own `slug` rather than re-deriving
 * one from the key — the suffix assumption is gone even here.
 *
 * DELETABLE once every Edition row has a non-null `accessPlan`. See the
 * deprecation note in the PR body.
 */
async function resolveUnitTargetFromLegacy(
  db: AccessDb,
  editionSlug: string,
  unitKey: string,
): Promise<ContentEntitlementTarget> {
  const book = await db.book.findUnique({
    where: { slug: editionSlug },
    select: { id: true, plan: true },
  });
  if (!book) throw new NotFoundException("EDITION_NOT_FOUND");

  const chapters = await db.chapter.findMany({
    where: { bookId: book.id },
    select: { id: true, order: true },
  });
  const chapter = chapters.find(
    (c) => unitKeyFromLegacyChapterId(c.id) === unitKey,
  );
  // A unit whose key doesn't map to a chapter of this book gets no access —
  // never fall back to a looser check to serve it.
  if (!chapter) throw new NotFoundException("UNIT_NOT_FOUND");
  return {
    bookId: book.id,
    bookPlan: book.plan,
    isFreePreview: isFreePreviewByPosition(chapter.order),
  };
}

/** Resolve the entitlement target from a legacy ChapterBlock id. */
async function resolveByLegacyBlockId(
  db: AccessDb,
  blockId: string,
): Promise<ContentEntitlementTarget> {
  const block = await db.chapterBlock.findUnique({
    where: { id: blockId },
    select: {
      chapter: {
        select: {
          id: true,
          order: true,
          bookId: true,
          book: { select: { plan: true, slug: true } },
        },
      },
    },
  });
  if (!block) throw new NotFoundException("BLOCK_NOT_FOUND");

  // Preview follows the chapter's IDENTITY, not the number beside it. Reaching
  // a chapter through one of its blocks must not produce a different answer
  // from reaching it through its unit key — a caller choosing `blockId` over
  // `blockKey` would otherwise get a different entitlement decision for the
  // same content.
  const unit = await adoptedUnitFor(db, {
    bookSlug: block.chapter.book.slug,
    chapterId: block.chapter.id,
  });

  return {
    bookId: block.chapter.bookId,
    bookPlan: block.chapter.book.plan,
    isFreePreview:
      unit?.isFreePreview ?? isFreePreviewByPosition(block.chapter.order),
  };
}

/**
 * The `ContentUnit` a legacy chapter was adopted as, if any.
 *
 * The one place that answers "has Content Core taken this chapter over", so a
 * legacy block, a unit key and the reader cannot disagree about it. Adoption is
 * an identity question — `uuidv5(chapter.id)` — never a positional one.
 *
 * Ownership is per EDITION, though: an edition whose `accessPlan` is still null
 * has units that predate the column, whose `isFreePreview` defaults to false
 * and was never derived from anything. Trusting it there would revoke the free
 * preview of every un-migrated book.
 */
async function adoptedUnitFor(
  db: AccessDb,
  input: { bookSlug: string; chapterId: string },
): Promise<{ isFreePreview: boolean } | null> {
  const edition = await db.edition.findFirst({
    where: { slug: input.bookSlug },
    select: { id: true, accessPlan: true },
  });
  // Same ownership switch as `resolveUnitTarget`: until an edition is owned,
  // its units' `isFreePreview` has never been derived and means nothing.
  if (!edition || edition.accessPlan === null) return null;
  return db.contentUnit.findFirst({
    where: {
      editionId: edition.id,
      unitKey: unitKeyFromLegacyChapterId(input.chapterId),
    },
    select: { isFreePreview: true },
  });
}

/**
 * Resolve the entitlement target for a mark write `{ blockKey?, blockId? }`.
 * Knowing a blockKey grants nothing: the key is resolved to its book/chapter and
 * the SAME gate is applied. A legacy `blockId` resolves directly; a `blockKey`
 * resolves via its ContentBlock's legacy binding (backfilled blocks) or, for a
 * pure Content Core block, via its unit's edition + unitKey.
 */
export async function resolveWriteTarget(
  db: AccessDb,
  input: { blockKey?: string; blockId?: string },
): Promise<ContentEntitlementTarget> {
  if (input.blockKey) {
    const cb = await db.contentBlock.findUnique({
      where: { blockKey: input.blockKey },
      select: { legacyBlockId: true, unitId: true },
    });
    if (!cb) throw new NotFoundException("BLOCK_NOT_FOUND");
    if (cb.legacyBlockId) return resolveByLegacyBlockId(db, cb.legacyBlockId);
    // Pure Content Core block → resolve via its unit's edition + unitKey.
    const unit = await db.contentUnit.findUnique({
      where: { id: cb.unitId },
      select: { editionId: true, unitKey: true },
    });
    if (!unit) throw new NotFoundException("BLOCK_NOT_FOUND");
    const edition = await db.edition.findUnique({
      where: { id: unit.editionId },
      select: { editionKey: true },
    });
    if (!edition) throw new NotFoundException("BLOCK_NOT_FOUND");
    return resolveUnitTarget(db, edition.editionKey, unit.unitKey);
  }
  if (input.blockId) return resolveByLegacyBlockId(db, input.blockId);
  throw new BadRequestException("ANCHOR_MISSING_TARGET");
}
