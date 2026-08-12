import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ContentAccessService } from "../content-core/access/content-access.service";
import { LectorService } from "./lector.service";

/**
 * Naming a chapter is fail-CLOSED.
 *
 * Adding `chapterId` gave legacy writes a stable identity, but left a hole:
 * when the id did not resolve, the code fell through to the positional path.
 * So a malformed or foreign id would write to whichever chapter — very likely a
 * NATIVE one — happened to occupy that position. The stable identity would have
 * made things worse than the positional behaviour it replaced.
 *
 * The distinction that matters, and that these tests hold apart:
 *
 *   a stable identity was supplied and did not resolve   → nothing happens
 *   no stable identity was supplied                      → resolve by position
 *
 * The fixture puts a NATIVE chapter at position 2 precisely so that a fallback
 * would be visible: if the rule breaks, the unit at 2 gets written.
 */

const DB = "write_identity_db";
const SLUG = "libro-fail-closed";
const OTHER_SLUG = "libro-ajeno";
const USER = "u-fail-closed";
const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("stable write identity is fail-closed", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let lector: LectorService;
  let bookId = "";
  let legacyCh1 = "";
  let nativeUnitAt2 = "";
  let foreignChapterId = "";

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = new URL(base as string);
    url.pathname = `/${DB}`;
    execSync("pnpm exec prisma migrate deploy", {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url.toString() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    lector = new LectorService(
      prisma as never,
      { get: () => undefined } as never,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );

    await prisma.user.create({
      data: { id: USER, email: "fc@test.local", name: "F" },
    });

    // Book A: legacy chapter at 1, NATIVE at 2.
    const book = await prisma.book.create({
      data: { slug: SLUG, title: "Libro", plan: "FREE", totalChapters: 2 },
    });
    bookId = book.id;
    const ch1 = await prisma.chapter.create({
      data: { bookId, order: 1, title: "Uno", isPublished: true },
    });
    legacyCh1 = ch1.id;
    await prisma.chapterBlock.create({
      data: { chapterId: ch1.id, order: 0, kind: "PARAGRAPH", content: "T1" },
    });

    const work = await prisma.work.create({
      data: { workKey: "w-fc", title: "Libro", authorName: "A" },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: "libro-fail-closed-1e", // gitleaks:allow — a book slug
        slug: SLUG,
        label: "Primera",
        accessPlan: "FREE",
      },
    });
    const revision = await prisma.revision.create({
      data: {
        editionId: edition.id,
        number: 1,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    await prisma.edition.update({
      where: { id: edition.id },
      data: { publishedRevisionId: revision.id },
    });
    for (const [order, key] of [
      [1, "u-1"],
      [2, "u-2"],
    ] as const) {
      const unit = await prisma.contentUnit.create({
        data: { editionId: edition.id, unitKey: key, isFreePreview: true },
      });
      if (order === 2) nativeUnitAt2 = unit.id;
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: `Cap ${order}` },
      });
      const block = await prisma.contentBlock.create({
        data: { unitId: unit.id, blockKey: `bk-${key}` },
      });
      await prisma.blockVersion.create({
        data: {
          contentBlockId: block.id,
          unitVersionId: version.id,
          order: 1,
          kind: "PARAGRAPH",
          content: `Texto ${key}.`,
          contentHash: `hash-${key}`,
        },
      });
      await prisma.revisionUnit.create({
        data: {
          revisionId: revision.id,
          unitId: unit.id,
          unitVersionId: version.id,
          order,
        },
      });
    }

    // Book B, whose chapter id is a valid id — for the wrong book.
    const other = await prisma.book.create({
      data: {
        slug: OTHER_SLUG,
        title: "Otro",
        plan: "FREE",
        totalChapters: 1,
      },
    });
    const foreign = await prisma.chapter.create({
      data: {
        bookId: other.id,
        order: 1,
        title: "Ajeno",
        isPublished: true,
      },
    });
    foreignChapterId = foreign.id;
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  /** Everything a reader write could possibly have touched. */
  const snapshot = async () => ({
    sessions: await prisma.readingSession.count(),
    progress: await prisma.userProgress.count(),
    nativeSession: await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: nativeUnitAt2 },
    }),
    nativeProgress: await prisma.userProgress.findFirst({
      where: { userId: USER, contentUnitId: nativeUnitAt2 },
    }),
  });

  const beat = (chapterId: string | undefined, order: number) =>
    lector.heartbeat(USER, {
      bookId,
      chapterOrder: order,
      ...(chapterId ? { chapterId } : {}),
      lastBlockId: "b",
      timeSpentDeltaSec: 30,
      progressPct: 0.9,
    });

  it("the fixture really has a NATIVE chapter at position 2", async () => {
    // Without this, a fallback would have nothing to land on and the
    // assertions below would pass for the wrong reason.
    const atTwo = await prisma.chapter.findFirst({
      where: { bookId, order: 2 },
    });
    expect(atTwo).toBeNull();
    expect(nativeUnitAt2).not.toBe("");
  });

  // ── heartbeat ────────────────────────────────────────────────────────────

  it("an INVALID chapterId writes nothing — not even to the native occupant", async () => {
    const before = await snapshot();

    // Position 2 is native. Before the repair, this wrote to it.
    const res = await beat("does-not-exist", 2);

    // Soft-ack, exactly as an unresolvable unit id does. A heartbeat is
    // fire-and-forget; a loud failure would not help a tab that is already
    // pointing at nothing.
    expect(res.ok).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it("a FOREIGN chapterId writes nothing", async () => {
    const before = await snapshot();

    // A perfectly real chapter id — belonging to another book.
    const res = await beat(foreignChapterId, 2);

    expect(res.ok).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it("an INVALID contentUnitId writes nothing either — the parity case", async () => {
    const before = await snapshot();

    const res = await lector.heartbeat(USER, {
      bookId,
      chapterOrder: 2,
      contentUnitId: "not-a-unit",
      lastBlockId: "b",
      timeSpentDeltaSec: 30,
      progressPct: 0.9,
    });

    expect(res.ok).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it("an OLD client with no identity still resolves by position", async () => {
    // The compatibility path, unchanged: position 2 is native, so the native
    // positional fallback writes there. This is correct — nobody named a
    // chapter, so position is all there is to go on.
    const res = await beat(undefined, 2);

    expect(res.ok).toBe(true);
    const session = await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: nativeUnitAt2 },
    });
    expect(session).not.toBeNull();
  });

  it("an OLD client at a LEGACY position still writes the legacy chapter", async () => {
    const res = await beat(undefined, 1);

    expect(res.ok).toBe(true);
    const session = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: legacyCh1 },
    });
    expect(session).not.toBeNull();
  });

  it("a VALID chapterId still writes that chapter, ignoring the position", async () => {
    // The Pass C guarantee, re-asserted here so the fail-closed split cannot
    // quietly break it: the path says 2 (native), the id says chapter 1.
    const before = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: legacyCh1 },
    });
    await beat(legacyCh1, 2);

    const after = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: legacyCh1 },
    });
    expect(after!.progressPct).toBeGreaterThanOrEqual(before?.progressPct ?? 0);
    expect(after!.progressPct).toBeCloseTo(0.9);
  });

  it("naming BOTH identities is refused, and writes nothing", async () => {
    const before = await snapshot();

    await expect(
      lector.heartbeat(USER, {
        bookId,
        chapterOrder: 2,
        chapterId: legacyCh1,
        contentUnitId: nativeUnitAt2,
        lastBlockId: "b",
        timeSpentDeltaSec: 30,
        progressPct: 1,
      }),
    ).rejects.toThrow(/AMBIGUOUS_READER_WRITE_IDENTITY/);

    expect(await snapshot()).toEqual(before);
  });

  // ── completion ───────────────────────────────────────────────────────────

  it("an INVALID chapterId on completion is a 404, and completes nothing", async () => {
    const before = await snapshot();

    await expect(
      lector.completeChapter(USER, SLUG, 2, undefined, "does-not-exist"),
    ).rejects.toThrow(/CHAPTER_NOT_FOUND/);

    // Unlike a heartbeat, completion is a deliberate act with visible
    // consequences, so it fails loudly rather than silently.
    expect(await snapshot()).toEqual(before);
  });

  it("a FOREIGN chapterId on completion is a 404, and completes nothing", async () => {
    const before = await snapshot();

    await expect(
      lector.completeChapter(USER, SLUG, 2, undefined, foreignChapterId),
    ).rejects.toThrow(/CHAPTER_NOT_FOUND/);

    expect(await snapshot()).toEqual(before);
  });

  it("an INVALID contentUnitId on completion is refused too — parity", async () => {
    const before = await snapshot();

    await expect(
      lector.completeChapter(USER, SLUG, 2, "not-a-unit"),
    ).rejects.toThrow(/CHAPTER_NOT_FOUND/);

    expect(await snapshot()).toEqual(before);
  });

  it("naming BOTH on completion is refused, and writes nothing", async () => {
    const before = await snapshot();

    await expect(
      lector.completeChapter(USER, SLUG, 2, nativeUnitAt2, legacyCh1),
    ).rejects.toThrow(/AMBIGUOUS_READER_WRITE_IDENTITY/);

    expect(await snapshot()).toEqual(before);
  });

  it("an OLD client's positional completion still works — legacy", async () => {
    const res = await lector.completeChapter(USER, SLUG, 1);

    expect(res.ok).toBe(true);
    const progress = await prisma.userProgress.findFirst({
      where: { userId: USER, chapterId: legacyCh1 },
    });
    expect(progress).not.toBeNull();
  });

  it("an OLD client's positional completion still works — native", async () => {
    const res = await lector.completeChapter(USER, SLUG, 2);

    expect(res.ok).toBe(true);
    const progress = await prisma.userProgress.findFirst({
      where: { userId: USER, contentUnitId: nativeUnitAt2 },
    });
    expect(progress).not.toBeNull();
  });

  it("a VALID chapterId still completes that chapter, ignoring the position", async () => {
    // Path says 2 (native); the id says legacy chapter 1. The id wins, and
    // adjacency comes from that chapter's CURRENT order — 1, so next is 2.
    const res = await lector.completeChapter(
      USER,
      SLUG,
      2,
      undefined,
      legacyCh1,
    );

    expect(res.nextChapter).toBe(2);
    expect(res.nextReaderRef).toEqual({ kind: "unit", id: nativeUnitAt2 });
  });
});
