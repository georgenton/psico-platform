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
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { JobsService } from "../jobs";
import { closeE2EApp, createE2EApp, type E2EHarness } from "../test/e2e-app";
import {
  ACCOUNT_DELETION_COOLDOWN_MS,
  accountDeletionDueAt,
} from "./account-deletion-window";

/**
 * `POST /api/user/delete-request/cancel` through the real HTTP stack: prefix,
 * JWT, throttler, pipe and error envelope, with Prisma mocked.
 *
 * What the database decides —the lock, the conditional write, the race with the
 * worker— is in `account-deletion-cancel.pg-spec.ts`. This is the contract a
 * client sees, and it runs without a PostgreSQL.
 */

const ID = "user-baja-1";
const CANCEL = "/api/user/delete-request/cancel";
const DAY = 24 * 60 * 60 * 1000;

describe("cancelling an account deletion · E2E", () => {
  let h: E2EHarness;
  let auth: { Authorization: string };
  /** What the row says. `undefined` is an account that no longer exists. */
  let requestedAt: Date | null | undefined;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h = await createE2EApp();
    const token = h.app
      .get(JwtService)
      .sign({ sub: ID, email: "baja@example.test", ar: 0 });
    auth = { Authorization: `Bearer ${token}` };
  }, 20_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  beforeEach(async () => {
    await h.resetMocks();
    requestedAt = null;
    h.prisma.user.findUnique.mockImplementation(
      async ({ select }: { select?: Record<string, boolean> }) => {
        // The guard's own read, which must keep passing while the service's
        // reads see whatever the case sets.
        if (select?.authRevision) {
          return {
            id: ID,
            email: "baja@example.test",
            role: "USER",
            plan: "FREE",
            isActive: true,
            authRevision: 0,
          };
        }
        return requestedAt === undefined
          ? null
          : { deleteRequestedAt: requestedAt };
      },
    );
    h.prisma.user.updateMany.mockImplementation(async () => {
      requestedAt = null;
      return { count: 1 };
    });
    h.prisma.privacySettings.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.dataExportRequest.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cancel = () => request(h.app.getHttpServer()).post(CANCEL).set(auth);

  it("answers 401 without a session, and touches nothing", async () => {
    const res = await request(h.app.getHttpServer()).post(CANCEL);

    expect(res.status).toBe(401);
    expect(h.prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("needs no body and no password, and undoes both columns", async () => {
    requestedAt = new Date(Date.now() - 5 * DAY);

    const res = await cancel();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, cancelled: true });
    expect(h.prisma.privacySettings.updateMany).toHaveBeenCalledWith({
      where: { userId: ID },
      data: { accountDeleteRequestedAt: null },
    });
  });

  it("is idempotent: the second one finds nothing pending and is not an error", async () => {
    requestedAt = new Date(Date.now() - 5 * DAY);

    await cancel().expect(200, { ok: true, cancelled: true });
    await cancel().expect(200, { ok: true, cancelled: false });
    expect(h.prisma.user.updateMany).toHaveBeenCalledTimes(1);
  });

  it("answers 409 with its code and a message a person can read, once it is too late", async () => {
    requestedAt = new Date(Date.now() - ACCOUNT_DELETION_COOLDOWN_MS - 1_000);

    const res = await cancel();

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      statusCode: 409,
      code: "ACCOUNT_DELETION_WINDOW_CLOSED",
      message: "Ya pasó el plazo para cancelar la eliminación.",
      path: CANCEL,
    });
    expect(h.prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("answers 410 when the worker finished first", async () => {
    requestedAt = new Date(Date.now() - 5 * DAY);
    h.prisma.user.updateMany.mockImplementation(async () => {
      requestedAt = undefined;
      return { count: 0 };
    });

    const res = await cancel();

    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({
      statusCode: 410,
      code: "ACCOUNT_ALREADY_DELETED",
    });
    expect(h.prisma.privacySettings.updateMany).not.toHaveBeenCalled();
  });

  it("a repeated request answers the same day the first one gave", async () => {
    const enqueue = vi
      .spyOn(h.app.get(JobsService), "enqueueAccountDeletion")
      .mockResolvedValue(undefined);
    requestedAt = new Date("2026-11-24T14:05:00.000Z");

    const res = await request(h.app.getHttpServer())
      .post("/api/user/delete-request")
      .set(auth)
      .send({ password: "whatever" });

    expect(res.status).toBe(202);
    expect(res.body.deleteAt).toBe(
      accountDeletionDueAt(requestedAt).toISOString(),
    );
    // No second job for a request that is already standing.
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("sits on the global limit of 60 a minute, with no smaller one of its own", async () => {
    // Every web caller shares one bucket, so a handful per hour would let a few
    // people use up everybody else's chance to keep their account.
    for (let i = 0; i < 60; i++) await cancel().expect(200);

    const limited = await cancel();
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});
