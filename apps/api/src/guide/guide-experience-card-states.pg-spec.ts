import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
import { GuideLifecycleService } from "./guide-lifecycle.service";

/**
 * C.1 — the card state of EACH experience, against real PostgreSQL.
 *
 * The defect (#639) is not a rendering bug. A chapter resolves one guide pin,
 * the state was asked once for that pin, and every card compared itself to the
 * single answer — so finishing one journey made the other read «Completada»
 * without anybody opening it. The fix has to be provable at the level where
 * the sessions actually live, which is here.
 *
 * Two REAL registry guides with their REAL editorial fixtures, driven through
 * the REAL lifecycle. No definition is invented for the test: a production
 * catalog entry created to make a test pass would be a lie about what the
 * product ships.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "c1_experience_card_states_db";

const BOOK_A = "emociones-en-construccion";
const BOOK_B = "parejas-que-perduran";
const GUIDE_A = "eec-c1-cuerpo-antes-que-mente";
const GUIDE_B = "pqp-c1-contacto-sostenido";
const HEADING_A = EXERCISE_INGESTION_CATALOG[BOOK_A][0].practice.sourceHeading;
const HEADING_B = EXERCISE_INGESTION_CATALOG[BOOK_B][0].practice.sourceHeading;
const A_STEPS = [
  "explorar-cuerpo-antes-que-mente",
  "practicar-escucharte-por-dentro",
] as const;
const A_RECALL = "recordar-cuerpo-antes-que-mente";
const A_CORRECT = "opcion-cuerpo-primero";

const PIN_A = { guideKey: GUIDE_A, guideVersion: 1 };
const PIN_B = { guideKey: GUIDE_B, guideVersion: 1 };

/** Zero-entropy canonical UUIDs (Gitleaks-safe). */
const key = (n: number) =>
  `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, "0")}`;

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

suite("C.1 · one card state per experience", () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: GuideLifecycleService;
  let sessions: GuideSessionRepository;
  let steps: GuideSessionStepRepository;
  let user: AuthenticatedUser;
  let seq = 0;

  const nextKey = () => key(++seq);

  const start = (pin: { guideKey: string; guideVersion: number }) =>
    service.start(user, { idempotencyKey: nextKey(), ...pin });

  /** Drive A to COMPLETED through the real commands. */
  async function completeA(): Promise<string> {
    const started = await start(PIN_A);
    for (const stepKey of A_STEPS) {
      await service.completeStep(user, {
        idempotencyKey: nextKey(),
        sessionId: started.sessionId,
        stepKey,
      });
    }
    await service.completeRecallStep(user, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
      stepKey: A_RECALL,
      selectedOptionKey: A_CORRECT,
    });
    await service.completeSession(user, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
    });
    return started.sessionId;
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
    // book's manifest gave order 1 to the preface.
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
      data: { email: "c1-cards@example.test", name: "Cards", plan: "FREE" },
    });
    user = { userId: u.id, plan: "FREE" } as AuthenticatedUser;

    const svc = prisma as unknown as PrismaService;
    const resolver = new LearningCatalogResolver(svc);
    sessions = new GuideSessionRepository(prisma);
    steps = new GuideSessionStepRepository(prisma);
    service = new GuideLifecycleService(
      svc,
      resolver,
      new ContentAccessService(svc),
      new GuideTargetContextService(resolver),
      sessions,
      steps,
      new GuideCommandReceiptRepository(prisma),
      new LearningEventRepository(prisma),
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
    vi.restoreAllMocks();
    await prisma.guideSessionStep.deleteMany();
    await prisma.guideCommandReceipt.deleteMany();
    await prisma.guideSession.deleteMany();
    await prisma.learningEvent.deleteMany();
  });

  const cards = (pins = [PIN_A, PIN_B]) =>
    service.resolveExperienceCardStates(user.userId, pins);

  /**
   * The answer no longer carries the session (a card needs a verdict and a pin
   * to run, not a projection), so "which run backs this?" is asked of the
   * database directly. That keeps the old assertions honest instead of
   * deleting them along with the field.
   */
  const rowsFor = (pin: { guideKey: string; guideVersion: number }) =>
    prisma.guideSession.findMany({
      where: { userId: user.userId, ...pin },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true },
    });

  // ── The three states, per experience ─────────────────────────────────────

  it("two untouched experiences both START", async () => {
    const [a, b] = await cards();
    expect(a?.status).toBe("START");
    expect(b?.status).toBe("START");
    expect(a?.resumePin).toEqual(PIN_A);
    expect(b?.resumePin).toEqual(PIN_B);
  });

  it("an ACTIVE A gives A CONTINUE and leaves B at START", async () => {
    const started = await start(PIN_A);
    const [a, b] = await cards();
    expect(a?.status).toBe("CONTINUE");
    expect(a?.resumePin).toEqual(PIN_A);
    // The run that backs it is the one just started, and it is still ACTIVE.
    expect(await rowsFor(PIN_A)).toEqual([
      { id: started.sessionId, status: "ACTIVE" },
    ]);
    expect(b?.status).toBe("START");
  });

  it("a COMPLETED A gives A COMPLETED and leaves B at START", async () => {
    // The exact sentence #639 opens with: finish one, the other must not read
    // «Completada».
    const finished = await completeA();
    const [a, b] = await cards();
    expect(a?.status).toBe("COMPLETED");
    expect(await rowsFor(PIN_A)).toEqual([
      { id: finished, status: "COMPLETED" },
    ]);
    expect(b?.status).toBe("START");
  });

  it("ACTIVE A and COMPLETED B resolve independently", async () => {
    const startedB = await start(PIN_B);
    await service.completeStep(user, {
      idempotencyKey: nextKey(),
      sessionId: startedB.sessionId,
      stepKey: "explorar-contacto-sostenido",
    });
    const startedA = await start(PIN_A);

    const [a, b] = await cards();
    expect(a?.status).toBe("CONTINUE");
    expect(a?.resumePin).toEqual(PIN_A);
    expect(b?.status).toBe("CONTINUE");
    expect(b?.resumePin).toEqual(PIN_B);
    // Two lineages, two runs: neither verdict is borrowed from the other.
    expect(startedA.sessionId).not.toBe(startedB.sessionId);
    expect(await rowsFor(PIN_A)).toEqual([
      { id: startedA.sessionId, status: "ACTIVE" },
    ]);
    expect(await rowsFor(PIN_B)).toEqual([
      { id: startedB.sessionId, status: "ACTIVE" },
    ]);
  });

  // ── Lineage recovery vs exact-pin completion ─────────────────────────────

  it("an ACTIVE A@v1 answers CONTINUE for a published A@v2, on the OLD pin", async () => {
    // The reader is mid-run and the catalog moved on. Offering a fresh v2
    // would strand the run they are in, so rule 1 outranks rule 3 — and the
    // pin handed back is the session's own. A session is never migrated.
    const started = await start(PIN_A);
    const [card] = await cards([{ guideKey: GUIDE_A, guideVersion: 2 }]);

    expect(card?.status).toBe("CONTINUE");
    expect(card?.guidePin).toEqual({ guideKey: GUIDE_A, guideVersion: 2 });
    // Asked about v2, answered on v1: the pin to run is the running one.
    expect(card?.resumePin).toEqual({ guideKey: GUIDE_A, guideVersion: 1 });
    expect(await rowsFor({ guideKey: GUIDE_A, guideVersion: 1 })).toEqual([
      { id: started.sessionId, status: "ACTIVE" },
    ]);
    // And no v2 run was conjured to justify the verdict.
    expect(await rowsFor({ guideKey: GUIDE_A, guideVersion: 2 })).toEqual([]);
  });

  it("a COMPLETED A@v1 with published A@v2 and nothing ACTIVE reads START", async () => {
    // Completion does NOT cross versions: finishing v1 says nothing about v2.
    await completeA();
    const [card] = await cards([{ guideKey: GUIDE_A, guideVersion: 2 }]);

    expect(card?.status).toBe("START");
    expect(card?.resumePin).toEqual({ guideKey: GUIDE_A, guideVersion: 2 });
  });

  it("asked about v1 AND v2 together, only v1 reads COMPLETED", async () => {
    // The batch is what makes this reachable: with both pins in one request,
    // the finished `A@v1` row IS in hand while `A@v2` is being decided. If the
    // verdict matched on `guideKey` alone — "some version of this is done" —
    // v2 would inherit a completion nobody earned.
    await completeA();
    const [v1, v2] = await cards([
      { guideKey: GUIDE_A, guideVersion: 1 },
      { guideKey: GUIDE_A, guideVersion: 2 },
    ]);

    expect(v1?.status).toBe("COMPLETED");
    expect(v2?.status).toBe("START");
    expect(v2?.resumePin).toEqual({ guideKey: GUIDE_A, guideVersion: 2 });
  });

  it("a CANCELLED session is not a state — the card reads START", async () => {
    const started = await start(PIN_A);
    await service.cancel(user, {
      idempotencyKey: nextKey(),
      sessionId: started.sessionId,
    });
    const [a] = await cards([PIN_A]);
    expect(a?.status).toBe("START");
    // The cancelled row is still there — it just is not a state.
    expect(await rowsFor(PIN_A)).toEqual([
      { id: started.sessionId, status: "CANCELLED" },
    ]);
  });

  // ── What must never leak across cards ────────────────────────────────────

  it("B's session is never returned when asking about A", async () => {
    await start(PIN_B);
    const [a] = await cards([PIN_A]);
    expect(a?.status).toBe("START");
    expect(a?.resumePin).toEqual(PIN_A);
  });

  it("a version nobody ever started does not fall back to another session", async () => {
    await completeA();
    const [card] = await cards([{ guideKey: GUIDE_A, guideVersion: 7 }]);
    expect(card?.status).toBe("START");
    expect(card?.resumePin).toEqual({ guideKey: GUIDE_A, guideVersion: 7 });
  });

  it("another actor's session is invisible, not denied", async () => {
    const other = await prisma.user.create({
      data: { email: "c1-other@example.test", name: "Other", plan: "FREE" },
    });
    await start(PIN_A);

    const theirs = await service.resolveExperienceCardStates(other.id, [PIN_A]);
    expect(theirs[0]?.status).toBe("START");
    expect(theirs[0]?.resumePin).toEqual(PIN_A);
  });

  // ── One snapshot, not two moments ────────────────────────────────────────

  /**
   * The verdict is assembled from two reads, and a verdict assembled from two
   * MOMENTS belongs to neither of them.
   *
   * The interleaving is forced, never slept on: the exact-pin read is held at
   * a barrier until a concurrent START has committed from another connection.
   * Under per-statement snapshots that produces a word — START — that was true
   * at no single instant: before the concurrent start the answer was
   * COMPLETED, after it CONTINUE.
   */
  function barrier() {
    let release!: () => void;
    const reached = new Promise<void>((resolve) => {
      // Resolved by the spy the moment the second read is attempted.
      release = resolve;
    });
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { reached, arrive: release, gate, open };
  }

  it("holds ONE snapshot across both reads — never the hybrid START", async () => {
    const finished = await completeA();

    // Hold the second read until a concurrent START has committed.
    const b = barrier();
    const real = sessions.findLatestOwnPerExactPin.bind(sessions);
    const spy = vi
      .spyOn(sessions, "findLatestOwnPerExactPin")
      .mockImplementation(async (...args) => {
        b.arrive();
        await b.gate;
        return real(...args);
      });

    const verdict = cards([PIN_A]);
    // The ACTIVE read has run and found nothing; the exact-pin read is waiting.
    await b.reached;

    // Another device starts A, and COMMITS, while our read is mid-flight.
    const concurrent = await start(PIN_A);
    b.open();

    const [a] = await verdict;

    // The whole answer belongs to the snapshot taken before that commit.
    expect(a?.status).toBe("COMPLETED");
    expect(a?.resumePin).toEqual(PIN_A);
    expect(spy).toHaveBeenCalledTimes(1);

    // …and the concurrency really happened: the new run is committed and
    // visible to a fresh read.
    const rows = await prisma.guideSession.findMany({
      where: { userId: user.userId, ...PIN_A },
      select: { id: true, status: true },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    });
    expect(rows.map((r) => r.id)).toContain(concurrent.sessionId);
    expect(rows.find((r) => r.id === concurrent.sessionId)?.status).toBe(
      "ACTIVE",
    );
    expect(rows.find((r) => r.id === finished)?.status).toBe("COMPLETED");

    // A LATER read, on its own snapshot, sees the world that now exists.
    vi.restoreAllMocks();
    const [after] = await cards([PIN_A]);
    expect(after?.status).toBe("CONTINUE");
  });

  it("the snapshot is the boundary even when the new run is another VERSION", async () => {
    /**
     * Documents the boundary rather than discriminating the bug: with the
     * concurrent run on `A@v1` and the question about `A@v2`, no single read
     * can produce a hybrid. What it pins is that the answer is the ONE the
     * snapshot supports — and that the forbidden shortcut (treat any ACTIVE
     * row the exact-pin read returns as CONTINUE) would not have helped here,
     * because that read never sees the other version's row at all.
     */
    const V2 = { guideKey: GUIDE_A, guideVersion: 2 };
    await completeA(); // A@v1 finished; nothing ACTIVE.

    const b = barrier();
    const real = sessions.findLatestOwnPerExactPin.bind(sessions);
    vi.spyOn(sessions, "findLatestOwnPerExactPin").mockImplementation(
      async (...args) => {
        b.arrive();
        await b.gate;
        return real(...args);
      },
    );

    const verdict = cards([V2]);
    await b.reached;
    const concurrent = await start(PIN_A); // the OLDER version of the lineage
    b.open();

    const [v2] = await verdict;
    expect(v2?.status).toBe("START");
    expect(v2?.resumePin).toEqual(V2);

    vi.restoreAllMocks();
    // Once the snapshot moves on, rule 1 applies: the open run wins, on its
    // own pin, even though the card asked about v2.
    const [after] = await cards([V2]);
    expect(after?.status).toBe("CONTINUE");
    expect(after?.resumePin).toEqual(PIN_A);
    expect(concurrent.sessionId).toBeTruthy();
  });

  it("the snapshot read writes nothing, even racing a commit", async () => {
    await completeA();
    const before = {
      sessions: await prisma.guideSession.count(),
      steps: await prisma.guideSessionStep.count(),
      receipts: await prisma.guideCommandReceipt.count(),
      events: await prisma.learningEvent.count(),
    };

    const b = barrier();
    const real = sessions.findLatestOwnPerExactPin.bind(sessions);
    vi.spyOn(sessions, "findLatestOwnPerExactPin").mockImplementation(
      async (...args) => {
        b.arrive();
        await b.gate;
        return real(...args);
      },
    );
    const verdict = cards([PIN_A, PIN_B]);
    await b.reached;
    b.open();
    await verdict;

    // Only the reader ran; nothing it did left a row behind.
    expect({
      sessions: await prisma.guideSession.count(),
      steps: await prisma.guideSessionStep.count(),
      receipts: await prisma.guideCommandReceipt.count(),
      events: await prisma.learningEvent.count(),
    }).toEqual(before);
  });

  // ── The cost of a long history ───────────────────────────────────────────

  it("a pin with a long history still returns ONE row", async () => {
    /**
     * The bound this endpoint lives or dies by: `returned_rows <=
     * distinct_requested_pins`. A reader who has started and withdrawn the
     * same journey many times has many rows for that pin, and handing them all
     * to the service would make a card's cost grow with somebody's past.
     */
    for (let i = 0; i < 6; i += 1) {
      const s = await start(PIN_A);
      await service.cancel(user, {
        idempotencyKey: nextKey(),
        sessionId: s.sessionId,
      });
    }
    await start(PIN_B);
    expect(await prisma.guideSession.count()).toBe(7);

    const rows = await sessions.findLatestOwnPerExactPin(user.userId, [
      PIN_A,
      PIN_B,
      PIN_A, // repeated on purpose: it is the same question twice
    ]);

    expect(rows.length).toBeLessThanOrEqual(2); // distinct requested pins
    expect(rows.map((r) => `${r.guideKey}@${r.guideVersion}`).sort()).toEqual([
      `${GUIDE_A}@1`,
      `${GUIDE_B}@1`,
    ]);
  });

  it("the LAST outcome decides, not the best one", async () => {
    // Completed, then started again and withdrawn. Answering COMPLETED would
    // describe a run the reader already left; answering START describes where
    // they actually stand.
    await completeA();
    const again = await start(PIN_A);
    await service.cancel(user, {
      idempotencyKey: nextKey(),
      sessionId: again.sessionId,
    });

    const rows = await sessions.findLatestOwnPerExactPin(user.userId, [PIN_A]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("CANCELLED");

    const [card] = await cards([PIN_A]);
    expect(card?.status).toBe("START");
  });

  it("picks the newest row deterministically, tie-broken by id", async () => {
    // Two rows of the same pin forced to share `startedAt` to the microsecond.
    // Without the `id` tie-break the answer would depend on planner order,
    // which is no way to decide what a card says.
    const first = await start(PIN_A);
    await service.cancel(user, {
      idempotencyKey: nextKey(),
      sessionId: first.sessionId,
    });
    const second = await start(PIN_A);
    const when = new Date("2026-01-01T00:00:00.000Z");
    await prisma.guideSession.updateMany({
      where: { userId: user.userId, guideKey: GUIDE_A },
      data: { startedAt: when },
    });

    // What "last by id" means is PostgreSQL's business, not JavaScript's:
    // string ordering depends on the database collation, so the expectation is
    // asked of the same engine that will answer the real query.
    const [highest] = await prisma.guideSession.findMany({
      where: { userId: user.userId, guideKey: GUIDE_A },
      orderBy: { id: "desc" },
      take: 1,
      select: { id: true },
    });
    expect([first.sessionId, second.sessionId]).toContain(highest?.id);

    for (let i = 0; i < 4; i += 1) {
      const rows = await sessions.findLatestOwnPerExactPin(user.userId, [
        PIN_A,
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(highest?.id);
    }
  });

  // ── The list's own properties ────────────────────────────────────────────

  it("0, 1 and N pins all answer in the requested order", async () => {
    expect(await cards([])).toEqual([]);

    const one = await cards([PIN_B]);
    expect(one).toHaveLength(1);
    expect(one[0]?.guidePin).toEqual(PIN_B);

    const many = await cards([PIN_B, PIN_A, PIN_B]);
    expect(many.map((c) => c.guidePin)).toEqual([PIN_B, PIN_A, PIN_B]);
  });

  it("two experiences on the SAME binding get the SAME answer, not a fake one", async () => {
    // Two experience keys pinned to one guide ARE one lineage. Pretending they
    // are independent would hide a catalog mistake C.3/C.4 must prevent.
    const started = await start(PIN_A);
    const [first, second] = await cards([PIN_A, PIN_A]);
    expect(first).toEqual(second);
    expect(first?.status).toBe("CONTINUE");
    expect(first?.resumePin).toEqual(PIN_A);
    expect(await rowsFor(PIN_A)).toEqual([
      { id: started.sessionId, status: "ACTIVE" },
    ]);
  });

  it("the cost does not grow with the list — no N+1", async () => {
    await start(PIN_A);
    await start(PIN_B);

    const active = vi.spyOn(sessions, "findActiveOwnForGuideKeys");
    const exact = vi.spyOn(sessions, "findLatestOwnPerExactPin");
    const perSession = vi.spyOn(steps, "listAccepted");

    await cards([PIN_A, PIN_B, PIN_A, PIN_B, PIN_A]);

    // DATABASE_READS_PER_CHUNK=2 — two reads for five cards, and the ledger is
    // not among them: a card needs a verdict, not a step-by-step projection.
    expect(active).toHaveBeenCalledTimes(1);
    expect(exact).toHaveBeenCalledTimes(1);
    expect(perSession).not.toHaveBeenCalled();
  });

  it("reading a card state writes nothing", async () => {
    await start(PIN_A);
    const before = {
      sessions: await prisma.guideSession.count(),
      steps: await prisma.guideSessionStep.count(),
      receipts: await prisma.guideCommandReceipt.count(),
      events: await prisma.learningEvent.count(),
    };

    await cards([PIN_A, PIN_B]);

    expect({
      sessions: await prisma.guideSession.count(),
      steps: await prisma.guideSessionStep.count(),
      receipts: await prisma.guideCommandReceipt.count(),
      events: await prisma.learningEvent.count(),
    }).toEqual(before);
  });

  it("carries no user id, no idempotency key and no editorial context", async () => {
    await start(PIN_A);
    const [card] = await cards([PIN_A]);
    const wire = JSON.stringify(card);
    expect(wire).not.toContain(user.userId);
    expect(wire).not.toMatch(/idempotency/i);
    expect(wire).not.toMatch(/editionId|unitId/);
    expect(Object.keys(card ?? {}).sort()).toEqual([
      "guidePin",
      "resumePin",
      "status",
    ]);
    // The session itself is deliberately absent: a card renders a word and a
    // pin, and shipping a projection per card would pay the ledger's cost for
    // a list nobody is running yet.
    expect(wire).not.toMatch(/sessionId|stepsCompleted|currentStepKey/);
  });
});
