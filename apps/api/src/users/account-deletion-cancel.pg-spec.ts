import { execSync } from "node:child_process";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import type { Job } from "bullmq";
import { Pool } from "pg";
import request from "supertest";
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

import { CircleActivityRepository } from "../circles/circle-activity.repository";
import { CircleArtifactRepository } from "../circles/circle-artifact.repository";
import { CircleEventRepository } from "../circles/circle-event.repository";
import { CircleGuestSessionRepository } from "../circles/circle-guest-session.repository";
import { CircleInvitationRepository } from "../circles/circle-invitation.repository";
import { CircleMemberRepository } from "../circles/circle-member.repository";
import { CircleParticipantRepository } from "../circles/circle-participant.repository";
import { CirclesAccountDeletionService } from "../circles/circles-account-deletion.service";
import { JobsService } from "../jobs";
import { AccountDeletionProcessor } from "../jobs/processors/account-deletion.processor";
import { DataExportProcessor } from "../jobs/processors/data-export.processor";
import {
  JobName,
  type AccountDeletionJobPayload,
  type DataExportJobPayload,
} from "../jobs/queue-names";
import { closeE2EApp, createE2EApp, type E2EHarness } from "../test/e2e-app";
import {
  createThrowawayDatabase,
  type ThrowawayDatabase,
} from "../test/throwaway-database";
import {
  ACCOUNT_DELETION_COOLDOWN_MS,
  accountDeletionDueAt,
} from "./account-deletion-window";
import { UsersService } from "./users.service";

/**
 * Cancelling an account deletion against the worker that executes it, on REAL
 * PostgreSQL.
 *
 * The unit spec can see the SHAPE of the cancellation —lock, conditional write,
 * mirror— because its `$transaction` is a double that serialises nothing. What
 * has to be shown here is the other half: that two connections competing for
 * the same account have exactly two possible outcomes, and that neither says
 * «cancelled» about something that was erased.
 *
 * ── How a race is produced without a seam in production code ───────────────
 *
 * The two never compete except around one instant. The worker acts only once
 * thirty days have passed; a cancellation is accepted only before. So every race
 * here is dated so that the instant falls DURING the test: the request is due a
 * few hundred milliseconds after the cancellation has read it and found it open,
 * the cancellation is held by a wrapper around its own client (never by a hook
 * in the service), and the worker starts once the time has really passed. No
 * clock is moved; the stored request is, the way `hosted-cleanup.mjs` ages one.
 *
 * Who is waiting on whom is read from `pg_blocking_pids` on a third connection.
 * Without that, two operations that happened not to overlap would pass.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const API_DIR = process.cwd();

const DAY = 24 * 60 * 60 * 1000;
/** Long enough to read the request before it is due, on a slow machine too. */
const DUE_SOON = 1_500;
const PASSWORD = "UnaClave-larga-9";
const WORKER = "account_deletion_worker";
const CANCELLER = "account_deletion_canceller";
const CANCELLER_B = "account_deletion_canceller_b";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every door opened in a test, and every side still running behind one. */
let doors: Gate[] = [];
let running: Promise<unknown>[] = [];

/** A door one side waits at, and somebody else opens. */
function makeGate() {
  let reach!: () => void;
  let open!: () => void;
  const reached = new Promise<void>((r) => (reach = r));
  const released = new Promise<void>((r) => (open = r));
  const gate = { reached, released, reach, open };
  doors.push(gate);
  return gate;
}
interface Gate {
  reached: Promise<void>;
  released: Promise<void>;
  reach: () => void;
  open: () => void;
}

/** Starts one side of a race, so a failing test still lets it finish. */
function start<T>(side: Promise<T>): Promise<T> {
  running.push(side.catch(() => undefined));
  return side;
}

/**
 * Waits for one side to arrive at its door, or fails if it finished without
 * ever getting there. A race whose two sides did not meet is not a race, and
 * without this it would be reported as a timeout, sixty seconds later.
 */
async function arrives(gate: Gate, side: Promise<unknown>, who: string) {
  const first = await Promise.race([
    gate.reached.then(() => "arrived"),
    side.then(
      () => "finished",
      (e) => `failed: ${String(e)}`,
    ),
  ]);
  if (first !== "arrived") throw new Error(`${who} never got there (${first})`);
}

/**
 * The same client, holding the cancellation ONCE at one of two points:
 *
 *   `before-lock`    it has read the request and found it inside its window;
 *                    it has not asked PostgreSQL for the row yet.
 *   `before-commit`  both columns are written in its transaction and nothing
 *                    has been committed.
 *
 * The longer timeout is the test's, not the product's: the pause spends the
 * transaction's budget on waiting, which production never does.
 */
function holding(
  client: PrismaClient,
  point: "before-lock" | "before-commit",
  gate: Gate,
): PrismaClient {
  let armed = true;
  const hold = async () => {
    if (!armed) return;
    armed = false;
    gate.reach();
    await gate.released;
  };
  type Call = (...args: unknown[]) => Promise<unknown>;

  const held = (tx: Record<string, unknown>) =>
    new Proxy(tx, {
      get(target, prop) {
        const real = target[prop as string];
        if (point === "before-lock" && prop === "$queryRaw") {
          return async (...args: unknown[]) => {
            await hold();
            return (real as Call).apply(target, args);
          };
        }
        if (point === "before-commit" && prop === "privacySettings") {
          const model = real as Record<string, Call>;
          return new Proxy(model, {
            get: (m, op) =>
              op !== "updateMany"
                ? m[op as string]
                : async (...args: unknown[]) => {
                    const out = await m.updateMany!.apply(m, args);
                    await hold();
                    return out;
                  },
          });
        }
        return real;
      },
    });

  return new Proxy(client, {
    get(target, prop) {
      if (prop !== "$transaction") {
        return (target as unknown as Record<string | symbol, unknown>)[prop];
      }
      return (fn: (tx: unknown) => Promise<unknown>) =>
        target.$transaction((tx) => fn(held(tx as never)), {
          timeout: 60_000,
          maxWait: 10_000,
        });
    },
  }) as PrismaClient;
}

suite("cancelling an account deletion (real PostgreSQL)", () => {
  let desechable: ThrowawayDatabase;
  let pool: Pool;
  let prisma: PrismaClient;
  let workerSide: { pool: Pool; prisma: PrismaClient };
  let cancelSide: { pool: Pool; prisma: PrismaClient };
  let cancelSideB: { pool: Pool; prisma: PrismaClient };
  let passwordHash = "";

  let seq = 0;
  // Padded, because an object key is only OURS from eight characters up: with
  // a shorter id the worker would find nothing to erase and every «it erased
  // nothing» below would be true for the wrong reason.
  const uid = (p: string) => `${p}-${String(++seq).padStart(8, "0")}`;

  /** Every deletion job the service asked for, in order. */
  let queued: AccountDeletionJobPayload[] = [];
  let resumed: DataExportJobPayload[] = [];
  let erased: string[] = [];
  let onErase: (key: string) => Promise<void> = async () => undefined;
  let lines: string[] = [];

  const storage = {
    putObject: async () => undefined,
    deleteObject: async (key: string) => {
      await onErase(key);
      erased.push(key);
    },
  };
  const jobs = {
    enqueueAccountDeletion: async (p: AccountDeletionJobPayload) => {
      queued.push(p);
    },
    enqueueDataExport: async () => undefined,
    resumeDataExport: async (p: DataExportJobPayload) => {
      resumed.push(p);
      return true;
    },
  };

  const usersOn = (client: PrismaClient) =>
    new UsersService(
      client as never,
      storage as never,
      jobs as never,
      { get: () => "https://app.example.test" } as never,
      { incr: async () => 1 } as never,
    );

  const workerOn = (client: PrismaClient) =>
    new AccountDeletionProcessor(
      client as never,
      new CirclesAccountDeletionService(
        new CircleParticipantRepository(client as never),
        new CircleActivityRepository(client as never),
        new CircleEventRepository(client as never) as never,
        new CircleMemberRepository(client as never),
        new CircleInvitationRepository(client as never),
        new CircleGuestSessionRepository(client as never),
        new CircleArtifactRepository(client as never),
      ),
      storage as never,
    );

  const fire = (
    payload: AccountDeletionJobPayload,
    client: PrismaClient = workerSide.prisma,
  ) =>
    workerOn(client).process({
      id: "job",
      name: JobName.FINALIZE_ACCOUNT_DELETION,
      data: payload,
    } as unknown as Job<AccountDeletionJobPayload>);

  /** A client on ONE named connection, so `pg_stat_activity` can find it. */
  const identified = (name: string) => {
    const p = new Pool({
      connectionString: desechable.url,
      max: 1,
      application_name: name,
      // Stays connected: a reconnection would spend the milliseconds a dated
      // race leaves before the deadline.
      idleTimeoutMillis: 0,
    });
    return { pool: p, prisma: new PrismaClient({ adapter: new PrismaPg(p) }) };
  };

  const pidOf = async (name: string): Promise<number | null> => {
    const { rows } = await pool.query(
      `SELECT pid FROM pg_stat_activity
        WHERE application_name = $1 AND datname = current_database() LIMIT 1`,
      [name],
    );
    return rows.length ? (rows[0].pid as number) : null;
  };

  /** Waits until `name` is blocked, and says by whom. */
  const blockedBy = async (name: string): Promise<number[]> => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const { rows } = await pool.query(
        `SELECT pg_blocking_pids(pid) AS blockers
           FROM pg_stat_activity
          WHERE application_name = $1
            AND datname = current_database()
            AND wait_event_type = 'Lock'`,
        [name],
      );
      const blockers = (rows[0]?.blockers ?? []) as number[];
      if (blockers.length) return blockers;
      await sleep(15);
    }
    return [];
  };

  const account = async () => {
    const id = uid("u");
    await prisma.user.create({
      data: { id, email: `${id}@example.test`, name: id, passwordHash },
    });
    return id;
  };

  /** Ages the stored request, and its mirror, as time passing would have. */
  const requestedAt = async (userId: string, at: Date) => {
    await prisma.user.update({
      where: { id: userId },
      data: { deleteRequestedAt: at },
    });
    await prisma.privacySettings.upsert({
      where: { userId },
      create: { userId, accountDeleteRequestedAt: at },
      update: { accountDeleteRequestedAt: at },
    });
    return at;
  };
  const dueIn = (userId: string, ms: number) =>
    requestedAt(
      userId,
      new Date(Date.now() - ACCOUNT_DELETION_COOLDOWN_MS + ms),
    );

  const stateOf = async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { privacySettings: true },
    });
    return user
      ? {
          exists: true as const,
          requested: user.deleteRequestedAt,
          mirror: user.privacySettings?.accountDeleteRequestedAt ?? null,
        }
      : { exists: false as const, requested: null, mirror: null };
  };

  /**
   * Something for the worker to destroy: an object in R2, and a live shared
   * activity with an envelope that only the deletion would empty.
   */
  const withBelongings = async (userId: string) => {
    const image = {
      buffer: Buffer.from("png"),
      originalname: "me.png",
      mimetype: "image/png",
      size: 1024,
    } as Express.Multer.File;
    await usersOn(prisma).uploadAvatar(userId, image);

    const circleId = uid("c");
    const memberId = uid("m");
    const activityId = uid("act");
    const seatId = uid("seat");
    await pool.query(
      `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
       VALUES ($1,'DUO','ACTIVE',$2,2,now())`,
      [circleId, userId],
    );
    await pool.query(
      `INSERT INTO "CircleMember" ("id","circleId","userId","role","status","joinedAt")
       VALUES ($1,$2,$3,'ORGANIZER','ACTIVE',now())`,
      [memberId, circleId, userId],
    );
    await pool.query(
      `INSERT INTO "CircleActivity"
         ("id","circleId","templateKey","templateVersion","status","requiredParticipants","updatedAt")
       VALUES ($1,$2,'fixture-duo-template',1,'INVITING',2,now())`,
      [activityId, circleId],
    );
    await pool.query(
      `INSERT INTO "CircleActivityParticipant"
         ("id","circleId","activityId","memberId","status","ciphertext","nonce",
          "keyVersion","payloadHash","readyAt","fieldKeys","sharingMode","updatedAt")
       VALUES ($1,$2,$3,$4,'INVITED','CIPHERTEXT','nonce',1,$5,now(),'{a}','SELECTED_FIELDS',now())`,
      [seatId, circleId, activityId, memberId, "0".repeat(64)],
    );
    /** Everything the deletion would have touched, as rows. */
    return async () => ({
      avatar: (
        await pool.query(`SELECT "avatarUrl" FROM "User" WHERE "id" = $1`, [
          userId,
        ])
      ).rows,
      member: (
        await pool.query(`SELECT * FROM "CircleMember" WHERE "id" = $1`, [
          memberId,
        ])
      ).rows,
      activity: (
        await pool.query(`SELECT * FROM "CircleActivity" WHERE "id" = $1`, [
          activityId,
        ])
      ).rows,
      seat: (
        await pool.query(
          `SELECT * FROM "CircleActivityParticipant" WHERE "id" = $1`,
          [seatId],
        )
      ).rows,
      events: (
        await pool.query(
          `SELECT count(*)::int AS n FROM "CircleEvent" WHERE "circleId" = $1`,
          [circleId],
        )
      ).rows,
    });
  };

  beforeAll(async () => {
    desechable = await createThrowawayDatabase(base as string, "baja_cancel");
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: desechable.url,
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "pipe",
    });
    pool = new Pool({ connectionString: desechable.url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    workerSide = identified(WORKER);
    cancelSide = identified(CANCELLER);
    cancelSideB = identified(CANCELLER_B);
    passwordHash = await bcrypt.hash(PASSWORD, 4);
    // Connected before any dated test starts counting milliseconds.
    for (const s of [workerSide, cancelSide, cancelSideB]) {
      await s.prisma.user.count();
    }
  }, 240_000);

  afterAll(async () => {
    for (const s of [workerSide, cancelSide, cancelSideB]) {
      await s?.prisma.$disconnect();
      await s?.pool.end();
    }
    await prisma?.$disconnect();
    await pool?.end();
    await desechable?.drop();
  }, 60_000);

  beforeEach(() => {
    queued = [];
    resumed = [];
    erased = [];
    onErase = async () => undefined;
    lines = [];
    doors = [];
    running = [];
    const keep = (m: unknown) => void lines.push(String(m));
    vi.spyOn(Logger.prototype, "log").mockImplementation(keep);
    vi.spyOn(Logger.prototype, "warn").mockImplementation(keep);
  });
  afterEach(async () => {
    // Whatever a failing assertion left behind a door is let through, so one
    // red test does not hold a row and turn the next ones red with it.
    for (const door of doors) door.open();
    await Promise.all(running);
    vi.restoreAllMocks();
  });

  // ── The job is already queued ─────────────────────────────────────────────

  it("is effective with the job already queued: it fires, finds nothing and steps aside", async () => {
    const id = await account();
    const belongings = await withBelongings(id);
    const before = await belongings();

    await usersOn(prisma).requestDelete(id, { password: PASSWORD });
    expect(queued).toHaveLength(1);
    expect((await stateOf(id)).requested).not.toBeNull();
    expect((await stateOf(id)).mirror).not.toBeNull();

    expect(await usersOn(prisma).cancelDeleteRequest(id)).toEqual({
      ok: true,
      cancelled: true,
    });
    // Both columns, not one. The mirror travels in the data export.
    expect(await stateOf(id)).toEqual({
      exists: true,
      requested: null,
      mirror: null,
    });

    await fire(queued[0]!);

    expect((await stateOf(id)).exists).toBe(true);
    expect(erased).toEqual([]);
    expect(await belongings()).toEqual(before);
    expect(lines.join("\n")).toContain("cancelled deletion");
  });

  it("control: without the cancellation that same job DOES delete, once it is due", async () => {
    // Otherwise every «nothing happened» above could be a worker that never
    // does anything.
    const id = await account();
    await withBelongings(id);
    await usersOn(prisma).requestDelete(id, { password: PASSWORD });
    await requestedAt(id, new Date(Date.now() - 31 * DAY));

    await fire(queued[0]!);

    expect((await stateOf(id)).exists).toBe(false);
    expect(erased).toHaveLength(1);
  });

  // ── Asking again ──────────────────────────────────────────────────────────

  it("asking again after cancelling restarts the thirty days, and the OLD job does not delete", async () => {
    const id = await account();
    const users = usersOn(prisma);

    await users.requestDelete(id, { password: PASSWORD });
    await users.cancelDeleteRequest(id);
    const again = await users.requestDelete(id, { password: PASSWORD });

    // A second job was queued, for a second request — the first one was not
    // reused, and nothing deduplicated it away.
    expect(queued).toHaveLength(2);
    const [old, current] = queued as [
      AccountDeletionJobPayload,
      AccountDeletionJobPayload,
    ];
    expect(Date.parse(current.requestedAt)).toBeGreaterThanOrEqual(
      Date.parse(old.requestedAt),
    );
    const stored = (await stateOf(id)).requested as Date;
    expect(stored.toISOString()).toBe(current.requestedAt);
    expect(again.deleteAt).toEqual(accountDeletionDueAt(stored));

    // Day 30 of the OLD request, two days into the new one's last stretch: the
    // first job comes due while the second request is 28 days old.
    await requestedAt(id, new Date(Date.now() - 28 * DAY));
    await fire(old);
    expect((await stateOf(id)).exists).toBe(true);
    expect(lines.join("\n")).toContain("cooldown not elapsed");

    // And the new one is honoured when its own thirty days are up.
    await requestedAt(id, new Date(Date.now() - 30 * DAY - 1_000));
    await fire(current);
    expect((await stateOf(id)).exists).toBe(false);
  });

  // ── Too late, nothing to do, somebody else's ──────────────────────────────

  it("refuses once the thirty days have run out, and the request stands", async () => {
    const id = await account();
    const at = await dueIn(id, -1);

    await expect(usersOn(prisma).cancelDeleteRequest(id)).rejects.toMatchObject(
      {
        status: 409,
        response: { code: "ACCOUNT_DELETION_WINDOW_CLOSED" },
      },
    );
    expect(await stateOf(id)).toEqual({
      exists: true,
      requested: at,
      mirror: at,
    });
  });

  it("with nothing pending it answers success without writing, and leaves the others alone", async () => {
    const [quiet, pending] = [await account(), await account()];
    const at = await dueIn(pending, 10 * DAY);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: quiet },
    });

    expect(await usersOn(prisma).cancelDeleteRequest(quiet)).toEqual({
      ok: true,
      cancelled: false,
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: quiet } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect((await stateOf(pending)).requested).toEqual(at);

    // And cancelling one account does not cancel another.
    const other = await account();
    await dueIn(other, 10 * DAY);
    await usersOn(prisma).cancelDeleteRequest(other);
    expect((await stateOf(pending)).requested).toEqual(at);
    expect((await stateOf(pending)).mirror).toEqual(at);
  });

  // ── What the pending request closes, and cancelling reopens ───────────────

  it("gives back what the pending request had closed: the avatar and the export", async () => {
    const id = await account();
    const users = usersOn(prisma);
    const image = {
      buffer: Buffer.from("png"),
      originalname: "me.png",
      mimetype: "image/png",
      size: 1024,
    } as Express.Multer.File;

    await users.requestDelete(id, { password: PASSWORD });
    for (const blocked of [
      users.uploadAvatar(id, image),
      users.requestDataExport(id),
    ]) {
      await expect(blocked).rejects.toMatchObject({
        status: 409,
        response: { code: "ACCOUNT_DELETION_PENDING" },
      });
    }

    await users.cancelDeleteRequest(id);

    expect((await users.uploadAvatar(id, image)).avatarUrl).toContain(id);
    expect((await users.requestDataExport(id)).ok).toBe(true);
    expect(
      await prisma.dataExportRequest.count({ where: { userId: id } }),
    ).toBe(1);
  });

  it("gives back the export the worker skipped meanwhile, and only that one", async () => {
    // «Download my data, delete my account», in that order. The export is still
    // unprocessed when the deletion is asked for, so the worker skips it: its
    // job is spent, its row stays PENDING, and that row refuses a new one for
    // thirty days. Reproduced against the two real processes before this.
    const id = await account();
    const stranger = await account();
    const users = usersOn(prisma);
    await users.requestDataExport(id);
    await users.requestDataExport(stranger);
    const asked = await prisma.dataExportRequest.findFirstOrThrow({
      where: { userId: id },
    });
    // Neither of these is waiting for anything: one is finished, and the other
    // is old enough not to refuse a new request.
    await prisma.dataExportRequest.create({
      data: {
        userId: id,
        status: "READY",
        fileUrl: `data-exports/${id}/ready.json`,
        expectedAt: new Date(),
        createdAt: new Date(Date.now() - 2 * DAY),
      },
    });
    await prisma.dataExportRequest.create({
      data: {
        userId: id,
        status: "PENDING",
        expectedAt: new Date(),
        createdAt: new Date(Date.now() - 40 * DAY),
      },
    });

    await users.requestDelete(id, { password: PASSWORD });
    await new DataExportProcessor(
      prisma as never,
      storage as never,
      {} as never,
      {} as never,
    ).process({
      name: JobName.RUN_DATA_EXPORT,
      data: { requestId: asked.id, userId: id },
      attemptsMade: 0,
      opts: {},
    } as never);
    expect(lines.join("\n")).toContain("Skipping export");
    expect(
      (
        await prisma.dataExportRequest.findUniqueOrThrow({
          where: { id: asked.id },
        })
      ).status,
    ).toBe("PENDING");

    await users.cancelDeleteRequest(id);

    expect(resumed).toEqual([{ requestId: asked.id, userId: id }]);
  });

  // ── The race, in both orders ──────────────────────────────────────────────

  describe("against the worker, at the instant both could act", () => {
    it("the CANCELLATION takes the row first: the worker waits, and mutates nothing", async () => {
      const id = await account();
      const belongings = await withBelongings(id);
      const before = await belongings();
      const gate = makeGate();

      const at = await dueIn(id, DUE_SOON);
      // Held with both writes done and not committed.
      const cancelling = start(
        usersOn(
          holding(cancelSide.prisma, "before-commit", gate),
        ).cancelDeleteRequest(id),
      );
      await arrives(gate, cancelling, "the cancellation");

      // The thirty days run out. To anybody else the request is still there.
      await sleep(accountDeletionDueAt(at).getTime() - Date.now() + 25);
      const working = start(
        fire({ userId: id, requestedAt: at.toISOString() }),
      );

      expect(
        await blockedBy(WORKER),
        "the worker should be waiting on the cancellation",
      ).toContain(await pidOf(CANCELLER));

      gate.open();
      expect(await cancelling).toEqual({ ok: true, cancelled: true });
      await working;

      expect(await stateOf(id)).toEqual({
        exists: true,
        requested: null,
        mirror: null,
      });
      expect(erased).toEqual([]);
      expect(await belongings()).toEqual(before);
      expect(lines.join("\n")).toContain(
        "NOT deleted — the request was cancelled before the decision point",
      );
    }, 60_000);

    it("the WORKER takes the row first and deletes: the cancellation waits, and does not say it worked", async () => {
      const id = await account();
      await withBelongings(id);
      const read = makeGate();
      const erasing = makeGate();
      onErase = async () => {
        erasing.reach();
        await erasing.released;
      };

      const at = await dueIn(id, DUE_SOON);
      // It has found the request open, and has asked for nothing yet.
      const cancelling = start(
        usersOn(holding(cancelSide.prisma, "before-lock", read))
          .cancelDeleteRequest(id)
          .then(
            (ok) => ({ ok }),
            (err: { status?: number; response?: unknown }) => ({ err }),
          ),
      );
      await arrives(read, cancelling, "the cancellation");

      await sleep(accountDeletionDueAt(at).getTime() - Date.now() + 25);
      const working = start(
        fire({ userId: id, requestedAt: at.toISOString() }),
      );
      // The worker HOLDS the account from here, and is erasing.
      await arrives(erasing, working, "the worker");

      read.open();
      expect(
        await blockedBy(CANCELLER),
        "the cancellation should be waiting on the worker",
      ).toContain(await pidOf(WORKER));

      erasing.open();
      await working;
      const outcome = await cancelling;

      expect(outcome).toMatchObject({
        err: { status: 410, response: { code: "ACCOUNT_ALREADY_DELETED" } },
      });
      expect((await stateOf(id)).exists).toBe(false);
      expect(erased).toHaveLength(1);
    }, 60_000);

    it("the worker takes it first and FAILS half way: still not cancelled, and its retry finishes", async () => {
      // The worst place to answer «ok». The object is already gone from R2,
      // which does not roll back; the rows are, so the account is still there.
      // Judged by the clock it read before waiting, this would be accepted.
      const id = await account();
      await withBelongings(id);
      const read = makeGate();
      const erasing = makeGate();
      onErase = async () => {
        erasing.reach();
        await erasing.released;
        throw new Error("R2 unavailable");
      };

      const at = await dueIn(id, DUE_SOON);
      const cancelling = start(
        usersOn(holding(cancelSide.prisma, "before-lock", read))
          .cancelDeleteRequest(id)
          .then(
            (ok) => ({ ok }),
            (err: { status?: number; response?: unknown }) => ({ err }),
          ),
      );
      await arrives(read, cancelling, "the cancellation");

      await sleep(accountDeletionDueAt(at).getTime() - Date.now() + 25);
      const working = start(
        fire({ userId: id, requestedAt: at.toISOString() }).then(
          () => "finished",
          (e: Error) => e.message,
        ),
      );
      await arrives(erasing, working, "the worker");

      read.open();
      expect(await blockedBy(CANCELLER)).toContain(await pidOf(WORKER));
      erasing.open();

      expect(await working).toBe("R2 unavailable");
      expect(await cancelling).toMatchObject({
        err: {
          status: 409,
          response: { code: "ACCOUNT_DELETION_WINDOW_CLOSED" },
        },
      });
      expect(await stateOf(id)).toEqual({
        exists: true,
        requested: at,
        mirror: at,
      });

      onErase = async () => undefined;
      await fire({ userId: id, requestedAt: at.toISOString() });
      expect((await stateOf(id)).exists).toBe(false);
    }, 60_000);

    it("a LATE caller is refused at once, without queueing behind the deletion", async () => {
      const id = await account();
      await withBelongings(id);
      const erasing = makeGate();
      onErase = async () => {
        erasing.reach();
        await erasing.released;
      };
      const at = await dueIn(id, -1_000);
      const working = start(
        fire({ userId: id, requestedAt: at.toISOString() }),
      );
      await arrives(erasing, working, "the worker");

      const answer = await Promise.race([
        start(
          usersOn(cancelSide.prisma)
            .cancelDeleteRequest(id)
            .then(
              () => "cancelled",
              (e: { response?: { code?: string } }) => e.response?.code,
            ),
        ),
        sleep(3_000).then(() => "still waiting behind the worker"),
      ]);

      erasing.open();
      await working;
      expect(answer).toBe("ACCOUNT_DELETION_WINDOW_CLOSED");
      expect((await stateOf(id)).exists).toBe(false);
    }, 60_000);

    it("two cancellations at once: one undoes it, the other finds nothing left to undo", async () => {
      const id = await account();
      await dueIn(id, 10 * DAY);
      const gate = makeGate();

      const first = start(
        usersOn(
          holding(cancelSide.prisma, "before-commit", gate),
        ).cancelDeleteRequest(id),
      );
      await arrives(gate, first, "the first cancellation");
      const second = start(usersOn(cancelSideB.prisma).cancelDeleteRequest(id));
      expect(await blockedBy(CANCELLER_B)).toContain(await pidOf(CANCELLER));
      gate.open();

      expect(await first).toEqual({ ok: true, cancelled: true });
      expect(await second).toEqual({ ok: true, cancelled: false });
    }, 60_000);
  });

  // ── Over HTTP, end to end ─────────────────────────────────────────────────

  describe("over HTTP", () => {
    let h: E2EHarness;

    beforeAll(async () => {
      h = await createE2EApp({ prisma });
    }, 60_000);
    afterAll(async () => {
      if (h) await closeE2EApp(h);
    }, 60_000);

    const bearer = async (id: string) => {
      const u = await prisma.user.findUniqueOrThrow({ where: { id } });
      const token = h.app
        .get(JwtService)
        .sign({ sub: u.id, email: u.email, ar: u.authRevision });
      return { Authorization: `Bearer ${token}` };
    };

    it("asks, sees the day it will happen, cancels, and sees no day at all", async () => {
      // BullMQ cannot run on the harness's in-memory Redis (its Lua needs
      // `cmsgpack`), so what reaches the queue is observed, not executed.
      const enqueue = vi
        .spyOn(h.app.get(JobsService), "enqueueAccountDeletion")
        .mockResolvedValue(undefined);
      const id = await account();
      const auth = await bearer(id);
      const http = () => request(h.app.getHttpServer());
      const privacy = async () =>
        (await http().get("/api/user/me").set(auth).expect(200)).body
          .privacy as Record<string, string | null>;

      expect((await privacy()).accountDeleteScheduledFor).toBeNull();

      const asked = await http()
        .post("/api/user/delete-request")
        .set(auth)
        .send({ password: PASSWORD })
        .expect(202);
      expect(enqueue).toHaveBeenCalledTimes(1);

      const pending = await privacy();
      expect(pending.accountDeleteScheduledFor).toBe(asked.body.deleteAt);
      // Thirty days apart on the wire, which is what the screens got wrong.
      expect(
        Date.parse(pending.accountDeleteScheduledFor as string) -
          Date.parse(pending.accountDeleteRequested as string),
      ).toBe(30 * DAY);

      const cancelled = await http()
        .post("/api/user/delete-request/cancel")
        .set(auth)
        .expect(200);
      expect(cancelled.body).toEqual({ ok: true, cancelled: true });

      const after = await privacy();
      expect(after.accountDeleteRequested).toBeNull();
      expect(after.accountDeleteScheduledFor).toBeNull();

      const repeated = await http()
        .post("/api/user/delete-request/cancel")
        .set(auth)
        .expect(200);
      expect(repeated.body).toEqual({ ok: true, cancelled: false });
    });

    it("past the deadline answers 409 with its code, and the account is still scheduled", async () => {
      const id = await account();
      const at = await dueIn(id, -60_000);
      const res = await request(h.app.getHttpServer())
        .post("/api/user/delete-request/cancel")
        .set(await bearer(id))
        .expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        code: "ACCOUNT_DELETION_WINDOW_CLOSED",
        message: "Ya pasó el plazo para cancelar la eliminación.",
      });
      expect((await stateOf(id)).requested).toEqual(at);
    });
  });
});
