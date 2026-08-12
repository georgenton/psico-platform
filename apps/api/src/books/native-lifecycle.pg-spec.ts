import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BooksService } from "./books.service";
import { HomeService } from "../home/home.service";
import { LectorService } from "../lector/lector.service";
import { ContentAccessService } from "../content-core/access/content-access.service";

/**
 * A book authored in Content Studio can be started, read, finished, reviewed.
 *
 * Two assumptions had survived from when every chapter was a `Chapter` row:
 *
 *   startBook   took the first `Chapter` — a native book has none, so it threw
 *   createReview counted `Chapter` rows against `UserProgress.chapterId`
 *
 * And a third that was wrong for every book, not just native ones: Start wrote
 * a `UserProgress`. That table's `completedAt` is non-null with a default, so
 * the row means FINISHED. Opening a book announced a completion nobody earned,
 * and Book Detail — which read the same table — showed the first chapter as
 * read. Started lives in `ReadingSession`, which is what the reader writes.
 *
 * Against real Postgres because the distinction being tested is which ROW
 * exists in which table, and a mock would only confirm the stubs agree with me.
 */

const DB = "native_lifecycle_db";
const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

suite("native book lifecycle", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let books: BooksService;
  let home!: HomeService;
  let lector!: LectorService;

  // legacy-only · native-only · mixed (legacy A, native B, legacy C)
  const bookId: Record<string, string> = {};
  const chapterId: Record<string, string> = {};
  const unitId: Record<string, string> = {};

  const USER = "u-lifecycle";

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
    books = new BooksService(
      prisma as never,
      {
        get: () => undefined,
      } as never,
    );
    lector = new LectorService(
      prisma as never,
      { get: () => undefined } as never,
      {} as never,
      new ContentAccessService(prisma as never) as never,
    );
    // Only the continue card is exercised; its three collaborators are stubbed
    // so a routing proof does not drag Redis and the map provider along.
    home = new HomeService(
      prisma as never,
      { getForHome: async () => null } as never,
      { feed: async () => ({ items: [] }) } as never,
      { topForHome: async () => [] } as never,
    );

    await prisma.user.create({
      data: { id: USER, email: "life@test.local", name: "L" },
    });

    /** A book with an edition, and optionally a published revision. */
    async function makeBook(
      slug: string,
      opts: {
        legacy?: number[];
        native?: number[];
        publish?: boolean;
      },
    ) {
      const book = await prisma.book.create({
        // Published: the catalogue filters on it, so an unpublished fixture
        // would make the «Mis libros» assertion pass for the wrong reason.
        data: {
          slug,
          title: slug,
          plan: "FREE",
          // Deliberately WRONG. Content Studio never maintains this column, so
          // a card that reads it is stale by design — these fixtures make that
          // visible instead of letting a correct-by-luck number hide it.
          totalChapters: 99,
          isPublished: true,
        },
      });
      bookId[slug] = book.id;

      for (const order of opts.legacy ?? []) {
        const ch = await prisma.chapter.create({
          data: {
            bookId: book.id,
            order,
            title: `Legado ${order}`,
            isPublished: true,
          },
        });
        chapterId[`${slug}:${order}`] = ch.id;
        await prisma.chapterBlock.create({
          data: {
            chapterId: ch.id,
            order: 0,
            kind: "PARAGRAPH",
            content: "T",
          },
        });
      }

      const work = await prisma.work.create({
        data: { workKey: `w-${slug}`, title: slug, authorName: "A" },
      });
      const edition = await prisma.edition.create({
        data: {
          workId: work.id,
          editionKey: `${slug}-1e`, // gitleaks:allow — a book slug
          slug,
          label: "Primera",
          accessPlan: "FREE",
        },
      });
      const revision = await prisma.revision.create({
        data: {
          editionId: edition.id,
          number: 1,
          status: opts.publish === false ? "DRAFT" : "PUBLISHED",
          publishedAt: opts.publish === false ? null : new Date(),
        },
      });
      for (const order of opts.native ?? []) {
        const unit = await prisma.contentUnit.create({
          data: {
            editionId: edition.id,
            unitKey: `${slug}-u${order}`,
            isFreePreview: true,
          },
        });
        unitId[`${slug}:${order}`] = unit.id;
        const version = await prisma.contentUnitVersion.create({
          data: { unitId: unit.id, title: `Nativo ${order}` },
        });
        const block = await prisma.contentBlock.create({
          data: { unitId: unit.id, blockKey: `bk-${slug}-${order}` },
        });
        await prisma.blockVersion.create({
          data: {
            contentBlockId: block.id,
            unitVersionId: version.id,
            order: 1,
            kind: "PARAGRAPH",
            content: "T",
            contentHash: `h-${slug}-${order}`,
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
      if (opts.publish !== false) {
        await prisma.edition.update({
          where: { id: edition.id },
          data: { publishedRevisionId: revision.id },
        });
      }
    }

    await makeBook("solo-legado", { legacy: [1, 2] });
    await makeBook("solo-nativo", { native: [1, 2] });
    await makeBook("mixto", { legacy: [1, 3], native: [1, 2, 3] });
    // A native book whose only revision is a DRAFT — nothing to read yet.
    await makeBook("solo-borrador", { native: [1], publish: false });
    // Private to the card-progress assertions: those complete a whole book,
    // which would destroy the preconditions the review tests depend on.
    await makeBook("card-nativo", { native: [1, 2] });
    await makeBook("card-mixto", { legacy: [1, 3], native: [1, 2, 3] });
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  const sessions = () =>
    prisma.readingSession.count({ where: { userId: USER } });
  const completions = () =>
    prisma.userProgress.count({ where: { userId: USER } });

  // ── start ────────────────────────────────────────────────────────────────

  it("starting a LEGACY book opens a session on its first chapter", async () => {
    const before = await completions();
    await books.startBook(USER, "solo-legado");

    const s = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId["solo-legado:1"] },
    });
    expect(s).not.toBeNull();
    // The change that matters for EVERY book, not just native ones.
    expect(await completions()).toBe(before);
  });

  it("starting a NATIVE-ONLY book works at all, by contentUnitId", async () => {
    // Previously: "Book has no published chapters yet" — there is no `Chapter`
    // row to be first.
    const before = await completions();
    await books.startBook(USER, "solo-nativo");

    const s = await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: unitId["solo-nativo:1"] },
    });
    expect(s).not.toBeNull();
    expect(await completions()).toBe(before);
  });

  it("starting a MIXED book opens the first EFFECTIVE chapter", async () => {
    // Position 1 is claimed by both structures; the reader serves legacy, so
    // that is what "first chapter" means.
    await books.startBook(USER, "mixto");

    const s = await prisma.readingSession.findFirst({
      where: { userId: USER, chapterId: chapterId["mixto:1"] },
    });
    expect(s).not.toBeNull();
    const wrong = await prisma.readingSession.findFirst({
      where: { userId: USER, contentUnitId: unitId["mixto:1"] },
    });
    expect(wrong).toBeNull();
  });

  it("a DRAFT-only book cannot be started", async () => {
    await expect(books.startBook(USER, "solo-borrador")).rejects.toThrow(
      /no published chapters/i,
    );
  });

  it("starting again is harmless — no reset, no second row", async () => {
    // Read a little first, so there is something a reset would destroy.
    await prisma.readingSession.update({
      where: {
        userId_chapterId: {
          userId: USER,
          chapterId: chapterId["solo-legado:1"],
        },
      },
      data: { progressPct: 0.7, timeSpentSec: 300, lastBlockId: "b-9" },
    });
    const countBefore = await sessions();

    await books.startBook(USER, "solo-legado");

    const s = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: chapterId["solo-legado:1"] },
    });
    expect(s.progressPct).toBeCloseTo(0.7);
    expect(s.timeSpentSec).toBe(300);
    expect(s.lastBlockId).toBe("b-9");
    expect(await sessions()).toBe(countBefore);
  });

  // ── book detail ──────────────────────────────────────────────────────────

  it("Book Detail calls a started legacy chapter STARTED, not completed", async () => {
    const detail = await books.getDetail(USER, "solo-legado");
    const first = detail.chaptersList.find((c) => c.n === 1);

    // The old rule read `UserProgress.completedAt !== null`, and that column
    // cannot be null — so a started chapter was reported as finished.
    expect(first?.userProgress.status).toBe("started");
    const second = detail.chaptersList.find((c) => c.n === 2);
    expect(second?.userProgress.status).toBe("not-started");
  });

  it("Book Detail calls a started native chapter STARTED", async () => {
    const detail = await books.getDetail(USER, "solo-nativo");
    const first = detail.chaptersList.find((c) => c.n === 1);

    expect(first?.readerRef.kind).toBe("unit");
    expect(first?.userProgress.status).toBe("started");
  });

  it("completion overrides started", async () => {
    await prisma.userProgress.create({
      data: { userId: USER, chapterId: chapterId["solo-legado:1"] },
    });

    const detail = await books.getDetail(USER, "solo-legado");
    expect(
      detail.chaptersList.find((c) => c.n === 1)?.userProgress.status,
    ).toBe("completed");
  });

  it("a started book's CARD says started, on both structures", async () => {
    // Membership and the card have to agree. When only the membership query
    // learned about sessions, a freshly started book appeared on the shelf
    // with a card offering to start it.
    const list = await books.list(USER, { view: "mis" } as never);

    const legacy = list.books.find((b) => b.slug === "solo-legado");
    const native = list.books.find((b) => b.slug === "solo-nativo");
    expect(legacy?.userProgress).not.toBeNull();
    expect(native?.userProgress).not.toBeNull();

    // Started, not finished — and no completion was invented to say so.
    expect(legacy!.userProgress!.completedAt).toBeNull();
    expect(native!.userProgress!.completedAt).toBeNull();
    expect(native!.userProgress!.progressPct).toBe(0);

    // The timestamp is the session's own, not "now".
    const session = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, contentUnitId: unitId["solo-nativo:1"] },
    });
    expect(native!.userProgress!.startedAt.toISOString()).toBe(
      session.startedAt.toISOString(),
    );
  });

  it("the started card survives outside «Mis libros»", async () => {
    // The same book, seen through the plain catalogue.
    const list = await books.list(USER, {} as never);
    const native = list.books.find((b) => b.slug === "solo-nativo");

    expect(native?.userProgress).not.toBeNull();
    expect(native!.userProgress!.completedAt).toBeNull();
  });

  it("a book nobody opened has no progress summary", async () => {
    const list = await books.list(USER, {} as never);
    const untouched = list.books.find((b) => b.slug === "solo-borrador");

    expect(untouched?.userProgress).toBeNull();
  });

  it("a started book is still in «Mis libros»", async () => {
    // The regression this change could have caused: the view filtered on
    // `UserProgress`, which Start no longer writes.
    const list = await books.list(USER, { view: "mis" } as never);
    const slugs = list.books.map((b) => b.slug);
    expect(slugs).toContain("solo-legado");
    expect(slugs).toContain("solo-nativo");
    expect(slugs).not.toContain("solo-borrador");
  });

  // ── card truth ───────────────────────────────────────────────────────────

  /** The card for one book, from the plain authenticated catalogue. */
  const card = async (slug: string) => {
    const list = await books.list(USER, {} as never);
    return list.books.find((b) => b.slug === slug);
  };

  it("counts what a book OFFERS, not the stored column", async () => {
    // Every fixture carries `totalChapters: 99`.
    expect((await card("solo-legado"))!.chapters).toBe(2);
    expect((await card("solo-nativo"))!.chapters).toBe(2);
    // Legacy 1 and 3, native 2 — three effective, and the contested position
    // counted once rather than twice.
    expect((await card("mixto"))!.chapters).toBe(3);
  });

  it("a draft-only book counts none of its unpublished chapters", async () => {
    expect((await card("solo-borrador"))!.chapters).toBe(0);
  });

  it("a NATIVE card moves 0 → 50 → 100 as chapters are finished", async () => {
    await books.startBook(USER, "card-nativo");
    const started = await card("card-nativo");
    expect(started!.userProgress!.progressPct).toBe(0);
    expect(started!.userProgress!.completedAt).toBeNull();

    const first = await prisma.userProgress.create({
      data: { userId: USER, contentUnitId: unitId["card-nativo:1"] },
    });
    const half = await card("card-nativo");
    // Before this repair the card read legacy rows only, so a native
    // completion was invisible and this stayed at 0.
    expect(half!.userProgress!.progressPct).toBe(50);
    expect(half!.userProgress!.completedAt).toBeNull();

    const last = await prisma.userProgress.create({
      data: { userId: USER, contentUnitId: unitId["card-nativo:2"] },
    });
    const done = await card("card-nativo");
    expect(done!.userProgress!.progressPct).toBe(100);
    // The moment the final chapter was finished — stored, not read-time.
    expect(done!.userProgress!.completedAt?.toISOString()).toBe(
      last.completedAt.toISOString(),
    );
    expect(first.completedAt.getTime()).toBeLessThanOrEqual(
      last.completedAt.getTime(),
    );
  });

  it("a MIXED card divides by the EFFECTIVE total, not the legacy subset", async () => {
    await prisma.userProgress.create({
      data: { userId: USER, chapterId: chapterId["card-mixto:1"] },
    });
    // One of three, not one of two.
    expect((await card("card-mixto"))!.userProgress!.progressPct).toBe(33);

    await prisma.userProgress.create({
      data: { userId: USER, contentUnitId: unitId["card-mixto:2"] },
    });
    expect((await card("card-mixto"))!.userProgress!.progressPct).toBe(67);

    await prisma.userProgress.create({
      data: { userId: USER, chapterId: chapterId["card-mixto:3"] },
    });
    const done = await card("card-mixto");
    expect(done!.userProgress!.progressPct).toBe(100);
    // Reaching 100 without ever completing position 1's backfilled TWIN is
    // what proves the contested position is one requirement, not two.
    const twin = await prisma.userProgress.findFirst({
      where: { userId: USER, contentUnitId: unitId["card-mixto:1"] },
    });
    expect(twin).toBeNull();
  });

  it("an unauthenticated card still counts truthfully, with no reader state", async () => {
    const list = await books.list(null, {} as never);
    const native = list.books.find((b) => b.slug === "card-nativo");

    expect(native!.chapters).toBe(2);
    expect(native!.userProgress).toBeNull();
  });

  it("reading a card never writes the stored count", async () => {
    await books.list(USER, {} as never);
    const row = await prisma.book.findUniqueOrThrow({
      where: { slug: "solo-nativo" },
    });
    // Read-time truth, not a silent migration.
    expect(row.totalChapters).toBe(99);
  });

  // ── continue identity ────────────────────────────────────────────────────

  it("continue resumes a LEGACY chapter by its own id", async () => {
    const detail = await books.getDetail(USER, "solo-legado");
    expect(detail.continueReaderRef).toEqual({
      kind: "chapter",
      id: chapterId["solo-legado:1"],
    });
  });

  it("continue resumes a NATIVE chapter by its unit id", async () => {
    const detail = await books.getDetail(USER, "solo-nativo");
    expect(detail.continueReaderRef).toEqual({
      kind: "unit",
      id: unitId["solo-nativo:1"],
    });
  });

  it("continue follows the most recent session, not a percentage", async () => {
    // Open the second chapter later than the first.
    await prisma.readingSession.create({
      data: {
        userId: USER,
        chapterId: chapterId["solo-legado:2"],
        lastSeenAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });

    const detail = await books.getDetail(USER, "solo-legado");
    expect(detail.continueReaderRef).toEqual({
      kind: "chapter",
      id: chapterId["solo-legado:2"],
    });
  });

  it("a book nobody opened has nothing to continue", async () => {
    const detail = await books.getDetail(USER, "solo-borrador");
    expect(detail.continueReaderRef).toBeNull();
  });

  it("a RETIRED native unit never becomes the continue target", async () => {
    // A real retirement, not a hypothetical: publish a revision that drops
    // the unit somebody has an open session on. The previous version of this
    // test asserted conditionally and could pass without proving its title.
    const slug = "retirado";
    const book = await prisma.book.create({
      data: {
        slug,
        title: slug,
        plan: "FREE",
        totalChapters: 1,
        isPublished: true,
      },
    });
    const work = await prisma.work.create({
      data: { workKey: "w-ret", title: slug, authorName: "A" },
    });
    const edition = await prisma.edition.create({
      data: {
        workId: work.id,
        editionKey: "retirado-1e", // gitleaks:allow — a book slug
        slug,
        label: "Primera",
        accessPlan: "FREE",
      },
    });
    const mk = async (key: string) => {
      const unit = await prisma.contentUnit.create({
        data: { editionId: edition.id, unitKey: key, isFreePreview: true },
      });
      const version = await prisma.contentUnitVersion.create({
        data: { unitId: unit.id, title: key },
      });
      return { unitId: unit.id, versionId: version.id };
    };
    const doomed = await mk("u-doomed");
    const survivor = await mk("u-survivor");

    const publish = async (
      n: number,
      units: { unitId: string; versionId: string }[],
    ) => {
      const rev = await prisma.revision.create({
        data: {
          editionId: edition.id,
          number: n,
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      for (const [i, u] of units.entries()) {
        await prisma.revisionUnit.create({
          data: {
            revisionId: rev.id,
            unitId: u.unitId,
            unitVersionId: u.versionId,
            order: i + 1,
          },
        });
      }
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: rev.id },
      });
    };

    await publish(1, [doomed, survivor]);
    await prisma.readingSession.create({
      data: {
        userId: USER,
        contentUnitId: doomed.unitId,
        // The most recent session anywhere, so it would win on recency alone.
        lastSeenAt: new Date("2031-01-01T00:00:00.000Z"),
      },
    });
    expect((await books.getDetail(USER, slug)).continueReaderRef).toEqual({
      kind: "unit",
      id: doomed.unitId,
    });

    // Retire it.
    await publish(2, [survivor]);

    const after = await books.getDetail(USER, slug);
    expect(after.continueReaderRef?.id).not.toBe(doomed.unitId);
    // Nothing else is open in this book, so there is nothing to resume.
    expect(after.continueReaderRef).toBeNull();

    // And it must not become the GLOBAL continue card either.
    const card = (await home.getHome(USER)).continueBook;
    expect(card?.readerRef?.id).not.toBe(doomed.unitId);

    await prisma.readingSession.deleteMany({
      where: { userId: USER, contentUnitId: doomed.unitId },
    });
    await prisma.book.delete({ where: { id: book.id } });
  });

  it("reopening a chapter makes it the one to continue", async () => {
    // The recency fix. `lastSeenAt` is `@updatedAt`, and Prisma leaves it alone
    // on an empty update — so before this, reopening A after B left B as the
    // most recent session and Continue sent the reader to the wrong chapter.
    const slug = "solo-legado";
    const a = chapterId["solo-legado:1"];
    const b = chapterId["solo-legado:2"];

    // Open A, then B — through the real reader, not a direct row write.
    await lector.getChapterByRef(USER, "FREE" as never, slug, {
      kind: "chapter",
      id: a,
    });
    await lector.getChapterByRef(USER, "FREE" as never, slug, {
      kind: "chapter",
      id: b,
    });
    expect((await books.getDetail(USER, slug)).continueReaderRef).toEqual({
      kind: "chapter",
      id: b,
    });

    const bBefore = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: b },
    });
    const aBefore = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: a },
    });

    // Go back to A.
    await lector.getChapterByRef(USER, "FREE" as never, slug, {
      kind: "chapter",
      id: a,
    });

    const aAfter = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: a },
    });
    expect(aAfter.lastSeenAt.getTime()).toBeGreaterThan(
      aBefore.lastSeenAt.getTime(),
    );
    // Only recency moved.
    expect(aAfter.progressPct).toBe(aBefore.progressPct);
    expect(aAfter.timeSpentSec).toBe(aBefore.timeSpentSec);
    expect(aAfter.startedAt.toISOString()).toBe(
      aBefore.startedAt.toISOString(),
    );
    expect(aAfter.completedAt).toEqual(aBefore.completedAt);
    // B untouched.
    const bAfter = await prisma.readingSession.findFirstOrThrow({
      where: { userId: USER, chapterId: b },
    });
    expect(bAfter.lastSeenAt.toISOString()).toBe(
      bBefore.lastSeenAt.toISOString(),
    );

    // Both surfaces agree, and both now say A.
    const detail = await books.getDetail(USER, slug);
    expect(detail.continueReaderRef).toEqual({ kind: "chapter", id: a });
    const card = (await home.getHome(USER)).continueBook;
    expect(card?.readerRef).toEqual(detail.continueReaderRef);
  });

  it("a completion with no session still gives something to continue", async () => {
    // History predating sessions: `UserProgress` is the only evidence left.
    const slug = "historico";
    const book = await prisma.book.create({
      data: {
        slug,
        title: slug,
        plan: "FREE",
        totalChapters: 1,
        isPublished: true,
      },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "Uno", isPublished: true },
    });
    await prisma.userProgress.create({
      data: { userId: USER, chapterId: ch.id },
    });

    const sessionsBefore = await prisma.readingSession.count();
    const detail = await books.getDetail(USER, slug);

    expect(detail.continueReaderRef).toEqual({ kind: "chapter", id: ch.id });
    // Reading never writes.
    expect(await prisma.readingSession.count()).toBe(sessionsBefore);

    await prisma.userProgress.deleteMany({ where: { chapterId: ch.id } });
    await prisma.book.delete({ where: { id: book.id } });
  });

  // ── review ───────────────────────────────────────────────────────────────

  const review = (slug: string) =>
    books.createReview(USER, slug, { rating: 5, text: "Bueno" });

  it("a started-but-unfinished book cannot be reviewed", async () => {
    await expect(review("solo-nativo")).rejects.toThrow(
      /REVIEW_REQUIRES_COMPLETION/,
    );
  });

  it("a NATIVE-ONLY book half finished still cannot be reviewed", async () => {
    await prisma.userProgress.create({
      data: { userId: USER, contentUnitId: unitId["solo-nativo:1"] },
    });
    await expect(review("solo-nativo")).rejects.toThrow(
      /REVIEW_REQUIRES_COMPLETION/,
    );
  });

  it("a NATIVE-ONLY book fully finished CAN be reviewed", async () => {
    // Previously impossible: the guard counted `Chapter` rows, found zero, and
    // told the reader the book had nothing published.
    await prisma.userProgress.create({
      data: { userId: USER, contentUnitId: unitId["solo-nativo:2"] },
    });

    const res = await review("solo-nativo");
    expect(res.ok).toBe(true);
  });

  it("a MIXED book needs every chapter by its OWN identity", async () => {
    // Effective: legacy 1, native 2, legacy 3.
    await prisma.userProgress.create({
      data: { userId: USER, chapterId: chapterId["mixto:1"] },
    });
    await prisma.userProgress.create({
      data: { userId: USER, chapterId: chapterId["mixto:3"] },
    });
    // Both legacy chapters done, native one missing.
    await expect(review("mixto")).rejects.toThrow(/REVIEW_REQUIRES_COMPLETION/);

    await prisma.userProgress.create({
      data: { userId: USER, contentUnitId: unitId["mixto:2"] },
    });
    const res = await review("mixto");
    expect(res.ok).toBe(true);
  });

  it("a contested position is ONE requirement, not two", async () => {
    // `mixto` position 1 has both a legacy chapter and a backfilled unit. The
    // review above succeeded without a completion for `mixto:1`'s UNIT — if
    // both were demanded it could not have.
    const unitCompletion = await prisma.userProgress.findFirst({
      where: { userId: USER, contentUnitId: unitId["mixto:1"] },
    });
    expect(unitCompletion).toBeNull();
  });

  it("a DRAFT-only book cannot be reviewed", async () => {
    await expect(review("solo-borrador")).rejects.toThrow(
      /no published chapters/i,
    );
  });

  it("checking eligibility never writes", async () => {
    const s = await sessions();
    const c = await completions();
    const reviews = await prisma.bookReview.count({ where: { userId: USER } });

    await expect(review("solo-borrador")).rejects.toThrow();

    expect(await sessions()).toBe(s);
    expect(await completions()).toBe(c);
    expect(await prisma.bookReview.count({ where: { userId: USER } })).toBe(
      reviews,
    );
  });
});
