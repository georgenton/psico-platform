import type { BlockKind, Prisma, PrismaClient } from "@prisma/client";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "./lib/block-key";
import { contentHash } from "./lib/content-hash";
import {
  estimateDurationMinutes,
  type ParsedBlock,
} from "./lib/test-edition-parser";
import { resolveEnvironment } from "../shared/psico-environment";

/**
 * Content Core — new-book bootstrap (test editions).
 *
 * The gap this closes: `ingestUnitV2` updates a unit inside an edition that
 * ALREADY has a published revision, and refuses to mint the first one
 * (`INGEST_REQUIRES_BASE_REVISION`); `backfillContentCore` promotes books that
 * already exist as legacy rows. Neither can create a book that isn't there yet,
 * and the legacy markdown ingest is permanently forbidden in production because
 * it cascade-deletes reader anchors. So a brand-new book had no path at all.
 *
 * This creates that first, COMPLETE state in ONE transaction: the legacy rows the
 * current reader routes still read (`Book` / `Chapter` / `ChapterBlock`), then the
 * Content Core rows derived from them, then a revision #1 containing EVERY chapter,
 * published last. Either the whole book exists or none of it does — a half-created
 * book would surface in the library as an unreadable shell.
 *
 * It is additive-only: no DELETE, no UPDATE of another book, and an existing slug
 * fails closed rather than overwriting. Replacing the text later is a separate,
 * non-destructive concern — `ingestUnitV2` mints a new revision per unit and
 * carries reader anchors forward. See docs/operations/book-test-edition-ingest.md.
 */

export const BOOK_SLUG_TAKEN = "BOOK_SLUG_ALREADY_EXISTS";
export const EDITION_KEY_TAKEN = "EDITION_KEY_ALREADY_EXISTS";
export const WORK_KEY_TAKEN = "WORK_KEY_ALREADY_EXISTS";
export const MANIFEST_INVALID = "MANIFEST_INVALID";
export const BOOTSTRAP_FORBIDDEN = "BOOK_BOOTSTRAP_FORBIDDEN";
export const BOOTSTRAP_EMPTY = "BOOTSTRAP_NO_CHAPTERS";
export const BOOTSTRAP_COUNT_MISMATCH = "BOOTSTRAP_COUNT_MISMATCH";
export const BOOTSTRAP_INPUT_INVALID = "BOOTSTRAP_INPUT_INVALID";
export const BOOTSTRAP_CHAPTER_MISMATCH = "BOOTSTRAP_CHAPTER_MISMATCH";
export const BOOTSTRAP_EMPTY_CHAPTER = "BOOTSTRAP_EMPTY_CHAPTER";
export const BOOK_AUTHOR_CONFLICT = "BOOK_AUTHOR_CONFLICT";
export const BOOK_CATEGORY_NOT_FOUND = "BOOK_CATEGORY_NOT_FOUND";

export interface BookManifestChapter {
  order: number;
  title?: string | null;
  file: string;
}

export interface BookManifest {
  slug: string;
  title: string;
  author: string;
  /** Catalog identity of the author. Resolved, never overwritten. */
  authorSlug: string;
  /** Must already exist — categories are curated, never auto-created here. */
  categorySlug: string;
  editionLabel: string;
  /** Free-form provenance marker, e.g. "OCR_UNFINALIZED". Documented, not schema-backed. */
  sourceQuality?: string | null;
  language?: string | null;
  chapters: BookManifestChapter[];
}

/** One chapter, already parsed. The library never touches the filesystem. */
export interface BootstrapChapter {
  order: number;
  title: string;
  blocks: ParsedBlock[];
}

export interface BootstrapInput {
  manifest: BookManifest;
  chapters: BootstrapChapter[];
}

export type AuthorStatus = "existing" | "will-create" | "conflict";

export interface BootstrapPlan {
  slug: string;
  slug_available: boolean;
  edition_key: string;
  edition_key_available: boolean;
  work_key: string;
  work_key_available: boolean;
  author_status: AuthorStatus;
  category_available: boolean;
  input_valid: boolean;
  input_error: string | null;
  chapter_count: number;
  nonempty_chapter_count: number;
  total_block_count: number;
  block_kind_counts: Record<string, number>;
  bootstrap_safe: boolean;
}

export interface BootstrapStats {
  bookId: string;
  editionId: string;
  revisionId: string;
  chapters: number;
  blocks: number;
  units: number;
  blockVersions: number;
  revisionUnits: number;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate an untrusted manifest object. Throws `MANIFEST_INVALID` — the CLI maps
 * errors to machine codes, so the message never carries manuscript text.
 */
export function parseBookManifest(raw: unknown): BookManifest {
  const bad = (): never => {
    throw new Error(MANIFEST_INVALID);
  };
  if (typeof raw !== "object" || raw === null) return bad();
  const m = raw as Record<string, unknown>;

  const str = (v: unknown, max: number): string => {
    if (typeof v !== "string") return bad();
    const s = v.trim();
    if (s.length === 0 || s.length > max) return bad();
    return s;
  };

  const slug = str(m.slug, 120);
  if (!SLUG_RE.test(slug)) bad();

  if (!Array.isArray(m.chapters) || m.chapters.length === 0) bad();
  const chapters = (m.chapters as unknown[]).map((c): BookManifestChapter => {
    if (typeof c !== "object" || c === null) return bad();
    const ch = c as Record<string, unknown>;
    if (
      typeof ch.order !== "number" ||
      !Number.isInteger(ch.order) ||
      ch.order < 1
    ) {
      bad();
    }
    return {
      order: ch.order as number,
      title: ch.title == null || ch.title === "" ? null : str(ch.title, 300),
      file: str(ch.file, 500),
    };
  });

  const orders = new Set(chapters.map((c) => c.order));
  if (orders.size !== chapters.length) bad();

  const authorSlug = str(m.authorSlug, 120);
  if (!SLUG_RE.test(authorSlug)) bad();
  const categorySlug = str(m.categorySlug, 120);
  if (!SLUG_RE.test(categorySlug)) bad();

  return {
    slug,
    title: str(m.title, 300),
    author: str(m.author, 200),
    authorSlug,
    categorySlug,
    editionLabel: str(m.editionLabel, 200),
    sourceQuality: m.sourceQuality == null ? null : str(m.sourceQuality, 100),
    language: m.language == null ? null : str(m.language, 20),
    chapters: chapters.sort((a, b) => a.order - b.order),
  };
}

const ALLOWED_BLOCK_KINDS = new Set([
  "PARAGRAPH",
  "HEADING",
  "QUOTE",
  "EXERCISE",
  "PAUSE",
  "VIDEO",
]);

/**
 * Validate the FULL input, not just the manifest. The library must not trust that
 * its caller assembled a coherent object: `bootstrapBook` runs this BEFORE opening
 * the transaction, so an invalid input writes exactly nothing — there is no
 * half-written book to clean up and no rollback to rely on.
 *
 * Throws a sanitized machine code; never echoes manuscript text.
 */
export function validateBootstrapInput(input: BootstrapInput): void {
  // Re-runs the untrusted-object checks even on a typed manifest: a caller can
  // build one by hand, and TypeScript is not present at runtime.
  const manifest = parseBookManifest(input.manifest);
  const chapters = input.chapters;

  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error(BOOTSTRAP_EMPTY);
  }

  const orders = chapters.map((c) => c.order);
  if (orders.some((o) => !Number.isInteger(o) || o < 1)) {
    throw new Error(BOOTSTRAP_INPUT_INVALID);
  }
  if (new Set(orders).size !== orders.length) {
    throw new Error(BOOTSTRAP_INPUT_INVALID);
  }

  // The manifest declares the book; `chapters` is what would actually be written.
  // A mismatch means one of the two is stale, and guessing which would ship a
  // book that is not the one the manifest describes.
  const declared = [...manifest.chapters.map((c) => c.order)].sort(
    (a, b) => a - b,
  );
  const received = [...orders].sort((a, b) => a - b);
  if (declared.length !== received.length) {
    throw new Error(BOOTSTRAP_CHAPTER_MISMATCH);
  }
  for (let i = 0; i < declared.length; i++) {
    if (declared[i] !== received[i]) {
      throw new Error(BOOTSTRAP_CHAPTER_MISMATCH);
    }
  }

  for (const ch of chapters) {
    if (typeof ch.title !== "string" || ch.title.trim().length === 0) {
      throw new Error(BOOTSTRAP_INPUT_INVALID);
    }
    if (!Array.isArray(ch.blocks) || ch.blocks.length === 0) {
      throw new Error(BOOTSTRAP_EMPTY_CHAPTER);
    }
    for (const b of ch.blocks) {
      if (!ALLOWED_BLOCK_KINDS.has(b.kind)) {
        throw new Error(BOOTSTRAP_INPUT_INVALID);
      }
      if (typeof b.content !== "string" || b.content.trim().length === 0) {
        throw new Error(BOOTSTRAP_INPUT_INVALID);
      }
    }
  }
}

export function workKeyFor(slug: string): string {
  return slug;
}

export function editionKeyFor(slug: string): string {
  // Same shape the backfill and the backfill CLI use, so a book bootstrapped
  // here is indistinguishable from a backfilled one downstream.
  return `${slug}-1e`;
}

/** An apply on a deployed box needs an explicit operator opt-in. */
export function assertBookBootstrapAllowed(env: {
  ALLOW_CONTENT_CORE_BOOK_INGEST?: string;
}): void {
  const environment = resolveEnvironment(); // throws on misconfigured boxes
  const deployed = environment === "production" || environment === "staging";
  if (deployed && env.ALLOW_CONTENT_CORE_BOOK_INGEST !== "on") {
    throw new Error(BOOTSTRAP_FORBIDDEN);
  }
}

/**
 * Read-only inspection. Reports whether the slug is free and what would be
 * written — metrics only, never block text.
 */
export async function planBookBootstrap(
  prisma: PrismaClient,
  input: BootstrapInput,
): Promise<BootstrapPlan> {
  const { manifest, chapters } = input;
  const editionKey = editionKeyFor(manifest.slug);
  const workKey = workKeyFor(manifest.slug);

  const [book, editionByKey, editionBySlug, work, author, category] =
    await Promise.all([
      prisma.book.findUnique({
        where: { slug: manifest.slug },
        select: { id: true },
      }),
      prisma.edition.findUnique({
        where: { editionKey },
        select: { id: true },
      }),
      prisma.edition.findUnique({
        where: { slug: manifest.slug },
        select: { id: true },
      }),
      prisma.work.findUnique({ where: { workKey }, select: { id: true } }),
      prisma.bookAuthor.findUnique({
        where: { slug: manifest.authorSlug },
        select: { id: true, name: true },
      }),
      prisma.bookCategory.findUnique({
        where: { slug: manifest.categorySlug },
        select: { id: true },
      }),
    ]);

  const kinds: Record<string, number> = {};
  let total = 0;
  let nonEmpty = 0;
  for (const ch of chapters) {
    if (ch.blocks.length > 0) nonEmpty += 1;
    for (const b of ch.blocks) {
      kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
      total += 1;
    }
  }

  let inputValid = true;
  let inputError: string | null = null;
  try {
    validateBootstrapInput(input);
  } catch (err) {
    inputValid = false;
    inputError = sanitizeBootstrapError(err);
  }

  const slugAvailable = book === null && editionBySlug === null;
  const editionAvailable = editionByKey === null;
  const workAvailable = work === null;
  // An author row with the same slug but a different name is a collision, not a
  // reuse: silently attaching this book to it would misattribute the work.
  const authorStatus: AuthorStatus =
    author === null
      ? "will-create"
      : author.name === manifest.author
        ? "existing"
        : "conflict";
  const categoryAvailable = category !== null;

  return {
    slug: manifest.slug,
    slug_available: slugAvailable,
    edition_key: editionKey,
    edition_key_available: editionAvailable,
    work_key: workKey,
    work_key_available: workAvailable,
    author_status: authorStatus,
    category_available: categoryAvailable,
    input_valid: inputValid,
    input_error: inputError,
    chapter_count: chapters.length,
    nonempty_chapter_count: nonEmpty,
    total_block_count: total,
    block_kind_counts: kinds,
    bootstrap_safe:
      slugAvailable &&
      editionAvailable &&
      workAvailable &&
      authorStatus !== "conflict" &&
      categoryAvailable &&
      inputValid,
  };
}

/**
 * Create the book atomically. Fails closed on an existing slug — this never
 * deletes or overwrites an existing book, so a mistaken re-run cannot destroy
 * reader marks.
 */
export async function bootstrapBook(
  prisma: PrismaClient,
  input: BootstrapInput,
  opts: {
    env?: { ALLOW_CONTENT_CORE_BOOK_INGEST?: string };
    throwAfterChapters?: number;
  } = {},
): Promise<BootstrapStats> {
  assertBookBootstrapAllowed(opts.env ?? process.env);
  // Everything checkable without the database is checked here, before a single
  // row is touched — an invalid input must not depend on rollback to be harmless.
  validateBootstrapInput(input);

  const { manifest } = input;
  const chapters = [...input.chapters].sort((a, b) => a.order - b.order);

  const editionKey = editionKeyFor(manifest.slug);
  const workKey = workKeyFor(manifest.slug);
  const language = manifest.language ?? "es";

  return prisma.$transaction(
    async (tx) => {
      // Fail closed INSIDE the transaction: the pre-flight plan can go stale
      // between inspection and apply, and the unique indexes are the real
      // authority. A duplicate must never reach a partial write.
      if (
        await tx.book.findUnique({
          where: { slug: manifest.slug },
          select: { id: true },
        })
      ) {
        throw new Error(BOOK_SLUG_TAKEN);
      }
      if (
        await tx.edition.findUnique({
          where: { slug: manifest.slug },
          select: { id: true },
        })
      ) {
        throw new Error(BOOK_SLUG_TAKEN);
      }
      if (
        await tx.edition.findUnique({
          where: { editionKey },
          select: { id: true },
        })
      ) {
        throw new Error(EDITION_KEY_TAKEN);
      }
      // A bootstrap CREATES a work; it never edits one. An upsert here would let
      // ingesting a new book quietly retitle an unrelated existing work.
      if (
        await tx.work.findUnique({ where: { workKey }, select: { id: true } })
      ) {
        throw new Error(WORK_KEY_TAKEN);
      }

      // ── 0. Catalog identity — resolved, never overwritten ───────────────────
      // The author is created only when absent; a same-slug row under a different
      // name is a collision, and attaching this book to it would misattribute the
      // work to someone else. Categories are curated editorially, so a missing one
      // is an operator error to fix, not a row to invent.
      const existingAuthor = await tx.bookAuthor.findUnique({
        where: { slug: manifest.authorSlug },
      });
      if (existingAuthor && existingAuthor.name !== manifest.author) {
        throw new Error(BOOK_AUTHOR_CONFLICT);
      }
      const author =
        existingAuthor ??
        (await tx.bookAuthor.create({
          data: { slug: manifest.authorSlug, name: manifest.author },
        }));

      const category = await tx.bookCategory.findUnique({
        where: { slug: manifest.categorySlug },
      });
      if (!category) throw new Error(BOOK_CATEGORY_NOT_FOUND);

      const totalDuration = chapters.reduce(
        (n, c) => n + estimateDurationMinutes(c.blocks),
        0,
      );

      // ── 1. Legacy rows — what the current reader routes still read ──────────
      // The edition label doubles as the provenance marker: there is no
      // `sourceQuality` column and adding one for a test edition would be schema
      // churn for a transient state (§6 of the brief).
      const book = await tx.book.create({
        data: {
          slug: manifest.slug,
          title: manifest.title,
          subtitle: manifest.editionLabel,
          description: manifest.sourceQuality
            ? `${manifest.editionLabel} · ${manifest.sourceQuality}`
            : manifest.editionLabel,
          language,
          totalChapters: chapters.length,
          durationMinutes: totalDuration,
          isPublished: true,
          publishedAt: new Date(),
          authorId: author.id,
          categoryId: category.id,
        },
      });

      const work = await tx.work.create({
        data: {
          workKey,
          title: manifest.title,
          authorName: manifest.author,
        },
      });

      const edition = await tx.edition.create({
        data: {
          workId: work.id,
          editionKey,
          slug: manifest.slug,
          label: manifest.editionLabel,
          language: "es-419",
        },
      });

      const revision = await tx.revision.create({
        data: {
          editionId: edition.id,
          number: 1,
          status: "DRAFT",
          note: `bootstrap:${manifest.sourceQuality ?? "test-edition"}`,
        },
      });

      const stats: BootstrapStats = {
        bookId: book.id,
        editionId: edition.id,
        revisionId: revision.id,
        chapters: 0,
        blocks: 0,
        units: 0,
        blockVersions: 0,
        revisionUnits: 0,
      };

      for (const ch of chapters) {
        const durationMinutes = estimateDurationMinutes(ch.blocks);

        const chapter = await tx.chapter.create({
          data: {
            bookId: book.id,
            order: ch.order,
            title: ch.title,
            durationMinutes,
            isPublished: true,
          },
        });
        stats.chapters += 1;

        // ── 2. Content Core identity, derived from the legacy ids ────────────
        // Never invented here: `unitKey`/`blockKey` come from the CC-1 helpers so
        // a bootstrapped book is byte-identical in identity to a backfilled one.
        const unit = await tx.contentUnit.create({
          data: {
            editionId: edition.id,
            unitKey: unitKeyFromLegacyChapterId(chapter.id),
          },
        });
        stats.units += 1;

        const unitVersion = await tx.contentUnitVersion.create({
          data: {
            unitId: unit.id,
            title: ch.title,
            durationMinutes,
          },
        });

        let order = 0;
        for (const b of ch.blocks) {
          const kind = b.kind as BlockKind;
          const metaInput =
            b.meta == null ? {} : { meta: b.meta as Prisma.InputJsonValue };

          const chapterBlock = await tx.chapterBlock.create({
            data: {
              chapterId: chapter.id,
              order,
              kind,
              content: b.content,
              ...metaInput,
            },
          });
          stats.blocks += 1;

          const contentBlock = await tx.contentBlock.create({
            data: {
              blockKey: blockKeyFromLegacyId(chapterBlock.id),
              unitId: unit.id,
              legacyBlockId: chapterBlock.id,
            },
          });

          await tx.blockVersion.create({
            data: {
              contentBlockId: contentBlock.id,
              unitVersionId: unitVersion.id,
              order,
              kind,
              content: b.content,
              contentHash: contentHash(b.content),
              ...metaInput,
            },
          });
          stats.blockVersions += 1;
          order += 1;
        }

        await tx.revisionUnit.create({
          data: {
            revisionId: revision.id,
            unitId: unit.id,
            unitVersionId: unitVersion.id,
            order: ch.order,
          },
        });
        stats.revisionUnits += 1;

        /* istanbul ignore next -- rollback probe, test-only */
        if (
          opts.throwAfterChapters != null &&
          stats.chapters >= opts.throwAfterChapters
        ) {
          throw new Error("INJECTED_TEST_FAILURE");
        }
      }

      // ── 3. The first revision must be COMPLETE before it is published ───────
      // A revision missing a unit would serve a book with a hole in it, and the
      // reader would read that hole as "this chapter does not exist".
      if (stats.revisionUnits !== chapters.length) {
        throw new Error(BOOTSTRAP_COUNT_MISMATCH);
      }

      await tx.revision.update({
        where: { id: revision.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      await tx.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: revision.id },
      });

      return stats;
    },
    { timeout: 60_000 },
  );
}

const PUBLIC_ERROR_CODES = [
  BOOK_SLUG_TAKEN,
  EDITION_KEY_TAKEN,
  WORK_KEY_TAKEN,
  MANIFEST_INVALID,
  BOOTSTRAP_FORBIDDEN,
  BOOTSTRAP_EMPTY,
  BOOTSTRAP_COUNT_MISMATCH,
  BOOTSTRAP_INPUT_INVALID,
  BOOTSTRAP_CHAPTER_MISMATCH,
  BOOTSTRAP_EMPTY_CHAPTER,
  BOOK_AUTHOR_CONFLICT,
  BOOK_CATEGORY_NOT_FOUND,
  "MISSING_MANIFEST",
  "MISSING_DATABASE_URL",
  "CHAPTER_FILE_UNREADABLE",
];

export const BOOTSTRAP_INTERNAL_ERROR = "BOOTSTRAP_INTERNAL_ERROR";

/** Only a whitelisted machine code ever reaches stdout — never manuscript text. */
export function sanitizeBootstrapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  return PUBLIC_ERROR_CODES.includes(msg) ? msg : BOOTSTRAP_INTERNAL_ERROR;
}

export function serializeBootstrapPlan(plan: BootstrapPlan): string {
  const kinds = Object.entries(plan.block_kind_counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  return [
    `slug=${plan.slug}`,
    `slug_available=${plan.slug_available}`,
    `edition_key=${plan.edition_key}`,
    `edition_key_available=${plan.edition_key_available}`,
    `work_key=${plan.work_key}`,
    `work_key_available=${plan.work_key_available}`,
    `author_status=${plan.author_status}`,
    `category_available=${plan.category_available}`,
    `input_valid=${plan.input_valid}`,
    `input_error=${plan.input_error ?? "none"}`,
    `chapter_count=${plan.chapter_count}`,
    `nonempty_chapter_count=${plan.nonempty_chapter_count}`,
    `total_block_count=${plan.total_block_count}`,
    `block_kind_counts=${kinds}`,
    `bootstrap_safe=${plan.bootstrap_safe}`,
  ].join("\n");
}
