import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";
import { EDITION_KEY_SUFFIX } from "../read/content-read";

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
 * Decisions are identical for `source=legacy` and `source=content-core`: both
 * resolve to the same `(bookId, bookPlan, chapterOrder)` via the legacy chapter
 * mapping (a Content Core unitKey is `uuidv5(Chapter.id)`), so there is no path
 * that falls back to a different source to dodge a 403.
 */

/** Where every content surface can resolve to for the entitlement decision. */
export interface ContentEntitlementTarget {
  bookId: string;
  bookPlan: string;
  chapterOrder: number;
}

/**
 * THE gate. The only place the FREE/PRO condition lives. A PRO book's chapters
 * beyond the first are denied to FREE; chapter 1 is always a free preview.
 */
export function assertContentAccess(input: {
  userPlan: string;
  bookPlan: string;
  chapterOrder: number;
}): void {
  if (
    input.bookPlan === "PRO" &&
    input.chapterOrder > 1 &&
    input.userPlan === "FREE"
  ) {
    throw new ForbiddenException("PRO_REQUIRED");
  }
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
  if (!editionKey.endsWith(EDITION_KEY_SUFFIX)) {
    throw new NotFoundException("EDITION_NOT_FOUND");
  }
  const slug = editionKey.slice(0, -EDITION_KEY_SUFFIX.length);
  const book = await db.book.findUnique({
    where: { slug },
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
  return { bookId: book.id, bookPlan: book.plan, chapterOrder: chapter.order };
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
        select: { order: true, bookId: true, book: { select: { plan: true } } },
      },
    },
  });
  if (!block) throw new NotFoundException("BLOCK_NOT_FOUND");
  return {
    bookId: block.chapter.bookId,
    bookPlan: block.chapter.book.plan,
    chapterOrder: block.chapter.order,
  };
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
