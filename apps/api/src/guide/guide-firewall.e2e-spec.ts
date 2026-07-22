import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHECKIN_ITEMS } from "@psico/types";
import type { EmotionalMapService } from "../emotional-map/emotional-map.service";
import { MoodService } from "../mood/mood.service";
import type { PrismaService } from "../prisma";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";
import {
  assertNonEmptyEmotionalBaseline,
  createFirewallEmotionalMapService,
  freshProjection as freshMapProjection,
  projectedDimension as dim,
  seedEmotionalSignal,
} from "../test/emotional-firewall-testkit";
import type { MapProjection } from "../test/emotional-firewall-testkit";
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
 *   2. the CANONICAL EMOTIONAL PROJECTION is identical before and after.
 *
 * The authority for claim 2 is the projection itself — the very object the
 * product serves — recomputed through the real `EmotionalMapService` after a
 * real cache invalidation, over a REAL, non-empty emotional baseline. Row
 * counts over the emotional tables are kept as a cheap extra defence, but they
 * are NOT the authority: a table can stay the same size while the map moves.
 *
 * The definition of "the Map" and of "an emotional signal" is the SHARED one
 * (`src/test/emotional-firewall-testkit.ts`), the same `learning-firewall`
 * uses at the domain level — two independent lists would be free to drift.
 *
 * Every `it` provisions its own user and its own session, so the file passes
 * alone, in reverse order and inside the full suite.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

// The map read path fails closed without the kill switch (PR-0.2); flags are
// env-read at call time, so declaring it here is the real mechanism.
process.env.EMOTIONAL_MAP_PUBLIC = "on";

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
  let emotionalMap: EmotionalMapService;
  let mood: MoodService;
  let seq = 0;

  const nextKey = () => key(++seq);
  const http = () => request(h.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const freshProjection = (userId: string): Promise<MapProjection> =>
    freshMapProjection(emotionalMap, userId);

  /**
   * Extra defence, NOT the authority: the emotional tables the product writes.
   * Scoped per user so the tests stay order-independent.
   */
  const emotionalRowCounts = async (userId: string) => ({
    emotionalMapSnapshots: await prisma.emotionalMapSnapshot.count({
      where: { userId },
    }),
    resonances: await prisma.resonance.count({ where: { userId } }),
    checkinResponses: await prisma.checkinResponse.count({ where: { userId } }),
    moodLogs: await prisma.moodLog.count({ where: { userId } }),
    diaryTextFeatures: await prisma.diaryTextFeature.count({
      where: { userId },
    }),
    diaryEntries: await prisma.diaryEntry.count({ where: { userId } }),
  });

  /**
   * A user with a REAL emotional baseline and a signed token. Each test gets
   * its own, so nothing depends on what another `it` left behind.
   */
  async function provisionUser(
    label: string,
  ): Promise<{ userId: string; token: string }> {
    const user = await prisma.user.create({
      data: {
        email: `cc74d-firewall-${label}@example.test`,
        name: "F",
        plan: "FREE",
      },
    });
    await seedEmotionalSignal(prisma, user.id, { moodLogs: 12, checkins: 3 });
    const token = h.app
      .get(JwtService)
      .sign({ sub: user.id, email: user.email, ar: user.authRevision });
    return { userId: user.id, token };
  }

  /** The whole guide over the real HTTP surface. Returns the session id. */
  async function walkGuide(token: string): Promise<string> {
    const started = await http()
      .post("/api/guide/sessions")
      .set(auth(token))
      .send({ idempotencyKey: nextKey(), guideKey: GUIDE_KEY, guideVersion: 1 })
      .expect(201);
    const sessionId = started.body.session.sessionId as string;

    await http()
      .post(`/api/guide/sessions/${sessionId}/steps/${STEP_CONCEPT}/complete`)
      .set(auth(token))
      .send({ idempotencyKey: nextKey() })
      .expect(201);

    await http()
      .post(`/api/guide/sessions/${sessionId}/steps/${STEP_PRACTICE}/complete`)
      .set(auth(token))
      .send({ idempotencyKey: nextKey() })
      .expect(201);

    await http()
      .post(`/api/guide/sessions/${sessionId}/steps/${STEP_RECALL}/recall`)
      .set(auth(token))
      .send({ idempotencyKey: nextKey(), selectedOptionKey: CORRECT_OPTION })
      .expect(201);

    const done = await http()
      .post(`/api/guide/sessions/${sessionId}/complete`)
      .set(auth(token))
      .send({ idempotencyKey: nextKey() })
      .expect(201);
    expect(done.body.session.status).toBe("COMPLETED");

    return sessionId;
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

    // The SHARED firewall wiring: real cache identity, and a provider that
    // must never score an axis (decision L3).
    emotionalMap = createFirewallEmotionalMapService(
      prisma,
      "cc74d-firewall-stub",
    );
    mood = new MoodService(prisma as unknown as PrismaService, emotionalMap);

    h = await createE2EApp({ prisma });
  }, 180_000);

  afterAll(async () => {
    await closeE2EApp(h);
    await prisma.$disconnect();
    await pool.end();
  });

  it("a full guide produces educational events and ZERO emotional delta", async () => {
    const { userId, token } = await provisionUser("walk");

    const before = await freshProjection(userId);
    // Never certify a firewall over an empty map: with no signal at all,
    // "nothing changed" would be trivially true and prove nothing.
    assertNonEmptyEmotionalBaseline(before);
    const rowsBefore = await emotionalRowCounts(userId);

    await walkGuide(token);

    // ── The educational consequences, exactly ─────────────────────────────
    const countKind = (kind: string) =>
      prisma.learningEvent.count({ where: { userId, kind: kind as never } });
    expect(await countKind("GUIDE_SESSION_STARTED")).toBe(1);
    expect(await countKind("PRACTICE_COMPLETED")).toBe(1);
    expect(await countKind("ACTIVE_RECALL_ATTEMPTED")).toBe(1);
    expect(await countKind("GUIDE_SESSION_COMPLETED")).toBe(1);
    // The concept step is not an educational fact by itself, and there is no
    // such thing as a `guide_step_completed` event.
    expect(await countKind("CONCEPT_EXPLORED")).toBe(0);
    expect(await prisma.learningEvent.count({ where: { userId } })).toBe(4);

    // ── The emotional firewall (the authority) ────────────────────────────
    // Real invalidation + real recompute through the real service.
    const after = await freshProjection(userId);
    expect(after).toEqual(before);

    // Extra defence — a table can stay the same size while the map moves, so
    // this is a complement to the projection equality, never a substitute.
    expect(await emotionalRowCounts(userId)).toEqual(rowsBefore);
  });

  it("negative control: a legitimate check-in DOES move the projection", async () => {
    const { userId } = await provisionUser("control");

    const baseline = await freshProjection(userId);
    assertNonEmptyEmotionalBaseline(baseline);

    // A real emotional surface, through its real service.
    await mood.logCheckin(userId, CHECKIN_ITEMS[0].key, 4);

    const after = await freshProjection(userId);
    expect(after).not.toEqual(baseline);
    // And it is the check-in's OWN axis that moved.
    expect(dim(after, CHECKIN_ITEMS[0].axis)).not.toEqual(
      dim(baseline, CHECKIN_ITEMS[0].axis),
    );
  });

  it("progress comes from the ledger, never from the events", async () => {
    const { userId, token } = await provisionUser("ledger");
    const sessionId = await walkGuide(token);

    const session = await prisma.guideSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    const ledgerRows = await prisma.guideSessionStep.count({
      where: { sessionId },
    });
    expect(session.stepsCompleted).toBe(ledgerRows);
    expect(session.stepsCompleted).toBe(3);

    // Deleting this user's educational events cannot change the projection:
    // they are consequences of the transition, not its source.
    const beforeMap = await freshProjection(userId);
    await prisma.learningEvent.deleteMany({ where: { userId } });
    const after = await prisma.guideSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(after.stepsCompleted).toBe(session.stepsCompleted);
    expect(await freshProjection(userId)).toEqual(beforeMap);
  });
});
