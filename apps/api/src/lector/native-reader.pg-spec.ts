import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";

import { LectorService } from "./lector.service";
import { ContentAccessService } from "../content-core/access/content-access.service";

/**
 * A chapter that exists only in Content Core, opened through the real reader.
 *
 * #580 made such a chapter AUTHORIZABLE. It was still unopenable: every part of
 * `getChapter` went through a legacy `Chapter` row — the lookup itself, the
 * reading session, completion, the title, the part label. Entitlement had
 * stopped being the blocker and the envelope had become one.
 *
 * The fixture is a production-shaped existing Book that gains a native chapter:
 * legacy chapters 1 and 2 keep their Chapter rows, and chapter 3 has none at
 * all. That is the exact shape Content Studio will produce.
 */

const DB = "native_reader_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("native reader · a chapter with no legacy Chapter row", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let lector: LectorService;

  let bookId = "";
  let editionId = "";
  let publishedRevisionId = "";
  let nativeUnitId = "";
  let legacyChapter1Id = "";
  const USER = "user-native";

  /** Build a native unit and place it in the given revision. */
  async function makeNativeUnit(opts: {
    unitKey: string;
    title: string;
    order: number;
    revisionId: string;
    isFreePreview?: boolean;
    summary?: string;
    durationMinutes?: number;
    partNumber?: number;
    partTitle?: string;
  }) {
    const unit = await prisma.contentUnit.create({
      data: {
        editionId,
        unitKey: opts.unitKey,
        isFreePreview: opts.isFreePreview ?? false,
      },
    });
    const version = await prisma.contentUnitVersion.create({
      data: {
        unitId: unit.id,
        title: opts.title,
        summary: opts.summary ?? null,
        durationMinutes: opts.durationMinutes ?? null,
      },
    });
    const block = await prisma.contentBlock.create({
      data: { unitId: unit.id, blockKey: `bk-${opts.unitKey}` },
    });
    await prisma.blockVersion.create({
      data: {
        contentBlockId: block.id,
        unitVersionId: version.id,
        order: 1,
        kind: "PARAGRAPH",
        content: `Texto de ${opts.title}.`,
        contentHash: `hash-${opts.unitKey}`,
      },
    });
    await prisma.revisionUnit.create({
      data: {
        revisionId: opts.revisionId,
        unitId: unit.id,
        unitVersionId: version.id,
        order: opts.order,
        partNumber: opts.partNumber ?? null,
        partTitle: opts.partTitle ?? null,
      },
    });
    return unit.id;
  }

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
    lector = new LectorService(
      prisma as never,
      { get: () => undefined } as never, // ConfigService
      {} as never, // StorageService — signed audio URLs are not on this path
      new ContentAccessService(prisma as never) as never,
    );

    await prisma.user.create({
      data: { id: USER, email: "native@test.local", name: "N" },
    });

    // An existing PRO book with two ordinary legacy chapters.
    const book = await prisma.book.create({
      data: {
        slug: "libro-nativo",
        title: "Libro",
        plan: "PRO",
        totalChapters: 2,
      },
    });
    bookId = book.id;
    const ch1 = await prisma.chapter.create({
      data: { bookId, order: 1, title: "Uno" },
    });
    legacyChapter1Id = ch1.id;
    await prisma.chapter.create({ data: { bookId, order: 2, title: "Dos" } });

    const work = await prisma.work.create({
      data: { workKey: "w-nativo", title: "Libro", authorName: "A" },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: "libro-nativo-1e", // gitleaks:allow — a book slug, not a key
        slug: "libro-nativo",
        label: "Primera",
        // #580 — native entitlement ownership.
        accessPlan: "PRO",
      },
    });
    editionId = edition.id;

    const revision = await prisma.revision.create({
      data: {
        editionId,
        number: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    publishedRevisionId = revision.id;
    await prisma.edition.update({
      where: { id: editionId },
      data: { publishedRevisionId: revision.id },
    });

    // Positions 1 and 2 mirror the legacy chapters; position 3 is native-only.
    await makeNativeUnit({
      unitKey: "u-1",
      title: "Uno",
      order: 1,
      revisionId: revision.id,
      isFreePreview: true,
    });
    await makeNativeUnit({
      unitKey: "u-2",
      title: "Dos",
      order: 2,
      revisionId: revision.id,
    });
    nativeUnitId = await makeNativeUnit({
      unitKey: "u-nativa",
      title: "Capítulo nativo",
      order: 3,
      revisionId: revision.id,
      summary: "Un resumen nativo.",
      durationMinutes: 11,
      partNumber: 2,
      partTitle: "Parte II",
    });
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  const open = (order: number, plan: "FREE" | "PRO" = "PRO") =>
    lector.getChapter(USER, plan as never, "libro-nativo", order);

  it("the fixture has no Chapter row at position 3", async () => {
    // If one existed the whole suite would be exercising the legacy path.
    expect(await prisma.chapter.count({ where: { bookId } })).toBe(2);
  });

  describe("the envelope", () => {
    it("opens a native chapter and takes its metadata from Content Core", async () => {
      const res = await open(3);

      expect(res.chapter.title).toBe("Capítulo nativo");
      expect(res.chapter.subtitle).toBe("Un resumen nativo.");
      expect(res.chapter.durationMinutes).toBe(11);
      expect(res.chapter.partNumber).toBe(2);
      expect(res.chapter.partTitle).toBe("Parte II");
      expect(res.chapter.order).toBe(3);
    });

    it("carries the unit as the chapter identity, not a fabricated id", async () => {
      const res = await open(3);
      expect(res.chapter.id).toBe(nativeUnitId);
      // And that id really is a ContentUnit, not a Chapter.
      expect(
        await prisma.contentUnit.count({ where: { id: res.chapter.id } }),
      ).toBe(1);
      expect(
        await prisma.chapter.count({ where: { id: res.chapter.id } }),
      ).toBe(0);
    });

    it("counts what a reader can navigate, without writing the legacy column", async () => {
      const res = await open(3);
      // Three placed units, even though Book.totalChapters still says 2.
      expect(res.book.totalChapters).toBe(3);
      const book = await prisma.book.findUniqueOrThrow({
        where: { id: bookId },
      });
      expect(book.totalChapters).toBe(2);
    });

    it("reports empty extras truthfully rather than faking them", async () => {
      // A chapter with no exercises, no audio and no legacy blocks is still a
      // perfectly valid chapter. What it must not do is invent any of them.
      const res = await open(3);
      expect(res.lessons).toEqual([]);
      expect(res.chapter.audioAvailable).toBe(false);
      expect(res.blocks).toEqual([]);
      expect(res.highlights).toEqual([]);
      expect(res.annotations).toEqual([]);
    });

    it("404s a position that exists nowhere", async () => {
      await expect(open(9)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("access reuses #580, by unit", () => {
    it("denies a FREE reader the gated native chapter", async () => {
      await expect(open(3, "FREE")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("allows a FREE reader the designated preview", async () => {
      // Position 1 has a legacy chapter too, so this also pins that the legacy
      // path still decides identically.
      await expect(open(1, "FREE")).resolves.toBeTruthy();
    });
  });

  describe("session and completion belong to the unit", () => {
    it("creates a session against the unit, with no chapter", async () => {
      await open(3);
      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, contentUnitId: nativeUnitId },
      });
      expect(session.chapterId).toBeNull();
    });

    it("persists heartbeat progress", async () => {
      await lector.heartbeat(USER, {
        bookId,
        chapterOrder: 3,
        progressPct: 0.47,
        timeSpentDeltaSec: 30,
        lastBlockId: null,
      } as never);

      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, contentUnitId: nativeUnitId },
      });
      expect(session.progressPct).toBeCloseTo(0.47);
      expect(session.timeSpentSec).toBe(30);
    });

    it("completes the native chapter", async () => {
      const res = await lector.completeChapter(USER, "libro-nativo", 3);
      // Position 3 of 3 — nothing after it.
      expect(res.nextChapter).toBeNull();

      const progress = await prisma.userProgress.findFirstOrThrow({
        where: { userId: USER, contentUnitId: nativeUnitId },
      });
      expect(progress.chapterId).toBeNull();
    });

    it("refuses a second session for the same user and unit", async () => {
      // The unique index is what stops two concurrent opens from splitting one
      // reader's progress in half.
      await expect(
        prisma.readingSession.create({
          data: { userId: USER, contentUnitId: nativeUnitId },
        }),
      ).rejects.toThrow();
    });

    it("never lets a heartbeat write into a book it was not sent for", async () => {
      // The unit is resolved server-side from (book, position); a client cannot
      // name one. Sending a position that does not exist is acked and dropped.
      const res = await lector.heartbeat(USER, {
        bookId,
        chapterOrder: 99,
        progressPct: 0.9,
        timeSpentDeltaSec: 10,
        lastBlockId: null,
      } as never);
      expect(res.ok).toBe(true);
      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, contentUnitId: nativeUnitId },
      });
      // Untouched by the bogus position.
      expect(session.progressPct).toBe(1);
    });
  });

  describe("progress follows the unit, not the position", () => {
    it("survives a reorder", async () => {
      // The reason identity is the unit. Move the native chapter from 3 to 5
      // and put something else at 3.
      const displaced = await makeNativeUnit({
        unitKey: "u-otra",
        title: "Otra",
        order: 4,
        revisionId: publishedRevisionId,
      });

      await prisma.revisionUnit.updateMany({
        where: { revisionId: publishedRevisionId, unitId: nativeUnitId },
        data: { order: 5 },
      });
      await prisma.revisionUnit.updateMany({
        where: { revisionId: publishedRevisionId, unitId: displaced },
        data: { order: 3 },
      });

      // Same unit at its new position, same completed session.
      const moved = await open(5);
      expect(moved.chapter.id).toBe(nativeUnitId);
      expect(moved.session.progressPct).toBe(1);
      expect(moved.session.completedAt).not.toBeNull();

      // The new occupant of position 3 inherits nothing.
      const newcomer = await open(3);
      expect(newcomer.chapter.id).toBe(displaced);
      expect(newcomer.session.progressPct).toBe(0);
      expect(newcomer.session.completedAt).toBeNull();

      // And completion is still recorded against the unit that earned it.
      const progress = await prisma.userProgress.findMany({
        where: { userId: USER, contentUnitId: { not: null } },
      });
      expect(progress.map((p) => p.contentUnitId)).toEqual([nativeUnitId]);
    });
  });

  describe("draft structural work stays private", () => {
    it("does not serve a unit that is only in a draft revision", async () => {
      const draft = await prisma.revision.create({
        data: { editionId, number: 2, status: "DRAFT" },
      });
      // Copy the published placement forward, then add a new unit at 6.
      const published = await prisma.revisionUnit.findMany({
        where: { revisionId: publishedRevisionId },
      });
      for (const ru of published) {
        await prisma.revisionUnit.create({
          data: {
            revisionId: draft.id,
            unitId: ru.unitId,
            unitVersionId: ru.unitVersionId,
            order: ru.order,
          },
        });
      }
      await makeNativeUnit({
        unitKey: "u-borrador",
        title: "Sólo en borrador",
        order: 6,
        revisionId: draft.id,
      });

      // The reader resolves against the PUBLISHED revision only.
      await expect(open(6)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("legacy chapters do not regress", () => {
    it("still opens through the legacy path, with its Chapter identity", async () => {
      const res = await open(1, "FREE");
      expect(res.chapter.id).toBe(legacyChapter1Id);
      expect(res.chapter.title).toBe("Uno");
    });

    it("still writes its session against the legacy chapter", async () => {
      await lector.heartbeat(USER, {
        bookId,
        chapterOrder: 1,
        progressPct: 0.25,
        timeSpentDeltaSec: 5,
        lastBlockId: null,
      } as never);

      const session = await prisma.readingSession.findFirstOrThrow({
        where: { userId: USER, chapterId: legacyChapter1Id },
      });
      expect(session.contentUnitId).toBeNull();
      expect(session.progressPct).toBeCloseTo(0.25);
    });
  });
});
