import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";

/**
 * CC-7.4D — the emotional firewall, over the FULL HTTP stack.
 *
 * A complete guide is walked through the real routes — START → concept →
 * practice → recall → complete — and then two things are proven:
 *
 *   1. the only consequences are the four EDUCATIONAL events of the closed
 *      matrix (no `guide_step_completed`, no `concept_explored`);
 *   2. every EMOTIONAL read model has delta ZERO. Not "no obvious writes" —
 *      a row count before and after.
 *
 * The emotional set is the one the rest of the product already treats as
 * emotional: the map snapshots, resonances, check-ins, mood logs and the
 * on-device text features. A Guide session is an educational transition; it
 * must not become a signal about how someone feels.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "cc74d_guide_firewall_db";

const BOOK_SLUG = "emociones-en-construccion";
const GUIDE_KEY = "eec-c1-cuerpo-antes-que-mente";
const PRACTICE_HEADING =
  EXERCISE_INGESTION_CATALOG[BOOK_SLUG][0].practice.sourceHeading;

const STEP_CONCEPT = "explorar-cuerpo-antes-que-mente";
const STEP_PRACTICE = "practicar-escucharte-por-dentro";
const STEP_RECALL = "recordar-cuerpo-antes-que-mente";
const CORRECT_OPTION = "opcion-cuerpo-primero";

const key = (n: number) =>
  `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, "0")}`;

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("CC-7.4D · Guide full-stack emotional firewall", () => {
  let h: E2EHarness;
  let prisma: PrismaClient;
  let pool: Pool;
  let token = "";
  let seq = 0;

  const nextKey = () => key(++seq);
  const http = () => request(h.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  /** The EMOTIONAL read models — the same set the product treats as such. */
  const emotionalSnapshot = async () => ({
    emotionalMapSnapshots: await prisma.emotionalMapSnapshot.count(),
    resonances: await prisma.resonance.count(),
    checkinResponses: await prisma.checkinResponse.count(),
    moodLogs: await prisma.moodLog.count(),
    diaryTextFeatures: await prisma.diaryTextFeature.count(),
    diaryEntries: await prisma.diaryEntry.count(),
  });

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

    const book = await prisma.book.create({
      data: {
        slug: BOOK_SLUG,
        title: "Emociones en Construcción",
        plan: "FREE",
      },
    });
    const ch1 = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1", isPublished: true },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch1.id,
        order: 0,
        kind: "PARAGRAPH",
        content: "Intro.",
      },
    });
    await prisma.chapterBlock.create({
      data: {
        chapterId: ch1.id,
        order: 1,
        kind: "HEADING",
        content: PRACTICE_HEADING,
      },
    });
    await backfillContentCore(prisma);

    const user = await prisma.user.create({
      data: { email: "cc74d-firewall@example.test", name: "F", plan: "FREE" },
    });

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

  it("a full guide produces educational events and ZERO emotional delta", async () => {
    const before = await emotionalSnapshot();

    // ── The whole guide, over the real HTTP surface ───────────────────────
    const started = await http()
      .post("/api/guide/sessions")
      .set(auth())
      .send({ idempotencyKey: nextKey(), guideKey: GUIDE_KEY, guideVersion: 1 })
      .expect(201);
    const sessionId = started.body.session.sessionId as string;

    await http()
      .post(`/api/guide/sessions/${sessionId}/steps/${STEP_CONCEPT}/complete`)
      .set(auth())
      .send({ idempotencyKey: nextKey() })
      .expect(201);

    await http()
      .post(`/api/guide/sessions/${sessionId}/steps/${STEP_PRACTICE}/complete`)
      .set(auth())
      .send({ idempotencyKey: nextKey() })
      .expect(201);

    await http()
      .post(`/api/guide/sessions/${sessionId}/steps/${STEP_RECALL}/recall`)
      .set(auth())
      .send({ idempotencyKey: nextKey(), selectedOptionKey: CORRECT_OPTION })
      .expect(201);

    const done = await http()
      .post(`/api/guide/sessions/${sessionId}/complete`)
      .set(auth())
      .send({ idempotencyKey: nextKey() })
      .expect(201);
    expect(done.body.session.status).toBe("COMPLETED");

    // ── The educational consequences, exactly ─────────────────────────────
    const countKind = (kind: string) =>
      prisma.learningEvent.count({
        where: { kind: kind as never, userId: undefined },
      });
    expect(await countKind("GUIDE_SESSION_STARTED")).toBe(1);
    expect(await countKind("PRACTICE_COMPLETED")).toBe(1);
    expect(await countKind("ACTIVE_RECALL_ATTEMPTED")).toBe(1);
    expect(await countKind("GUIDE_SESSION_COMPLETED")).toBe(1);
    // The concept step is not an educational fact by itself, and there is no
    // such thing as a `guide_step_completed` event.
    expect(await countKind("CONCEPT_EXPLORED")).toBe(0);
    expect(await prisma.learningEvent.count()).toBe(4);

    // ── The emotional firewall ────────────────────────────────────────────
    expect(await emotionalSnapshot()).toEqual(before);
  });

  it("progress comes from the ledger, never from the events", async () => {
    const session = await prisma.guideSession.findFirstOrThrow();
    const ledgerRows = await prisma.guideSessionStep.count({
      where: { sessionId: session.id },
    });
    expect(session.stepsCompleted).toBe(ledgerRows);
    expect(session.stepsCompleted).toBe(3);

    // Deleting the educational events cannot change the projection: they are
    // consequences of the transition, not its source.
    const before = session.stepsCompleted;
    await prisma.learningEvent.deleteMany();
    const after = await prisma.guideSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(after.stepsCompleted).toBe(before);
    expect(await emotionalSnapshot()).toEqual({
      emotionalMapSnapshots: 0,
      resonances: 0,
      checkinResponses: 0,
      moodLogs: 0,
      diaryTextFeatures: 0,
      diaryEntries: 0,
    });
  });
});
