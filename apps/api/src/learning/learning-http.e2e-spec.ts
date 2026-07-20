import * as bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";
import { unitKeyFromLegacyChapterId } from "../content-core/lib/block-key";
import { LearningController } from "./learning.controller";

/**
 * CC-7.3 — the HTTP surface through the REAL wiring (global prefix,
 * ValidationPipe, JwtAuthGuard, HttpExceptionFilter): 401 without a token,
 * the CC-7.1 parsers as the runtime authority (400s incl. extra fields and a
 * smuggled userId), the 201/200 create-vs-replay split, the value-free error
 * envelope for 403/404/409/422, and the registered throttle policies.
 *
 * Domain behavior (catalog, entitlement fixtures, transitions, grading,
 * progress derivation) runs against REAL PostgreSQL in
 * `learning-domain.pg-spec.ts` — this spec is exclusively the HTTP contract.
 */

const PASSWORD = "http-spec-password-1";
const USER_ID = "user-cc73-http";
const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const CH_ID = "ch-cc73-http";
const UNIT_KEY = unitKeyFromLegacyChapterId(CH_ID);

const COMMAND_ROUTES: string[] = [
  `/api/learning/units/${UNIT_KEY}/open`,
  `/api/learning/units/${UNIT_KEY}/complete`,
  "/api/learning/concepts/algun-concepto/explore",
  "/api/learning/recall-attempts",
  "/api/learning/practices/ex-1/complete",
];

describe("CC-7.3 · learning HTTP surface (E2E)", () => {
  let h: E2EHarness;
  let token: string;

  /** The full resolvable chain for ONE unit, FREE book, chapter `order`. */
  function wireUnitChain(opts: { plan?: string; chapterOrder?: number } = {}) {
    h.prisma.contentUnit.findMany.mockResolvedValue([
      {
        id: "cu-1",
        unitKey: UNIT_KEY,
        edition: {
          id: "ed-1",
          editionKey: "libro-1e",
          slug: "libro",
          publishedRevisionId: "rev-1",
        },
      },
    ]);
    h.prisma.revisionUnit.findUnique.mockResolvedValue({
      revision: { id: "rev-1", number: 1 },
    });
    h.prisma.book.findUnique.mockResolvedValue({
      id: "b-1",
      slug: "libro",
      plan: opts.plan ?? "FREE",
    });
    h.prisma.chapter.findMany.mockResolvedValue([
      { id: CH_ID, order: opts.chapterOrder ?? 1 },
    ]);
  }

  const STORED_ROW = {
    id: "le-http-1",
    userId: USER_ID,
    kind: "UNIT_OPENED",
    payload: { editionKey: "libro-1e", unitKey: UNIT_KEY },
    editionId: "ed-1",
    unitId: "cu-1",
    conceptId: null,
    guideSessionId: null,
    blockKey: null,
    idempotencyKey: KEY,
    schemaVersion: 1,
    createdAt: new Date("2026-07-20T12:00:00Z"),
  };

  beforeAll(async () => {
    h = await createE2EApp();

    // Real login → real JWT. Every authed request below re-validates the
    // actor against this user mock (JwtStrategy hits the DB per request).
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    h.prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: "cc73-http@example.com",
      name: "HTTP Spec",
      role: "USER",
      plan: "FREE",
      passwordHash,
      authProvider: "LOCAL",
      isActive: true,
      authRevision: 0,
      cryptoSalt: "c2FsdC1zYWx0LXNhbHQtc2FsdA",
    });
    h.prisma.refreshToken.create.mockResolvedValue({});
    const login = await request(h.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "cc73-http@example.com", password: PASSWORD });
    expect(login.status).toBe(200);
    token = login.body.accessToken as string;
  }, 60_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  // ─── auth ────────────────────────────────────────────────────────────────

  it("every route returns 401 without a token", async () => {
    for (const path of COMMAND_ROUTES) {
      const res = await request(h.app.getHttpServer())
        .post(path)
        .send({ idempotencyKey: KEY });
      expect(res.status, path).toBe(401);
    }
    const progress = await request(h.app.getHttpServer()).get(
      "/api/learning/progress?bookSlug=libro",
    );
    expect(progress.status).toBe(401);
  });

  // ─── parsers as the runtime authority ────────────────────────────────────

  it("missing idempotencyKey → 400 IDEMPOTENCY_KEY_REQUIRED on every command", async () => {
    for (const path of COMMAND_ROUTES) {
      const body =
        path === "/api/learning/recall-attempts" ? { itemKey: "i-1" } : {};
      const res = await request(h.app.getHttpServer())
        .post(path)
        .set("Authorization", `Bearer ${token}`)
        .send(body);
      expect(res.status, path).toBe(400);
      expect(res.body.code, path).toBe(
        "LEARNING_EVENT_IDEMPOTENCY_KEY_REQUIRED",
      );
    }
  });

  it("invalid UUID → 400; extra field → 400; smuggled userId → 400 without echoing it", async () => {
    const badUuid = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: "not-a-uuid" });
    expect(badUuid.status).toBe(400);
    expect(badUuid.body.code).toBe("LEARNING_EVENT_INVALID_PAYLOAD");
    expect(JSON.stringify(badUuid.body)).not.toContain("not-a-uuid");

    const extra = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: KEY, progress: 100 });
    expect(extra.status).toBe(400);
    expect(extra.body.code).toBe("LEARNING_EVENT_INVALID_PAYLOAD");

    // The actor is the JWT — a userId in the body is an unknown field.
    const smuggled = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: KEY, userId: "evil-user" });
    expect(smuggled.status).toBe(400);
    expect(JSON.stringify(smuggled.body)).not.toContain("evil-user");
  });

  it("a client-forged recall `result` is rejected as an unknown field → 400", async () => {
    const res = await request(h.app.getHttpServer())
      .post("/api/learning/recall-attempts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        idempotencyKey: KEY,
        itemKey: "item-1",
        selectedOptionKey: "opt-a",
        result: "correct",
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LEARNING_EVENT_INVALID_PAYLOAD");
  });

  // ─── 201 create / 200 replay ─────────────────────────────────────────────

  it("a new event returns 201 with the closed command response (no userId)", async () => {
    wireUnitChain();
    h.prisma.learningEvent.createMany.mockResolvedValue({ count: 1 });
    h.prisma.learningEvent.findUnique.mockResolvedValue(STORED_ROW);

    const res = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: KEY });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.replayed).toBe(false);
    expect(res.body.event.type).toBe("unit_opened");
    expect(res.body.event.occurredAt).toBe("2026-07-20T12:00:00.000Z");
    expect(JSON.stringify(res.body)).not.toContain("userId");
    expect(JSON.stringify(res.body)).not.toContain(USER_ID);
  });

  it("an exact replay returns 200 with the ORIGINAL event", async () => {
    wireUnitChain();
    h.prisma.learningEvent.createMany.mockResolvedValue({ count: 0 });
    h.prisma.learningEvent.findUnique.mockResolvedValue(STORED_ROW);

    const res = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: KEY });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.replayed).toBe(true);
    expect(res.body.event.id).toBe("le-http-1");
  });

  // ─── error envelope: value-free codes at the right statuses ──────────────

  it("unknown unit → 404 UNKNOWN_UNIT; ambiguous unit → 422 UNRESOLVED", async () => {
    h.prisma.contentUnit.findMany.mockResolvedValue([]);
    const notFound = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: KEY });
    expect(notFound.status).toBe(404);
    expect(notFound.body.code).toBe("LEARNING_EVENT_UNKNOWN_UNIT");

    h.prisma.contentUnit.findMany.mockResolvedValue([
      { id: "cu-1", unitKey: UNIT_KEY, edition: { id: "e1" } },
      { id: "cu-2", unitKey: UNIT_KEY, edition: { id: "e2" } },
    ]);
    const ambiguous = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: KEY });
    expect(ambiguous.status).toBe(422);
    expect(ambiguous.body.code).toBe(
      "LEARNING_EVENT_UNRESOLVED_CONTENT_CONTEXT",
    );
  });

  it("idempotency conflict → 409 with the stable code only", async () => {
    wireUnitChain();
    h.prisma.learningEvent.createMany.mockResolvedValue({ count: 0 });
    h.prisma.learningEvent.findUnique.mockResolvedValue({
      ...STORED_ROW,
      payload: { editionKey: "OTRA-1e", unitKey: UNIT_KEY },
    });

    const res = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: KEY });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LEARNING_EVENT_IDEMPOTENCY_CONFLICT");
    expect(JSON.stringify(res.body)).not.toContain("OTRA");
  });

  it("denied entitlement → 403 LEARNING_EVENT_FORBIDDEN without any catalog detail", async () => {
    // FREE actor, PRO book, chapter 2 — the single FREE/PRO condition denies.
    wireUnitChain({ plan: "PRO", chapterOrder: 2 });
    const writesBefore = h.prisma.learningEvent.createMany.mock.calls.length;
    const res = await request(h.app.getHttpServer())
      .post(`/api/learning/units/${UNIT_KEY}/open`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idempotencyKey: KEY });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("LEARNING_EVENT_FORBIDDEN");
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("PRO_REQUIRED");
    expect(serialized).not.toContain("libro");
    // The denial never triggered a write:
    expect(h.prisma.learningEvent.createMany.mock.calls.length).toBe(
      writesBefore,
    );
  });

  it("progress without a valid bookSlug → 400", async () => {
    const missing = await request(h.app.getHttpServer())
      .get("/api/learning/progress")
      .set("Authorization", `Bearer ${token}`);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("LEARNING_EVENT_INVALID_PAYLOAD");
  });

  // ─── throttle policies registered on every handler ───────────────────────

  it("every handler carries an explicit throttle policy", () => {
    const handlers = [
      "openUnit",
      "completeUnit",
      "exploreConcept",
      "submitRecallAttempt",
      "completePractice",
      "getProgress",
    ] as const;
    // Commands 30/min · recall 20/min · progress 60/min:
    const expectedLimit = (name: string) =>
      name === "submitRecallAttempt" ? 20 : name === "getProgress" ? 60 : 30;
    for (const name of handlers) {
      const target = LearningController.prototype[name];
      const keys = Reflect.getMetadataKeys(target) as unknown[];
      // @nestjs/throttler v6 stores LIMIT and TTL under separate metadata
      // keys — pick the LIMIT one and compare the exact number.
      const limitKey = keys.find((k) => {
        const s = String(k).toUpperCase();
        return s.includes("THROTTLER") && s.includes("LIMIT");
      });
      expect(limitKey, name).toBeDefined();
      const value = Reflect.getMetadata(limitKey, target) as unknown;
      expect(Number(value), name).toBe(expectedLimit(name));
    }
  });
});
