import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CircleActivityRepository } from "./circle-activity.repository";
import { CircleEventRepository } from "./circle-event.repository";
import { CircleParticipantRepository } from "./circle-participant.repository";
import { CirclesAccountDeletionService } from "./circles-account-deletion.service";
import { CircleMemberRepository } from "./circle-member.repository";
import { CircleInvitationRepository } from "./circle-invitation.repository";
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { CircleArtifactRepository } from "./circle-artifact.repository";
import { CirclesParticipationService } from "./circles-participation.service";
import { CirclesService } from "./circles.service";
import { CirclesRolloutService } from "./circles-rollout.service";
import { resolveCirclesRolloutConfig } from "./circles-rollout";
import { CirclesCipher } from "./circles-crypto";
import { CirclesSweepService } from "./circles-sweep.service";
import { CircleTemplateRegistry } from "@psico/types";
import { PUBLISHED_DUO_TEMPLATE } from "./circles.fixtures";
import { mintInvitationToken } from "./circles-secrets";

/**
 * Account deletion with Círculos, against REAL PostgreSQL.
 *
 * The whole design is a database behaviour: three foreign keys detach instead
 * of blocking, and one trigger admits exactly one transition. None of that can
 * be tested against a mock — what is under test IS the database's refusal, and
 * its single, narrow acceptance.
 *
 * Two databases, because they answer different questions:
 *
 *   · `deletion_db`   — the whole chain from scratch, which is what a fresh
 *                       environment does.
 *   · `deletion_base` — the 64 migrations that were on `main`, asserted to
 *                       still REJECT the deletion, and then this migration
 *                       replayed on top and asserted to allow it. That is the
 *                       upgrade production would experience, and it is the only
 *                       version of the test that proves the migration is what
 *                       changed the outcome.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

const API_DIR = process.cwd();
const MIGRATIONS_DIR = join(API_DIR, "prisma", "migrations");
const THIS_MIGRATION = "20260913000000_circles_account_deletion";

/**
 * ── The harness owns only what it created ─────────────────────────────────
 *
 * The first version used fixed names and opened with
 * `DROP DATABASE IF EXISTS ... WITH (FORCE)`. Two problems, and the second is
 * the serious one:
 *
 *   · two runs at once (a watch window and CI, or two shards) fought over the
 *     same two names and destroyed each other's databases mid-test;
 *   · `DROP` before `CREATE` is how a harness takes a name that was NOT its
 *     own. If somebody's real database happened to be called
 *     `circles_deletion_db`, the suite deleted it to make room.
 *
 * So: unique names per run, created and never seized, recorded as they are
 * created, and dropped at the end BY THAT RECORD rather than by pattern.
 */
const RUN = randomBytes(6).toString("hex");
const DB = `circles_del_${RUN}`;
const BASE_DB = `circles_del_base_${RUN}`;

/** Databases this run actually created. Nothing else is ever dropped. */
const created: string[] = [];

/** `a-z0-9_`, starting with a letter, bounded — PostgreSQL's identifier limit. */
const SAFE_IDENT = /^[a-z][a-z0-9_]{0,62}$/;

function quoteIdent(name: string): string {
  if (!SAFE_IDENT.test(name)) {
    throw new Error(`refusing to use unsafe database identifier: ${name}`);
  }
  return `"${name}"`;
}

/**
 * Refuse a destination that does not look like a throwaway test server.
 *
 * This suite creates and drops databases. Pointed at a developer's own
 * database — or anything not on loopback — that is not a test run, it is an
 * incident, so the shape of the target is checked before the first statement.
 */
function assertDestructionAllowed(url: string): void {
  const u = new URL(url);
  const host = u.hostname;
  const localhost =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!localhost) {
    throw new Error(
      `refusing destructive test setup against a non-local host: ${host}`,
    );
  }
  const db = u.pathname.replace(/^\//, "");
  if (!/test|locks|ci|tmp/i.test(db)) {
    throw new Error(
      `refusing destructive test setup against a database that does not look ` +
        `like a test target: ${db}`,
    );
  }
}

async function createDatabase(admin: Pool, name: string): Promise<void> {
  // CREATE, never DROP-then-CREATE: a name already in use belongs to somebody
  // else and the run fails rather than taking it.
  await admin.query(`CREATE DATABASE ${quoteIdent(name)} TEMPLATE template0`);
  created.push(name);
}

async function dropCreatedDatabases(connectionString: string): Promise<void> {
  if (created.length === 0) return;
  const admin = new Pool({ connectionString });
  try {
    for (const name of created.splice(0)) {
      await admin.query(
        `DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`,
      );
    }
  } finally {
    await admin.end();
  }
}

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const pgTs = (d: Date) => d.toISOString().replace("Z", "");
const future = (ms = 3_600_000) => new Date(Date.now() + ms);
const fakeHash = (n: number) => String(n).padStart(64, "a");
const HMAC_HEX = "0".repeat(64);

/**
 * Fresh identities per test, assigned in `beforeEach`.
 *
 * Not constants, and not cleaned up between tests either: `CircleEvent` is
 * append-only, so a suite that reused one user would accumulate their seats and
 * every count assertion would be reading the previous test's leftovers. New
 * subjects each time is the only isolation this table permits.
 */
let GONE = "";
let STAYS = "";
let STRANGER = "";

/**
 * The harness guards, tested without a database.
 *
 * These run unconditionally — they are the part that protects somebody's real
 * data, so they must not be skippable by forgetting an environment variable.
 */
describe("the PostgreSQL harness owns only what it created", () => {
  it("refuses an identifier it did not generate", () => {
    for (const bad of [
      'x"; DROP DATABASE postgres; --',
      "Circles_Deletion",
      "1circles",
      "circles-deletion",
      "",
      `c${"x".repeat(70)}`,
    ]) {
      expect(() => quoteIdent(bad), bad).toThrow(/unsafe database identifier/);
    }
    expect(quoteIdent(`circles_del_${"ab12cd".slice(0, 6)}`)).toBe(
      '"circles_del_ab12cd"',
    );
  });

  it("refuses a destructive run against a non-local host", () => {
    expect(() =>
      assertDestructionAllowed("postgresql://u:p@db.production.example/psico"),
    ).toThrow(/non-local host/);
  });

  it("refuses a destructive run against a database that is not a test target", () => {
    expect(() =>
      assertDestructionAllowed("postgresql://u:p@localhost:5432/psico_dev"),
    ).toThrow(/does not look like a test target/);
    // The names CI and the runbook actually use are accepted.
    expect(() =>
      assertDestructionAllowed("postgresql://u:p@localhost:5432/psico_locks"),
    ).not.toThrow();
  });

  it("names its databases per run, so two runs cannot collide", () => {
    // `RUN` is random per process. Two shards get different names and neither
    // can drop the other's, because the drop list is what THIS process created.
    expect(DB).toMatch(/^circles_del_[0-9a-f]{12}$/);
    expect(BASE_DB).toMatch(/^circles_del_base_[0-9a-f]{12}$/);
    expect(DB).not.toBe(BASE_DB);
  });
});

/** An events repository whose append always fails, for the resume cases. */
const BROKEN_EVENTS = {
  append: async () => {
    throw new Error("ledger unavailable");
  },
} as never;

/**
 * The service with real repositories. One place for the argument list, so a new
 * dependency does not mean editing every construction in this file.
 */
function buildService(
  prisma: PrismaClient,
  events: unknown = null,
): CirclesAccountDeletionService {
  return new CirclesAccountDeletionService(
    new CircleParticipantRepository(prisma as never),
    new CircleActivityRepository(prisma as never),
    (events ?? new CircleEventRepository(prisma as never)) as never,
    new CircleMemberRepository(prisma as never),
    new CircleInvitationRepository(prisma as never),
    new CircleGuestSessionRepository(prisma as never),
  );
}

suite("circles · account deletion (real PostgreSQL)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let service: CirclesAccountDeletionService;

  let seq = 0;
  const uid = (p: string) => `${p}-${++seq}`;

  /**
   * The detach, run the way the job runs it: inside ONE transaction the caller
   * owns. The service opens none of its own any more — that is the whole point
   * of the authority fix, so the tests must not open them either.
   */
  const detach = (userId: string, svc?: CirclesAccountDeletionService) =>
    prisma.$transaction(
      (tx) => (svc ?? service).detachUser(userId, tx as never),
      { timeout: 60_000 },
    );

  const insertUser = (id: string) =>
    pool.query(
      `INSERT INTO "User" ("id","email","name","passwordHash","updatedAt")
       VALUES ($1,$2,$3,'x',now()) ON CONFLICT DO NOTHING`,
      [id, `${id}@example.test`, id],
    );

  /** A circle with one member per user id given. Returns ids. */
  const makeCircle = async (creator: string, others: string[] = []) => {
    const circleId = uid("c");
    await pool.query(
      `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
       VALUES ($1,'DUO','ACTIVE',$2,2,now())`,
      [circleId, creator],
    );
    const members: Record<string, string> = {};
    for (const [i, u] of [creator, ...others].entries()) {
      const memberId = uid("m");
      await pool.query(
        `INSERT INTO "CircleMember" ("id","circleId","userId","role","status","joinedAt")
         VALUES ($1,$2,$3,$4::"CircleMemberRole",'ACTIVE',now())`,
        [memberId, circleId, u, i === 0 ? "ORGANIZER" : "MEMBER"],
      );
      members[u] = memberId;
    }
    return { circleId, members };
  };

  const makeActivity = async (circleId: string, status = "INVITING") => {
    const activityId = uid("act");
    // `CircleActivity_revealed_has_timestamp` (and its siblings for CANCELLED
    // and CLOSED) mean a stage is not just an enum value — the fixture has to
    // be a state the domain can actually be in.
    await pool.query(
      `INSERT INTO "CircleActivity"
         ("id","circleId","templateKey","templateVersion","status",
          "requiredParticipants","revealedAt","updatedAt")
       VALUES ($1,$2,'fixture-duo-template',1,$3::"CircleActivityStatus",2,$4,now())`,
      [
        activityId,
        circleId,
        status,
        status === "REVEALED" || status === "FOLLOW_UP"
          ? pgTs(new Date())
          : null,
      ],
    );
    return activityId;
  };

  const makeInvitation = async (
    circleId: string,
    activityId: string,
    memberId: string,
  ) => {
    const id = uid("inv");
    await pool.query(
      `INSERT INTO "CircleInvitation"
         ("id","circleId","activityId","createdByMemberId","tokenHash","expiresAt","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        circleId,
        activityId,
        memberId,
        fakeHash(++seq),
        pgTs(future()),
        pgTs(new Date()),
      ],
    );
    return id;
  };

  const makeSeat = async (cols: {
    circleId: string;
    activityId: string;
    memberId?: string | null;
    invitationId?: string | null;
    status?: string;
    withEnvelope?: boolean;
  }) => {
    const id = uid("seat");
    const env = cols.withEnvelope === true;
    await pool.query(
      `INSERT INTO "CircleActivityParticipant"
         ("id","circleId","activityId","memberId","invitationId","status",
          "ciphertext","nonce","keyVersion","payloadHash","readyAt","fieldKeys",
          "sharingMode","withdrawnAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6::"CircleParticipantStatus",
               $7,$8,$9,$10,$11,$12,$13::"CircleSharingMode",$14,now())`,
      [
        id,
        cols.circleId,
        cols.activityId,
        cols.memberId ?? null,
        cols.invitationId ?? null,
        cols.status ?? "INVITED",
        env ? "CIPHERTEXT-PAYLOAD" : null,
        env ? "nonce-value" : null,
        env ? 1 : null,
        env ? HMAC_HEX : null,
        env ? pgTs(new Date()) : null,
        env ? ["a"] : [],
        env ? "SELECTED_FIELDS" : null,
        // `CircleActivityParticipant_withdrawn_has_timestamp`: a WITHDRAWN seat
        // without a `withdrawnAt` is not a state the domain can be in.
        cols.status === "WITHDRAWN" ? pgTs(new Date()) : null,
      ],
    );
    return id;
  };

  const makeGuestSession = async (
    invitationId: string,
    activityId: string,
    participantId: string,
  ) => {
    const id = uid("gs");
    await pool.query(
      `INSERT INTO "CircleGuestSession"
         ("id","invitationId","activityId","participantId","tokenHash","expiresAt","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        invitationId,
        activityId,
        participantId,
        fakeHash(++seq),
        pgTs(future()),
        pgTs(new Date()),
      ],
    );
    return id;
  };

  /** An event naming the user as actor — the row that used to block deletion. */
  const makeUserEvent = async (circleId: string, userId: string) => {
    const id = uid("ev");
    await pool.query(
      `INSERT INTO "CircleEvent" ("id","circleId","type","actorUserId","occurredAt")
       VALUES ($1,$2,'CIRCLE_CREATED'::"CircleEventType",$3,now())`,
      [id, circleId, userId],
    );
    return id;
  };

  const deleteUser = (id: string) =>
    pool.query(`DELETE FROM "User" WHERE "id" = $1`, [id]);

  const refusalOf = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return { code: e.code ?? "", message: e.message ?? "" };
    }
    throw new Error("expected PostgreSQL to refuse the statement");
  };

  beforeAll(async () => {
    assertDestructionAllowed(base as string);
    const admin = new Pool({ connectionString: base });
    try {
      await createDatabase(admin, DB);
    } finally {
      await admin.end();
    }

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "pipe",
    });

    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    service = buildService(prisma);
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    await dropCreatedDatabases(base as string);
  });

  beforeEach(async () => {
    GONE = uid("u-gone");
    STAYS = uid("u-stays");
    STRANGER = uid("u-stranger");
    for (const u of [GONE, STAYS, STRANGER]) await insertUser(u);
  });

  // ── 1 · the plain case ────────────────────────────────────────────────────

  it("1 · deletes a user who never touched Círculos", async () => {
    const summary = await detach(GONE);
    expect(summary.memberships).toBe(0);
    expect(summary.seatsWithdrawn).toBe(0);
    await deleteUser(GONE);
    const { rows } = await pool.query(`SELECT 1 FROM "User" WHERE "id" = $1`, [
      GONE,
    ]);
    expect(rows).toHaveLength(0);
  });

  // ── 2 · a pending invitation ──────────────────────────────────────────────

  it("2 · a pending invitation stops authorising and the activity ends", async () => {
    const { circleId, members } = await makeCircle(GONE, [STAYS]);
    const activityId = await makeActivity(circleId, "INVITING");
    const invitationId = await makeInvitation(
      circleId,
      activityId,
      members[GONE]!,
    );
    await makeSeat({
      circleId,
      activityId,
      memberId: members[GONE]!,
      status: "ACCEPTED",
    });
    const guestSeat = await makeSeat({
      circleId,
      activityId,
      invitationId,
      status: "INVITED",
    });
    const sessionId = await makeGuestSession(
      invitationId,
      activityId,
      guestSeat,
    );
    await makeUserEvent(circleId, GONE);

    const summary = await detach(GONE);
    expect(summary.activitiesCancelled).toBe(1);
    expect(summary.invitationsRevoked).toBe(1);
    expect(summary.guestSessionsRevoked).toBe(1);

    await deleteUser(GONE);

    const activity = await pool.query(
      `SELECT "status" FROM "CircleActivity" WHERE "id" = $1`,
      [activityId],
    );
    expect(activity.rows[0].status).toBe("CANCELLED");

    const inv = await pool.query(
      `SELECT "revokedAt" FROM "CircleInvitation" WHERE "id" = $1`,
      [invitationId],
    );
    expect(inv.rows[0].revokedAt).not.toBeNull();

    const gs = await pool.query(
      `SELECT "revokedAt" FROM "CircleGuestSession" WHERE "id" = $1`,
      [sessionId],
    );
    expect(gs.rows[0].revokedAt).not.toBeNull();
  });

  // ── 3 · content confirmed, not yet revealed ───────────────────────────────

  it("3 · a snapshot confirmed before the reveal is destroyed on BOTH sides", async () => {
    const { circleId, members } = await makeCircle(GONE, [STAYS]);
    const activityId = await makeActivity(circleId, "PREPARING");
    const mine = await makeSeat({
      circleId,
      activityId,
      memberId: members[GONE]!,
      status: "READY",
      withEnvelope: true,
    });
    const theirs = await makeSeat({
      circleId,
      activityId,
      memberId: members[STAYS]!,
      status: "READY",
      withEnvelope: true,
    });

    await detach(GONE);
    await deleteUser(GONE);

    // Neither envelope survives: the counterpart confirmed for a conversation
    // that is not going to happen, which is the withdrawal rule, not a new one.
    const seats = await pool.query(
      `SELECT "id","status","ciphertext","nonce","payloadHash","readyAt"
         FROM "CircleActivityParticipant" WHERE "id" = ANY($1)`,
      [[mine, theirs]],
    );
    for (const row of seats.rows) {
      expect(row.ciphertext, row.id).toBeNull();
      expect(row.nonce, row.id).toBeNull();
      expect(row.payloadHash, row.id).toBeNull();
      expect(row.readyAt, row.id).toBeNull();
    }
    const activity = await pool.query(
      `SELECT "status" FROM "CircleActivity" WHERE "id" = $1`,
      [activityId],
    );
    expect(activity.rows[0].status).toBe("CANCELLED");
  });

  // ── 4 · already revealed, with an artifact ────────────────────────────────

  it("4 · a revealed activity closes; the deleted person's envelope goes, the artifact is LEFT AS IS", async () => {
    const { circleId, members } = await makeCircle(GONE, [STAYS]);
    const activityId = await makeActivity(circleId, "REVEALED");
    const mine = await makeSeat({
      circleId,
      activityId,
      memberId: members[GONE]!,
      status: "READY",
      withEnvelope: true,
    });
    const theirs = await makeSeat({
      circleId,
      activityId,
      memberId: members[STAYS]!,
      status: "READY",
      withEnvelope: true,
    });
    const artifactId = uid("art");
    await pool.query(
      `INSERT INTO "CircleArtifact"
         ("id","activityId","createdByParticipantId","status","version","kind",
          "ciphertext","nonce","keyVersion","payloadHash","updatedAt")
       VALUES ($1,$2,$3,'PROPOSED'::"CircleArtifactStatus",1,
               'AGREEMENT'::"CircleArtifactKind",'CT','N',1,$4,now())`,
      [artifactId, activityId, theirs, HMAC_HEX],
    );

    await detach(GONE);
    await deleteUser(GONE);

    const activity = await pool.query(
      `SELECT "status" FROM "CircleActivity" WHERE "id" = $1`,
      [activityId],
    );
    expect(activity.rows[0].status).toBe("CLOSED");

    // The deleted person keeps nothing.
    const gone = await pool.query(
      `SELECT "ciphertext","status" FROM "CircleActivityParticipant" WHERE "id" = $1`,
      [mine],
    );
    expect(gone.rows[0].ciphertext).toBeNull();
    expect(gone.rows[0].status).toBe("WITHDRAWN");

    // A reveal that already happened is not undone: the counterpart's own
    // snapshot and the shared artifact are theirs, and nothing here pretends
    // they can un-see what they read.
    const kept = await pool.query(
      `SELECT "ciphertext" FROM "CircleActivityParticipant" WHERE "id" = $1`,
      [theirs],
    );
    expect(kept.rows[0].ciphertext).not.toBeNull();
    const art = await pool.query(
      `SELECT 1 FROM "CircleArtifact" WHERE "id" = $1`,
      [artifactId],
    );
    expect(art.rows).toHaveLength(1);
  });

  // ── Races, driven by the REAL commands ───────────────────────────────────
  //
  // The earlier version of this suite raced the deletion against a hand-written
  // `UPDATE`, which proves nothing about the service: a manual statement takes
  // whatever locks the author chose, in whatever order they chose. These drive
  // `createDuo` and the guest surface through the actual services, on their own
  // connections, and then read the WHOLE persisted result — not merely "no
  // deadlock happened".

  describe("races against the real services", () => {
    const KEY = randomBytes(32).toString("base64");
    let participation: CirclesParticipationService;
    let access: CirclesService;

    const buildParticipation = (mode = "on") =>
      new CirclesParticipationService(
        prisma as never,
        new CircleActivityRepository(prisma as never),
        new CircleParticipantRepository(prisma as never),
        new CircleArtifactRepository(prisma as never),
        new CircleEventRepository(prisma as never),
        new CircleMemberRepository(prisma as never),
        new CircleGuestSessionRepository(prisma as never),
        new CircleInvitationRepository(prisma as never),
        new CirclesRolloutService(
          resolveCirclesRolloutConfig({ CIRCLES_ROLLOUT_MODE: mode }),
        ),
        new CirclesCipher(Buffer.from(KEY, "base64")),
        new CircleTemplateRegistry([PUBLISHED_DUO_TEMPLATE]),
      );

    const buildAccess = (mode = "on") =>
      new CirclesService(
        prisma as never,
        new CircleInvitationRepository(prisma as never),
        new CircleGuestSessionRepository(prisma as never),
        new CircleEventRepository(prisma as never),
        new CircleMemberRepository(prisma as never),
        new CirclesRolloutService(
          resolveCirclesRolloutConfig({ CIRCLES_ROLLOUT_MODE: mode }),
        ),
        new CircleActivityRepository(prisma as never),
      );

    beforeEach(() => {
      participation = buildParticipation();
      access = buildAccess();
    });

    /**
     * A real guest, produced the way a real guest is: create the Dúo, then
     * exchange the invitation token for a session. No hand-built rows.
     */
    const inviteAndAccept = async (userId: string) => {
      const token = mintInvitationToken();
      const created = await participation.createDuo({
        userId,
        templateKey: PUBLISHED_DUO_TEMPLATE.templateKey,
        templateVersion: PUBLISHED_DUO_TEMPLATE.templateVersion,
        invitationToken: token.raw,
        idempotencyKey: `idem-${uid("k")}`,
      });
      const session = await access.exchange(token.raw);
      const seat = await pool.query(
        `SELECT gs."participantId" FROM "CircleGuestSession" gs WHERE gs."id" = $1`,
        [session.guestSessionId],
      );
      const guest = {
        kind: "GUEST" as const,
        guestSessionId: session.guestSessionId,
        activityId: created.activityId,
        participantId: seat.rows[0].participantId as string,
      };
      return { created, guest };
    };

    /** The guest's real confirmation — the command, not an UPDATE. */
    const guestConfirms = (
      guest: {
        kind: "GUEST";
        guestSessionId: string;
        activityId: string;
        participantId: string;
      },
      activityId: string,
    ) =>
      participation.confirmShare(
        guest,
        activityId,
        {
          mode: "SELECTED_FIELDS",
          fields: [{ fieldKey: "campo-a", value: "texto sintético" }],
        },
        `idem-${uid("k")}`,
      );

    /** The organiser needs a circle to create in, which `createDuo` makes. */
    const createDuoFor = async (userId: string) =>
      participation.createDuo({
        userId,
        templateKey: PUBLISHED_DUO_TEMPLATE.templateKey,
        templateVersion: PUBLISHED_DUO_TEMPLATE.templateVersion,
        invitationToken: mintInvitationToken().raw,
        idempotencyKey: `idem-${uid("k")}`,
      });

    /** The circles this user belongs to, captured BEFORE the deletion detaches them. */
    const circlesOf = async (userId: string): Promise<string[]> => {
      const { rows } = await pool.query(
        `SELECT "circleId" FROM "CircleMember" WHERE "userId" = $1`,
        [userId],
      );
      return rows.map((r: { circleId: string }) => r.circleId);
    };

    /**
     * Everything the deletion is supposed to have touched, read back — SCOPED
     * to this user's circles.
     *
     * Global counts were the first version and they were wrong: the suite
     * shares one database (the ledger is append-only, so rows cannot be cleaned
     * between tests) and every earlier test's activity was being counted too.
     */
    const snapshot = async (userId: string, circleIds: string[]) => {
      const account = await pool.query(`SELECT 1 FROM "User" WHERE "id" = $1`, [
        userId,
      ]);
      const members = await pool.query(
        `SELECT "status","userId" FROM "CircleMember" WHERE "userId" = $1`,
        [userId],
      );
      const detached = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleMember" WHERE "userId" IS NULL`,
      );
      const live = await pool.query(
        `SELECT count(*)::int AS n
           FROM "CircleActivity"
          WHERE "circleId" = ANY($1)
            AND "status" IN ('INVITING','PREPARING','REVEALED','FOLLOW_UP')`,
        [circleIds],
      );
      const openInvitations = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleInvitation"
          WHERE "revokedAt" IS NULL AND "circleId" = ANY($1)`,
        [circleIds],
      );
      const openSessions = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleGuestSession" gs
           JOIN "CircleActivity" a ON a."id" = gs."activityId"
          WHERE gs."revokedAt" IS NULL AND a."circleId" = ANY($1)`,
        [circleIds],
      );
      const envelopes = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleActivityParticipant"
          WHERE "ciphertext" IS NOT NULL AND "circleId" = ANY($1)`,
        [circleIds],
      );
      const events = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent" WHERE "actorUserId" = $1`,
        [userId],
      );
      return {
        accountExists: account.rows.length === 1,
        memberRows: members.rows.length,
        detachedMembers: detached.rows[0].n as number,
        liveActivities: live.rows[0].n as number,
        openInvitations: openInvitations.rows[0].n as number,
        openSessions: openSessions.rows[0].n as number,
        envelopes: envelopes.rows[0].n as number,
        eventsNamingUser: events.rows[0].n as number,
      };
    };

    it("guest command FIRST: the deletion cleans what it produced", async () => {
      const { created, guest } = await inviteAndAccept(GONE);
      const mine = await circlesOf(GONE);

      // The REAL command, through the real service, on the real lock chain.
      await guestConfirms(guest, created.activityId);

      const afterConfirm = await pool.query(
        `SELECT "status","ciphertext" FROM "CircleActivityParticipant"
          WHERE "id" = $1`,
        [guest.participantId],
      );
      expect(afterConfirm.rows[0].status).toBe("READY");
      expect(afterConfirm.rows[0].ciphertext).not.toBeNull();

      await detach(GONE);
      await deleteUser(GONE);

      const after = await snapshot(GONE, mine);
      expect(after.accountExists).toBe(false);
      expect(after.liveActivities).toBe(0);
      expect(after.openInvitations).toBe(0);
      expect(after.openSessions).toBe(0);
      expect(after.envelopes).toBe(0);
      expect(after.eventsNamingUser).toBe(0);

      // The guest's own seat and its envelope went with the cancellation: the
      // conversation it was confirmed for is not going to happen.
      const seat = await pool.query(
        `SELECT "ciphertext","nonce","payloadHash" FROM "CircleActivityParticipant"
          WHERE "id" = $1`,
        [guest.participantId],
      );
      expect(seat.rows[0].ciphertext).toBeNull();
      expect(seat.rows[0].nonce).toBeNull();
      expect(seat.rows[0].payloadHash).toBeNull();
    });

    it("deletion FIRST: the guest command is refused with no new effects", async () => {
      const { created, guest } = await inviteAndAccept(GONE);
      const mine = await circlesOf(GONE);

      await detach(GONE);
      await deleteUser(GONE);

      const before = await snapshot(GONE, mine);
      const seatBefore = await pool.query(
        `SELECT * FROM "CircleActivityParticipant" WHERE "id" = $1`,
        [guest.participantId],
      );
      const eventsBefore = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent" WHERE "activityId" = $1`,
        [created.activityId],
      );

      // The credential was revoked and the activity is terminal, so the real
      // command must refuse — not partially apply.
      await expect(guestConfirms(guest, created.activityId)).rejects.toThrow();

      const after = await snapshot(GONE, mine);
      expect(after).toEqual(before);
      const seatAfter = await pool.query(
        `SELECT * FROM "CircleActivityParticipant" WHERE "id" = $1`,
        [guest.participantId],
      );
      expect(seatAfter.rows[0]).toEqual(seatBefore.rows[0]);
      const eventsAfter = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent" WHERE "activityId" = $1`,
        [created.activityId],
      );
      expect(eventsAfter.rows[0].n).toBe(eventsBefore.rows[0].n);
    });

    it("the deletion waits behind a guest command holding the chain", async () => {
      // Both take the member row first (canonical order). The guest command
      // holds it; the deletion must WAIT rather than deadlock, and the wait is
      // observed in `pg_stat_activity`, not assumed after a sleep.
      const { created, guest } = await inviteAndAccept(GONE);
      const mine = await circlesOf(GONE);

      const holder = await pool.connect();
      let detaching: Promise<unknown> | null = null;
      try {
        await holder.query("BEGIN");
        await holder.query(
          `SELECT m."id" FROM "CircleMember" m WHERE m."userId" = $1 FOR UPDATE`,
          [GONE],
        );

        detaching = prisma.$transaction(
          async (tx) => {
            await tx.$queryRawUnsafe(
              `SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE`,
              GONE,
            );
            return service.detachUser(GONE, tx as never);
          },
          { timeout: 60_000 },
        );

        let waiting = 0;
        for (let i = 0; i < 600 && waiting === 0; i += 1) {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE wait_event_type = 'Lock'
                AND datname = current_database()
                AND pid <> pg_backend_pid()`,
          );
          waiting = rows[0].n as number;
          if (waiting === 0) await new Promise((r) => setTimeout(r, 10));
        }
        expect(waiting, "the deletion should be waiting").toBeGreaterThan(0);
      } finally {
        await holder.query("COMMIT").catch(() => undefined);
        holder.release();
      }

      await detaching;
      await deleteUser(GONE);

      const after = await snapshot(GONE, mine);
      expect(after.accountExists).toBe(false);
      expect(after.liveActivities).toBe(0);
      void created;
      void guest;
    });

    it("creation FIRST: the new Dúo is in the inventory and is ended", async () => {
      const created = await createDuoFor(GONE);
      const mine = await circlesOf(GONE);
      // Real rows exist before the deletion looks at anything.
      const before = await snapshot(GONE, mine);
      expect(before.liveActivities).toBe(1);
      expect(before.openInvitations).toBe(1);

      await detach(GONE);
      await deleteUser(GONE);

      const after = await snapshot(GONE, mine);
      expect(after.accountExists).toBe(false);
      expect(after.memberRows).toBe(0); // no row still names this user
      expect(after.detachedMembers).toBeGreaterThan(0);
      expect(after.liveActivities).toBe(0);
      expect(after.openInvitations).toBe(0);
      expect(after.openSessions).toBe(0);
      expect(after.eventsNamingUser).toBe(0);

      const activity = await pool.query(
        `SELECT "status" FROM "CircleActivity" WHERE "id" = $1`,
        [created.activityId],
      );
      expect(activity.rows[0].status).toBe("CANCELLED");
    });

    it("deletion FIRST: a later createDuo cannot resurrect the account", async () => {
      await createDuoFor(GONE);
      const mine = await circlesOf(GONE);
      await detach(GONE);
      await deleteUser(GONE);

      // The account is gone; the command has no actor to create for. Whatever
      // the service answers, it must not produce a new live activity.
      await expect(createDuoFor(GONE)).rejects.toThrow();

      const after = await snapshot(GONE, mine);
      expect(after.accountExists).toBe(false);
      expect(after.liveActivities).toBe(0);
    });

    it("the deletion BLOCKS on the User lock a creation is holding", async () => {
      // An OBSERVABLE barrier: another connection holds the row, and the
      // deletion's wait is read out of `pg_locks`. No sleep decides anything.
      await createDuoFor(GONE);
      const mine = await circlesOf(GONE);

      const holder = await pool.connect();
      let detaching: Promise<unknown> | null = null;
      try {
        await holder.query("BEGIN");
        await holder.query(
          `SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE`,
          [GONE],
        );

        detaching = prisma.$transaction(
          async (tx) => {
            await tx.$queryRawUnsafe(
              `SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE`,
              GONE,
            );
            return service.detachUser(GONE, tx as never);
          },
          { timeout: 60_000 },
        );

        // Wait for the block to APPEAR, read out of `pg_stat_activity`. The
        // condition is OBSERVED; the loop just re-reads it, and no fixed delay
        // decides anything. (The first version queried `pg_locks` with a
        // mis-parenthesised predicate that could never be true.)
        let waiting = 0;
        for (let i = 0; i < 600 && waiting === 0; i += 1) {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS n FROM pg_stat_activity
              WHERE wait_event_type = 'Lock'
                AND datname = current_database()
                AND pid <> pg_backend_pid()`,
          );
          waiting = rows[0].n as number;
          if (waiting === 0) await new Promise((r) => setTimeout(r, 10));
        }
        expect(
          waiting,
          "the deletion should be waiting on the User row",
        ).toBeGreaterThan(0);
      } finally {
        await holder.query("COMMIT").catch(() => undefined);
        holder.release();
      }

      // Released: it proceeds and finishes.
      await detaching;
      await deleteUser(GONE);
      const after = await snapshot(GONE, mine);
      expect(after.accountExists).toBe(false);
      expect(after.liveActivities).toBe(0);
    });

    it("an aborted decision leaves Círculos byte-for-byte untouched", async () => {
      // This is what the single-transaction design buys, and the reason the
      // cleanup may no longer open transactions of its own.
      //
      // The cleanup runs — really runs, ending the activity and revoking the
      // invitation — and THEN the decision aborts, exactly as it does when the
      // person cancelled or a new Dúo raced in. Because everything shared one
      // transaction, the rollback takes all of it. Under the previous design
      // the cleanup had already committed on its own and this state would have
      // survived a decision not to delete.
      const created = await createDuoFor(GONE);
      const mine = await circlesOf(GONE);
      const before = await snapshot(GONE, mine);
      expect(before.liveActivities).toBe(1);
      expect(before.openInvitations).toBe(1);

      await expect(
        prisma.$transaction(
          async (tx) => {
            await service.detachUser(GONE, tx as never);
            // Prove the cleanup really happened inside the transaction before
            // we abort — otherwise "untouched afterwards" would be vacuous.
            const midway = await tx.circleActivity.count({
              where: {
                circleId: { in: mine },
                status: { in: ["INVITING", "PREPARING"] },
              },
            });
            expect(midway).toBe(0);
            throw new Error("ACCOUNT_DELETION_ABORTED");
          },
          { timeout: 60_000 },
        ),
      ).rejects.toThrow(/ACCOUNT_DELETION_ABORTED/);

      const after = await snapshot(GONE, mine);
      expect(after).toEqual(before);
      const activity = await pool.query(
        `SELECT "status" FROM "CircleActivity" WHERE "id" = $1`,
        [created.activityId],
      );
      expect(activity.rows[0].status).toBe("INVITING");
    });
  });

  // ── The temporal sweep ───────────────────────────────────────────────────
  //
  // Shares this file's harness because it needs exactly the same thing: a real
  // database, real constraints, and fixtures the domain would accept. What a
  // clock may decide is a narrow question, and these pin both halves of it —
  // what it does, and what it must never do.

  describe("the temporal sweep", () => {
    const sweepWith = (mode: string) =>
      new CirclesSweepService(
        prisma as never,
        new CircleActivityRepository(prisma as never),
        new CircleEventRepository(prisma as never),
        new CirclesRolloutService(
          resolveCirclesRolloutConfig({ CIRCLES_ROLLOUT_MODE: mode }),
        ),
      );

    /** An INVITING activity whose only invitation is already expired. */
    const stuckInviting = async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "INVITING");
      const id = uid("inv");
      await pool.query(
        `INSERT INTO "CircleInvitation"
           ("id","circleId","activityId","createdByMemberId","tokenHash","expiresAt","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          circleId,
          activityId,
          members[GONE]!,
          fakeHash(++seq),
          pgTs(new Date(Date.now() - 60_000)),
          pgTs(new Date(Date.now() - 120_000)),
        ],
      );
      return { circleId, activityId, invitationId: id };
    };

    const statusOf = async (activityId: string) => {
      const { rows } = await pool.query(
        `SELECT "status" FROM "CircleActivity" WHERE "id" = $1`,
        [activityId],
      );
      return rows[0].status as string;
    };

    it("cancels an INVITING activity nobody can join any more", async () => {
      const { activityId } = await stuckInviting();
      const result = await sweepWith("on").sweep();
      expect(result.invitingCancelled).toBeGreaterThan(0);
      expect(await statusOf(activityId)).toBe("CANCELLED");
    });

    it("leaves an INVITING activity whose link is still good", async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "INVITING");
      await makeInvitation(circleId, activityId, members[GONE]!); // expires in an hour

      await sweepWith("on").sweep();

      expect(await statusOf(activityId)).toBe("INVITING");
    });

    it("opens a follow-up that is due, and never one that is not", async () => {
      const { circleId } = await makeCircle(GONE, [STAYS]);
      const due = await makeActivity(circleId, "REVEALED");
      const notYet = await makeActivity(circleId, "REVEALED");
      await pool.query(
        `UPDATE "CircleActivity" SET "followUpDueAt" = $2 WHERE "id" = $1`,
        [due, pgTs(new Date(Date.now() - 60_000))],
      );
      await pool.query(
        `UPDATE "CircleActivity" SET "followUpDueAt" = $2 WHERE "id" = $1`,
        [notYet, pgTs(future(3_600_000))],
      );

      const result = await sweepWith("on").sweep();

      expect(result.followUpOpened).toBeGreaterThan(0);
      expect(await statusOf(due)).toBe("FOLLOW_UP");
      expect(await statusOf(notYet)).toBe("REVEALED");
    });

    it("NEVER closes a follow-up just because its date arrived", async () => {
      // Closing is a decision the stage exists to collect. A timer that made it
      // would be recording a choice nobody made.
      const { circleId } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "REVEALED");
      await pool.query(
        `UPDATE "CircleActivity"
            SET "status" = 'FOLLOW_UP', "followUpDueAt" = $2
          WHERE "id" = $1`,
        [activityId, pgTs(new Date(Date.now() - 30 * 24 * 3_600_000))],
      );

      await sweepWith("on").sweep();

      expect(await statusOf(activityId)).toBe("FOLLOW_UP");
    });

    it("fabricates no confirmation and no reveal", async () => {
      // A PREPARING activity with one READY seat and one not. A timer must not
      // decide the second person confirmed, and must not reveal.
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "PREPARING");
      const ready = await makeSeat({
        circleId,
        activityId,
        memberId: members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      const waiting = await makeSeat({
        circleId,
        activityId,
        memberId: members[STAYS]!,
        status: "ACCEPTED",
      });

      await sweepWith("on").sweep();

      expect(await statusOf(activityId)).toBe("PREPARING");
      const seats = await pool.query(
        `SELECT "id","status" FROM "CircleActivityParticipant"
          WHERE "id" = ANY($1) ORDER BY "id"`,
        [[ready, waiting].sort()],
      );
      const byId = Object.fromEntries(
        seats.rows.map((r: { id: string; status: string }) => [r.id, r.status]),
      );
      expect(byId[ready]).toBe("READY");
      expect(byId[waiting]).toBe("ACCEPTED");
    });

    it("does nothing at all while the rollout is off", async () => {
      const { activityId } = await stuckInviting();

      const result = await sweepWith("off").sweep();

      expect(result).toEqual({
        invitingCancelled: 0,
        followUpOpened: 0,
        skippedRolloutOff: true,
      });
      expect(await statusOf(activityId)).toBe("INVITING");
    });

    it("is idempotent, and two concurrent passes do not double up", async () => {
      const { activityId } = await stuckInviting();
      const sweep = sweepWith("on");

      // Both passes race on the same row; the status guard means one wins.
      //
      // Asserted PER ACTIVITY, not on the totals: the suite shares a database
      // (the ledger is append-only, so rows cannot be cleaned between tests)
      // and earlier cases deliberately leave stuck activities behind — an
      // `off` run, for one. A global count would be reading their leftovers.
      await Promise.all([sweep.sweep(), sweep.sweep()]);
      expect(await statusOf(activityId)).toBe("CANCELLED");

      const again = await sweep.sweep();
      expect(await statusOf(activityId)).toBe("CANCELLED");
      void again;

      // Exactly one ACTIVITY_CANCELLED for it, not two.
      const events = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId" = $1 AND "type" = 'ACTIVITY_CANCELLED'`,
        [activityId],
      );
      expect(events.rows[0].n).toBe(1);
    });

    it("takes work in bounded batches", async () => {
      await stuckInviting();
      await stuckInviting();
      await stuckInviting();

      const first = await sweepWith("on").sweep({ batchSize: 1 });
      expect(first.invitingCancelled).toBe(1);

      // The rest is left for the next pass — an interrupted run resumes rather
      // than starting over.
      const second = await sweepWith("on").sweep({ batchSize: 10 });
      expect(second.invitingCancelled).toBeGreaterThanOrEqual(2);
    });

    it("does not touch an issued guest session's TTL", async () => {
      // An expired LINK and an expired SESSION are different things: the first
      // can no longer be redeemed, the second was already handed to somebody
      // who accepted. Shortening the second would break a promise, so the
      // sweep leaves it to the read path that already enforces it.
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "PREPARING");
      const invitationId = await makeInvitation(
        circleId,
        activityId,
        members[GONE]!,
      );
      const seat = await makeSeat({
        circleId,
        activityId,
        invitationId,
        status: "ACCEPTED",
      });
      const sessionId = await makeGuestSession(invitationId, activityId, seat);
      const before = await pool.query(
        `SELECT "expiresAt","revokedAt" FROM "CircleGuestSession" WHERE "id" = $1`,
        [sessionId],
      );

      await sweepWith("on").sweep();

      const after = await pool.query(
        `SELECT "expiresAt","revokedAt" FROM "CircleGuestSession" WHERE "id" = $1`,
        [sessionId],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });
  });

  // ── 2A · participation that is already over ───────────────────────────────
  //
  // The first cut filtered the whole deletion by "live", which meant a seat
  // still holding this person's snapshot in a finished activity was never
  // reached. Ending an activity and erasing an account's content are different
  // jobs, and only the first one is about being live.

  describe("2A · terminal activities are erased too", () => {
    /** Every column the envelope occupies, not just `ciphertext`. */
    const ENVELOPE_COLUMNS = [
      "ciphertext",
      "nonce",
      "keyVersion",
      "payloadHash",
      "readyAt",
      "sharingMode",
    ] as const;

    const expectNoEnvelope = async (seatId: string, label: string) => {
      const { rows } = await pool.query(
        `SELECT "ciphertext","nonce","keyVersion","payloadHash","readyAt",
                "sharingMode","fieldKeys","status"
           FROM "CircleActivityParticipant" WHERE "id" = $1`,
        [seatId],
      );
      expect(rows, label).toHaveLength(1);
      for (const col of ENVELOPE_COLUMNS) {
        expect(rows[0][col], `${label} · ${col}`).toBeNull();
      }
      expect(rows[0].fieldKeys, `${label} · fieldKeys`).toEqual([]);
    };

    it("purges the envelope in an activity that was already CLOSED", async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "REVEALED");
      const mine = await makeSeat({
        circleId,
        activityId,
        memberId: members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      // The conversation finished before anybody asked to be deleted.
      await pool.query(
        `UPDATE "CircleActivity" SET "status" = 'CLOSED', "closedAt" = now() WHERE "id" = $1`,
        [activityId],
      );

      const summary = await detach(GONE);
      // Nothing to END — the activity was already terminal — but something to
      // ERASE. The old code reported both as zero.
      expect(summary.seatsWithdrawn).toBe(0);
      expect(summary.envelopesPurged).toBe(1);

      await deleteUser(GONE);
      await expectNoEnvelope(mine, "closed activity");
    });

    it("purges when the COUNTERPART closed the activity", async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "REVEALED");
      const mine = await makeSeat({
        circleId,
        activityId,
        memberId: members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      const theirs = await makeSeat({
        circleId,
        activityId,
        memberId: members[STAYS]!,
        status: "WITHDRAWN",
      });
      await pool.query(
        `UPDATE "CircleActivity" SET "status" = 'CLOSED', "closedAt" = now() WHERE "id" = $1`,
        [activityId],
      );

      await detach(GONE);
      await deleteUser(GONE);

      await expectNoEnvelope(mine, "closed by counterpart");
      // Their seat is untouched by our erase — it holds nothing of ours.
      const t = await pool.query(
        `SELECT "status" FROM "CircleActivityParticipant" WHERE "id" = $1`,
        [theirs],
      );
      expect(t.rows[0].status).toBe("WITHDRAWN");
    });

    it("is a no-op for a participation already withdrawn, and on retry", async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "PREPARING");
      const mine = await makeSeat({
        circleId,
        activityId,
        memberId: members[GONE]!,
        status: "WITHDRAWN",
      });

      const first = await detach(GONE);
      expect(first.envelopesPurged).toBe(0);
      const second = await detach(GONE);
      expect(second.envelopesPurged).toBe(0);
      expect(second.seatsWithdrawn).toBe(0);

      await deleteUser(GONE);
      await expectNoEnvelope(mine, "already withdrawn");
    });

    it("resumes after a partial failure and finishes the erase", async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      // One LIVE activity (which the broken service will fail on) and one
      // already-CLOSED activity holding an envelope.
      const live = await makeActivity(circleId, "PREPARING");
      await makeSeat({
        circleId,
        activityId: live,
        memberId: members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      const done = await makeActivity(circleId, "REVEALED");
      const doneSeat = await makeSeat({
        circleId,
        activityId: done,
        memberId: members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      await pool.query(
        `UPDATE "CircleActivity" SET "status" = 'CLOSED', "closedAt" = now() WHERE "id" = $1`,
        [done],
      );

      const broken = buildService(prisma, BROKEN_EVENTS);
      await expect(detach(GONE, broken)).rejects.toThrow();

      // The failure happened while ENDING the live one, so the erase never
      // ran: the closed activity still holds the envelope. That is the state
      // the retry has to finish from.
      const midway = await pool.query(
        `SELECT "ciphertext" FROM "CircleActivityParticipant" WHERE "id" = $1`,
        [doneSeat],
      );
      expect(midway.rows[0].ciphertext).not.toBeNull();

      const summary = await detach(GONE);
      expect(summary.seatsWithdrawn).toBe(1);
      expect(summary.envelopesPurged).toBe(1);
      await deleteUser(GONE);
      await expectNoEnvelope(doneSeat, "resumed");
    });

    it("does not reach into somebody else's closed activity", async () => {
      const mine = await makeCircle(GONE, [STAYS]);
      const mineActivity = await makeActivity(mine.circleId, "REVEALED");
      await makeSeat({
        circleId: mine.circleId,
        activityId: mineActivity,
        memberId: mine.members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      await pool.query(
        `UPDATE "CircleActivity" SET "status" = 'CLOSED', "closedAt" = now() WHERE "id" = $1`,
        [mineActivity],
      );

      const theirs = await makeCircle(STRANGER);
      const theirActivity = await makeActivity(theirs.circleId, "REVEALED");
      const theirSeat = await makeSeat({
        circleId: theirs.circleId,
        activityId: theirActivity,
        memberId: theirs.members[STRANGER]!,
        status: "READY",
        withEnvelope: true,
      });
      await pool.query(
        `UPDATE "CircleActivity" SET "status" = 'CLOSED', "closedAt" = now() WHERE "id" = $1`,
        [theirActivity],
      );

      await detach(GONE);
      await deleteUser(GONE);

      const kept = await pool.query(
        `SELECT "ciphertext","nonce","payloadHash","status"
           FROM "CircleActivityParticipant" WHERE "id" = $1`,
        [theirSeat],
      );
      expect(kept.rows[0].ciphertext).not.toBeNull();
      expect(kept.rows[0].nonce).not.toBeNull();
      expect(kept.rows[0].payloadHash).not.toBeNull();
      expect(kept.rows[0].status).toBe("READY");
    });

    it("the counterpart's REVEALED snapshot survives; only ours goes", async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "REVEALED");
      const mine = await makeSeat({
        circleId,
        activityId,
        memberId: members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      const theirs = await makeSeat({
        circleId,
        activityId,
        memberId: members[STAYS]!,
        status: "READY",
        withEnvelope: true,
      });
      await pool.query(
        `UPDATE "CircleActivity" SET "status" = 'CLOSED', "closedAt" = now() WHERE "id" = $1`,
        [activityId],
      );

      await detach(GONE);
      await deleteUser(GONE);

      await expectNoEnvelope(mine, "ours");
      // Theirs is their own content, already read by both. Erasing it would
      // destroy somebody else's record without un-revealing anything.
      const kept = await pool.query(
        `SELECT "ciphertext","status" FROM "CircleActivityParticipant" WHERE "id" = $1`,
        [theirs],
      );
      expect(kept.rows[0].ciphertext).not.toBeNull();
      expect(kept.rows[0].status).toBe("READY");
    });
  });

  // ── Artifacts: the matrix, and the part that is NOT decided ───────────────

  describe("artifacts are left as they are, and that is a PENDING decision", () => {
    /**
     * What this suite pins is the CURRENT behaviour, not an approved policy.
     *
     * The withdrawal contract says nothing about artifacts — `withdraw()` does
     * not touch them — and no retention policy exists in the repository. So
     * deletion inherits "leave them alone" by default, and these tests record
     * that rather than bless it.
     *
     * The matrix that needs a decision:
     *
     *   PROPOSED by the deleted person, never confirmed  → their content,
     *       nobody agreed to it. Arguably should go. TODAY IT STAYS.
     *   AGREED by both                                    → joint content the
     *       counterpart agreed to and read. Deleting it destroys their record.
     *   SUPERSEDED                                        → historical.
     *
     * `ARTIFACT_RETENTION_POLICY_STATUS=pending_decision`.
     */
    const makeArtifact = async (
      activityId: string,
      participantId: string,
      status: "PROPOSED" | "AGREED",
    ) => {
      const id = uid("art");
      await pool.query(
        `INSERT INTO "CircleArtifact"
           ("id","activityId","createdByParticipantId","status","version","kind",
            "ciphertext","nonce","keyVersion","payloadHash","agreedAt","updatedAt")
         VALUES ($1,$2,$3,$4::"CircleArtifactStatus",1,
                 'AGREEMENT'::"CircleArtifactKind",'CT','N',1,$5,$6,now())`,
        [
          id,
          activityId,
          participantId,
          status,
          HMAC_HEX,
          status === "AGREED" ? pgTs(new Date()) : null,
        ],
      );
      return id;
    };

    it("a PROPOSED artifact authored by the deleted person is NOT erased today", async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "REVEALED");
      const mine = await makeSeat({
        circleId,
        activityId,
        memberId: members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      const artifactId = await makeArtifact(activityId, mine, "PROPOSED");

      await detach(GONE);
      await deleteUser(GONE);

      const { rows } = await pool.query(
        `SELECT "status","ciphertext" FROM "CircleArtifact" WHERE "id" = $1`,
        [artifactId],
      );
      // Recorded, not endorsed: nobody ever agreed to this text, so calling it
      // "shared content already seen" would be false. Whether it should be
      // erased is the open decision.
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("PROPOSED");
      expect(rows[0].ciphertext).not.toBeNull();
    });

    it("an AGREED artifact survives, and that one IS justified", async () => {
      const { circleId, members } = await makeCircle(GONE, [STAYS]);
      const activityId = await makeActivity(circleId, "REVEALED");
      const mine = await makeSeat({
        circleId,
        activityId,
        memberId: members[GONE]!,
        status: "READY",
        withEnvelope: true,
      });
      const artifactId = await makeArtifact(activityId, mine, "AGREED");

      await detach(GONE);
      await deleteUser(GONE);

      const { rows } = await pool.query(
        `SELECT "status","agreedAt" FROM "CircleArtifact" WHERE "id" = $1`,
        [artifactId],
      );
      expect(rows[0].status).toBe("AGREED");
      expect(rows[0].agreedAt).not.toBeNull();
    });
  });

  // ── 5 · retries ───────────────────────────────────────────────────────────

  it("5 · a retried detach is a no-op, and the delete still succeeds", async () => {
    const { circleId, members } = await makeCircle(GONE, [STAYS]);
    const activityId = await makeActivity(circleId, "PREPARING");
    await makeSeat({
      circleId,
      activityId,
      memberId: members[GONE]!,
      status: "READY",
      withEnvelope: true,
    });

    const first = await detach(GONE);
    expect(first.seatsWithdrawn).toBe(1);

    const second = await detach(GONE);
    expect(second.seatsWithdrawn).toBe(0);
    expect(second.memberships).toBe(0);

    // Exactly one PARTICIPANT_WITHDRAWN, not two: the receipt key is derived
    // from the seat, so the replay appends nothing.
    const events = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "activityId" = $1 AND "type" = 'PARTICIPANT_WITHDRAWN'`,
      [activityId],
    );
    expect(events.rows[0].n).toBe(1);

    await deleteUser(GONE);
  });

  // ── 6 · concurrency ───────────────────────────────────────────────────────

  it("6 · a confirmation racing the detach never leaves authority half-standing", async () => {
    const { circleId, members } = await makeCircle(GONE, [STAYS]);
    const activityId = await makeActivity(circleId, "PREPARING");
    await makeSeat({
      circleId,
      activityId,
      memberId: members[GONE]!,
      status: "ACCEPTED",
    });
    const theirs = await makeSeat({
      circleId,
      activityId,
      memberId: members[STAYS]!,
      status: "ACCEPTED",
    });

    // The competing write takes the activity row first and holds it.
    const racer = await pool.connect();
    await racer.query("BEGIN");
    await racer.query(
      `SELECT "id" FROM "CircleActivity" WHERE "id" = $1 FOR UPDATE`,
      [activityId],
    );

    const detaching = detach(GONE);

    // The confirmation lands while the detach is blocked on the lock.
    await racer.query(
      // All SIX columns `CircleActivityParticipant_ready_is_complete` requires.
      // A half-written envelope is not a state the reveal barrier should ever
      // have to interpret, so the database will not store one.
      `UPDATE "CircleActivityParticipant"
          SET "status" = 'READY', "ciphertext" = 'CT', "nonce" = 'N',
              "keyVersion" = 1, "payloadHash" = $2, "readyAt" = now(),
              "sharingMode" = 'SELECTED_FIELDS', "fieldKeys" = ARRAY['a'],
              "updatedAt" = now()
        WHERE "id" = $1`,
      [theirs, HMAC_HEX],
    );
    await racer.query("COMMIT");
    racer.release();

    await detaching;
    await deleteUser(GONE);

    // Whichever order the two took, the end state is terminal and closed to
    // further disclosure — never "cancelled but the seat is still READY".
    const activity = await pool.query(
      `SELECT "status" FROM "CircleActivity" WHERE "id" = $1`,
      [activityId],
    );
    expect(["CANCELLED", "CLOSED"]).toContain(activity.rows[0].status);

    const survivors = await pool.query(
      `SELECT "status","ciphertext" FROM "CircleActivityParticipant"
        WHERE "activityId" = $1 AND "id" = $2`,
      [activityId, theirs],
    );
    // The counterpart's envelope is gone with the cancellation.
    expect(survivors.rows[0].ciphertext).toBeNull();
  });

  // ── 7 · other people ──────────────────────────────────────────────────────

  it("7 · a stranger's circle and activity are untouched", async () => {
    const mine = await makeCircle(GONE, [STAYS]);
    const mineActivity = await makeActivity(mine.circleId, "PREPARING");
    await makeSeat({
      circleId: mine.circleId,
      activityId: mineActivity,
      memberId: mine.members[GONE]!,
      status: "READY",
      withEnvelope: true,
    });

    const theirs = await makeCircle(STRANGER);
    const theirActivity = await makeActivity(theirs.circleId, "PREPARING");
    const theirSeat = await makeSeat({
      circleId: theirs.circleId,
      activityId: theirActivity,
      memberId: theirs.members[STRANGER]!,
      status: "READY",
      withEnvelope: true,
    });
    const theirInvitation = await makeInvitation(
      theirs.circleId,
      theirActivity,
      theirs.members[STRANGER]!,
    );

    await detach(GONE);
    await deleteUser(GONE);

    const activity = await pool.query(
      `SELECT "status" FROM "CircleActivity" WHERE "id" = $1`,
      [theirActivity],
    );
    expect(activity.rows[0].status).toBe("PREPARING");

    const seat = await pool.query(
      `SELECT "status","ciphertext" FROM "CircleActivityParticipant" WHERE "id" = $1`,
      [theirSeat],
    );
    expect(seat.rows[0].status).toBe("READY");
    expect(seat.rows[0].ciphertext).not.toBeNull();

    const inv = await pool.query(
      `SELECT "revokedAt" FROM "CircleInvitation" WHERE "id" = $1`,
      [theirInvitation],
    );
    expect(inv.rows[0].revokedAt).toBeNull();

    const member = await pool.query(
      `SELECT "status","userId" FROM "CircleMember" WHERE "id" = $1`,
      [theirs.members[STRANGER]!],
    );
    expect(member.rows[0].status).toBe("ACTIVE");
    expect(member.rows[0].userId).toBe(STRANGER);
  });

  // ── 8 · the ledger is still append-only ───────────────────────────────────

  describe("8 · the ledger admits ONE transition and refuses the rest", () => {
    it("refuses ordinary UPDATE, DELETE and TRUNCATE", async () => {
      const { circleId } = await makeCircle(GONE, [STAYS]);
      const eventId = await makeUserEvent(circleId, GONE);

      const update = await refusalOf(() =>
        pool.query(
          `UPDATE "CircleEvent" SET "type" = 'CIRCLE_CREATED' WHERE "id" = $1`,
          [eventId],
        ),
      );
      expect(update.message).toContain("CIRCLE_EVENT_APPEND_ONLY");

      const del = await refusalOf(() =>
        pool.query(`DELETE FROM "CircleEvent" WHERE "id" = $1`, [eventId]),
      );
      expect(del.message).toContain("CIRCLE_EVENT_APPEND_ONLY");

      const truncate = await refusalOf(() =>
        pool.query(`TRUNCATE "CircleEvent"`),
      );
      expect(truncate.message).toContain("CIRCLE_EVENT_APPEND_ONLY");
    });

    it("refuses the scrub SHAPE while the account still exists", async () => {
      // This is the clause that makes the exception the authorised deletion
      // path and nothing else. The same statement the foreign key performs is
      // refused when a service issues it directly, because the user is alive.
      const { circleId } = await makeCircle(GONE, [STAYS]);
      const eventId = await makeUserEvent(circleId, GONE);

      const refused = await refusalOf(() =>
        pool.query(
          `UPDATE "CircleEvent" SET "actorUserId" = NULL WHERE "id" = $1`,
          [eventId],
        ),
      );
      expect(refused.message).toContain("CIRCLE_EVENT_APPEND_ONLY");

      const still = await pool.query(
        `SELECT "actorUserId" FROM "CircleEvent" WHERE "id" = $1`,
        [eventId],
      );
      expect(still.rows[0].actorUserId).toBe(GONE);
    });

    it("admits the detach, and detaches only the actor", async () => {
      const { circleId } = await makeCircle(GONE, [STAYS]);
      const eventId = await makeUserEvent(circleId, GONE);
      const before = await pool.query(
        `SELECT * FROM "CircleEvent" WHERE "id" = $1`,
        [eventId],
      );

      await detach(GONE);
      await deleteUser(GONE);

      const after = await pool.query(
        `SELECT * FROM "CircleEvent" WHERE "id" = $1`,
        [eventId],
      );
      expect(after.rows).toHaveLength(1);
      expect(after.rows[0].actorUserId).toBeNull();
      // Every other column is exactly what it was — the row is detached, not
      // rewritten.
      for (const col of [
        "id",
        "circleId",
        "activityId",
        "type",
        "actorParticipantId",
        "artifactId",
        "idempotencyKey",
        "metadata",
        "occurredAt",
      ]) {
        expect(after.rows[0][col], col).toEqual(before.rows[0][col]);
      }
    });

    it("still refuses a DELETE after the account is gone", async () => {
      // The exception is for ONE update shape. Removing the row was never the
      // sanctioned behaviour and still is not.
      const { circleId } = await makeCircle(GONE, [STAYS]);
      const eventId = await makeUserEvent(circleId, GONE);
      await detach(GONE);
      await deleteUser(GONE);

      const del = await refusalOf(() =>
        pool.query(`DELETE FROM "CircleEvent" WHERE "id" = $1`, [eventId]),
      );
      expect(del.message).toContain("CIRCLE_EVENT_APPEND_ONLY");
    });
  });

  // ── 9 · a provoked failure ────────────────────────────────────────────────

  it("9 · a failure mid-detach leaves the account and its authority intact", async () => {
    const { circleId, members } = await makeCircle(GONE, [STAYS]);
    const activityId = await makeActivity(circleId, "PREPARING");
    const seat = await makeSeat({
      circleId,
      activityId,
      memberId: members[GONE]!,
      status: "READY",
      withEnvelope: true,
    });

    // A service whose event append always throws — the failure lands AFTER the
    // seat and activity were moved inside the transaction, so the transaction
    // must roll all of it back.
    const broken = buildService(prisma, BROKEN_EVENTS);

    await expect(detach(GONE, broken)).rejects.toThrow();

    // Nothing half-done: the seat is still READY, the activity still PREPARING,
    // the membership still ACTIVE, and the account still deletable later.
    const after = await pool.query(
      `SELECT p."status" AS seat, p."ciphertext", a."status" AS activity, m."status" AS member
         FROM "CircleActivityParticipant" p
         JOIN "CircleActivity" a ON a."id" = p."activityId"
         JOIN "CircleMember" m ON m."id" = p."memberId"
        WHERE p."id" = $1`,
      [seat],
    );
    expect(after.rows[0].seat).toBe("READY");
    expect(after.rows[0].ciphertext).not.toBeNull();
    expect(after.rows[0].activity).toBe("PREPARING");
    expect(after.rows[0].member).toBe("ACTIVE");

    // And the retry — with a working service — completes.
    const summary = await detach(GONE);
    expect(summary.seatsWithdrawn).toBe(1);
    await deleteUser(GONE);
  });

  // ── membership detaches rather than vanishing ─────────────────────────────

  it("revokes membership and detaches it, keeping the circle for the counterpart", async () => {
    const { circleId, members } = await makeCircle(GONE, [STAYS]);
    await detach(GONE);
    await deleteUser(GONE);

    const mine = await pool.query(
      `SELECT "userId","status" FROM "CircleMember" WHERE "id" = $1`,
      [members[GONE]!],
    );
    expect(mine.rows[0].userId).toBeNull();
    expect(mine.rows[0].status).toBe("LEFT");

    const circle = await pool.query(
      `SELECT "createdByUserId","status" FROM "Circle" WHERE "id" = $1`,
      [circleId],
    );
    // The circle outlives its creator, and says so honestly rather than
    // crediting the counterpart with having created it.
    expect(circle.rows[0].createdByUserId).toBeNull();
    expect(circle.rows[0].status).toBe("ACTIVE");

    const theirs = await pool.query(
      `SELECT "userId","status" FROM "CircleMember" WHERE "id" = $1`,
      [members[STAYS]!],
    );
    expect(theirs.rows[0].userId).toBe(STAYS);
    expect(theirs.rows[0].status).toBe("ACTIVE");
  });

  it("cannot represent a detached membership that is still ACTIVE", async () => {
    const { members } = await makeCircle(GONE, [STAYS]);
    const refused = await refusalOf(() =>
      pool.query(`UPDATE "CircleMember" SET "userId" = NULL WHERE "id" = $1`, [
        members[GONE]!,
      ]),
    );
    expect(refused.message).toMatch(/CircleMember_detached_is_left/);
  });
});

// ── the upgrade path ────────────────────────────────────────────────────────

suite(
  "circles · account deletion migrates onto main's 64 (real PostgreSQL)",
  () => {
    it("main REJECTS the deletion; this migration is what changes that", async () => {
      assertDestructionAllowed(base as string);
      const admin = new Pool({ connectionString: base });
      try {
        await createDatabase(admin, BASE_DB);
      } finally {
        await admin.end();
      }

      const url = withDatabase(base as string, BASE_DB);
      const pool = new Pool({ connectionString: url });

      try {
        // The 64 that were on `main`, in order, applied by hand so the new one
        // can be held back.
        const all = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();
        const baseline = all.filter((d) => d !== THIS_MIGRATION);
        expect(baseline).toHaveLength(64);
        expect(all).toHaveLength(65);

        const { readFileSync } = await import("node:fs");
        for (const dir of baseline) {
          const sql = readFileSync(
            join(MIGRATIONS_DIR, dir, "migration.sql"),
            "utf8",
          );
          await pool.query(sql);
        }

        // Seed a user the ledger names.
        await pool.query(
          `INSERT INTO "User" ("id","email","name","passwordHash","updatedAt")
         VALUES ('u-base','u-base@example.test','u','x',now())`,
        );
        await pool.query(
          `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
         VALUES ('c-base','DUO','ACTIVE','u-base',2,now())`,
        );
        await pool.query(
          `INSERT INTO "CircleEvent" ("id","circleId","type","actorUserId","occurredAt")
         VALUES ('e-base','c-base','CIRCLE_CREATED'::"CircleEventType",'u-base',now())`,
        );

        // BEFORE: the deletion is refused, which is the blocker this cut
        // exists to remove. Asserted rather than assumed.
        //
        // On SQLSTATE and the constraint NAME, never on the message.
        // PostgreSQL has two wordings for this refusal — "violates foreign key
        // constraint" for NO ACTION, "violates RESTRICT setting of foreign key
        // constraint" for RESTRICT — and WHICH of the blocking constraints
        // fires first is not ordered. A message regex therefore passes or
        // fails on an accident: this assertion was green locally and red in CI
        // for exactly that reason. 23503 plus the constraint family says the
        // thing that is actually true.
        let refused: { code?: string; constraint?: string } = {};
        try {
          await pool.query(`DELETE FROM "User" WHERE "id" = 'u-base'`);
          throw new Error("main accepted the deletion — the blocker is absent");
        } catch (err) {
          refused = err as { code?: string; constraint?: string };
        }
        // BOTH classes, because RESTRICT and NO ACTION are different
        // SQLSTATEs for the same fact:
        //
        //   23001  restrict_violation      ← ON DELETE RESTRICT
        //   23503  foreign_key_violation   ← ON DELETE NO ACTION
        //
        // and which of the blocking constraints the planner reaches first is
        // unordered. Pinning either one alone pins the accident: the first
        // version of this assertion matched a message, the second matched
        // 23503, and both were green locally and red in CI for the same
        // reason. What is invariant — and what this cut is actually about — is
        // that the delete is refused BY A CÍRCULOS REFERENCE.
        expect(["23001", "23503"], "refused by a foreign key").toContain(
          refused.code,
        );
        expect(refused.constraint ?? "").toMatch(
          /^(Circle_createdByUserId_fkey|CircleEvent_actorUserId_fkey)$/,
        );

        // Apply ONLY the new migration.
        const sql = readFileSync(
          join(MIGRATIONS_DIR, THIS_MIGRATION, "migration.sql"),
          "utf8",
        );
        await pool.query(sql);

        // AFTER: the same statement, on the same pre-existing rows, succeeds —
        // and the ledger row is detached rather than removed.
        await pool.query(`DELETE FROM "User" WHERE "id" = 'u-base'`);
        const ev = await pool.query(
          `SELECT "actorUserId" FROM "CircleEvent" WHERE "id" = 'e-base'`,
        );
        expect(ev.rows).toHaveLength(1);
        expect(ev.rows[0].actorUserId).toBeNull();
        const circle = await pool.query(
          `SELECT "createdByUserId" FROM "Circle" WHERE "id" = 'c-base'`,
        );
        expect(circle.rows[0].createdByUserId).toBeNull();
      } finally {
        await pool.end();
        await dropCreatedDatabases(base as string);
      }
    }, 300_000);
  },
);
