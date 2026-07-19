import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BOOK_NOT_FOUND,
  applyTargetedBackfill,
  dryRunTargetedBackfill,
} from "./backfill-runner";

/**
 * CC-6F — targeted backfill runner on real PostgreSQL 18.
 *
 * Proves the OPERATIONAL guarantees the runner adds on top of the approved
 * CC-3 library: a dry-run performs zero writes; an unknown slug refuses to
 * run; an apply touches ONLY the requested slug; a second identical apply is
 * a no-op; drift aborts with BACKFILL_DRIFT_DETECTED and zero writes; marks
 * (Highlight/Annotation) are byte-identical across an apply; a mid-transaction
 * failure rolls back completely.
 *
 * Runs only when TEST_DATABASE_URL is set (CI `test:locks`); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "cc6f_runner_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Row counts across every Content Core table — the zero-writes yardstick. */
async function coreCounts(prisma: PrismaClient) {
  const [
    works,
    editions,
    revisions,
    units,
    versions,
    blocks,
    blockVersions,
    revisionUnits,
    concepts,
    conceptLinks,
  ] = await Promise.all([
    prisma.work.count(),
    prisma.edition.count(),
    prisma.revision.count(),
    prisma.contentUnit.count(),
    prisma.contentUnitVersion.count(),
    prisma.contentBlock.count(),
    prisma.blockVersion.count(),
    prisma.revisionUnit.count(),
    prisma.concept.count(),
    prisma.conceptLink.count(),
  ]);
  return {
    works,
    editions,
    revisions,
    units,
    versions,
    blocks,
    blockVersions,
    revisionUnits,
    concepts,
    conceptLinks,
  };
}

suite("Content Core · CC-6F targeted backfill runner (real PostgreSQL)", () => {
  let prisma: PrismaClient;
  let pool: Pool;

  const TARGET = "familias-ensambladas"; // the book we backfill
  const OTHER = "emociones-en-construccion"; // must remain untouched
  let targetBlockId = "";
  let targetCh2Id = "";
  let userId = "";

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    // Two legacy books, one of which we target. Marks live on the target.
    for (const [slug, title] of [
      [TARGET, "Familias"],
      [OTHER, "Emociones"],
    ] as const) {
      const book = await prisma.book.create({
        data: { slug, title, plan: "PRO" },
      });
      for (const order of [1, 2]) {
        const ch = await prisma.chapter.create({
          data: { bookId: book.id, order, title: `Cap ${order}` },
        });
        const block = await prisma.chapterBlock.create({
          data: {
            chapterId: ch.id,
            order: 0,
            kind: "PARAGRAPH",
            content: `Contenido ${slug} ${order}`,
          },
        });
        if (slug === TARGET && order === 2) {
          targetBlockId = block.id;
          targetCh2Id = ch.id;
        }
      }
    }

    const user = await prisma.user.create({
      data: {
        email: "cc6f-runner@test.local",
        name: "CC6F",
        passwordHash: "x",
      },
    });
    userId = user.id;
    await prisma.highlight.create({
      data: {
        userId,
        blockId: targetBlockId,
        startOffset: 0,
        endOffset: 5,
        color: "YELLOW",
      },
    });
    await prisma.annotation.create({
      data: { userId, blockId: targetBlockId, text: "nota pre-backfill" },
    });
  }, 180_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("1. dry-run performs ZERO database writes", async () => {
    const before = await coreCounts(prisma);
    const report = await dryRunTargetedBackfill(prisma, TARGET);
    const after = await coreCounts(prisma);
    expect(after).toEqual(before);
    expect(report.book_found).toBe(true);
    expect(report.current_manifest_source).toBe("legacy");
    expect(report.chapters_found).toBe(2);
    expect(report.legacy_blocks_found).toBe(2);
    expect(report.planned_content_units_created).toBe(2);
    expect(report.planned_content_blocks_created).toBe(2);
    expect(report.highlights_found).toBe(1);
    expect(report.annotations_found).toBe(1);
    expect(report.drift_conflicts).toBe(0);
    expect(report.database_writes).toBe(0);
    expect(report.backfill_safe).toBe(true);
  });

  it("2. unknown slug → BOOK_NOT_FOUND (dry-run AND apply)", async () => {
    await expect(
      dryRunTargetedBackfill(prisma, "no-such-book"),
    ).rejects.toThrow(BOOK_NOT_FOUND);
    await expect(
      applyTargetedBackfill(prisma, "no-such-book", { env: {} }),
    ).rejects.toThrow(BOOK_NOT_FOUND);
  });

  it("7. mid-transaction failure → complete rollback (zero core rows remain)", async () => {
    // Runs BEFORE the successful apply: inject a failure after the 1st unit.
    const before = await coreCounts(prisma);
    await expect(
      applyTargetedBackfill(prisma, TARGET, { env: {}, throwAfterUnits: 1 }),
    ).rejects.toThrow("INJECTED_TEST_FAILURE");
    const after = await coreCounts(prisma);
    expect(after).toEqual(before);
  });

  it("3+6. apply processes ONLY the requested slug and never touches marks", async () => {
    const hlBefore = await prisma.highlight.findMany({
      orderBy: { id: "asc" },
    });
    const anBefore = await prisma.annotation.findMany({
      orderBy: { id: "asc" },
    });

    const stats = await applyTargetedBackfill(prisma, TARGET, { env: {} });
    expect(stats.works).toBe(1); // exactly one Work processed

    // Target published from Core…
    const targetEdition = await prisma.edition.findUnique({
      where: { editionKey: `${TARGET}-1e` },
    });
    expect(targetEdition?.publishedRevisionId).not.toBeNull();
    // …while the OTHER book has NO core rows at all.
    expect(
      await prisma.edition.findUnique({ where: { editionKey: `${OTHER}-1e` } }),
    ).toBeNull();
    expect(await prisma.work.count({ where: { workKey: OTHER } })).toBe(0);

    // Marks byte-identical (same rows, same fields, nothing rewritten).
    const hlAfter = await prisma.highlight.findMany({ orderBy: { id: "asc" } });
    const anAfter = await prisma.annotation.findMany({
      orderBy: { id: "asc" },
    });
    expect(JSON.stringify(hlAfter)).toBe(JSON.stringify(hlBefore));
    expect(JSON.stringify(anAfter)).toBe(JSON.stringify(anBefore));
  });

  it("4. a second identical apply is a no-op (counts unchanged)", async () => {
    const before = await coreCounts(prisma);
    await applyTargetedBackfill(prisma, TARGET, { env: {} });
    const after = await coreCounts(prisma);
    expect(after).toEqual(before);

    // Dry-run now reports content-core + nothing left to create.
    const report = await dryRunTargetedBackfill(prisma, TARGET);
    expect(report.current_manifest_source).toBe("content-core");
    expect(report.planned_content_units_created).toBe(0);
    expect(report.planned_content_blocks_created).toBe(0);
    expect(report.planned_block_versions_created).toBe(0);
  });

  // 5. Per-field drift matrix — dry-run and apply share ONE inspection
  //    (backfill-inspect.ts), so EVERY create-or-verify field must (a) surface
  //    as drift_conflicts>0 in the dry-run, (b) make the apply throw
  //    BACKFILL_DRIFT_DETECTED, and (c) leave zero writes behind.
  const DRIFT_MUTATIONS: Array<{
    name: string;
    mutate: () => Promise<() => Promise<void>>;
  }> = [
    {
      name: "content",
      mutate: async () => {
        const orig = await prisma.chapterBlock.findUniqueOrThrow({
          where: { id: targetBlockId },
        });
        await prisma.chapterBlock.update({
          where: { id: targetBlockId },
          data: { content: "CONTENIDO EDITADO POST-PUBLICACIÓN (drift)" },
        });
        return async () => {
          await prisma.chapterBlock.update({
            where: { id: targetBlockId },
            data: { content: orig.content },
          });
        };
      },
    },
    {
      name: "title",
      mutate: async () => {
        const orig = await prisma.chapter.findUniqueOrThrow({
          where: { id: targetCh2Id },
        });
        await prisma.chapter.update({
          where: { id: targetCh2Id },
          data: { title: "Título editado (drift)" },
        });
        return async () => {
          await prisma.chapter.update({
            where: { id: targetCh2Id },
            data: { title: orig.title },
          });
        };
      },
    },
    {
      name: "summary",
      mutate: async () => {
        const orig = await prisma.chapter.findUniqueOrThrow({
          where: { id: targetCh2Id },
        });
        await prisma.chapter.update({
          where: { id: targetCh2Id },
          data: { description: "Resumen editado (drift)" },
        });
        return async () => {
          await prisma.chapter.update({
            where: { id: targetCh2Id },
            data: { description: orig.description },
          });
        };
      },
    },
    {
      name: "kind",
      mutate: async () => {
        const orig = await prisma.chapterBlock.findUniqueOrThrow({
          where: { id: targetBlockId },
        });
        await prisma.chapterBlock.update({
          where: { id: targetBlockId },
          data: { kind: "HEADING" },
        });
        return async () => {
          await prisma.chapterBlock.update({
            where: { id: targetBlockId },
            data: { kind: orig.kind },
          });
        };
      },
    },
    {
      name: "order",
      mutate: async () => {
        const orig = await prisma.chapterBlock.findUniqueOrThrow({
          where: { id: targetBlockId },
        });
        await prisma.chapterBlock.update({
          where: { id: targetBlockId },
          data: { order: 9 },
        });
        return async () => {
          await prisma.chapterBlock.update({
            where: { id: targetBlockId },
            data: { order: orig.order },
          });
        };
      },
    },
    {
      name: "meta",
      mutate: async () => {
        await prisma.chapterBlock.update({
          where: { id: targetBlockId },
          data: { meta: { drifted: true } },
        });
        return async () => {
          // Prisma JSON null semantics: DbNull restores "no meta".
          await prisma.$executeRaw`UPDATE "ChapterBlock" SET meta = NULL WHERE id = ${targetBlockId}`;
        };
      },
    },
    {
      name: "placement (partNumber)",
      mutate: async () => {
        const orig = await prisma.chapter.findUniqueOrThrow({
          where: { id: targetCh2Id },
        });
        await prisma.chapter.update({
          where: { id: targetCh2Id },
          data: { partNumber: 7 },
        });
        return async () => {
          await prisma.chapter.update({
            where: { id: targetCh2Id },
            data: { partNumber: orig.partNumber },
          });
        };
      },
    },
  ];

  it.each(DRIFT_MUTATIONS)(
    "5. drift in $name → dry-run flags it, apply throws BACKFILL_DRIFT_DETECTED, zero writes",
    async ({ mutate }) => {
      const restore = await mutate();
      try {
        const report = await dryRunTargetedBackfill(prisma, TARGET);
        expect(report.drift_conflicts).toBeGreaterThan(0);
        expect(report.backfill_safe).toBe(false);

        const before = await coreCounts(prisma);
        await expect(
          applyTargetedBackfill(prisma, TARGET, { env: {} }),
        ).rejects.toThrow("BACKFILL_DRIFT_DETECTED");
        const after = await coreCounts(prisma);
        expect(after).toEqual(before);
      } finally {
        await restore();
      }

      // Restored source → clean verdict again (the matrix leaves no residue).
      const clean = await dryRunTargetedBackfill(prisma, TARGET);
      expect(clean.drift_conflicts).toBe(0);
      expect(clean.backfill_safe).toBe(true);
    },
  );
});
