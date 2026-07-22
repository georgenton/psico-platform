import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import request from "supertest";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";
import type * as SentryModule from "../observability/sentry";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideLifecycleService } from "./guide-lifecycle.service";
import { backfillContentCore } from "../content-core/backfill";
import { EXERCISE_INGESTION_CATALOG } from "../content-core/exercise-ingestion-catalog";

/**
 * CC-7.4D — the Guide HTTP surface end to end: real Nest app, real JWT, real
 * PostgreSQL, real editorial fixture.
 *
 * What these tests are for is the WIRE, not the lifecycle (which has its own
 * pg-spec): the actor comes from the token, the bodies are closed, the status
 * follows created/replayed, a foreign session is indistinguishable from a
 * missing one, and every rejection leaves zero rows behind.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();
const DB = "cc74d_guide_http_db";

const BOOK_SLUG = "emociones-en-construccion";
const GUIDE_KEY = "eec-c1-cuerpo-antes-que-mente";
const PRACTICE_HEADING =
  EXERCISE_INGESTION_CATALOG[BOOK_SLUG][0].practice.sourceHeading;

const STEP_CONCEPT = "explorar-cuerpo-antes-que-mente";
const STEP_PRACTICE = "practicar-escucharte-por-dentro";
const STEP_RECALL = "recordar-cuerpo-antes-que-mente";
const CORRECT_OPTION = "opcion-cuerpo-primero";
const WRONG_OPTION = "opcion-mente-primero";

/** Zero-entropy canonical UUIDs (Gitleaks-safe). */
const key = (n: number) =>
  `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;

/**
 * The Sentry sink, intercepted at the module boundary the filter imports from.
 * `vi.hoisted` is what lets the (hoisted) mock factory reference it.
 */
const { sentrySpy } = vi.hoisted(() => ({ sentrySpy: vi.fn() }));
vi.mock("../observability/sentry", async (importOriginal) => {
  const actual = await importOriginal<typeof SentryModule>();
  return {
    ...actual,
    captureException: (exception: unknown, context?: unknown) =>
      sentrySpy(exception, context) as unknown,
  };
});

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

suite("CC-7.4D · Guide HTTP surface (real app + real PostgreSQL)", () => {
  let h: E2EHarness;
  let prisma: PrismaClient;
  let pool: Pool;
  let tokenA = "";
  let tokenB = "";
  let seq = 0;

  const nextKey = () => key(++seq);
  const http = () => request(h.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const counts = async () => ({
    sessions: await prisma.guideSession.count(),
    steps: await prisma.guideSessionStep.count(),
    receipts: await prisma.guideCommandReceipt.count(),
    events: await prisma.learningEvent.count(),
  });

  /** Start a session and return its id. */
  async function start(token = tokenA): Promise<string> {
    const res = await http()
      .post("/api/guide/sessions")
      .set(auth(token))
      .send({ idempotencyKey: nextKey(), guideKey: GUIDE_KEY, guideVersion: 1 })
      .expect(201);
    return res.body.session.sessionId as string;
  }

  const completeStep = (sessionId: string, stepKey: string, k = nextKey()) =>
    http()
      .post(`/api/guide/sessions/${sessionId}/steps/${stepKey}/complete`)
      .set(auth(tokenA))
      .send({ idempotencyKey: k });

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

    // The REAL editorial fixture, ingested by the real backfill.
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

    const a = await prisma.user.create({
      data: { email: "cc74d-a@example.test", name: "A", plan: "FREE" },
    });
    const b = await prisma.user.create({
      data: { email: "cc74d-b@example.test", name: "B", plan: "FREE" },
    });

    h = await createE2EApp({ prisma });
    const jwt = h.app.get(JwtService);
    // `ar` is the auth revision the JwtStrategy re-validates (ADR 0015):
    // a token without it is a legacy token and is rejected outright.
    tokenA = jwt.sign({ sub: a.id, email: a.email, ar: a.authRevision });
    tokenB = jwt.sign({ sub: b.id, email: b.email, ar: b.authRevision });
  }, 180_000);

  afterAll(async () => {
    await closeE2EApp(h);
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await prisma.guideSessionStep.deleteMany();
    await prisma.guideCommandReceipt.deleteMany();
    await prisma.guideSession.deleteMany();
    await prisma.learningEvent.deleteMany();
  });

  // ── Auth ─────────────────────────────────────────────────────────────────

  it("every route requires a JWT", async () => {
    const routes = [
      "/api/guide/sessions",
      `/api/guide/sessions/s1/steps/${STEP_CONCEPT}/complete`,
      `/api/guide/sessions/s1/steps/${STEP_RECALL}/recall`,
      "/api/guide/sessions/s1/cancel",
      "/api/guide/sessions/s1/complete",
    ];
    for (const route of routes) {
      await http().post(route).send({ idempotencyKey: nextKey() }).expect(401);
    }
  });

  it("a userId in the body is a 400, never an actor", async () => {
    const before = await counts();
    await http()
      .post("/api/guide/sessions")
      .set(auth(tokenA))
      .send({
        idempotencyKey: nextKey(),
        guideKey: GUIDE_KEY,
        guideVersion: 1,
        userId: "someone-else",
      })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("GUIDE_INVALID_PAYLOAD"));
    expect(await counts()).toEqual(before);
  });

  // ── START ────────────────────────────────────────────────────────────────

  it("START returns 201 with the closed session view and no context", async () => {
    const k = nextKey();
    const res = await http()
      .post("/api/guide/sessions")
      .set(auth(tokenA))
      .send({ idempotencyKey: k, guideKey: GUIDE_KEY, guideVersion: 1 })
      .expect(201);

    expect(Object.keys(res.body).sort()).toEqual([
      "created",
      "replayed",
      "session",
    ]);
    expect(res.body.created).toBe(true);
    expect(res.body.replayed).toBe(false);
    expect(Object.keys(res.body.session).sort()).toEqual([
      "currentStepKey",
      "guideKey",
      "guideVersion",
      "sessionId",
      "status",
      "stepsCompleted",
      "totalSteps",
    ]);
    expect(res.body.session).toMatchObject({
      guideKey: GUIDE_KEY,
      guideVersion: 1,
      status: "ACTIVE",
      stepsCompleted: 0,
      totalSteps: 3,
      currentStepKey: STEP_CONCEPT,
    });
    // No editorial anchor, no ledger, no receipts, no events on the wire.
    const serialized = JSON.stringify(res.body);
    for (const leak of ["editionId", "unitId", "bookId", "revisionId"]) {
      expect(serialized).not.toContain(leak);
    }

    // Replay → 200, same session, zero new rows.
    const before = await counts();
    const replay = await http()
      .post("/api/guide/sessions")
      .set(auth(tokenA))
      .send({ idempotencyKey: k, guideKey: GUIDE_KEY, guideVersion: 1 })
      .expect(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.created).toBe(false);
    expect(replay.body.session.sessionId).toBe(res.body.session.sessionId);
    expect(await counts()).toEqual(before);
  });

  it("reusing a key for a DIFFERENT step is a 409 with zero writes", async () => {
    const sessionId = await start();
    const k = nextKey();
    await completeStep(sessionId, STEP_CONCEPT, k).expect(201);

    // The same key now means something else: receipt drift → conflict.
    const before = await counts();
    await completeStep(sessionId, STEP_PRACTICE, k)
      .expect(409)
      .expect((r) =>
        expect(r.body.code).toBe("GUIDE_SESSION_INVALID_TRANSITION"),
      );
    expect(await counts()).toEqual(before);
  });

  it("an unpublished version is a 422 — the catalog answers before the receipt", async () => {
    // START resolves the pinned catalog INSIDE its transaction and before
    // inspecting the receipt, so an unknown version is an unresolved editorial
    // context (422), never a conflict — even when the key was used before.
    const k = nextKey();
    await http()
      .post("/api/guide/sessions")
      .set(auth(tokenA))
      .send({ idempotencyKey: k, guideKey: GUIDE_KEY, guideVersion: 1 })
      .expect(201);
    const before = await counts();
    await http()
      .post("/api/guide/sessions")
      .set(auth(tokenA))
      .send({ idempotencyKey: k, guideKey: GUIDE_KEY, guideVersion: 9 })
      .expect(422)
      .expect((r) => expect(r.body.code).toBe("GUIDE_CONTEXT_UNRESOLVED"));
    expect(await counts()).toEqual(before);
  });

  it("editorial context in the body is a 400", async () => {
    for (const extra of [
      { editionKey: "emociones-en-construccion-1e" },
      { unitKey: "unit-1" },
      { context: { editionKey: "e", unitKey: "u" } },
    ]) {
      await http()
        .post("/api/guide/sessions")
        .set(auth(tokenA))
        .send({
          idempotencyKey: nextKey(),
          guideKey: GUIDE_KEY,
          guideVersion: 1,
          ...extra,
        })
        .expect(400);
    }
  });

  // ── Steps ────────────────────────────────────────────────────────────────

  it("the concept step advances the cursor and emits NO event", async () => {
    const sessionId = await start();
    const k = nextKey();
    const res = await completeStep(sessionId, STEP_CONCEPT, k).expect(201);
    expect(res.body.session).toMatchObject({
      stepsCompleted: 1,
      currentStepKey: STEP_PRACTICE,
    });
    // No concept_explored, no guide_step_completed — only the START event.
    const kinds = (await prisma.learningEvent.findMany()).map((e) => e.kind);
    expect(kinds).toEqual(["GUIDE_SESSION_STARTED"]);

    const before = await counts();
    const replay = await completeStep(sessionId, STEP_CONCEPT, k).expect(200);
    expect(replay.body.replayed).toBe(true);
    expect(await counts()).toEqual(before);
  });

  it("the practice step emits exactly one practice_completed", async () => {
    const sessionId = await start();
    await completeStep(sessionId, STEP_CONCEPT).expect(201);
    const res = await completeStep(sessionId, STEP_PRACTICE).expect(201);
    expect(
      await prisma.learningEvent.count({
        where: { kind: "PRACTICE_COMPLETED" },
      }),
    ).toBe(1);
    // The response carries state, never the event or a payload.
    expect(JSON.stringify(res.body)).not.toContain("payload");
    expect(JSON.stringify(res.body)).not.toContain("exerciseKey");
  });

  // ── Recall ───────────────────────────────────────────────────────────────

  it("recall accepts both a correct and an incorrect option", async () => {
    for (const option of [CORRECT_OPTION, WRONG_OPTION]) {
      await prisma.guideSessionStep.deleteMany();
      await prisma.guideCommandReceipt.deleteMany();
      await prisma.guideSession.deleteMany();
      await prisma.learningEvent.deleteMany();

      const sessionId = await start();
      await completeStep(sessionId, STEP_CONCEPT).expect(201);
      await completeStep(sessionId, STEP_PRACTICE).expect(201);
      const res = await http()
        .post(`/api/guide/sessions/${sessionId}/steps/${STEP_RECALL}/recall`)
        .set(auth(tokenA))
        .send({ idempotencyKey: nextKey(), selectedOptionKey: option })
        .expect(201);

      expect(res.body.session.stepsCompleted).toBe(3);
      // The correct answer never reaches the client.
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain("correctOptionKey");
      expect(serialized).not.toContain(CORRECT_OPTION);
      expect(serialized).not.toContain("evaluationSource");
    }
  });

  it("an option outside the item's set is a 422 with zero writes", async () => {
    const sessionId = await start();
    await completeStep(sessionId, STEP_CONCEPT).expect(201);
    await completeStep(sessionId, STEP_PRACTICE).expect(201);
    const before = await counts();
    await http()
      .post(`/api/guide/sessions/${sessionId}/steps/${STEP_RECALL}/recall`)
      .set(auth(tokenA))
      .send({
        idempotencyKey: nextKey(),
        selectedOptionKey: "opcion-inventada",
      })
      .expect(422)
      .expect((r) => expect(r.body.code).toBe("GUIDE_STEP_COMMAND_MISMATCH"));
    expect(await counts()).toEqual(before);
  });

  it("server-owned recall fields in the body are a 400", async () => {
    const sessionId = await start();
    for (const extra of [
      { result: "correct" },
      { evaluationSource: "server" },
      { itemKey: "eec-c1-recall-cuerpo-antes-que-mente" },
      { correctOptionKey: CORRECT_OPTION },
    ]) {
      await http()
        .post(`/api/guide/sessions/${sessionId}/steps/${STEP_RECALL}/recall`)
        .set(auth(tokenA))
        .send({
          idempotencyKey: nextKey(),
          selectedOptionKey: CORRECT_OPTION,
          ...extra,
        })
        .expect(400);
    }
  });

  // ── Complete · cancel ────────────────────────────────────────────────────

  it("SESSION_COMPLETE is 409 before the ledger is full, 201 after", async () => {
    const sessionId = await start();
    await completeStep(sessionId, STEP_CONCEPT).expect(201);
    await completeStep(sessionId, STEP_PRACTICE).expect(201);

    await http()
      .post(`/api/guide/sessions/${sessionId}/complete`)
      .set(auth(tokenA))
      .send({ idempotencyKey: nextKey() })
      .expect(409);

    await http()
      .post(`/api/guide/sessions/${sessionId}/steps/${STEP_RECALL}/recall`)
      .set(auth(tokenA))
      .send({ idempotencyKey: nextKey(), selectedOptionKey: CORRECT_OPTION })
      .expect(201);

    const k = nextKey();
    const done = await http()
      .post(`/api/guide/sessions/${sessionId}/complete`)
      .set(auth(tokenA))
      .send({ idempotencyKey: k })
      .expect(201);
    expect(done.body.session.status).toBe("COMPLETED");

    await http()
      .post(`/api/guide/sessions/${sessionId}/complete`)
      .set(auth(tokenA))
      .send({ idempotencyKey: k })
      .expect(200);

    expect(
      await prisma.learningEvent.count({
        where: { kind: "GUIDE_SESSION_COMPLETED" },
      }),
    ).toBe(1);
  });

  it("CANCEL closes the session, replays, and blocks later transitions", async () => {
    const sessionId = await start();
    const eventsBefore = await prisma.learningEvent.count();
    const k = nextKey();

    const res = await http()
      .post(`/api/guide/sessions/${sessionId}/cancel`)
      .set(auth(tokenA))
      .send({ idempotencyKey: k })
      .expect(201);
    expect(res.body.session.status).toBe("CANCELLED");
    expect(await prisma.learningEvent.count()).toBe(eventsBefore);

    await http()
      .post(`/api/guide/sessions/${sessionId}/cancel`)
      .set(auth(tokenA))
      .send({ idempotencyKey: k })
      .expect(200);

    await completeStep(sessionId, STEP_CONCEPT).expect(409);
  });

  // ── Ownership ────────────────────────────────────────────────────────────

  it("a foreign session is indistinguishable from a nonexistent one", async () => {
    const sessionId = await start();

    const foreign = await http()
      .post(`/api/guide/sessions/${sessionId}/cancel`)
      .set(auth(tokenB))
      .send({ idempotencyKey: nextKey() })
      .expect(404);
    const missing = await http()
      .post(`/api/guide/sessions/ses-que-no-existe/cancel`)
      .set(auth(tokenB))
      .send({ idempotencyKey: nextKey() })
      .expect(404);

    // Every STABLE field is identical. `timestamp` is operational and moves
    // with the clock, so the responses are not byte-identical — and claiming
    // they were would be false.
    expect(foreign.body.code).toBe("GUIDE_SESSION_NOT_FOUND");
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body.statusCode).toBe(missing.body.statusCode);
    expect(foreign.body.code).toBe(missing.body.code);
    expect(foreign.body.message).toBe(missing.body.message);
    expect(foreign.body.path).toBe(missing.body.path);
    expect(Object.keys(foreign.body).sort()).toEqual(
      Object.keys(missing.body).sort(),
    );
    // A's session did not move.
    expect(
      (
        await prisma.guideSession.findUniqueOrThrow({
          where: { id: sessionId },
        })
      ).status,
    ).toBe("ACTIVE");
  });

  // ── Closed bodies everywhere ─────────────────────────────────────────────

  it("every route rejects an extra key with zero side effects", async () => {
    const sessionId = await start();
    const before = await counts();
    const routes: Array<[string, Record<string, unknown>]> = [
      ["/api/guide/sessions", { guideKey: GUIDE_KEY, guideVersion: 1 }],
      [`/api/guide/sessions/${sessionId}/steps/${STEP_CONCEPT}/complete`, {}],
      [
        `/api/guide/sessions/${sessionId}/steps/${STEP_RECALL}/recall`,
        { selectedOptionKey: CORRECT_OPTION },
      ],
      [`/api/guide/sessions/${sessionId}/cancel`, {}],
      [`/api/guide/sessions/${sessionId}/complete`, {}],
    ];
    for (const [route, extraFields] of routes) {
      await http()
        .post(route)
        .set(auth(tokenA))
        .send({ idempotencyKey: nextKey(), ...extraFields, metadata: {} })
        .expect(400);
    }
    expect(await counts()).toEqual(before);
  });

  it("a missing idempotency key has its own code", async () => {
    await http()
      .post("/api/guide/sessions")
      .set(auth(tokenA))
      .send({ guideKey: GUIDE_KEY, guideVersion: 1 })
      .expect(400)
      .expect((r) =>
        expect(r.body.code).toBe("GUIDE_IDEMPOTENCY_KEY_REQUIRED"),
      );
  });

  // ── Error paths never echo a real id ─────────────────────────────────────

  describe("error surfaces carry the route TEMPLATE, never the values", () => {
    const CANCEL_TEMPLATE = "/api/guide/sessions/:sessionId/cancel";
    const STEP_TEMPLATE =
      "/api/guide/sessions/:sessionId/steps/:stepKey/complete";

    let warned: string[] = [];
    let errored: string[] = [];

    beforeEach(() => {
      warned = [];
      errored = [];
      sentrySpy.mockClear();
      vi.spyOn(Logger.prototype, "warn").mockImplementation(
        (message: unknown) => {
          warned.push(String(message));
        },
      );
      vi.spyOn(Logger.prototype, "error").mockImplementation(
        (message: unknown) => {
          errored.push(String(message));
        },
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Every surface at once: response envelope, log line, Sentry context. */
    const assertNoLeak = (values: string[]) => {
      for (const line of [...warned, ...errored]) {
        for (const value of values) {
          expect(line.includes(value), `logged: ${line}`).toBe(false);
        }
      }
      for (const call of sentrySpy.mock.calls) {
        const context = JSON.stringify(call[1] ?? {});
        for (const value of values) {
          expect(context.includes(value), `sentry: ${context}`).toBe(false);
        }
      }
    };

    it("404 · a foreign session and a missing one share every stable field", async () => {
      const sessionId = await start();

      const foreign = await http()
        .post(`/api/guide/sessions/${sessionId}/cancel`)
        .set(auth(tokenB))
        .send({ idempotencyKey: nextKey() })
        .expect(404);
      const missing = await http()
        .post("/api/guide/sessions/ses-que-no-existe/cancel")
        .set(auth(tokenB))
        .send({ idempotencyKey: nextKey() })
        .expect(404);

      // The path is the template — the real session id never travels back.
      expect(foreign.body.path).toBe(CANCEL_TEMPLATE);
      expect(missing.body.path).toBe(CANCEL_TEMPLATE);
      expect(foreign.body.path).not.toContain(sessionId);

      // FOREIGN_AND_MISSING_STABLE_ERROR_FIELDS_IDENTICAL: statusCode, code,
      // message, path and the key set. `timestamp` is operational and is
      // ALLOWED to differ — the two responses are not byte-identical.
      expect(foreign.body.statusCode).toBe(missing.body.statusCode);
      expect(foreign.body.code).toBe(missing.body.code);
      expect(foreign.body.message).toBe(missing.body.message);
      expect(foreign.body.path).toBe(missing.body.path);
      expect(Object.keys(foreign.body).sort()).toEqual(
        Object.keys(missing.body).sort(),
      );

      // Two 404s were logged, both against the template.
      const lines = warned.filter((l) => l.includes("404"));
      expect(lines).toHaveLength(2);
      for (const line of lines) expect(line).toContain(CANCEL_TEMPLATE);
      assertNoLeak([sessionId, "ses-que-no-existe"]);
    });

    it("409 · a step conflict reports the step template, not the keys", async () => {
      const sessionId = await start();
      const k = nextKey();
      await completeStep(sessionId, STEP_CONCEPT, k).expect(201);
      // The same key aimed at a DIFFERENT step is a conflict.
      const conflict = await completeStep(sessionId, STEP_PRACTICE, k).expect(
        409,
      );

      expect(conflict.body.path).toBe(STEP_TEMPLATE);
      expect(conflict.body.path).not.toContain(sessionId);
      expect(conflict.body.path).not.toContain(STEP_PRACTICE);

      const lines = warned.filter((l) => l.includes("409"));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(STEP_TEMPLATE);
      assertNoLeak([sessionId, STEP_PRACTICE, STEP_CONCEPT, k]);
    });

    it("404 · an UNMATCHED route reports a constant, not the segments", async () => {
      const sessionId = await start();
      // No such action: the router itself fails to match, so there is no
      // template — and no way to tell a route word from a value.
      const res = await http()
        .post(`/api/guide/sessions/${sessionId}/no-such-action?token=secreto`)
        .set(auth(tokenA))
        .send({ idempotencyKey: nextKey() })
        .expect(404);

      // UNMATCHED_DYNAMIC_VALUE_IN_RESPONSE_PATH=false
      // UNMATCHED_QUERY_IN_RESPONSE_PATH=false
      expect(res.body.path).toBe("/api/:unmatched");
      expect(res.body.path).not.toContain(sessionId);
      expect(res.body.path).not.toContain("no-such-action");
      expect(res.body.path).not.toContain("secreto");
      expect(res.body.path).not.toContain("?");
      // Nest's router-level message quotes the raw URL, so it is replaced by
      // the code — otherwise the body would leak what `path` just removed.
      expect(res.body.message).toBe("NOT_FOUND");
      expect(JSON.stringify(res.body)).not.toContain(sessionId);
      expect(JSON.stringify(res.body)).not.toContain("secreto");

      // UNMATCHED_DYNAMIC_VALUE_IN_LOG=false
      const lines = warned.filter((l) => l.includes("404"));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("/api/:unmatched");
      assertNoLeak([sessionId, "no-such-action", "secreto"]);
    });

    it("500 · a simulated failure logs and reports the template only", async () => {
      const sessionId = await start();
      vi.spyOn(
        h.app.get(GuideLifecycleService),
        "completeStep",
      ).mockRejectedValue(new Error("simulated lifecycle failure"));

      const res = await completeStep(sessionId, STEP_CONCEPT).expect(500);

      expect(res.body.code).toBe("INTERNAL_ERROR");
      expect(res.body.path).toBe(STEP_TEMPLATE);
      expect(res.body.path).not.toContain(sessionId);
      expect(res.body.path).not.toContain(STEP_CONCEPT);

      // The log line and the Sentry context use the SAME sanitized value.
      expect(errored.some((l) => l.includes(STEP_TEMPLATE))).toBe(true);
      expect(sentrySpy).toHaveBeenCalledTimes(1);
      expect(sentrySpy.mock.calls[0]?.[1]).toMatchObject({
        method: "POST",
        path: STEP_TEMPLATE,
        statusCode: 500,
        code: "INTERNAL_ERROR",
      });
      assertNoLeak([sessionId, STEP_CONCEPT]);
    });
  });
});
