import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapBook,
  type BootstrapInput,
} from "../content-core/bootstrap-book";
import { activateBookLearningCatalog } from "../content-core/learning-activation";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";

/**
 * GR-4 — discovery answers, and answers ONLY.
 *
 * `GET /api/guide/discovery/:bookSlug/:chapterOrder` is the question a reader
 * asks by opening a chapter. It must be free: standing in a doorway is not
 * walking through it, and a reader who opens ten chapters must not leave ten
 * sessions, ten receipts or a single learning event behind.
 *
 * The proof is a census of every table a guide can write, taken before the
 * requests and again after, over the REAL HTTP stack against a REAL PostgreSQL:
 *
 *   DISCOVERY_DATABASE_DELTA=0
 *
 * It also pins the demo's context expectations at the level the browser cannot
 * fake — the Parejas guide is offered on the book's chapter 1, which the ingest
 * manifest placed at PLATFORM order 2, and on nothing else.
 *
 * The manuscript never enters the repository: the chapter blocks here are
 * filler prose plus the approved practice heading, which is catalog data.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

// The pilot gate is the FIRST thing discovery checks; without it every answer
// would be `false` and the positive cases below would pass for the wrong
// reason. Flags are env-read at call time, so declaring it here is the real
// mechanism (same pattern as the CC-7.4D firewall spec).
process.env.GUIDE_ROLLOUT_MODE = "on";

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "gr4_discovery_db";
const API_DIR = process.cwd();

const SLUG = "parejas-que-perduran";
const PAIR = EXERCISE_INGESTION_CATALOG[SLUG][0];
/** The book's chapter 1 — platform order 2, because order 1 is the preface. */
const CHAPTER_ORDER = 2;
const GUIDE_KEY = "pqp-c1-contacto-sostenido";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** Preface at order 1, the guide's chapter at order 2 with the real heading. */
function parejasInput(): BootstrapInput {
  return {
    manifest: {
      slug: SLUG,
      title: "Parejas que perduran",
      author: "David Jaramillo",
      authorSlug: "david-jaramillo",
      categorySlug: "vinculos",
      editionLabel: "Edición de prueba OCR",
      sourceQuality: "OCR_UNFINALIZED",
      chapters: [
        { order: 1, title: "Prefacio", file: "01.md" },
        { order: 2, title: "Capítulo uno", file: "02.md" },
      ],
    },
    chapters: [
      {
        order: 1,
        title: "Prefacio",
        blocks: [{ kind: "PARAGRAPH" as const, content: "Prefacio." }],
      },
      {
        order: 2,
        title: "Capítulo uno",
        blocks: [
          { kind: "PARAGRAPH" as const, content: "Párrafo de apertura." },
          { kind: "HEADING" as const, content: PAIR.practice.sourceHeading },
          { kind: "PARAGRAPH" as const, content: "Consigna." },
          { kind: "PARAGRAPH" as const, content: "Cierre." },
        ],
      },
    ],
  } satisfies BootstrapInput;
}

suite("GR-4 · guide discovery is read-only", () => {
  let h: E2EHarness;
  let prisma: PrismaClient;
  let pool: Pool;
  let userId: string;
  let token: string;

  const http = () => request(h.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  /**
   * Every table a guide command can write, plus every emotional one it must
   * never touch. Global counts, not per-user: a write attributed to somebody
   * else would be just as wrong.
   */
  async function census() {
    const [
      guideSessions,
      guideSessionSteps,
      guideCommandReceipts,
      learningEvents,
      resonances,
      moodLogs,
      checkinResponses,
      emotionalMapSnapshots,
      diaryTextFeatures,
      diaryEntries,
    ] = await Promise.all([
      prisma.guideSession.count(),
      prisma.guideSessionStep.count(),
      prisma.guideCommandReceipt.count(),
      prisma.learningEvent.count(),
      prisma.resonance.count(),
      prisma.moodLog.count(),
      prisma.checkinResponse.count(),
      prisma.emotionalMapSnapshot.count(),
      prisma.diaryTextFeature.count(),
      prisma.diaryEntry.count(),
    ]);
    return {
      guideSessions,
      guideSessionSteps,
      guideCommandReceipts,
      learningEvents,
      resonances,
      moodLogs,
      checkinResponses,
      emotionalMapSnapshots,
      diaryTextFeatures,
      diaryEntries,
    };
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

    // The bootstrap refuses to invent a category — the taxonomy is editorial.
    await prisma.bookCategory.create({
      data: { slug: "vinculos", label: "Vínculos", order: 2 },
    });
    await bootstrapBook(prisma, parejasInput(), {
      env: { ALLOW_CONTENT_CORE_BOOK_INGEST: "on" },
    });
    // The three targets the guide resolves against — Concept, ConceptLink and
    // the two Exercises. Without this the catalog is code with nothing behind
    // it and discovery answers `false` for the right reason but the wrong test.
    await activateBookLearningCatalog(prisma, SLUG);

    const user = await prisma.user.create({
      data: { email: "gr4-discovery@example.test", name: "D", plan: "FREE" },
    });
    userId = user.id;

    h = await createE2EApp({ prisma });
    token = h.app
      .get(JwtService)
      .sign({ sub: user.id, email: user.email, ar: user.authRevision });
  }, 180_000);

  afterAll(async () => {
    await closeE2EApp(h);
    await prisma.$disconnect();
    await pool.end();
  });

  it("offers the Parejas guide on the book's chapter 1 (platform order 2)", async () => {
    const res = await http()
      .get(`/api/guide/discovery/${SLUG}/${CHAPTER_ORDER}`)
      .set(auth())
      .expect(200);

    expect(res.body).toEqual({
      available: true,
      guideKey: GUIDE_KEY,
      guideVersion: 1,
    });
  });

  it.each([
    ["the preface", 1],
    ["a chapter that does not exist", 3],
  ])("offers nothing on %s", async (_why, order) => {
    const res = await http()
      .get(`/api/guide/discovery/${SLUG}/${order}`)
      .set(auth())
      .expect(200);
    expect(res.body).toEqual({ available: false });
  });

  it("offers nothing for a book that is not ingested here", async () => {
    const res = await http()
      .get(`/api/guide/discovery/emociones-en-construccion/1`)
      .set(auth())
      .expect(200);
    expect(res.body).toEqual({ available: false });
  });

  it("the negative answer never says WHY", async () => {
    const res = await http()
      .get(`/api/guide/discovery/${SLUG}/1`)
      .set(auth())
      .expect(200);
    // One key, and it is a boolean. No code, no reason, no catalog leak: a
    // reader must not be able to enumerate which books have guides.
    expect(Object.keys(res.body)).toEqual(["available"]);
  });

  it("DISCOVERY_DATABASE_DELTA=0 — asking never writes anything", async () => {
    const before = await census();

    // Ten questions: the available one, both negatives, the foreign book, and
    // repeats — a reader walking a book back and forth.
    for (let i = 0; i < 2; i += 1) {
      for (const path of [
        `/api/guide/discovery/${SLUG}/1`,
        `/api/guide/discovery/${SLUG}/2`,
        `/api/guide/discovery/${SLUG}/3`,
        `/api/guide/discovery/emociones-en-construccion/1`,
        `/api/guide/discovery/${SLUG}/2`,
      ]) {
        await http().get(path).set(auth()).expect(200);
      }
    }

    const after = await census();
    expect(after).toEqual(before);
    // Stated positively too, so a future reader of this file sees the claim
    // rather than having to infer it from a deep-equal.
    for (const [table, count] of Object.entries(after)) {
      const wasCount = (before as Record<string, number>)[table] as number;
      expect(count - wasCount, `${table} grew during discovery`).toBe(0);
    }
    expect(userId).not.toBe("");
  });

  it("requires authentication", async () => {
    await http().get(`/api/guide/discovery/${SLUG}/2`).expect(401);
  });

  it.each([
    ["an invalid slug", "Parejas_Que_Perduran", "2"],
    ["a non-numeric order", SLUG, "dos"],
    ["order zero", SLUG, "0"],
  ])("rejects %s without touching the catalog", async (_why, slug, order) => {
    const before = await census();
    await http()
      .get(`/api/guide/discovery/${slug}/${order}`)
      .set(auth())
      .expect(400);
    expect(await census()).toEqual(before);
  });
});
