import { execSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import {
  describeEditionDraft,
  reorderDraftManifest,
} from "../content-core/content-draft";
import { ContentStudioService } from "./content-studio.service";
import { LectorService } from "../lector/lector.service";
import { BooksService } from "../books/books.service";
import { ChaptersService } from "../chapters/chapters.service";
import { ContentAccessService } from "../content-core/access/content-access.service";

/**
 * Phase B.B2 — reordering chapters, against a real database.
 *
 * B.B1 made the published manifest the reader's structural authority. This is
 * the first write that USES that: an editor can change what the manifest says,
 * and every claim below is about the blast radius of doing so.
 *
 * The shape of the write is what makes most of it true. A revision is an
 * immutable snapshot, so reorder does not move rows — it mints the next
 * snapshot with the placements already final. Nothing is updated in place, so
 * there is no window where two chapters share a position and no need for the
 * parking orders an in-place swap would require to dodge
 * `@@unique([revisionId, order])`.
 *
 * The rest is about what must NOT follow a chapter around: its content, its
 * free preview, the reader's progress and marks, and — until the draft is
 * published — the reader's view of the book at all.
 */

const DB = "draft_reorder_db";
const API_DIR = process.cwd();
const USER = "u-reorder";

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

interface UnitSpec {
  key: string;
  order: number;
  part?: [number, string];
  freePreview?: boolean;
  /** A unit Content Core owns outright — no `Chapter` row behind it. */
  native?: boolean;
}

suite("Content Studio · reordering the draft manifest", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  /** The suite's own database, for subprocesses that connect themselves. */
  let dbUrl = "";
  let studio: ContentStudioService;
  let lector: LectorService;
  let books: BooksService;

  const bookId: Record<string, string> = {};
  const editionId: Record<string, string> = {};
  const unitId: Record<string, string> = {};
  const chapterId: Record<string, string> = {};
  const blockId: Record<string, string> = {};

  /**
   * A book whose chapters are legacy rows Content Core has ADOPTED.
   *
   * Adopted rather than native-only because that is the interesting case: the
   * `Chapter` row still exists, still has an `order`, and reorder must leave it
   * exactly as it is while the manifest moves on without it.
   */
  async function makeBook(
    slug: string,
    opts: {
      units: UnitSpec[];
      plan?: "FREE" | "PRO";
      accessPlan?: "FREE" | "PRO" | null;
      /** Legacy chapters Content Core never took in, at these orders. */
      unsyncedAt?: number[];
      publish?: boolean;
    },
  ) {
    const plan = opts.plan ?? "FREE";
    const book = await prisma.book.create({
      data: {
        slug,
        title: slug,
        plan,
        totalChapters: opts.units.length,
        isPublished: true,
      },
    });
    bookId[slug] = book.id;

    const work = await prisma.work.create({
      data: { workKey: `w-${slug}`, title: slug, authorName: "A" },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: `${slug}-1e`, // gitleaks:allow — a book slug
        slug,
        label: "Primera",
        accessPlan:
          opts.accessPlan === undefined ? plan : (opts.accessPlan ?? null),
      },
    });
    editionId[slug] = edition.id;

    const revision = await prisma.revision.create({
      data: {
        editionId: edition.id,
        number: 1,
        status: opts.publish === false ? "DRAFT" : "PUBLISHED",
        publishedAt: opts.publish === false ? null : new Date(),
      },
    });

    for (const u of opts.units) {
      let legacyBlockId: string | null = null;
      let unitKey = `native-${slug}-${u.key}`;
      if (!u.native) {
        const ch = await prisma.chapter.create({
          data: {
            bookId: book.id,
            order: u.order,
            title: `Cap ${u.key}`,
            isPublished: true,
          },
        });
        chapterId[`${slug}:${u.key}`] = ch.id;
        const cbLegacy = await prisma.chapterBlock.create({
          data: {
            chapterId: ch.id,
            order: 0,
            kind: "PARAGRAPH",
            content: `Texto ${u.key}`,
          },
        });
        blockId[`${slug}:${u.key}`] = cbLegacy.id;
        legacyBlockId = cbLegacy.id;
        // Adoption is identity: the key the backfill would derive.
        unitKey = unitKeyFromLegacyChapterId(ch.id);
      }

      const unit = await prisma.contentUnit.create({
        data: {
          editionId: edition.id,
          unitKey,
          isFreePreview: u.freePreview ?? true,
        },
      });
      unitId[`${slug}:${u.key}`] = unit.id;
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: `Cap ${u.key}` },
      });
      const cb = await prisma.contentBlock.create({
        data: {
          unitId: unit.id,
          blockKey: `bk-${slug}-${u.key}`,
          legacyBlockId,
        },
      });
      await prisma.blockVersion.create({
        data: {
          contentBlockId: cb.id,
          unitVersionId: version.id,
          order: 1,
          kind: "PARAGRAPH",
          content: `Texto ${u.key}`,
          contentHash: `h-${slug}-${u.key}`,
        },
      });
      await prisma.revisionUnit.create({
        data: {
          revisionId: revision.id,
          unitId: unit.id,
          unitVersionId: version.id,
          order: u.order,
          partNumber: u.part?.[0] ?? null,
          partTitle: u.part?.[1] ?? null,
        },
      });
    }

    for (const order of opts.unsyncedAt ?? []) {
      const ch = await prisma.chapter.create({
        data: {
          bookId: book.id,
          order,
          title: `Sin sincronizar ${order}`,
          isPublished: true,
        },
      });
      chapterId[`${slug}:unsynced-${order}`] = ch.id;
      await prisma.chapterBlock.create({
        data: { chapterId: ch.id, order: 0, kind: "PARAGRAPH", content: "T" },
      });
    }

    if (opts.publish !== false) {
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: revision.id },
      });
    }
    return revision.id;
  }

  /** The manifest of a revision, as `[order, unitKey-ish]`, sorted. */
  const manifestOf = async (revisionId: string) => {
    const rows = await prisma.revisionUnit.findMany({
      where: { revisionId },
      orderBy: { order: "asc" },
      select: { order: true, unitId: true, unitVersionId: true },
    });
    return rows;
  };

  const editingRevisionOf = async (slug: string) =>
    (await studio.getBookState(slug)).editingRevisionId;

  const revisionCountOf = async (slug: string) =>
    prisma.revision.count({ where: { editionId: editionId[slug] } });

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    // Set BEFORE Prisma connects, so every session inherits it. It is what
    // makes the serialisation proof below deterministic: a writer that waits
    // on the edition lock fails with a lock timeout instead of hanging, and
    // one that never takes the lock sails straight through.
    await admin.query(`ALTER DATABASE "${DB}" SET lock_timeout = '400ms'`);
    await admin.end();

    const url = new URL(base as string);
    url.pathname = `/${DB}`;
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });
    dbUrl = url.toString();
    pool = new Pool({ connectionString: url.toString() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const config = { get: () => undefined } as never;
    studio = new ContentStudioService(
      prisma as never,
      {
        get: () => "https://assets.example.com",
      } as never,
    );
    lector = new LectorService(
      prisma as never,
      config,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );
    books = new BooksService(prisma as never, config);

    await prisma.user.create({
      data: { id: USER, email: "reorder@test.local", name: "R" },
    });

    await makeBook("orden", {
      units: [
        { key: "A", order: 1 },
        { key: "B", order: 2 },
        { key: "C", order: 3 },
      ],
    });
    await makeBook("publicado", {
      units: [
        { key: "A", order: 1 },
        { key: "B", order: 2 },
        { key: "C", order: 3 },
      ],
    });
    await makeBook("hueco", {
      units: [
        { key: "A", order: 1 },
        { key: "B", order: 3 },
        { key: "C", order: 4 },
      ],
    });
    await makeBook("sin-plan", {
      units: [
        { key: "A", order: 1 },
        { key: "B", order: 2 },
      ],
      accessPlan: null,
    });
    await makeBook("sin-sync", {
      units: [{ key: "A", order: 1 }],
      unsyncedAt: [2],
    });
    await makeBook("conflicto", {
      units: [
        { key: "A", order: 1 },
        // Native, so the legacy row below is a DIFFERENT thing claiming the
        // same position — which is what makes it a conflict rather than merely
        // something not yet adopted.
        { key: "N", order: 2, native: true },
      ],
      unsyncedAt: [2],
    });
    await makeBook("carrera-1", {
      units: [
        { key: "A", order: 1 },
        { key: "B", order: 2 },
      ],
    });
    await makeBook("carrera-2", {
      units: [
        { key: "A", order: 1 },
        { key: "B", order: 2 },
      ],
    });
    await makeBook("partes", {
      units: [
        { key: "A", order: 1, part: [1, "Parte I"] },
        { key: "B", order: 2, part: [1, "Parte I"] },
        { key: "C", order: 3, part: [2, "Parte II"] },
        { key: "D", order: 4, part: [2, "Parte II"] },
      ],
    });
    await makeBook("pro-preview", {
      units: [
        { key: "A", order: 1, freePreview: true },
        { key: "B", order: 2, freePreview: false },
      ],
      plan: "PRO",
    });
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  // ── the write itself ─────────────────────────────────────────────────────

  describe("a reorder that stays in the draft", () => {
    let baseRevisionId = "";
    let draftRevisionId = "";
    let versionsBefore = 0;
    let blockVersionsBefore = 0;
    let contentBlocksBefore: Array<{
      id: string;
      blockKey: string;
      unitId: string;
    }> = [];
    let baseManifest: Awaited<ReturnType<typeof manifestOf>> = [];

    beforeAll(async () => {
      baseRevisionId = await editingRevisionOf("orden");
      baseManifest = await manifestOf(baseRevisionId);
      versionsBefore = await prisma.contentUnitVersion.count();
      blockVersionsBefore = await prisma.blockVersion.count();
      contentBlocksBefore = await prisma.contentBlock.findMany({
        orderBy: { id: "asc" },
        select: { id: true, blockKey: true, unitId: true },
      });

      // The reader has been here: progress and a mark, so the assertions below
      // about not touching them have something to be about.
      await prisma.readingSession.create({
        data: {
          userId: USER,
          chapterId: chapterId["orden:A"],
          progressPct: 0.5,
          timeSpentSec: 120,
        },
      });
      await prisma.userProgress.create({
        data: { userId: USER, chapterId: chapterId["orden:A"] },
      });
      await prisma.highlight.create({
        data: {
          userId: USER,
          blockId: blockId["orden:A"],
          startOffset: 0,
          endOffset: 5,
          color: "YELLOW",
        },
      });
      await prisma.annotation.create({
        data: { userId: USER, blockId: blockId["orden:A"], text: "nota" },
      });

      const res = await studio.reorderChapters("orden", {
        expectedRevisionId: baseRevisionId,
        orderedChapterOrders: [3, 1, 2],
      });
      draftRevisionId = res.revisionId;
    }, 120_000);

    it("puts the chapters where the editor asked", async () => {
      const rows = await manifestOf(draftRevisionId);
      expect(rows.map((r) => [r.order, r.unitId])).toEqual([
        [1, unitId["orden:C"]],
        [2, unitId["orden:A"]],
        [3, unitId["orden:B"]],
      ]);
    });

    it("mints a NEW revision and leaves the base physically unchanged", async () => {
      expect(draftRevisionId).not.toBe(baseRevisionId);
      // Byte for byte what it was before the reorder — no row was updated, so
      // no parking order was ever needed to get past the unique constraint.
      expect(await manifestOf(baseRevisionId)).toEqual(baseManifest);
      const revision = await prisma.revision.findUniqueOrThrow({
        where: { id: draftRevisionId },
      });
      expect(revision.status).toBe("DRAFT");
      expect(revision.note).toBe("content-studio:reorder");
    });

    it("carries every unit at the SAME version", async () => {
      const before = new Map(baseManifest.map((r) => [r.unitId, r]));
      for (const row of await manifestOf(draftRevisionId)) {
        expect(row.unitVersionId).toBe(before.get(row.unitId)!.unitVersionId);
      }
    });

    it("creates no unit version and no block version", async () => {
      // The difference between moving a chapter and rewriting one.
      expect(await prisma.contentUnitVersion.count()).toBe(versionsBefore);
      expect(await prisma.blockVersion.count()).toBe(blockVersionsBefore);
    });

    it("leaves every ContentBlock identity exactly as it was", async () => {
      // The anchor a reader's highlight resolves through. Not merely the same
      // count — the same rows, with the same keys, on the same units.
      expect(
        await prisma.contentBlock.findMany({
          orderBy: { id: "asc" },
          select: { id: true, blockKey: true, unitId: true },
        }),
      ).toEqual(contentBlocksBefore);
    });

    it("does not touch Chapter.order or Book.totalChapters", async () => {
      const chapters = await prisma.chapter.findMany({
        where: { bookId: bookId["orden"] },
        orderBy: { order: "asc" },
        select: { id: true, order: true },
      });
      expect(chapters.map((c) => [c.id, c.order])).toEqual([
        [chapterId["orden:A"], 1],
        [chapterId["orden:B"], 2],
        [chapterId["orden:C"], 3],
      ]);
      const book = await prisma.book.findUniqueOrThrow({
        where: { id: bookId["orden"] },
      });
      expect(book.totalChapters).toBe(3);
    });

    it("does not touch the reader's session or progress", async () => {
      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, chapterId: chapterId["orden:A"] },
      });
      expect(session.progressPct).toBeCloseTo(0.5);
      expect(session.timeSpentSec).toBe(120);
      expect(
        await prisma.userProgress.count({
          where: { userId: USER, chapterId: chapterId["orden:A"] },
        }),
      ).toBe(1);
    });

    it("does not touch the reader's marks", async () => {
      const h = await prisma.highlight.findFirstOrThrow({
        where: { userId: USER, blockId: blockId["orden:A"] },
      });
      expect([h.startOffset, h.endOffset]).toEqual([0, 5]);
      expect(
        await prisma.annotation.count({
          where: { userId: USER, blockId: blockId["orden:A"] },
        }),
      ).toBe(1);
    });

    // ── H — the draft must not describe itself as empty ────────────────────

    it("counts a move as a change, though no text changed", async () => {
      // Every unit is carried at the SAME unitVersionId, so the old rule —
      // compare versions — reported zero and Content Studio would have shown
      // an editor a draft it called unchanged.
      const described = await describeEditionDraft(prisma, editionId["orden"]);
      expect(described.draftRevisionId).toBe(draftRevisionId);
      expect(described.structureChanged).toBe(true);
      // All three moved.
      expect(described.changedUnitKeys).toHaveLength(3);

      const state = await studio.getBookState("orden");
      expect(state.changedUnitCount).toBe(3);
      expect(state.structureChanged).toBe(true);
      expect(state.chapters.every((c) => c.changed)).toBe(true);
    });

    it("a straight swap reports exactly the two chapters that moved", async () => {
      // The literal case from the review: published A1 B2, draft B1 A2, same
      // unit versions, and the count must be 2 rather than 0.
      const baseId = await editingRevisionOf("pro-preview");
      await studio.reorderChapters("pro-preview", {
        expectedRevisionId: baseId,
        orderedChapterOrders: [2, 1],
      });
      const described = await describeEditionDraft(
        prisma,
        editionId["pro-preview"],
      );
      expect(described.changedUnitKeys).toHaveLength(2);
      const state = await studio.getBookState("pro-preview");
      expect(state.changedUnitCount).toBe(2);
      expect(state.chapters.map((c) => c.changed)).toEqual([true, true]);
    });

    // ── I — draft isolation ───────────────────────────────────────────────

    it("Content Studio shows the DRAFT order", async () => {
      const state = await studio.getBookState("orden");
      expect(state.chapters.map((c) => c.title)).toEqual([
        "Cap C",
        "Cap A",
        "Cap B",
      ]);
    });

    it("the reader still sees the PUBLISHED order", async () => {
      for (const [order, key] of [
        [1, "A"],
        [2, "B"],
        [3, "C"],
      ] as const) {
        const res = await lector.getChapter(
          USER,
          "FREE" as never,
          "orden",
          order,
        );
        expect(res.chapter.readerRef).toEqual({
          kind: "chapter",
          id: chapterId[`orden:${key}`],
        });
      }
    });

    it("Book Detail still lists the PUBLISHED order", async () => {
      const detail = await books.getDetail(USER, "orden");
      expect(detail.chaptersList.map((c) => c.readerRef)).toEqual([
        { kind: "chapter", id: chapterId["orden:A"] },
        { kind: "chapter", id: chapterId["orden:B"] },
        { kind: "chapter", id: chapterId["orden:C"] },
      ]);
    });

    it("the card's structure is unchanged too", async () => {
      const list = await books.list(USER, {} as never);
      expect(list.books.find((b) => b.slug === "orden")?.chapters).toBe(3);
    });

    // ── N + O — two editors ───────────────────────────────────────────────

    it("a second editor working from the old revision is refused", async () => {
      const revisionsBefore = await revisionCountOf("orden");
      await expect(
        studio.reorderChapters("orden", {
          // The revision they loaded, which the first editor has superseded.
          expectedRevisionId: baseRevisionId,
          orderedChapterOrders: [2, 1, 3],
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await revisionCountOf("orden")).toBe(revisionsBefore);
    });

    it("a stale chapter screen cannot save its text into the new occupant", async () => {
      // The tab opened position 1 when it was A. It now holds C. Saving must
      // not put A's text into C — and the concurrency token is what catches
      // it, before the payload is interpreted as anything at all.
      const revisionsBefore = await revisionCountOf("orden");
      const cBefore = await prisma.blockVersion.findMany({
        where: {
          unitVersion: { unitId: unitId["orden:C"] },
        },
        select: { content: true },
      });

      // Deliberately a request that is valid in every other respect — no
      // title, which is the one field this surface would refuse on its own —
      // so the ONLY thing that can stop it is the stale concurrency token.
      await expect(
        studio.saveChapterDraft("orden", 1, {
          expectedRevisionId: baseRevisionId,
          blocks: [{ kind: "PARAGRAPH", content: "TEXTO VIEJO DE A" }],
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "CONTENT_DRAFT_CONFLICT" },
      });

      expect(await revisionCountOf("orden")).toBe(revisionsBefore);
      expect(
        await prisma.blockVersion.findMany({
          where: { unitVersion: { unitId: unitId["orden:C"] } },
          select: { content: true },
        }),
      ).toEqual(cBefore);
      expect(
        await prisma.blockVersion.count({
          where: { content: "TEXTO VIEJO DE A" },
        }),
      ).toBe(0);
    });
  });

  // ── D — the slot set is permuted, not renumbered ─────────────────────────

  it("preserves a gapped slot set instead of closing it up", async () => {
    const baseId = await editingRevisionOf("hueco");
    const res = await studio.reorderChapters("hueco", {
      expectedRevisionId: baseId,
      orderedChapterOrders: [4, 1, 3],
    });

    const rows = await manifestOf(res.revisionId);
    expect(rows.map((r) => r.order)).toEqual([1, 3, 4]);
    expect(rows.map((r) => [r.order, r.unitId])).toEqual([
      [1, unitId["hueco:C"]],
      [3, unitId["hueco:A"]],
      [4, unitId["hueco:B"]],
    ]);
  });

  // ── B + F + L + M — the refusals ─────────────────────────────────────────

  describe("books that may not be reordered", () => {
    const refuses = async (
      slug: string,
      orders: number[],
      expected: { status: number; code: string },
    ) => {
      const revisionsBefore = await revisionCountOf(slug);
      const unitsBefore = await prisma.revisionUnit.count({
        where: { revision: { editionId: editionId[slug] } },
      });
      const pointerBefore = (
        await prisma.edition.findUniqueOrThrow({
          where: { id: editionId[slug] },
        })
      ).publishedRevisionId;

      await expect(
        studio.reorderChapters(slug, {
          expectedRevisionId: await editingRevisionOf(slug),
          orderedChapterOrders: orders,
        }),
      ).rejects.toMatchObject({
        status: expected.status,
        response: { code: expected.code },
      });

      // Nothing at all: no revision, no rows, no archive, no pointer move.
      expect(await revisionCountOf(slug)).toBe(revisionsBefore);
      expect(
        await prisma.revisionUnit.count({
          where: { revision: { editionId: editionId[slug] } },
        }),
      ).toBe(unitsBefore);
      expect(
        (
          await prisma.edition.findUniqueOrThrow({
            where: { id: editionId[slug] },
          })
        ).publishedRevisionId,
      ).toBe(pointerBefore);
      expect(
        await prisma.revision.count({
          where: { editionId: editionId[slug], status: "ARCHIVED" },
        }),
      ).toBe(0);
    };

    it("an edition whose entitlement is still legacy", async () => {
      // `accessPlan = null` means free-preview is still answered from
      // `Chapter.order`, so moving chapters would move who can read them.
      await refuses("sin-plan", [2, 1], {
        status: 422,
        code: "CONTENT_REORDER_REQUIRES_NATIVE_ENTITLEMENT",
      });
    });

    it("a book with a legacy chapter Content Core never adopted", async () => {
      await refuses("sin-sync", [1], {
        status: 422,
        code: "CONTENT_STRUCTURE_REQUIRES_SYNC",
      });
    });

    it("a book where a position answers to two different things", async () => {
      await refuses("conflicto", [2, 1], {
        status: 422,
        code: "CONTENT_STRUCTURE_REQUIRES_SYNC",
      });
    });

    it("a move that would cross a part boundary", async () => {
      // C would land in slot 2, which belongs to Parte I.
      await refuses("partes", [1, 3, 2, 4], {
        status: 422,
        code: "CONTENT_REORDER_ACROSS_PARTS_UNSUPPORTED",
      });
    });

    it("but reordering WITHIN a part is fine", async () => {
      const res = await studio.reorderChapters("partes", {
        expectedRevisionId: await editingRevisionOf("partes"),
        orderedChapterOrders: [2, 1, 4, 3],
      });
      const rows = await manifestOf(res.revisionId);
      expect(rows.map((r) => r.unitId)).toEqual([
        unitId["partes:B"],
        unitId["partes:A"],
        unitId["partes:D"],
        unitId["partes:C"],
      ]);
      // And each chapter kept its own part.
      expect(rows.map((r) => r.order)).toEqual([1, 2, 3, 4]);
      const parts = await prisma.revisionUnit.findMany({
        where: { revisionId: res.revisionId },
        orderBy: { order: "asc" },
        select: { partNumber: true, partTitle: true },
      });
      expect(parts).toEqual([
        { partNumber: 1, partTitle: "Parte I" },
        { partNumber: 1, partTitle: "Parte I" },
        { partNumber: 2, partTitle: "Parte II" },
        { partNumber: 2, partTitle: "Parte II" },
      ]);
    });

    it("the book state says so before the editor tries", async () => {
      const blocked = await studio.getBookState("sin-plan");
      expect(blocked.reorderAvailable).toBe(false);
      expect(blocked.reorderBlockedReason).toBe("NATIVE_ENTITLEMENT_REQUIRED");

      const pending = await studio.getBookState("sin-sync");
      expect(pending.reorderAvailable).toBe(false);
      expect(pending.reorderBlockedReason).toBe("PENDING_SYNC");

      const fine = await studio.getBookState("hueco");
      expect(fine.reorderAvailable).toBe(true);
      expect(fine.reorderBlockedReason).toBeNull();
    });
  });

  // ── the other structural writers serialise against it ───────────────────

  describe("a chapter write waits for the edition lock", () => {
    let chapters: ChaptersService;

    beforeAll(async () => {
      chapters = new ChaptersService(prisma as never, {} as never);
      await makeBook("serializa", { units: [{ key: "A", order: 1 }] });
    }, 120_000);

    it("blocks while a reorder holds the lock, and proceeds once it does not", async () => {
      // `POST /api/books/:slug/chapters` creates a `Chapter` with no unit —
      // an UNADOPTED chapter, which is exactly the state that makes a book
      // ineligible to reorder. The reorder write decides that eligibility
      // inside the edition lock, so this insert must not be able to land in
      // the middle of it.
      const holder = await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query(
          `SELECT "id" FROM "Edition" WHERE "slug" = $1 FOR UPDATE`,
          ["serializa"],
        );

        // Waits, then gives up — which it could only do by asking for the
        // same row lock. Postgres decides this, not a timer in the test.
        await expect(
          chapters.create("serializa", { order: 2, title: "Dos" } as never),
        ).rejects.toThrow(/lock timeout|55P03|canceling statement/i);

        // And nothing was written while it was blocked.
        expect(
          await prisma.chapter.count({
            where: { bookId: bookId["serializa"] },
          }),
        ).toBe(1);
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }

      // Lock released: the same call now succeeds. Proves the refusal above
      // was contention and not some unrelated failure in the write.
      await chapters.create("serializa", {
        order: 2,
        title: "Dos",
      } as never);
      expect(
        await prisma.chapter.count({ where: { bookId: bookId["serializa"] } }),
      ).toBe(2);
    }, 60_000);

    it("the manuscript ingest script waits for it too", async () => {
      // `scripts/ingest-chapter-md.mjs` upserts `Chapter` rows, and its own
      // usage line offers a Railway shell — so it is production-capable
      // against an adopted book. Its production refusal keys on PSICO_ENV,
      // which says where the process is running, not which database it is
      // pointed at, so it is not what keeps this safe. The lock is.
      //
      // Driven as the real subprocess rather than a reimplementation of it,
      // because what is being proved is that THIS script takes the lock.
      const md = join(tmpdir(), `reorder-ingest-${process.pid}.md`);
      writeFileSync(
        md,
        "Capítulo de prueba\n\nUn párrafo cualquiera para que el parser tenga algo que hacer.\n",
        "utf8",
      );
      const run = () =>
        spawnSync(
          "node",
          [
            "scripts/ingest-chapter-md.mjs",
            "--file",
            md,
            "--order",
            "7",
            "--book",
            "serializa",
          ],
          {
            cwd: API_DIR,
            encoding: "utf8",
            env: {
              ...process.env,
              DATABASE_URL: dbUrl,
              ALLOW_LEGACY_DESTRUCTIVE_INGEST: "on",
              PSICO_ENV: "test",
            },
          },
        );

      const holder = await pool.connect();
      let blocked;
      try {
        await holder.query("BEGIN");
        await holder.query(
          `SELECT "id" FROM "Edition" WHERE "slug" = $1 FOR UPDATE`,
          ["serializa"],
        );
        blocked = run();
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }

      expect(blocked.status).not.toBe(0);
      expect(`${blocked.stdout}${blocked.stderr}`).toMatch(
        /lock timeout|55P03|canceling statement/i,
      );
      expect(
        await prisma.chapter.count({
          where: { bookId: bookId["serializa"], order: 7 },
        }),
      ).toBe(0);

      // Released: the same command now lands, so the refusal above was
      // contention and not the script being broken.
      const after = run();
      expect(after.status).toBe(0);
      expect(
        await prisma.chapter.count({
          where: { bookId: bookId["serializa"], order: 7 },
        }),
      ).toBe(1);
    }, 120_000);
  });

  // ── the refusal belongs to the WRITE, not to one HTTP caller ─────────────

  describe("the domain primitive owns the rule", () => {
    /** Everything a reorder could possibly have written, for this edition. */
    const structuralState = async (slug: string) => ({
      revisions: await prisma.revision.findMany({
        where: { editionId: editionId[slug] },
        orderBy: { number: "asc" },
        select: { id: true, number: true, status: true, note: true },
      }),
      units: await prisma.revisionUnit.findMany({
        where: { revision: { editionId: editionId[slug] } },
        orderBy: [{ revisionId: "asc" }, { order: "asc" }],
        select: { revisionId: true, unitId: true, order: true },
      }),
      pointer: (
        await prisma.edition.findUniqueOrThrow({
          where: { id: editionId[slug] },
        })
      ).publishedRevisionId,
    });

    it("refuses an unsynced book when called directly, bypassing the service", async () => {
      // The service check is a courtesy. If the only thing standing between an
      // unadopted chapter and a reorder were `ContentStudioService`, then any
      // other caller — a script, a job, the next endpoint someone writes —
      // would be a way around a hard invariant.
      const before = await structuralState("sin-sync");
      const baseId = (
        await prisma.edition.findUniqueOrThrow({
          where: { id: editionId["sin-sync"] },
        })
      ).publishedRevisionId!;

      await expect(
        reorderDraftManifest(prisma as never, {
          editionId: editionId["sin-sync"],
          expectedRevisionId: baseId,
          orderedCurrentOrders: [1],
        }),
      ).rejects.toThrow(/CONTENT_STRUCTURE_REQUIRES_SYNC/);

      expect(await structuralState("sin-sync")).toEqual(before);
    });

    it("refuses a conflicted book when called directly", async () => {
      const before = await structuralState("conflicto");
      const baseId = (
        await prisma.edition.findUniqueOrThrow({
          where: { id: editionId["conflicto"] },
        })
      ).publishedRevisionId!;

      await expect(
        reorderDraftManifest(prisma as never, {
          editionId: editionId["conflicto"],
          expectedRevisionId: baseId,
          orderedCurrentOrders: [2, 1],
        }),
      ).rejects.toThrow(/CONTENT_STRUCTURE_REQUIRES_SYNC/);

      expect(await structuralState("conflicto")).toEqual(before);
    });

    // ── the window the revision token cannot cover ────────────────────────

    /**
     * A reorder whose eligibility changes after the service checked it.
     *
     * The service reads the book's structure BEFORE opening a transaction. The
     * revision token catches a manifest that moved, but an unadopted `Chapter`
     * row is invisible to it — the manifest is untouched, so the token still
     * matches. The only thing that can catch it is the read inside the lock.
     *
     * Interleaved deterministically rather than with a sleep: the write lands
     * on a separate committed statement, in the gap between the service's
     * check and the transaction body, by intercepting `$transaction` itself.
     */
    const studioWithMutationBeforeTx = (mutate: () => Promise<unknown>) => {
      let fired = false;
      const proxy = new Proxy(prisma as object, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (prop !== "$transaction") return value;
          return async (...args: unknown[]) => {
            if (!fired) {
              fired = true;
              await mutate();
            }
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
      return new ContentStudioService(
        proxy as never,
        {
          get: () => "https://assets.example.com",
        } as never,
      );
    };

    it("an unsynced chapter appearing after the precheck stops the write", async () => {
      const before = await structuralState("carrera-1");
      const baseId = await editingRevisionOf("carrera-1");

      const racing = studioWithMutationBeforeTx(() =>
        prisma.chapter.create({
          data: {
            bookId: bookId["carrera-1"],
            // A slot the manifest says nothing about: unadopted, not conflicted.
            order: 9,
            title: "Aparecido",
            isPublished: true,
          },
        }),
      );

      await expect(
        racing.reorderChapters("carrera-1", {
          expectedRevisionId: baseId,
          orderedChapterOrders: [2, 1],
        }),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: "CONTENT_STRUCTURE_REQUIRES_SYNC" },
      });

      // No revision, no RevisionUnit, no archive, no pointer move.
      expect(await structuralState("carrera-1")).toEqual(before);
    });

    it("a colliding chapter appearing after the precheck stops the write", async () => {
      const before = await structuralState("carrera-2");
      const baseId = await editingRevisionOf("carrera-2");

      const racing = studioWithMutationBeforeTx(async () => {
        // Free the slot on the legacy side, then claim it with a row that is
        // NOT the chapter the manifest has there — a genuine conflict.
        await prisma.chapter.update({
          where: { id: chapterId["carrera-2:B"] },
          data: { order: 99 },
        });
        await prisma.chapter.create({
          data: {
            bookId: bookId["carrera-2"],
            order: 2,
            title: "Intruso",
            isPublished: true,
          },
        });
      });

      await expect(
        racing.reorderChapters("carrera-2", {
          expectedRevisionId: baseId,
          orderedChapterOrders: [2, 1],
        }),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: "CONTENT_STRUCTURE_REQUIRES_SYNC" },
      });

      expect(await structuralState("carrera-2")).toEqual(before);
    });
  });

  // ── J + K + Q + R — after the reorder is published ───────────────────────

  describe("once the reorder is published", () => {
    let publishedRevisionId = "";

    beforeAll(async () => {
      // Before the pointer moves, the reader sees the old complete structure.
      const beforeRef = (
        await lector.getChapter(USER, "FREE" as never, "publicado", 1)
      ).chapter.readerRef;
      expect(beforeRef).toEqual({
        kind: "chapter",
        id: chapterId["publicado:A"],
      });

      const reordered = await studio.reorderChapters("publicado", {
        expectedRevisionId: await editingRevisionOf("publicado"),
        orderedChapterOrders: [3, 1, 2],
      });
      // The EXISTING publish lifecycle. There is no reorder-specific publish.
      const published = await studio.publishBook(
        "publicado",
        reordered.revisionId,
      );
      publishedRevisionId = published.revisionId;
    }, 120_000);

    it("the reader now sees the new structure, complete", async () => {
      const seen: string[] = [];
      for (const order of [1, 2, 3]) {
        const res = await lector.getChapter(
          USER,
          "FREE" as never,
          "publicado",
          order,
        );
        seen.push((res.chapter.readerRef as { id: string }).id);
      }
      // Whole structure at once — no position left showing the old occupant.
      expect(seen).toEqual([
        chapterId["publicado:C"],
        chapterId["publicado:A"],
        chapterId["publicado:B"],
      ]);
      expect(
        (
          await prisma.edition.findUniqueOrThrow({
            where: { id: editionId["publicado"] },
          })
        ).publishedRevisionId,
      ).toBe(publishedRevisionId);
    });

    it("an old positional URL serves whoever holds that position now", async () => {
      const { readerRef } = await lector.getLocator(
        USER,
        "FREE" as never,
        "publicado",
        1,
      );
      expect(readerRef).toEqual({
        kind: "chapter",
        id: chapterId["publicado:C"],
      });
    });

    it("each canonical link still opens its own chapter, at its new number", async () => {
      for (const [key, order] of [
        ["C", 1],
        ["A", 2],
        ["B", 3],
      ] as const) {
        const res = await lector.getChapterByRef(
          USER,
          "FREE" as never,
          "publicado",
          { kind: "chapter", id: chapterId[`publicado:${key}`] },
        );
        expect(res.chapter.order).toBe(order);
        expect(res.chapter.readerRef).toEqual({
          kind: "chapter",
          id: chapterId[`publicado:${key}`],
        });
      }
    });

    // ── K4 — clients that name what they mean keep working ────────────────

    it("a heartbeat naming the chapter writes THAT chapter, stale position and all", async () => {
      const cBefore = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, chapterId: chapterId["publicado:C"] },
      });
      const res = await lector.heartbeat(USER, {
        bookId: bookId["publicado"],
        chapterOrder: 1, // where A used to be
        chapterId: chapterId["publicado:A"],
        lastBlockId: blockId["publicado:A"],
        timeSpentDeltaSec: 30,
        progressPct: 0.4,
      });
      expect(res.ok).toBe(true);
      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, chapterId: chapterId["publicado:A"] },
      });
      expect(session.progressPct).toBeCloseTo(0.4);
      // And emphatically not the chapter that took position 1. Its session
      // exists — the reader opened it above — so what matters is that this
      // beat did not touch it.
      const c = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, chapterId: chapterId["publicado:C"] },
      });
      expect(c.progressPct).toBe(cBefore.progressPct);
      expect(c.timeSpentSec).toBe(cBefore.timeSpentSec);
    });

    it("a heartbeat naming the unit writes THAT unit", async () => {
      const res = await lector.heartbeat(USER, {
        bookId: bookId["publicado"],
        chapterOrder: 1,
        contentUnitId: unitId["publicado:B"],
        lastBlockId: "b",
        timeSpentDeltaSec: 30,
        progressPct: 0.6,
      });
      expect(res.ok).toBe(true);
      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, contentUnitId: unitId["publicado:B"] },
      });
      expect(session.progressPct).toBeCloseTo(0.6);
    });

    it("a completion naming the chapter completes THAT chapter", async () => {
      const res = await lector.completeChapter(
        USER,
        "publicado",
        1, // stale
        undefined,
        chapterId["publicado:A"],
      );
      expect(res.ok).toBe(true);
      expect(
        await prisma.userProgress.count({
          where: { userId: USER, chapterId: chapterId["publicado:A"] },
        }),
      ).toBe(1);
      expect(
        await prisma.userProgress.count({
          where: { userId: USER, chapterId: chapterId["publicado:C"] },
        }),
      ).toBe(0);
    });

    it("a completion naming the unit completes THAT unit", async () => {
      const res = await lector.completeChapter(
        USER,
        "publicado",
        1,
        unitId["publicado:B"],
      );
      expect(res.ok).toBe(true);
      expect(
        await prisma.userProgress.count({
          where: { userId: USER, contentUnitId: unitId["publicado:B"] },
        }),
      ).toBe(1);
    });

    // ── K2 + K3 — clients that can only say "position 1" ──────────────────

    it("a position-only heartbeat writes nothing", async () => {
      // Both candidates, exactly as they stand: the C that holds position 1
      // now, and the A that held it when an ancient tab was opened.
      const snapshot = async () =>
        prisma.readingSession.findMany({
          where: {
            userId: USER,
            chapterId: {
              in: [chapterId["publicado:A"], chapterId["publicado:C"]],
            },
          },
          orderBy: { chapterId: "asc" },
          select: { chapterId: true, progressPct: true, timeSpentSec: true },
        });
      const before = await snapshot();
      expect(before).toHaveLength(2);

      const res = await lector.heartbeat(USER, {
        bookId: bookId["publicado"],
        chapterOrder: 1,
        lastBlockId: "b",
        timeSpentDeltaSec: 600,
        progressPct: 0.99,
      });

      // Soft-acked, because a heartbeat is fire-and-forget — but the server
      // cannot tell whether "1" means the C that is there now or the A that was
      // there when the tab opened, so it writes to neither.
      expect(res.ok).toBe(true);
      expect(await snapshot()).toEqual(before);
    });

    it("a position-only completion is refused outright", async () => {
      const progressBefore = await prisma.userProgress.count({
        where: { userId: USER },
      });

      await expect(
        lector.completeChapter(USER, "publicado", 1),
      ).rejects.toThrow(/CHAPTER_NOT_FOUND/);

      // Neither the current occupant nor the historical one.
      expect(await prisma.userProgress.count({ where: { userId: USER } })).toBe(
        progressBefore,
      );
      expect(
        await prisma.userProgress.count({
          where: { userId: USER, chapterId: chapterId["publicado:C"] },
        }),
      ).toBe(0);
    });

    // ── S — history is immutable, and the loss of safety is monotonic ─────

    it("reordering BACK does not re-enable position-only writes", async () => {
      const reverted = await studio.reorderChapters("publicado", {
        expectedRevisionId: await editingRevisionOf("publicado"),
        // C A B → A B C again.
        orderedChapterOrders: [2, 3, 1],
      });
      await studio.publishBook("publicado", reverted.revisionId);

      // The book reads exactly as it did originally...
      const { readerRef } = await lector.getLocator(
        USER,
        "FREE" as never,
        "publicado",
        1,
      );
      expect(readerRef).toEqual({
        kind: "chapter",
        id: chapterId["publicado:A"],
      });

      // ...and the tab that predates all of this is still out there, so a
      // payload with no identity is still ambiguous.
      await expect(
        lector.completeChapter(USER, "publicado", 3),
      ).rejects.toThrow(/CHAPTER_NOT_FOUND/);
    });

    it("every published revision is still readable as its own snapshot", async () => {
      const revisions = await prisma.revision.findMany({
        where: {
          editionId: editionId["publicado"],
          publishedAt: { not: null },
        },
        orderBy: { number: "asc" },
        select: { id: true, number: true },
      });
      expect(revisions.length).toBeGreaterThanOrEqual(3);

      const shapes = [];
      for (const r of revisions) shapes.push(await manifestOf(r.id));
      // r1 A B C · r2 C A B · r3 A B C — each intact, none rewritten by the
      // ones that came after.
      expect(shapes[0]!.map((x) => x.unitId)).toEqual([
        unitId["publicado:A"],
        unitId["publicado:B"],
        unitId["publicado:C"],
      ]);
      expect(shapes[1]!.map((x) => x.unitId)).toEqual([
        unitId["publicado:C"],
        unitId["publicado:A"],
        unitId["publicado:B"],
      ]);
      expect(shapes[2]!.map((x) => x.unitId)).toEqual([
        unitId["publicado:A"],
        unitId["publicado:B"],
        unitId["publicado:C"],
      ]);
    });

    it("a book nobody reordered still accepts position-only writes", async () => {
      // The compatibility this gate is narrow enough to preserve. `hueco` has
      // a draft reorder but has never PUBLISHED one.
      const res = await lector.heartbeat(USER, {
        bookId: bookId["hueco"],
        chapterOrder: 1,
        lastBlockId: "b",
        timeSpentDeltaSec: 45,
        progressPct: 0.3,
      });
      expect(res.ok).toBe(true);
      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, chapterId: chapterId["hueco:A"] },
      });
      expect(session.progressPct).toBeCloseTo(0.3);
    });
  });

  // ── the editorial read projection carries placement metadata ────────────

  describe("Book State exposes the manifest's part metadata", () => {
    it("a book with no parts reports the null/null tuple", async () => {
      // null/null is a real tuple, not missing data: it is what "this book has
      // no parts" looks like, and the reorder UI compares tuples.
      const state = await studio.getBookState("sin-plan");
      expect(state.chapters.map((c) => [c.partNumber, c.partTitle])).toEqual([
        [null, null],
        [null, null],
      ]);
    });

    it("a book with parts reports each chapter's own part", async () => {
      const state = await studio.getBookState("partes");
      expect(
        state.chapters.map((c) => [c.order, c.partNumber, c.partTitle]),
      ).toEqual([
        [1, 1, "Parte I"],
        [2, 1, "Parte I"],
        [3, 2, "Parte II"],
        [4, 2, "Parte II"],
      ]);
    });

    it("adds placement metadata and no internal identity", async () => {
      // The projection may say WHERE a chapter sits. It may not hand the
      // browser anything it could use to address a unit, a revision row or a
      // legacy chapter directly — reorder sends positions precisely so that
      // resolving identity stays on the server.
      const state = await studio.getBookState("partes");
      const keys = Object.keys(state.chapters[0]!).sort();
      expect(keys).toEqual(
        [
          "changed",
          "editable",
          "ingested",
          "isNewDraftChapter",
          "order",
          "partNumber",
          "partTitle",
          "title",
          "titleEditable",
        ].sort(),
      );
      const serialised = JSON.stringify(state.chapters);
      for (const forbidden of [
        unitId["partes:A"],
        editionId["partes"],
        chapterId["partes:A"],
      ]) {
        expect(serialised).not.toContain(forbidden);
      }
    });
  });

  // ── R — entitlement belongs to the chapter, not to the position ──────────

  it("the free preview stays with the chapter that has it", async () => {
    // `pro-preview` already has a draft swapping A and B; publish it.
    const draft = await describeEditionDraft(prisma, editionId["pro-preview"]);
    await studio.publishBook("pro-preview", draft.draftRevisionId!);

    const access = new ContentAccessService(prisma as never);
    const freeUser = { userId: USER, userPlan: "FREE" };
    const editionKey = "pro-preview-1e"; // gitleaks:allow — a book slug

    // A is at position 2 now and keeps its preview.
    await expect(
      access.assertCanReadUnit({
        ...freeUser,
        editionKey,
        unitKey: unitKeyFromLegacyChapterId(chapterId["pro-preview:A"]),
      } as never),
    ).resolves.toBeUndefined();

    // B moved INTO position 1 and does not gain one.
    await expect(
      access.assertCanReadUnit({
        ...freeUser,
        editionKey,
        unitKey: unitKeyFromLegacyChapterId(chapterId["pro-preview:B"]),
      } as never),
    ).rejects.toThrow(/PRO_REQUIRED/);

    // And the reader agrees, through the route a reader actually uses.
    await expect(
      lector.getChapterByRef(USER, "FREE" as never, "pro-preview", {
        kind: "chapter",
        id: chapterId["pro-preview:B"],
      }),
    ).rejects.toThrow(/PRO_REQUIRED/);

    // No flag was written by any of it.
    const units = await prisma.contentUnit.findMany({
      where: { editionId: editionId["pro-preview"] },
      select: { id: true, isFreePreview: true },
    });
    expect(
      units.find((u) => u.id === unitId["pro-preview:A"])!.isFreePreview,
    ).toBe(true);
    expect(
      units.find((u) => u.id === unitId["pro-preview:B"])!.isFreePreview,
    ).toBe(false);
  });
});
