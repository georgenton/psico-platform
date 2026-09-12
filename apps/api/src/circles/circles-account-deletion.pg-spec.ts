import { execSync } from "node:child_process";
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

const DB = "circles_deletion_db";
const BASE_DB = "circles_deletion_base";
const API_DIR = process.cwd();
const MIGRATIONS_DIR = join(API_DIR, "prisma", "migrations");
const THIS_MIGRATION = "20260913000000_circles_account_deletion";

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

suite("circles · account deletion (real PostgreSQL)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let service: CirclesAccountDeletionService;

  let seq = 0;
  const uid = (p: string) => `${p}-${++seq}`;

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
          "sharingMode","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6::"CircleParticipantStatus",
               $7,$8,$9,$10,$11,$12,$13::"CircleSharingMode",now())`,
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
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}" TEMPLATE template0`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "pipe",
    });

    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    service = new CirclesAccountDeletionService(
      prisma as never,
      new CircleParticipantRepository(prisma as never),
      new CircleActivityRepository(prisma as never),
      new CircleEventRepository(prisma as never),
    );
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS "${BASE_DB}" WITH (FORCE)`);
    await admin.end();
  });

  beforeEach(async () => {
    GONE = uid("u-gone");
    STAYS = uid("u-stays");
    STRANGER = uid("u-stranger");
    for (const u of [GONE, STAYS, STRANGER]) await insertUser(u);
  });

  // ── 1 · the plain case ────────────────────────────────────────────────────

  it("1 · deletes a user who never touched Círculos", async () => {
    const summary = await service.detachUser(GONE);
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

    const summary = await service.detachUser(GONE);
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

    await service.detachUser(GONE);
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

  it("4 · a revealed activity closes; the deleted person's envelope goes, the artifact stays", async () => {
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

    await service.detachUser(GONE);
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

    const first = await service.detachUser(GONE);
    expect(first.seatsWithdrawn).toBe(1);

    const second = await service.detachUser(GONE);
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

    const detach = service.detachUser(GONE);

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

    await detach;
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

    await service.detachUser(GONE);
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

      await service.detachUser(GONE);
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
      await service.detachUser(GONE);
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
    const broken = new CirclesAccountDeletionService(
      prisma as never,
      new CircleParticipantRepository(prisma as never),
      new CircleActivityRepository(prisma as never),
      {
        append: async () => {
          throw new Error("ledger unavailable");
        },
      } as never,
    );

    await expect(broken.detachUser(GONE)).rejects.toThrow();

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
    const summary = await service.detachUser(GONE);
    expect(summary.seatsWithdrawn).toBe(1);
    await deleteUser(GONE);
  });

  // ── membership detaches rather than vanishing ─────────────────────────────

  it("revokes membership and detaches it, keeping the circle for the counterpart", async () => {
    const { circleId, members } = await makeCircle(GONE, [STAYS]);
    await service.detachUser(GONE);
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
      const admin = new Pool({ connectionString: base });
      await admin.query(`DROP DATABASE IF EXISTS "${BASE_DB}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${BASE_DB}" TEMPLATE template0`);
      await admin.end();

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
        expect(refused.code, "SQLSTATE foreign_key_violation").toBe("23503");
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
        const cleanup = new Pool({ connectionString: base });
        await cleanup.query(
          `DROP DATABASE IF EXISTS "${BASE_DB}" WITH (FORCE)`,
        );
        await cleanup.end();
      }
    }, 300_000);
  },
);
