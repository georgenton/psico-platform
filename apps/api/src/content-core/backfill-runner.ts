import type { PrismaClient } from "@prisma/client";
import { CHAPTER_CONCEPTS } from "@psico/types";
import { backfillContentCore, type BackfillStats } from "./backfill";
import {
  blockVersionDrifts,
  contentBlockDrifts,
  expectedBlockVersionFields,
  expectedRevisionUnitFields,
  expectedUnitVersionFields,
  revisionUnitDrifts,
  unitVersionDrifts,
} from "./backfill-inspect";
import {
  blockKeyFromLegacyId,
  unitKeyFromLegacyChapterId,
} from "./lib/block-key";
import { resolveEnvironment } from "../shared/psico-environment";

/**
 * Content Core — CC-6F targeted backfill runner (operational surface ONLY).
 *
 * The approved CC-3 library (`backfillContentCore`) keeps its semantics: it is
 * atomic per Book, idempotent, zero-DELETE, drift-throwing and publish-last.
 * This module adds the safe way to OPERATE it against production:
 *
 *   - one Work at a time (`--book-slug`), never the whole catalog;
 *   - dry-run by default — `--apply` must be explicit;
 *   - the apply on a DEPLOYED box (production OR staging, resolved by the
 *     canonical PSICO_ENV/Railway resolver — fail-closed on a Railway box
 *     without PSICO_ENV, on an invalid PSICO_ENV, and on a deployed box that
 *     claims development) additionally requires
 *     `ALLOW_CONTENT_CORE_BACKFILL=on` (BACKFILL_FORBIDDEN otherwise);
 *   - dry-run and apply share ONE set of create-or-verify expectations
 *     (`backfill-inspect.ts`), so `backfill_safe=true` and a later
 *     BACKFILL_DRIFT_DETECTED can never disagree;
 *   - the dry-run performs ZERO database writes, reads inside ONE transaction
 *     (consistent snapshot) and reports metrics only — never block text,
 *     titles, emails, ids or quotes.
 *
 * Scoping strategy: the library reads its work-list through ONE call site
 * (`prisma.book.findMany`). `scopePrismaToBook` wraps the client in a Proxy
 * that narrows that call to the requested slug and passes everything else
 * through untouched. The only-requested-slug guarantee is pinned by a pg-spec.
 */

export const BOOK_NOT_FOUND = "BOOK_NOT_FOUND";
export const BACKFILL_FORBIDDEN = "BACKFILL_FORBIDDEN";
export const MISSING_BOOK_SLUG = "MISSING_BOOK_SLUG";
export const BACKFILL_INTERNAL_ERROR = "BACKFILL_INTERNAL_ERROR";

/** The ONLY error codes the CLI may surface; anything else is INTERNAL. */
const PUBLIC_ERROR_CODES: readonly string[] = [
  BOOK_NOT_FOUND,
  BACKFILL_FORBIDDEN,
  "BACKFILL_DRIFT_DETECTED",
  MISSING_BOOK_SLUG,
];

/**
 * Map ANY thrown value to a whitelisted machine code. Raw messages (Prisma
 * errors, connection strings, stack fragments) never reach stdout/stderr.
 */
export function sanitizeErrorCode(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  return PUBLIC_ERROR_CODES.includes(msg) ? msg : BACKFILL_INTERNAL_ERROR;
}

// ── CLI arguments ────────────────────────────────────────────────────────────

export interface RunnerArgs {
  bookSlug: string;
  /** True ONLY when --apply was passed explicitly. Dry-run otherwise. */
  apply: boolean;
}

export function parseRunnerArgs(argv: string[]): RunnerArgs {
  let bookSlug: string | null = null;
  let apply = false;
  let dryRun = false;
  for (const arg of argv) {
    if (arg.startsWith("--book-slug=")) {
      if (bookSlug !== null) throw new Error("DUPLICATE_BOOK_SLUG");
      bookSlug = arg.slice("--book-slug=".length).trim();
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      throw new Error("UNKNOWN_ARGUMENT");
    }
  }
  if (apply && dryRun) throw new Error("CONFLICTING_MODE_FLAGS");
  if (!bookSlug) throw new Error(MISSING_BOOK_SLUG);
  return { bookSlug, apply };
}

// ── production/staging gate (fail-closed) ────────────────────────────────────

/**
 * An APPLY on a deployed box (production or staging) is refused unless ops
 * explicitly set ALLOW_CONTENT_CORE_BACKFILL=on. The environment comes from
 * the canonical resolver, which itself fails closed: Railway box without
 * PSICO_ENV → throws; invalid PSICO_ENV → throws; a deployed box claiming
 * "development" → throws. NODE_ENV alone never decides. Dry-runs (read-only)
 * do not require the flag but still go through the resolver.
 */
export function assertBackfillAllowed(env: {
  ALLOW_CONTENT_CORE_BACKFILL?: string;
}): void {
  const environment = resolveEnvironment(); // throws on misconfigured boxes
  const deployed = environment === "production" || environment === "staging";
  if (deployed && env.ALLOW_CONTENT_CORE_BACKFILL !== "on") {
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

/**
 * Zero-write preview inside ONE read transaction (consistent snapshot). Walks
 * the book exactly like the apply would — same identity rules (uuidv5 unit /
 * block keys, `cuv-` version ids, revision #1) and the SAME create-or-verify
 * expectations from `backfill-inspect.ts` — so its `drift_conflicts` /
 * `backfill_safe` verdict matches what `backfillContentCore` would do.
 */
export async function dryRunTargetedBackfill(
  prisma: PrismaClient,
  bookSlug: string,
): Promise<DryRunReport> {
  return prisma.$transaction(
    async (tx) => {
      const book = await tx.book.findUnique({ where: { slug: bookSlug } });
      if (!book) throw new Error(BOOK_NOT_FOUND);

      const editionKey = `${bookSlug}-1e`;
      const chapters = await tx.chapter.findMany({
        where: { bookId: book.id },
        orderBy: { order: "asc" },
      });

      const work = await tx.work.findUnique({ where: { workKey: bookSlug } });
      const edition = await tx.edition.findUnique({ where: { editionKey } });
      const revisionsCount = edition
        ? await tx.revision.count({ where: { editionId: edition.id } })
        : 0;
      // The library targets revision #1 (create-if-missing, keep-as-is).
      const revision = edition
        ? await tx.revision.findUnique({
            where: { editionId_number: { editionId: edition.id, number: 1 } },
          })
        : null;
      const existingUnits = edition
        ? await tx.contentUnit.findMany({ where: { editionId: edition.id } })
        : [];
      const unitByKey = new Map(existingUnits.map((u) => [u.unitKey, u]));
      const existingBlocksCount = await tx.contentBlock.count({
        where: { unitId: { in: existingUnits.map((u) => u.id) } },
      });

      let plannedUnits = 0;
      let plannedUnitVersions = 0;
      let plannedBlocks = 0;
      let plannedBlockVersions = 0;
      let drift = 0;
      let legacyBlocksFound = 0;
      const legacyBlockIds: string[] = [];

      for (const ch of chapters) {
        const unitKey = unitKeyFromLegacyChapterId(ch.id);
        const unit = unitByKey.get(unitKey) ?? null;
        if (!unit) plannedUnits += 1;

        // ContentUnitVersion — same id rule + same drift comparison as apply.
        const versionId = `cuv-${unitKey}`;
        const existingVer = await tx.contentUnitVersion.findUnique({
          where: { id: versionId },
        });
        if (!existingVer) {
          plannedUnitVersions += 1;
        } else if (
          unit &&
          unitVersionDrifts(existingVer, expectedUnitVersionFields(ch, unit.id))
        ) {
          drift += 1;
        }

        const blocks = await tx.chapterBlock.findMany({
          where: { chapterId: ch.id },
          orderBy: { order: "asc" },
        });
        legacyBlocksFound += blocks.length;
        for (const b of blocks) {
          legacyBlockIds.push(b.id);
          const cb = await tx.contentBlock.findUnique({
            where: { blockKey: blockKeyFromLegacyId(b.id) },
          });
          if (!cb) {
            plannedBlocks += 1;
            plannedBlockVersions += 1;
            continue;
          }
          if (
            unit &&
            contentBlockDrifts(cb, { unitId: unit.id, legacyBlockId: b.id })
          ) {
            drift += 1;
          }
          const bv = existingVer
            ? await tx.blockVersion.findUnique({
                where: {
                  unitVersionId_contentBlockId: {
                    unitVersionId: existingVer.id,
                    contentBlockId: cb.id,
                  },
                },
              })
            : null;
          if (!bv) {
            plannedBlockVersions += 1;
          } else if (blockVersionDrifts(bv, expectedBlockVersionFields(b))) {
            drift += 1;
          }
        }

        // RevisionUnit / manifest placement — same comparison as apply.
        if (revision && unit && existingVer) {
          const ru = await tx.revisionUnit.findUnique({
            where: {
              revisionId_unitId: { revisionId: revision.id, unitId: unit.id },
            },
          });
          if (
            ru &&
            revisionUnitDrifts(
              ru,
              expectedRevisionUnitFields(ch, existingVer.id),
            )
          ) {
            drift += 1;
          }
        }
      }

      // Concepts mirror the library: Concept by `concept.key`, link `cl-<key>`,
      // catalog rows whose chapter is absent are skipped.
      const catalog = CHAPTER_CONCEPTS[bookSlug] ?? {};
      const conceptKeys = Object.values(catalog).map((c) => c.key);
      const existingConcepts = conceptKeys.length
        ? await tx.concept.findMany({
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
        const linked = await tx.conceptLink.count({
          where: { id: `cl-${concept.key}` },
        });
        if (linked === 0) plannedConceptLinks += 1;
      }

      // Marks anchored to this book (counts only).
      const coreBlockIds = (
        await tx.contentBlock.findMany({
          where: { unitId: { in: existingUnits.map((u) => u.id) } },
          select: { id: true },
        })
      ).map((b) => b.id);
      const [highlights, annotations] = await Promise.all([
        tx.highlight.count({
          where: {
            OR: [
              { blockId: { in: legacyBlockIds } },
              { contentBlockId: { in: coreBlockIds } },
            ],
          },
        }),
        tx.annotation.count({
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
        legacy_blocks_found: legacyBlocksFound,
        concepts_found: Object.keys(catalog).length,
        highlights_found: highlights,
        annotations_found: annotations,
        existing_works: work ? 1 : 0,
        existing_editions: edition ? 1 : 0,
        existing_revisions: revisionsCount,
        existing_content_units: existingUnits.length,
        existing_content_blocks: existingBlocksCount,
        planned_works_created: work ? 0 : 1,
        planned_editions_created: edition ? 0 : 1,
        planned_revisions_created: revisionsCount > 0 ? 0 : 1,
        planned_content_units_created: plannedUnits,
        planned_unit_versions_created: plannedUnitVersions,
        planned_content_blocks_created: plannedBlocks,
        planned_block_versions_created: plannedBlockVersions,
        planned_concepts_created: plannedConcepts,
        planned_concept_links_created: plannedConceptLinks,
        drift_conflicts: drift,
        unresolved_blocks: 0, // every legacy block maps by construction (uuidv5)
        destructive_operations: 0,
        database_writes: 0,
        backfill_safe: drift === 0,
      };
      return report;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

// ── apply ────────────────────────────────────────────────────────────────────

export interface ApplyOptions {
  /** Test-only passthrough to the library's injected-failure hook. */
  throwAfterUnits?: number;
  /** ALLOW-flag source (defaults to process.env) — injectable for tests. */
  env?: { ALLOW_CONTENT_CORE_BACKFILL?: string };
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
  // via the SAME backfill-inspect predicates the dry-run uses
  // (BACKFILL_DRIFT_DETECTED → full rollback), publish last, zero DELETE, and
  // it never touches Highlight/Annotation rows.
  return backfillContentCore(scopePrismaToBook(prisma, bookSlug), {
    throwAfterUnits: opts.throwAfterUnits,
  });
}
