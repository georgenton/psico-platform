import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";
// The SAME constant the read adapter and the manifest derive legacy edition
// keys with. Imported rather than repeated so the gate cannot drift from the
// surface it gates; `read/content-read` imports nothing from here, so this
// introduces no cycle.
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
 * El código de dominio de la negativa.
 *
 * Viaja en `code`, no en `message`. Antes se lanzaba como cadena suelta, que el
 * filtro coloca en `message` y deja `code` en el genérico `FORBIDDEN`: un
 * cliente que conmute por `code` no podía distinguir «hazte Pro» de «esto no es
 * tuyo», y el único dato que los separaba era un texto. La forma de objeto es
 * la que el proyecto ya usa para sus errores de dominio. Ver #736.
 */
export const PRO_REQUIRED = "PRO_REQUIRED";

/**
 * LA condición. Una sola expresión para las dos preguntas que hay que
 * responder sobre un contenido:
 *
 *   · ¿puedo abrirlo?        → `assertContentAccess`, que lanza
 *   · ¿lo pinto bloqueado?   → esta, que devuelve un booleano
 *
 * Tenerlas separadas fue exactamente el fallo de #736: la lista de capítulos se
 * calculaba su propia respuesta con otros datos y decía que sí estaba bloqueado
 * el capítulo que el lector servía sin problema.
 */
export function isContentLockedByPlan(input: {
  userPlan: string;
  bookPlan: string;
  isFreePreview: boolean;
}): boolean {
  return (
    input.bookPlan === "PRO" &&
    !input.isFreePreview &&
    input.userPlan === "FREE"
  );
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
  if (isContentLockedByPlan(input)) {
    throw new ForbiddenException({
      code: PRO_REQUIRED,
      message: PRO_REQUIRED,
    });
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

/**
 * Resolve `bookId + plan` from a book slug (manifest gate + book-level checks).
 *
 * Y la publicación, que faltaba. Esta función es la puerta del manifiesto de
 * Content Core y del manifiesto de medios, y comprobaba existencia y plan
 * pero no si el libro estaba publicado: un libro retirado devolvía su
 * manifiesto por la dirección a cualquiera que la supiera. Medido por HTTP en
 * `books-availability.e2e-spec.ts`.
 *
 * El filtro es seguro aquí porque esta función YA exige una fila `Book`: es
 * el camino legado, no el nativo. Una edición nativa independiente no pasa por
 * aquí y no se ve afectada — su publicación la decide el estado de su
 * revisión, que es otra cosa y vive en otro sitio.
 */
export async function resolveBookTarget(
  db: AccessDb,
  bookSlug: string,
): Promise<{ bookId: string; bookPlan: string }> {
  const book = await db.book.findFirst({
    where: { slug: bookSlug, isPublished: true },
    select: { id: true, plan: true },
  });
  if (!book) throw new NotFoundException("BOOK_NOT_FOUND");
  return { bookId: book.id, bookPlan: book.plan };
}

/**
 * Resolve the entitlement target for a Content Core `(editionKey, unitKey)`.
 * Mirrors the legacy read resolution EXACTLY (edition slug → book, unitKey →
 * chapter via uuidv5) so the same keys map to the same book/chapter regardless
 * of `source` — including the case the read adapter calls legacy, where there
 * is no Edition row to read a slug from. Fail-closed: an unknown edition/unit
 * throws rather than allowing.
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
  // No Edition row at all means Content Core never took this book over. The
  // READ adapter still serves it: `buildLegacyRead` derives the slug from the
  // key suffix and projects the book's ChapterBlocks. This gate claimed just
  // above to mirror that resolution exactly, and did not — so every chapter of
  // a never-backfilled book died here, and the web turned the 404 into
  // "contenido temporalmente no disponible" on chapters the reader was willing
  // to serve. Measured on `familias-ensambladas`: its free first chapter was
  // unreachable while the lector envelope returned it with six blocks.
  //
  // The suffix is consulted ONLY when no row exists, so an edition can still
  // be called anything: a key with no row and no derivable slug stays a 404.
  // And the derivation refuses when the BOOK already has an edition under some
  // other key — see `resolveUnitTargetFromKeySuffix`.
  if (!edition) return resolveUnitTargetFromKeySuffix(db, editionKey, unitKey);

  if (edition.accessPlan !== null) {
    // Native path: entitlement comes from Content Core's own rows. No Chapter,
    // no assumption about how the key is spelled.
    const unit = await db.contentUnit.findFirst({
      where: { editionId: edition.id, unitKey },
      select: { isFreePreview: true },
    });
    if (!unit) throw new NotFoundException("UNIT_NOT_FOUND");

    // ── Y la publicación del libro, cuando hay libro ────────────────────
    //
    // «Nativo» aquí NO quiere decir «sin `Book`». `accessPlan` lo escribe el
    // backfill a partir de `book.plan` (`backfill.ts`), y la migración
    // `20260810040000_content_core_native_entitlements` lo hizo para TODAS
    // las ediciones preexistentes, así que todo libro legado con backfill
    // entra por esta rama. Comprobado contra staging: las dos ediciones que
    // existen —incluida la obra que la decisión editorial retiene— tienen
    // `accessPlan` y revisión publicada.
    //
    // El resultado era que el gate del manifiesto cerraba la puerta y ESTA la
    // dejaba abierta para la misma edición: la lectura por `unitKey` servía
    // el texto completo de una obra retirada. El `unitKey` no es un secreto
    // —es `uuidv5` del id del capítulo con un espacio de nombres publicado en
    // este repositorio, y el propio lector lo entrega a todo cliente—, así
    // que «la clave la tenía quien abrió el libro mientras estaba publicado»
    // es precisamente el enlace que circuló.
    //
    // La consulta es por slug y TOLERA la ausencia: una edición nativa pura,
    // sin fila `Book`, no gana aquí ninguna exigencia nueva. Lo que gana la
    // edición adoptada es la misma respuesta que ya daban las otras puertas
    // sobre el mismo libro.
    const libro = await db.book.findUnique({
      where: { slug: edition.slug },
      select: { isPublished: true },
    });
    if (libro && !libro.isPublished) {
      // Opaca y del mismo tipo que una unidad inexistente: quien no tiene
      // derecho no debe poder distinguir «retirada» de «no existe».
      throw new NotFoundException("UNIT_NOT_FOUND");
    }

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
 * The target for a book Content Core holds NO edition row for.
 *
 * Mirrors `buildLegacyRead` exactly: same suffix, same slug, same uuidv5
 * chapter mapping, same `order === 1` preview rule — so the gate and the read
 * agree on which book and chapter a key names, which is the whole point of
 * this file's promise. Fail-closed at every step: a key that is not derivable,
 * a slug with no book, or a unit key that maps to no chapter of that book all
 * refuse rather than widening the check to serve something.
 *
 * DELETABLE together with `resolveUnitTargetFromLegacy`, once every book has
 * an Edition row (not merely every Edition row a non-null `accessPlan`).
 */
async function resolveUnitTargetFromKeySuffix(
  db: AccessDb,
  editionKey: string,
  unitKey: string,
): Promise<ContentEntitlementTarget> {
  if (!editionKey.endsWith(EDITION_KEY_SUFFIX)) {
    throw new NotFoundException("EDITION_NOT_FOUND");
  }
  const slug = editionKey.slice(0, -EDITION_KEY_SUFFIX.length);

  // The escape this closes: a book Content Core HAS adopted, under an edition
  // key that is not its slug plus the suffix. `findUnique` by the invented key
  // misses, and without this check the derivation below would answer for that
  // same book from the legacy tables — `Book.plan` and `order === 1` instead
  // of `Edition.accessPlan` and `ContentUnit.isFreePreview`. A caller could
  // then ask for `<slug>-1e` and be judged by the looser of the two policies.
  // Since the read adapter derives the same way, the content would follow.
  //
  // So the derivation is for books Content Core never took over AT ALL. If any
  // edition exists for the slug, its own key is the only way in.
  const adoptada = await db.edition.findFirst({
    where: { slug },
    select: { id: true },
  });
  if (adoptada) throw new NotFoundException("EDITION_NOT_FOUND");

  return resolveUnitTargetFromLegacy(db, slug, unitKey);
}

/**
 * The transitional path, for editions the backfill has not derived yet.
 *
 * Deliberately identical to the pre-#580 behaviour, including the legacy
 * `order === 1` rule, so an un-derived edition decides exactly what it decided
 * before this change. It takes the slug as an argument rather than deriving
 * one: its first caller reads the edition's own `slug`, so the suffix
 * assumption is gone on that path; `resolveUnitTargetFromKeySuffix` is the
 * only place that derives, and only when there is no row to read it from.
 *
 * DELETABLE once every book has an Edition row with a non-null `accessPlan`.
 * See the deprecation note in the PR body.
 */
async function resolveUnitTargetFromLegacy(
  db: AccessDb,
  editionSlug: string,
  unitKey: string,
): Promise<ContentEntitlementTarget> {
  // La publicación cuenta también por este camino. Es el respaldo legado —ya
  // exige una fila `Book`— y sin el filtro servía el texto de un libro
  // retirado a quien pidiera su unidad por la clave derivada. La negativa es
  // la misma que para una edición inexistente, a propósito.
  const book = await db.book.findFirst({
    where: { slug: editionSlug, isPublished: true },
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
