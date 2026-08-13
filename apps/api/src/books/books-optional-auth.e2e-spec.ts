import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";

/**
 * The catalogue must know who is asking.
 *
 * Everything downstream of `userId` was already right: the card lifecycle
 * resolves sessions and completions by identity, and a session at 0% produces a
 * real progress summary. But `GET /books` and `GET /books/:idOrSlug` read
 * `req.user` while running no guard at all — and a Bearer header does not make
 * Passport run. `req.user` was always `undefined`, so `userId` was always null,
 * so every signed-in reader saw the anonymous catalogue: their started book
 * still offering to be started.
 *
 * Every existing test called `books.list(USER, …)` directly. They proved the
 * service was correct once `userId` existed and said nothing about how it got
 * there — which is exactly where the defect lived.
 *
 * So these run over HTTP, with a real app, a real JWT and real Postgres. No
 * `req.user` is assigned by hand; the token has to do the work.
 */

const DB = "books_optional_auth_db";
const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();

suite("books · optional auth at the HTTP boundary", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let h: E2EHarness;

  /** A reader with a legacy session, one with a native session, one with none. */
  let tokenLegacy = "";
  let tokenNative = "";
  let tokenFresh = "";
  let tokenFav = "";
  let legacyChapterId = "";
  let nativeUnitId = "";
  let freshFirstUnitId = "";

  const LEGACY_SLUG = "libro-legado-http";
  const NATIVE_SLUG = "libro-nativo-http";
  const FRESH_SLUG = "libro-limpio-http";

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
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
    pool = new Pool({ connectionString: url.toString() });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    /** A published book, legacy and/or native. */
    async function makeBook(
      slug: string,
      opts: { legacy?: number[]; native?: number[] },
    ) {
      const book = await prisma.book.create({
        data: {
          slug,
          title: slug,
          plan: "FREE",
          totalChapters: 2,
          isPublished: true,
        },
      });
      const chapterIds: string[] = [];
      for (const order of opts.legacy ?? []) {
        const ch = await prisma.chapter.create({
          data: {
            bookId: book.id,
            order,
            title: `Legado ${order}`,
            isPublished: true,
          },
        });
        chapterIds.push(ch.id);
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
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      const unitIds: string[] = [];
      for (const order of opts.native ?? []) {
        const unit = await prisma.contentUnit.create({
          data: {
            editionId: edition.id,
            unitKey: `${slug}-u${order}`,
            isFreePreview: true,
          },
        });
        unitIds.push(unit.id);
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
      await prisma.edition.update({
        where: { id: edition.id },
        data: { publishedRevisionId: revision.id },
      });
      return { book, chapterIds, unitIds };
    }

    const legacyBook = await makeBook(LEGACY_SLUG, { legacy: [1, 2] });
    legacyChapterId = legacyBook.chapterIds[0];
    const nativeBook = await makeBook(NATIVE_SLUG, { native: [1, 2] });
    nativeUnitId = nativeBook.unitIds[0];
    const freshBook = await makeBook(FRESH_SLUG, { native: [1, 2] });
    freshFirstUnitId = freshBook.unitIds[0];

    const mkUser = async (email: string) =>
      prisma.user.create({ data: { email, name: "U", plan: "FREE" } });

    const uLegacy = await mkUser("oauth-legacy@test.local");
    const uNative = await mkUser("oauth-native@test.local");
    const uFresh = await mkUser("oauth-fresh@test.local");
    const uFav = await mkUser("oauth-fav@test.local");

    // Started, nothing finished — the exact shape the two production accounts
    // were in when their cards still said "Empezar".
    await prisma.readingSession.create({
      data: { userId: uLegacy.id, chapterId: legacyChapterId, progressPct: 0 },
    });
    await prisma.readingSession.create({
      data: { userId: uNative.id, contentUnitId: nativeUnitId, progressPct: 0 },
    });
    await prisma.bookFavorite.create({
      data: { userId: uFav.id, bookId: legacyBook.book.id },
    });
    await prisma.bookBookmark.create({
      data: { userId: uFav.id, bookId: legacyBook.book.id },
    });

    h = await createE2EApp({ prisma });
    const jwt = h.app.get(JwtService);
    // `ar` is the auth revision the JwtStrategy re-validates (ADR 0015).
    const mint = (u: { id: string; email: string; authRevision: number }) =>
      jwt.sign({ sub: u.id, email: u.email, ar: u.authRevision });
    tokenLegacy = mint(uLegacy);
    tokenNative = mint(uNative);
    tokenFresh = mint(uFresh);
    tokenFav = mint(uFav);
  }, 300_000);

  afterAll(async () => {
    await closeE2EApp(h);
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  const api = () => request(h.app.getHttpServer());
  /** The response is asserted field by field, so a loose row type is fine. */
  type Row = Record<string, never> & { slug: string };
  const findBook = (body: { books: Row[] }, slug: string) =>
    body.books.find((b) => b.slug === slug) as unknown as Record<
      string,
      never
    > & {
      slug: string;
      userProgress: { progressPct: number; completedAt: Date | null } | null;
      isFavorite: boolean;
      isBookmarked: boolean;
    };

  // ── anonymous stays public ───────────────────────────────────────────────

  it("anonymous callers still get the catalogue", async () => {
    const res = await api().get("/api/books").expect(200);

    const book = findBook(res.body, LEGACY_SLUG);
    expect(book).toBeDefined();
    expect(book.userProgress).toBeNull();
    expect(book.isFavorite).toBe(false);
    expect(book.isBookmarked).toBe(false);
  });

  it("anonymous detail is still public", async () => {
    const res = await api().get(`/api/books/${LEGACY_SLUG}`).expect(200);
    expect(res.body.userProgress).toBeNull();
  });

  // ── the repro ────────────────────────────────────────────────────────────

  it("a legacy session hydrates the list — via the Bearer token alone", async () => {
    // Against the code this fixes, `userProgress` here is null: the header is
    // sent, no guard runs, `req.user` is undefined, the service is told nobody
    // is asking.
    const res = await api()
      .get("/api/books")
      .set("Authorization", `Bearer ${tokenLegacy}`)
      .expect(200);

    const book = findBook(res.body, LEGACY_SLUG);
    const progress = book.userProgress;
    expect(progress).not.toBeNull();
    expect(progress!.progressPct).toBe(0);
    expect(progress!.completedAt).toBeNull();
  });

  it("a native session hydrates the list too", async () => {
    const res = await api()
      .get("/api/books")
      .set("Authorization", `Bearer ${tokenNative}`)
      .expect(200);

    const book = findBook(res.body, NATIVE_SLUG);
    const progress = book.userProgress;
    expect(progress).not.toBeNull();
    expect(progress!.progressPct).toBe(0);
    expect(progress!.completedAt).toBeNull();
  });

  it("«Mis libros» finds a started legacy book", async () => {
    const res = await api()
      .get("/api/books?view=mis")
      .set("Authorization", `Bearer ${tokenLegacy}`)
      .expect(200);

    expect(findBook(res.body, LEGACY_SLUG)).toBeDefined();
  });

  it("«Mis libros» finds a started native book", async () => {
    const res = await api()
      .get("/api/books?view=mis")
      .set("Authorization", `Bearer ${tokenNative}`)
      .expect(200);

    expect(findBook(res.body, NATIVE_SLUG)).toBeDefined();
  });

  it("detail hydrates a legacy session, and names the chapter to resume", async () => {
    const res = await api()
      .get(`/api/books/${LEGACY_SLUG}`)
      .set("Authorization", `Bearer ${tokenLegacy}`)
      .expect(200);

    expect(res.body.userProgress).not.toBeNull();
    expect(res.body.userProgress.progressPct).toBe(0);
    expect(res.body.chaptersList[0].userProgress.status).toBe("started");
    expect(res.body.continueReaderRef).toEqual({
      kind: "chapter",
      id: legacyChapterId,
    });
  });

  it("detail hydrates a native session", async () => {
    const res = await api()
      .get(`/api/books/${NATIVE_SLUG}`)
      .set("Authorization", `Bearer ${tokenNative}`)
      .expect(200);

    expect(res.body.userProgress).not.toBeNull();
    expect(res.body.chaptersList[0].userProgress.status).toBe("started");
    expect(res.body.continueReaderRef).toEqual({
      kind: "unit",
      id: nativeUnitId,
    });
  });

  it("favourites and bookmarks hydrate from the token as well", async () => {
    const res = await api()
      .get("/api/books")
      .set("Authorization", `Bearer ${tokenFav}`)
      .expect(200);

    const book = findBook(res.body, LEGACY_SLUG);
    expect(book.isFavorite).toBe(true);
    expect(book.isBookmarked).toBe(true);
  });

  // ── attempted auth fails closed ──────────────────────────────────────────

  it("an invalid Bearer is refused, not quietly downgraded", async () => {
    // Silently answering anonymously would be worse than failing: the web app
    // relies on a 401 to notice an expired session and send somebody to log in
    // again. A 200 would leave them browsing as a stranger inside their own
    // account, wondering where their books went.
    await api()
      .get("/api/books")
      .set("Authorization", "Bearer definitely-invalid")
      .expect(401);
  });

  it("an invalid Bearer is refused on detail too", async () => {
    await api()
      .get(`/api/books/${LEGACY_SLUG}`)
      .set("Authorization", "Bearer definitely-invalid")
      .expect(401);
  });

  it("a Bearer with no credential at all is refused", async () => {
    await api().get("/api/books").set("Authorization", "Bearer ").expect(401);
  });

  it("an expired token is refused", async () => {
    const jwt = h.app.get(JwtService);
    const expired = jwt.sign(
      { sub: "someone", email: "x@test.local", ar: 1 },
      { expiresIn: "-1s" },
    );
    await api()
      .get("/api/books")
      .set("Authorization", `Bearer ${expired}`)
      .expect(401);
  });

  // ── the production flow, automated ───────────────────────────────────────

  it("start → back to the catalogue, without opening the reader", async () => {
    // This is the manual test two accounts failed. Start, then look at the
    // shelf — no reader in between, because opening the reader would create
    // the session by itself and prove nothing about Start.
    await api()
      .post(`/api/books/${FRESH_SLUG}/start`)
      .set("Authorization", `Bearer ${tokenFresh}`)
      .expect(200);

    const list = await api()
      .get("/api/books")
      .set("Authorization", `Bearer ${tokenFresh}`)
      .expect(200);
    const card = findBook(list.body, FRESH_SLUG);
    expect(card.userProgress).not.toBeNull();
    expect(card.userProgress!.progressPct).toBe(0);
    expect(card.userProgress!.completedAt).toBeNull();

    const mis = await api()
      .get("/api/books?view=mis")
      .set("Authorization", `Bearer ${tokenFresh}`)
      .expect(200);
    expect(findBook(mis.body, FRESH_SLUG)).toBeDefined();

    const detail = await api()
      .get(`/api/books/${FRESH_SLUG}`)
      .set("Authorization", `Bearer ${tokenFresh}`)
      .expect(200);
    expect(detail.body.userProgress).not.toBeNull();
    expect(detail.body.continueReaderRef).toEqual({
      kind: "unit",
      id: freshFirstUnitId,
    });
    expect(detail.body.chaptersList[0].userProgress.status).toBe("started");

    // Start registers that a book is open, never that a chapter is finished.
    const completions = await prisma.userProgress.count({
      where: { user: { email: "oauth-fresh@test.local" } },
    });
    expect(completions).toBe(0);
  });

  it("opening the reader also shows up on the catalogue", async () => {
    // The second production path: no Start at all, just reading. The reader
    // creates the session, and the card has to see it.
    const reader = await prisma.user.create({
      data: { email: "oauth-reader@test.local", name: "R", plan: "FREE" },
    });
    const jwt = h.app.get(JwtService);
    const token = jwt.sign({
      sub: reader.id,
      email: reader.email,
      ar: reader.authRevision,
    });

    await api()
      .get(`/api/lector/${LEGACY_SLUG}/ref/c/${legacyChapterId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const list = await api()
      .get("/api/books")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(findBook(list.body, LEGACY_SLUG).userProgress).not.toBeNull();
  });
});
