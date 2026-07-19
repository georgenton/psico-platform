import type { PrismaClient } from "@prisma/client";
import { CHAPTER_CONCEPTS } from "@psico/types";
import { backfillContentCore, type BackfillStats } from "./backfill";
import { contentHash } from "./lib/content-hash";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "./lib/block-key";

/**
 * Content Core — CC-6F targeted backfill runner (operational surface ONLY).
 *
 * The approved CC-3 library (`backfillContentCore`) stays untouched: it is
 * atomic per Book, idempotent, zero-DELETE, drift-throwing and publish-last.
 * This module adds the safe way to OPERATE it against production:
 *
 *   - one Work at a time (`--book-slug`), never the whole catalog;
 *   - dry-run by default — `--apply` must be explicit;
 *   - in production the apply additionally requires
 *     `ALLOW_CONTENT_CORE_BACKFILL=on` (BACKFILL_FORBIDDEN otherwise);
 *   - the dry-run performs ZERO database writes and reports metrics only —
 *     never block text, titles beyond the catalog, emails, ids or quotes.
 *
 * Scoping strategy: the library reads its work-list through ONE call site
 * (`prisma.book.findMany`). `scopePrismaToBook` wraps the client in a Proxy
 * that narrows that call to the requested slug and passes everything else
 * through untouched (the per-book work happens on the interactive-transaction
 * client `tx`, which is never intercepted). The only-requested-slug guarantee
 * is pinned by a pg-spec so a future extra call site cannot silently widen
 * the scope.
 */

export const BOOK_NOT_FOUND = "BOOK_NOT_FOUND";
export const BACKFILL_FORBIDDEN = "BACKFILL_FORBIDDEN";

// ── CLI arguments ────────────────────────────────────────────────────────────

export interface RunnerArgs {
  bookSlug: string;
  /** True ONLY when --apply was passed explicitly. Dry-run otherwise. */
  apply: boolean;
}

export function parseRunnerArgs(argv: string[]): RunnerArgs {
  let bookSlug = "";
  let apply = false;
  for (const arg of argv) {
    if (arg.startsWith("--book-slug="))
      bookSlug = arg.slice("--book-slug=".length);
    else if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false; // explicit no-op: dry-run IS the default
  }
  if (!bookSlug) {
    throw new Error("MISSING_BOOK_SLUG (use --book-slug=<slug>)");
  }
  return { bookSlug, apply };
}

// ── production gate ──────────────────────────────────────────────────────────

/**
 * An apply against a production database is refused unless ops explicitly set
 * ALLOW_CONTENT_CORE_BACKFILL=on. Dry-runs are always allowed (read-only).
 */
export function assertBackfillAllowed(env: {
  NODE_ENV?: string;
  ALLOW_CONTENT_CORE_BACKFILL?: string;
}): void {
  if (
    env.NODE_ENV === "production" &&
    env.ALLOW_CONTENT_CORE_BACKFILL !== "on"
  ) {
    throw new Error(BACKFILL_FORBIDDEN);
  }
}

// ── prisma scoping (no library change) ───────────────────────────────────────

export function scopePrismaToBook(
  prisma: PrismaClient,
  bookSlug: string,
): PrismaClient {
  const scopedBook = new Proxy(prisma.book, {
    get(target, prop, receiver) {
      if (prop === "findMany") {
        return (args: Record<string, unknown> = {}) =>
          target.findMany({
            ...args,
            where: { ...((args.where as object) ?? {}), slug: bookSlug },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return new Proxy(prisma, {
    get(target, prop, receiver) {
      if (prop === "book") return scopedBook;
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}

// ── dry-run ──────────────────────────────────────────────────────────────────

/** Metrics-only report. NO field may carry text content, emails or raw ids. */
export interface DryRunReport {
  book_slug: string;
  book_found: boolean;
  current_manifest_source: "legacy" | "content-core";
  chapters_found: number;
  legacy_blocks_found: number;
  concepts_found: number;
  highlights_found: number;
  annotations_found: number;
  existing_works: number;
  existing_editions: number;
  existing_revisions: number;
  existing_content_units: number;
  existing_content_blocks: number;
  planned_works_created: number;
  planned_editions_created: number;
  planned_revisions_created: number;
  planned_content_units_created: number;
  planned_unit_versions_created: number;
  planned_content_blocks_created: number;
  planned_block_versions_created: number;
  planned_concepts_created: number;
  planned_concept_links_created: number;
  drift_conflicts: number;
  unresolved_blocks: number;
  destructive_operations: 0;
  database_writes: 0;
  backfill_safe: boolean;
}

const REPORT_KEYS: Array<keyof DryRunReport> = [
  "book_slug",
  "book_found",
  "current_manifest_source",
  "chapters_found",
  "legacy_blocks_found",
  "concepts_found",
  "highlights_found",
  "annotations_found",
  "existing_works",
  "existing_editions",
  "existing_revisions",
  "existing_content_units",
  "existing_content_blocks",
  "planned_works_created",
  "planned_editions_created",
  "planned_revisions_created",
  "planned_content_units_created",
  "planned_unit_versions_created",
  "planned_content_blocks_created",
  "planned_block_versions_created",
  "planned_concepts_created",
  "planned_concept_links_created",
  "drift_conflicts",
  "unresolved_blocks",
  "destructive_operations",
  "database_writes",
  "backfill_safe",
];

/** key=value lines for stdout — emits ONLY the whitelisted metric keys. */
export function serializeDryRunReport(report: DryRunReport): string {
  return REPORT_KEYS.map((k) => `${k}=${String(report[k])}`).join("\n");
}

export async function dryRunTargetedBackfill(
  prisma: PrismaClient,
  bookSlug: string,
): Promise<DryRunReport> {
  const book = await prisma.book.findUnique({ where: { slug: bookSlug } });
  if (!book) throw new Error(BOOK_NOT_FOUND);

  const editionKey = `${bookSlug}-1e`;
  const chapters = await prisma.chapter.findMany({
    where: { bookId: book.id },
    orderBy: { order: "asc" },
  });
  const chapterIds = chapters.map((c) => c.id);
  const legacyBlocks = await prisma.chapterBlock.findMany({
    where: { chapterId: { in: chapterIds } },
    orderBy: [{ chapterId: "asc" }, { order: "asc" }],
  });
  const legacyBlockIds = legacyBlocks.map((b) => b.id);

  const work = await prisma.work.findUnique({ where: { workKey: bookSlug } });
  const edition = await prisma.edition.findUnique({ where: { editionKey } });
  const revisions = edition
    ? await prisma.revision.count({ where: { editionId: edition.id } })
    : 0;
  const existingUnits = edition
    ? await prisma.contentUnit.findMany({ where: { editionId: edition.id } })
    : [];
  const unitIds = existingUnits.map((u) => u.id);
  const existingBlocks = await prisma.contentBlock.findMany({
    where: { unitId: { in: unitIds } },
  });

  // Planned creations mirror the library's identity rules exactly:
  // unitKey = uuidv5(Chapter.id) · blockKey = uuidv5(ChapterBlock.id).
  const existingUnitKeys = new Set(existingUnits.map((u) => u.unitKey));
  const plannedUnits = chapters.filter(
    (c) => !existingUnitKeys.has(unitKeyFromLegacyChapterId(c.id)),
  ).length;

  const unitVersionCounts = new Map<string, number>();
  for (const u of existingUnits) {
    unitVersionCounts.set(
      u.id,
      await prisma.contentUnitVersion.count({ where: { unitId: u.id } }),
    );
  }
  const unitByKey = new Map(existingUnits.map((u) => [u.unitKey, u]));
  let plannedUnitVersions = 0;
  for (const c of chapters) {
    const u = unitByKey.get(unitKeyFromLegacyChapterId(c.id));
    if (!u || (unitVersionCounts.get(u.id) ?? 0) === 0)
      plannedUnitVersions += 1;
  }

  const existingBlockByKey = new Map(
    existingBlocks.map((b) => [b.blockKey, b]),
  );
  let plannedBlocks = 0;
  let plannedBlockVersions = 0;
  let driftConflicts = 0;
  for (const lb of legacyBlocks) {
    const key = blockKeyFromLegacyId(lb.id);
    const cb = existingBlockByKey.get(key);
    if (!cb) {
      plannedBlocks += 1;
      plannedBlockVersions += 1;
      continue;
    }
    const versions = await prisma.blockVersion.findMany({
      where: { contentBlockId: cb.id },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    if (versions.length === 0) {
      plannedBlockVersions += 1;
    } else if (versions[0].contentHash !== contentHash(lb.content)) {
      driftConflicts += 1;
    }
  }

  // Concepts mirror the library exactly: Concept upserted by `concept.key`,
  // link id deterministically `cl-<key>`; catalog rows whose chapter is absent
  // are skipped (same guard as the library).
  const catalog = CHAPTER_CONCEPTS[bookSlug] ?? {};
  const conceptKeys = Object.values(catalog).map((c) => c.key);
  const existingConcepts = conceptKeys.length
    ? await prisma.concept.findMany({
        where: { conceptKey: { in: conceptKeys } },
      })
    : [];
  const existingConceptKeys = new Set(
    existingConcepts.map((c) => c.conceptKey),
  );
  let plannedConcepts = 0;
  let plannedConceptLinks = 0;
  for (const [orderStr, concept] of Object.entries(catalog)) {
    const chapter = chapters.find((c) => c.order === Number(orderStr));
    if (!chapter) continue;
    if (!existingConceptKeys.has(concept.key)) plannedConcepts += 1;
    const linked = await prisma.conceptLink.count({
      where: { id: `cl-${concept.key}` },
    });
    if (linked === 0) plannedConceptLinks += 1;
  }

  // Marks anchored to this book, via the legacy block ids OR a Core block of
  // this edition (counts only — rows are never read beyond the aggregate).
  const coreBlockIds = existingBlocks.map((b) => b.id);
  const [highlights, annotations] = await Promise.all([
    prisma.highlight.count({
      where: {
        OR: [
          { blockId: { in: legacyBlockIds } },
          { contentBlockId: { in: coreBlockIds } },
        ],
      },
    }),
    prisma.annotation.count({
      where: {
        OR: [
          { blockId: { in: legacyBlockIds } },
          { contentBlockId: { in: coreBlockIds } },
        ],
      },
    }),
  ]);

  const report: DryRunReport = {
    book_slug: bookSlug,
    book_found: true,
    current_manifest_source: edition?.publishedRevisionId
      ? "content-core"
      : "legacy",
    chapters_found: chapters.length,
    legacy_blocks_found: legacyBlocks.length,
    concepts_found: Object.keys(catalog).length,
    highlights_found: highlights,
    annotations_found: annotations,
    existing_works: work ? 1 : 0,
    existing_editions: edition ? 1 : 0,
    existing_revisions: revisions,
    existing_content_units: existingUnits.length,
    existing_content_blocks: existingBlocks.length,
    planned_works_created: work ? 0 : 1,
    planned_editions_created: edition ? 0 : 1,
    planned_revisions_created: revisions > 0 ? 0 : 1,
    planned_content_units_created: plannedUnits,
    planned_unit_versions_created: plannedUnitVersions,
    planned_content_blocks_created: plannedBlocks,
    planned_block_versions_created: plannedBlockVersions,
    planned_concepts_created: plannedConcepts,
    planned_concept_links_created: plannedConceptLinks,
    drift_conflicts: driftConflicts,
    unresolved_blocks: 0, // every legacy block maps by construction (uuidv5)
    destructive_operations: 0,
    database_writes: 0,
    backfill_safe: driftConflicts === 0,
  };
  return report;
}

// ── apply ────────────────────────────────────────────────────────────────────

export interface ApplyOptions {
  /** Test-only passthrough to the library's injected-failure hook. */
  throwAfterUnits?: number;
  /** Env source (defaults to process.env) — injectable for tests. */
  env?: { NODE_ENV?: string; ALLOW_CONTENT_CORE_BACKFILL?: string };
}

export async function applyTargetedBackfill(
  prisma: PrismaClient,
  bookSlug: string,
  opts: ApplyOptions = {},
): Promise<BackfillStats> {
  assertBackfillAllowed(opts.env ?? process.env);
  const book = await prisma.book.findUnique({ where: { slug: bookSlug } });
  if (!book) throw new Error(BOOK_NOT_FOUND);
  // The library does the rest: atomic per-book transaction, create-or-verify
  // (BACKFILL_DRIFT_DETECTED → full rollback), publish last, zero DELETE, and
  // it never touches Highlight/Annotation rows.
  return backfillContentCore(scopePrismaToBook(prisma, bookSlug), {
    throwAfterUnits: opts.throwAfterUnits,
  });
}
