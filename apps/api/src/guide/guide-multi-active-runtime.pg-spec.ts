import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaService } from "../prisma";
import type { AuthenticatedUser } from "../auth";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";
import { ContentAccessService } from "../content-core/access/content-access.service";
import { LearningCatalogResolver } from "../learning/learning-catalog.resolver";
import { LearningEventRepository } from "../learning/learning-event.repository";
import { GuideCommandReceiptRepository } from "./guide-command-receipt.repository";
import { GuideSessionRepository } from "./guide-session.repository";
import { GuideSessionStepRepository } from "./guide-session-step.repository";
import { GuideTargetContextService } from "./guide-target-context.service";
import { GuideReaderApplicabilityService } from "./guide-reader-applicability.service";
import { GuideLifecycleService } from "./guide-lifecycle.service";
import { readGuideActiveCapability } from "./guide-active-capability";

/**
 * C.0B2 — do the READERS survive multi-ACTIVE, or only PostgreSQL?
 *
 * Proving the schema now accepts three ACTIVE rows says nothing about the code
 * that reads them. The failure this file exists to catch is a query that asks
 * for "the user's ACTIVE session" and gets handed whichever lineage the
 * planner returned first: recovery for A answering with B, a state read
 * calling B completed because A finished, an autocancel closing a journey
 * nobody started.
 *
 * Both lineages here are REAL registry definitions with REAL editorial
 * fixtures, driven through the REAL lifecycle service. Two rows exist at once
 * in a database whose only ACTIVE invariant is the lineage index, which is the
 * world C.0B2 creates.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c0b2_multi_active_runtime_db";

const BOOK_A = "emociones-en-construccion";
const BOOK_B = "parejas-que-perduran";
const GUIDE_A = "eec-c1-cuerpo-antes-que-mente";
const GUIDE_B = "pqp-c1-contacto-sostenido";
const HEADING_A = EXERCISE_INGESTION_CATALOG[BOOK_A][0].practice.sourceHeading;
const HEADING_B = EXERCISE_INGESTION_CATALOG[BOOK_B][0].practice.sourceHeading;
const STEP_A_CONCEPT = "explorar-cuerpo-antes-que-mente";

/** Zero-entropy canonical UUIDs (Gitleaks-safe). */
const key = (n: number) =>
  `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

suite("C.0B2 · the runtime under two ACTIVE lineages", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: GuideLifecycleService;
  let sessions: GuideSessionRepository;
  let user: AuthenticatedUser;
  let seq = 0;

  const nextKey = () => key(++seq);

  const activeRows = () =>
    prisma.guideSession.findMany({
      where: { userId: user.userId, status: "ACTIVE" },
      orderBy: { guideKey: "asc" },
      select: { id: true, guideKey: true, guideVersion: true, status: true },
    });

  /** Both journeys running at once — the state C.0B2 makes possible. */
  async function startBoth(): Promise<{ a: string; b: string }> {
    const a = await service.start(user, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_A,
      guideVersion: 1,
    });
    const b = await service.start(user, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_B,
      guideVersion: 1,
    });
    return { a: a.sessionId, b: b.sessionId };
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

    // The chapter ORDER differs per book and is not cosmetic: the ingestion
    // catalog keys `parejas-que-perduran` on platform order 2, because that
    // book's manifest gave order 1 to the preface. Seeding it at 1 makes the
    // ingest look for the practice heading inside the preface and fail closed.
    for (const [slug, title, heading, chapterOrder] of [
      [BOOK_A, "Emociones en Construcción", HEADING_A, 1],
      [BOOK_B, "Parejas que Perduran", HEADING_B, 2],
    ] as const) {
      const book = await prisma.book.create({
        data: { slug, title, plan: "FREE" },
      });
      const ch = await prisma.chapter.create({
        data: {
          bookId: book.id,
          order: chapterOrder,
          title: `C${chapterOrder}`,
          isPublished: true,
        },
      });
      await prisma.chapterBlock.create({
        data: {
          chapterId: ch.id,
          order: 0,
          kind: "PARAGRAPH",
          content: "Intro.",
        },
      });
      await prisma.chapterBlock.create({
        data: { chapterId: ch.id, order: 1, kind: "HEADING", content: heading },
      });
    }
    await backfillContentCore(prisma);

    const u = await prisma.user.create({
      data: { email: "c0b2-multi@example.test", name: "Multi", plan: "FREE" },
    });
    user = { userId: u.id, plan: "FREE" } as AuthenticatedUser;

    const svc = prisma as unknown as PrismaService;
    const resolver = new LearningCatalogResolver(svc);
    sessions = new GuideSessionRepository(prisma);
    service = new GuideLifecycleService(
      svc,
      resolver,
      new ContentAccessService(svc),
      new GuideTargetContextService(resolver),
      sessions,
      new GuideSessionStepRepository(prisma),
      new GuideCommandReceiptRepository(prisma),
      new LearningEventRepository(prisma),
      new GuideReaderApplicabilityService(
        new GuideTargetContextService(resolver),
      ),
    );
  }, 240_000);

  afterAll(async () => {
    try {
      if (prisma) await prisma.$disconnect();
    } catch {
      /* the database drop below is what matters */
    }
    try {
      if (pool) await pool.end();
    } catch {
      /* idem */
    }
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  }, 240_000);

  beforeEach(async () => {
    await prisma.guideSessionStep.deleteMany();
    await prisma.guideCommandReceipt.deleteMany();
    await prisma.guideSession.deleteMany();
    await prisma.learningEvent.deleteMany();
  });

  it("is running in the LINEAGE world, with two ACTIVE lineages", async () => {
    // The premise. If the schema still enforced one ACTIVE per user, the second
    // START below would have autocancelled the first and every assertion in
    // this file would be vacuously true.
    const cap = await prisma.$transaction((tx) =>
      readGuideActiveCapability(tx),
    );
    expect(cap.effectiveMode).toBe("LINEAGE");

    await startBoth();
    const rows = await activeRows();
    expect(rows.map((r) => r.guideKey)).toEqual([GUIDE_A, GUIDE_B]);
  });

  // ── Recovery answers about the lineage it was asked about ────────────────

  it("recovery for A returns A, and for B returns B", async () => {
    const { a, b } = await startBoth();

    const forA = await service.findRecoverableSession(user.userId, {
      guideKey: GUIDE_A,
      guideVersion: 1,
    });
    const forB = await service.findRecoverableSession(user.userId, {
      guideKey: GUIDE_B,
      guideVersion: 1,
    });

    expect(forA?.sessionId).toBe(a);
    expect(forA?.guideKey).toBe(GUIDE_A);
    expect(forB?.sessionId).toBe(b);
    expect(forB?.guideKey).toBe(GUIDE_B);
    // The failure mode in one line: never each other's.
    expect(forA?.sessionId).not.toBe(b);
    expect(forB?.sessionId).not.toBe(a);
  });

  it("a version that does not exist returns null, not some other session", async () => {
    await startBoth();
    const wrongVersion = await service.findRecoverableSession(user.userId, {
      guideKey: GUIDE_A,
      guideVersion: 99,
    });
    expect(wrongVersion).toBeNull();
    // And an unknown lineage is not answered with a running one either.
    const unknown = await sessions.findActiveOwnForGuideKey(
      user.userId,
      "guia-que-no-existe",
    );
    expect(unknown).toBeNull();
  });

  // ── State is computed per lineage ────────────────────────────────────────

  it("advancing A leaves B untouched", async () => {
    const { a, b } = await startBoth();

    await service.completeStep(user, {
      idempotencyKey: nextKey(),
      sessionId: a,
      stepKey: STEP_A_CONCEPT,
    });

    const rowA = await sessions.findLatestOwnForExactPin(user.userId, {
      guideKey: GUIDE_A,
      guideVersion: 1,
    });
    const rowB = await sessions.findLatestOwnForExactPin(user.userId, {
      guideKey: GUIDE_B,
      guideVersion: 1,
    });
    expect(rowA?.id).toBe(a);
    expect(rowA?.stepsCompleted).toBe(1);
    expect(rowB?.id).toBe(b);
    // The bug issue #639 opens with: progress bleeding across experiences.
    expect(rowB?.stepsCompleted).toBe(0);
    expect(rowB?.status).toBe("ACTIVE");
  });

  it("cancelling A leaves B ACTIVE and recoverable", async () => {
    const { a, b } = await startBoth();
    await service.cancel(user, { idempotencyKey: nextKey(), sessionId: a });

    const rows = await activeRows();
    expect(rows.map((r) => r.id)).toEqual([b]);
    const forB = await service.findRecoverableSession(user.userId, {
      guideKey: GUIDE_B,
      guideVersion: 1,
    });
    expect(forB?.sessionId).toBe(b);
  });

  // ── Autocancel is scoped to the lineage being started ────────────────────

  it("re-starting A autocancels only A's previous session", async () => {
    const { a, b } = await startBoth();

    const again = await service.start(user, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_A,
      guideVersion: 1,
    });
    expect(again.sessionId).not.toBe(a);

    const previous = await prisma.guideSession.findUniqueOrThrow({
      where: { id: a },
      select: { status: true },
    });
    expect(previous.status).toBe("CANCELLED");

    const untouched = await prisma.guideSession.findUniqueOrThrow({
      where: { id: b },
      select: { status: true },
    });
    // Under the old global rule this row would have been closed by a START
    // that has nothing to do with it.
    expect(untouched.status).toBe("ACTIVE");

    const rows = await activeRows();
    expect(rows.map((r) => r.guideKey)).toEqual([GUIDE_A, GUIDE_B]);
    expect(rows.map((r) => r.id).sort()).toEqual([again.sessionId, b].sort());
  });

  it("B survives a full run of A, start to finish", async () => {
    // The acceptance criterion of the issue, end to end: finish one journey
    // and the other still reads as its own.
    const { b } = await startBoth();
    const restarted = await service.start(user, {
      idempotencyKey: nextKey(),
      guideKey: GUIDE_A,
      guideVersion: 1,
    });
    await service.cancel(user, {
      idempotencyKey: nextKey(),
      sessionId: restarted.sessionId,
    });

    const forB = await service.findRecoverableSession(user.userId, {
      guideKey: GUIDE_B,
      guideVersion: 1,
    });
    expect(forB?.sessionId).toBe(b);
    expect(forB?.guideKey).toBe(GUIDE_B);
  });
});
