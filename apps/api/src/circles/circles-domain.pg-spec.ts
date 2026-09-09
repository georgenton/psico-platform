import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CircleInvitationRepository } from "./circle-invitation.repository";
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { CircleEventRepository } from "./circle-event.repository";
import { CirclesService } from "./circles.service";
import { CirclesError } from "./circles-http-errors";
import { hashSecret, mintInvitationToken } from "./circles-secrets";

/**
 * The Círculos invariants against REAL PostgreSQL (PR2 · spec §D/§H).
 *
 * A CHECK, a partial unique index, a composite foreign key and a trigger cannot
 * be tested against a mock: the thing under test IS the database's refusal.
 * Every negative case here is a raw `INSERT`/`UPDATE` that goes around Prisma,
 * around the repositories and around every TypeScript branch, so what fails is
 * the constraint and not a guard somebody could delete.
 *
 * Two databases are built, and the second is the more interesting one:
 *
 *   · `circles_domain_db` — the whole chain from scratch, which is what a fresh
 *     environment does.
 *   · `circles_baseline_db` — the 62 migrations that were on `main` before this
 *     branch, asserted to contain no Círculos table, and THEN this migration
 *     replayed on top. That is what production will actually experience, and it
 *     is a different question from "does the chain work from zero".
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "circles_domain_db";
const BASELINE_DB = "circles_baseline_db";
const API_DIR = process.cwd();
const MIGRATIONS_DIR = join(API_DIR, "prisma", "migrations");
/** The migration this branch adds. Everything before it is the baseline. */
const THIS_MIGRATION = "20260909180000_circles_domain_foundation";

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

const U1 = "u-circles-owner";
const CIRCLE = "c-circles-one";
const MEMBER = "m-circles-one";
const ACTIVITY = "act-circles-one";
const OTHER_ACTIVITY = "act-circles-two";

const HOUR = 60 * 60 * 1000;
const future = (ms = HOUR) => new Date(Date.now() + ms);
const past = (ms = HOUR) => new Date(Date.now() - ms);

/**
 * A timestamp in the form the columns actually hold.
 *
 * Prisma's `DateTime` is `TIMESTAMP(3)` WITHOUT time zone, and Prisma writes
 * UTC wall-clock into it; `CURRENT_TIMESTAMP` on a UTC server writes the same
 * thing, which is why `expiresAt > createdAt` holds in production. Raw `pg`
 * does NOT: it serialises a `Date` with the local offset, and a `timestamp`
 * column keeps the local wall clock and discards the offset. On a UTC-5 laptop
 * that makes "an hour from now" land five hours in the past and the CHECK fire
 * for the wrong reason. Stripping the `Z` sends the same UTC wall clock Prisma
 * would, so these fixtures compare like with like.
 */
const pgTs = (d: Date) => d.toISOString().replace("Z", "");

/** A 64-hex value that is not a real hash — enough to satisfy the shape CHECK. */
const fakeHash = (n: number) => String(n).padStart(64, "a");

suite("circles · SQL invariants (real PostgreSQL)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let invitations: CircleInvitationRepository;
  let guestSessions: CircleGuestSessionRepository;
  let events: CircleEventRepository;
  let service: CirclesService;

  /**
   * A fresh activity per fixture. `CircleInvitation_one_live_per_activity` is
   * doing its job on the shared one, so tests that are not about that index get
   * their own activity rather than working around it.
   */
  let activitySeq = 0;
  const newActivity = async (id?: string): Promise<string> => {
    const activityId = id ?? `act-auto-${++activitySeq}`;
    await pool.query(
      `INSERT INTO "CircleActivity"
         ("id","circleId","templateKey","templateVersion","status",
          "requiredParticipants","updatedAt")
       VALUES ($1,$2,'fixture-duo-template',1,'INVITING',2,now())`,
      [activityId, CIRCLE],
    );
    return activityId;
  };

  /** Raw INSERT so nothing but the DATABASE validates the row. */
  const insertInvitation = async (cols: {
    id: string;
    activityId?: string;
    tokenHash: string;
    codeHash?: string | null;
    expiresAt?: Date;
    createdAt?: Date;
    consumedAt?: Date | null;
    acceptedAt?: Date | null;
    declinedAt?: Date | null;
    revokedAt?: Date | null;
  }) => {
    const activityId = cols.activityId ?? (await newActivity());
    return pool.query(
      `INSERT INTO "CircleInvitation"
         ("id","circleId","activityId","createdByMemberId","tokenHash","codeHash",
          "expiresAt","createdAt","consumedAt","acceptedAt","declinedAt","revokedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        cols.id,
        CIRCLE,
        activityId,
        MEMBER,
        cols.tokenHash,
        cols.codeHash ?? null,
        pgTs(cols.expiresAt ?? future()),
        pgTs(cols.createdAt ?? new Date()),
        cols.consumedAt ?? null,
        cols.acceptedAt ?? null,
        cols.declinedAt ?? null,
        cols.revokedAt ?? null,
      ],
    );
  };

  const insertParticipant = (cols: {
    id: string;
    activityId?: string;
    memberId?: string | null;
    invitationId?: string | null;
    status?: string;
    ciphertext?: string | null;
    nonce?: string | null;
    keyVersion?: number | null;
    readyAt?: Date | null;
    withdrawnAt?: Date | null;
  }) =>
    pool.query(
      `INSERT INTO "CircleActivityParticipant"
         ("id","activityId","memberId","invitationId","status",
          "ciphertext","nonce","keyVersion","readyAt","withdrawnAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5::"CircleParticipantStatus",$6,$7,$8,$9,$10,now())`,
      [
        cols.id,
        cols.activityId ?? ACTIVITY,
        cols.memberId ?? null,
        cols.invitationId ?? null,
        cols.status ?? "INVITED",
        cols.ciphertext ?? null,
        cols.nonce ?? null,
        cols.keyVersion ?? null,
        cols.readyAt ?? null,
        cols.withdrawnAt ?? null,
      ],
    );

  const insertGuestSession = (cols: {
    id: string;
    invitationId: string;
    activityId: string;
    participantId: string;
    tokenHash: string;
    expiresAt?: Date;
  }) =>
    pool.query(
      `INSERT INTO "CircleGuestSession"
         ("id","invitationId","activityId","participantId","tokenHash",
          "expiresAt","createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        cols.id,
        cols.invitationId,
        cols.activityId,
        cols.participantId,
        cols.tokenHash,
        pgTs(cols.expiresAt ?? future()),
        pgTs(new Date()),
      ],
    );

  /** Run a statement and hand back the SQLSTATE/constraint, never a pass. */
  const refusalOf = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      const e = err as { code?: string; constraint?: string; message?: string };
      return {
        code: e.code ?? "",
        constraint: e.constraint ?? "",
        message: e.message ?? "",
      };
    }
    throw new Error("expected PostgreSQL to refuse the statement");
  };

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
    invitations = new CircleInvitationRepository(prisma);
    guestSessions = new CircleGuestSessionRepository(prisma);
    events = new CircleEventRepository(prisma);
    service = new CirclesService(
      prisma as unknown as ConstructorParameters<typeof CirclesService>[0],
      invitations,
      guestSessions,
      events,
    );

    await prisma.user.create({
      data: {
        id: U1,
        email: "circles-owner@test.local",
        name: "Circles Owner",
      },
    });
    await pool.query(
      `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
       VALUES ($1,'DUO','ACTIVE',$2,2,now())`,
      [CIRCLE, U1],
    );
    await pool.query(
      `INSERT INTO "CircleMember" ("id","circleId","userId","role","status")
       VALUES ($1,$2,$3,'ORGANIZER','ACTIVE')`,
      [MEMBER, CIRCLE, U1],
    );
    for (const id of [ACTIVITY, OTHER_ACTIVITY]) {
      await pool.query(
        `INSERT INTO "CircleActivity"
           ("id","circleId","templateKey","templateVersion","status",
            "requiredParticipants","updatedAt")
         VALUES ($1,$2,'fixture-duo-template',1,'INVITING',2,now())`,
        [id, CIRCLE],
      );
    }
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS "${BASELINE_DB}" WITH (FORCE)`);
    await admin.end();
  }, 60_000);

  // ── The migration, from the branch's actual baseline ──────────────────────

  it("applies on top of the 62 migrations that were already on main", async () => {
    // "It works from zero" and "it works on top of what production has" are
    // different claims. This checks the second one, by replaying the files.
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const index = dirs.indexOf(THIS_MIGRATION);
    expect(
      index,
      "this branch's migration must be in the chain",
    ).toBeGreaterThan(-1);
    const baseline = dirs.slice(0, index);
    // It is also the LAST one: a migration that lands before somebody else's
    // would change the order they run in on a box that has neither.
    expect(dirs.slice(index)).toEqual([THIS_MIGRATION]);
    expect(baseline).toHaveLength(62);

    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${BASELINE_DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${BASELINE_DB}" TEMPLATE template0`);
    await admin.end();

    const baselinePool = new Pool({
      connectionString: withDatabase(base as string, BASELINE_DB),
    });
    try {
      for (const dir of baseline) {
        await baselinePool.query(
          readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"),
        );
      }
      const before = await baselinePool.query(
        `SELECT count(*)::int AS n FROM pg_tables
          WHERE schemaname='public' AND tablename LIKE 'Circle%'`,
      );
      expect(before.rows[0].n, "the baseline has no Círculos table").toBe(0);

      await baselinePool.query(
        readFileSync(
          join(MIGRATIONS_DIR, THIS_MIGRATION, "migration.sql"),
          "utf8",
        ),
      );

      const after = await baselinePool.query(
        `SELECT tablename FROM pg_tables
          WHERE schemaname='public' AND tablename LIKE 'Circle%' ORDER BY 1`,
      );
      expect(after.rows.map((r) => r.tablename)).toEqual([
        "Circle",
        "CircleActivity",
        "CircleActivityParticipant",
        "CircleArtifact",
        "CircleEvent",
        "CircleGuestSession",
        "CircleInvitation",
        "CircleMember",
      ]);
    } finally {
      await baselinePool.end().catch(() => undefined);
    }
  }, 240_000);

  it("is strictly additive — it drops and alters nothing", () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, THIS_MIGRATION, "migration.sql"),
      "utf8",
    );
    // Read from the file rather than from a summary of it: a `DROP` added
    // tomorrow has to get past this line.
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"));
    for (const line of statements) {
      expect(line, line).not.toMatch(
        /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)\b/i,
      );
      expect(line, line).not.toMatch(/\bALTER\s+COLUMN\b/i);
      expect(line, line).not.toMatch(/\bRENAME\b/i);
    }
    // Every ALTER TABLE it does contain targets a Círculos table.
    for (const match of sql.matchAll(/ALTER TABLE "(\w+)"/g)) {
      expect(match[1], match[0]).toMatch(/^Circle/);
    }
  });

  // ── Shape: what the schema refuses to hold ────────────────────────────────

  it("has nowhere to put a private draft", () => {
    // The privacy posture in one query: no column in any Círculos table is
    // named for a draft, a private response or a preparation answer.
    return pool
      .query(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name LIKE 'Circle%'`,
      )
      .then(({ rows }) => {
        for (const { table_name, column_name } of rows) {
          expect(
            String(column_name),
            `${table_name}.${column_name}`,
          ).not.toMatch(
            /draft|privateResponse|privateAnswer|preparation|answerText/i,
          );
        }
      });
  });

  it("has no free-text column on the event ledger", async () => {
    // An event records THAT something happened. `metadata` is JSON and capped;
    // everything else is an id or an enum.
    const { rows } = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='CircleEvent'`,
    );
    const textish = rows
      .filter((r) =>
        ["text", "character varying"].includes(String(r.data_type)),
      )
      .map((r) => String(r.column_name));
    // Only identifiers survive: no `reason`, no `note`, no `comment`.
    expect(textish.sort()).toEqual([
      "activityId",
      "actorParticipantId",
      "actorUserId",
      "circleId",
      "id",
      "idempotencyKey",
    ]);
  });

  // ── Invitations: hashes only, once, and never past their date ─────────────

  it("refuses a raw token where a hash belongs", async () => {
    const raw = mintInvitationToken().raw;
    const refusal = await refusalOf(() =>
      insertInvitation({ id: "inv-raw-token", tokenHash: raw }),
    );
    expect(refusal.code).toBe("23514"); // check_violation
    expect(refusal.constraint).toBe("CircleInvitation_token_hash_is_sha256");
  });

  it("refuses a raw code where a hash belongs", async () => {
    const refusal = await refusalOf(() =>
      insertInvitation({
        id: "inv-raw-code",
        tokenHash: fakeHash(1),
        codeHash: "K7M2PQ4XR9TB",
      }),
    );
    expect(refusal.code).toBe("23514");
    expect(refusal.constraint).toBe("CircleInvitation_code_hash_is_sha256");
  });

  it("refuses two invitations sharing a token hash", async () => {
    await insertInvitation({ id: "inv-dup-a", tokenHash: fakeHash(2) });
    const refusal = await refusalOf(() =>
      insertInvitation({ id: "inv-dup-b", tokenHash: fakeHash(2) }),
    );
    expect(refusal.code).toBe("23505"); // unique_violation
  });

  it("refuses two invitations sharing a code hash", async () => {
    await insertInvitation({
      id: "inv-dupcode-a",
      tokenHash: fakeHash(3),
      codeHash: fakeHash(4),
    });
    const refusal = await refusalOf(() =>
      insertInvitation({
        id: "inv-dupcode-b",
        tokenHash: fakeHash(5),
        codeHash: fakeHash(4),
      }),
    );
    expect(refusal.code).toBe("23505");
  });

  it("refuses an invitation that expires before it was created", async () => {
    const refusal = await refusalOf(() =>
      insertInvitation({
        id: "inv-backwards",
        tokenHash: fakeHash(6),
        createdAt: new Date(),
        expiresAt: past(),
      }),
    );
    expect(refusal.constraint).toBe("CircleInvitation_expires_after_creation");
  });

  it("refuses an invitation that is accepted without being consumed", async () => {
    const refusal = await refusalOf(() =>
      insertInvitation({
        id: "inv-halfstate",
        tokenHash: fakeHash(7),
        acceptedAt: new Date(),
        consumedAt: null,
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleInvitation_accepted_implies_consumed",
    );
  });

  it("allows at most one live invitation per activity", async () => {
    // Two open links into the same Dúo seat is two people racing for one chair.
    await newActivity("act-one-live");
    await insertInvitation({
      id: "inv-live-a",
      activityId: "act-one-live",
      tokenHash: fakeHash(8),
    });
    const refusal = await refusalOf(() =>
      insertInvitation({
        id: "inv-live-b",
        activityId: "act-one-live",
        tokenHash: fakeHash(9),
      }),
    );
    expect(refusal.code).toBe("23505");

    // Once the first is consumed it is no longer live, and a replacement fits.
    await pool.query(
      `UPDATE "CircleInvitation" SET "consumedAt"=now() WHERE id='inv-live-a'`,
    );
    await insertInvitation({
      id: "inv-live-c",
      activityId: "act-one-live",
      tokenHash: fakeHash(10),
    });
  });

  // ── Participants: exactly one identity, whole envelopes ───────────────────

  it("refuses a participant that is both a member and an invitee", async () => {
    await insertInvitation({ id: "inv-both", tokenHash: fakeHash(11) });
    const refusal = await refusalOf(() =>
      insertParticipant({
        id: "p-both",
        memberId: MEMBER,
        invitationId: "inv-both",
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_exactly_one_identity",
    );
  });

  it("refuses a participant that is neither", async () => {
    const refusal = await refusalOf(() =>
      insertParticipant({ id: "p-neither" }),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_exactly_one_identity",
    );
  });

  it("refuses a half-written snapshot", async () => {
    const refusal = await refusalOf(() =>
      insertParticipant({
        id: "p-half",
        memberId: MEMBER,
        ciphertext: "not-really-ciphertext",
        nonce: null,
        keyVersion: 1,
        readyAt: new Date(),
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_snapshot_all_or_nothing",
    );
  });

  it("refuses READY without a snapshot", async () => {
    const refusal = await refusalOf(() =>
      insertParticipant({
        id: "p-ready-empty",
        memberId: MEMBER,
        status: "READY",
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_ready_has_snapshot",
    );
  });

  // ── Guest sessions: pinned to one activity, structurally ──────────────────

  it("refuses a guest session pointing at another activity's participant", async () => {
    // The whole scoping story in one refusal. Without the composite key,
    // `activityId` would be a denormalised column two writers could disagree
    // about — and the actor is built from it.
    await insertInvitation({ id: "inv-scope", tokenHash: fakeHash(12) });
    await insertParticipant({
      id: "p-other-activity",
      activityId: OTHER_ACTIVITY,
      invitationId: "inv-scope",
    });
    const refusal = await refusalOf(() =>
      insertGuestSession({
        id: "gs-crossed",
        invitationId: "inv-scope",
        activityId: ACTIVITY, // …but the participant lives in OTHER_ACTIVITY.
        participantId: "p-other-activity",
        tokenHash: fakeHash(13),
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleGuestSession_participant_in_same_activity",
    );
    expect(refusal.code).toBe("23503"); // foreign_key_violation
  });

  it("refuses a raw guest secret where a hash belongs", async () => {
    const activityId = await newActivity();
    await insertInvitation({
      id: "inv-gs-raw",
      activityId,
      tokenHash: fakeHash(14),
    });
    await insertParticipant({
      id: "p-gs-raw",
      activityId,
      invitationId: "inv-gs-raw",
    });
    const refusal = await refusalOf(() =>
      insertGuestSession({
        id: "gs-raw",
        invitationId: "inv-gs-raw",
        activityId,
        participantId: "p-gs-raw",
        tokenHash: mintInvitationToken().raw,
      }),
    );
    expect(refusal.constraint).toBe("CircleGuestSession_token_hash_is_sha256");
  });

  // ── The template pin ──────────────────────────────────────────────────────

  it("refuses to re-point a running activity at a different template", async () => {
    const refusal = await refusalOf(() =>
      pool.query(
        `UPDATE "CircleActivity" SET "templateKey"='something-else' WHERE id=$1`,
        [ACTIVITY],
      ),
    );
    expect(refusal.message).toContain("CIRCLE_ACTIVITY_PIN_IMMUTABLE");

    const bumped = await refusalOf(() =>
      pool.query(
        `UPDATE "CircleActivity" SET "templateVersion"=2 WHERE id=$1`,
        [ACTIVITY],
      ),
    );
    expect(bumped.message).toContain("CIRCLE_ACTIVITY_PIN_IMMUTABLE");

    // Everything else about the row still updates.
    await pool.query(
      `UPDATE "CircleActivity" SET "followUpDueAt"=now() WHERE id=$1`,
      [ACTIVITY],
    );
  });

  // ── Membership ────────────────────────────────────────────────────────────

  it("allows one ACTIVE membership per person per circle, and rejoining", async () => {
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleMember" ("id","circleId","userId","role","status")
         VALUES ('m-dup',$1,$2,'MEMBER','ACTIVE')`,
        [CIRCLE, U1],
      ),
    );
    expect(refusal.code).toBe("23505");

    // A LEFT row does not occupy the slot, so leaving and being invited back
    // stays possible without deleting history.
    await pool.query(
      `INSERT INTO "CircleMember" ("id","circleId","userId","role","status","leftAt")
       VALUES ('m-left',$1,$2,'MEMBER','LEFT',now())`,
      [CIRCLE, U1],
    );
  });

  // ── The event ledger as a receipt ─────────────────────────────────────────

  it("refuses an event with two actors", async () => {
    await insertInvitation({ id: "inv-ev", tokenHash: fakeHash(15) });
    await insertParticipant({ id: "p-ev", invitationId: "inv-ev" });
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent"
           ("id","circleId","activityId","type","actorUserId","actorParticipantId")
         VALUES ('ev-two',$1,$2,'ACTIVITY_CREATED',$3,'p-ev')`,
        [CIRCLE, ACTIVITY, U1],
      ),
    );
    expect(refusal.constraint).toBe("CircleEvent_at_most_one_actor");
  });

  it("refuses metadata large enough to hold prose", async () => {
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","type","metadata")
         VALUES ('ev-big',$1,'ACTIVITY_CREATED',$2::jsonb)`,
        [CIRCLE, JSON.stringify({ smuggled: "x".repeat(4000) })],
      ),
    );
    expect(refusal.constraint).toBe("CircleEvent_metadata_is_small");
  });

  it("makes a replayed command a NOOP through a unique index, not a read", async () => {
    const first = await events.append({
      circleId: CIRCLE,
      activityId: ACTIVITY,
      type: "INVITATION_CREATED",
      actorUserId: U1,
      idempotencyKey: "receipt-key-1",
    });
    expect(first.outcome).toBe("APPENDED");

    const replay = await events.append({
      circleId: CIRCLE,
      activityId: ACTIVITY,
      type: "INVITATION_CREATED",
      actorUserId: U1,
      idempotencyKey: "receipt-key-1",
    });
    expect(replay.outcome).toBe("REPLAY");

    // A different command with the same key is a different receipt.
    const other = await events.append({
      circleId: CIRCLE,
      activityId: ACTIVITY,
      type: "ACTIVITY_CREATED",
      actorUserId: U1,
      idempotencyKey: "receipt-key-1",
    });
    expect(other.outcome).toBe("APPENDED");

    // And events without a key are never deduplicated: the partial indexes are
    // `WHERE "idempotencyKey" IS NOT NULL`, so an unkeyed event is a plain
    // append every time rather than silently colliding with its predecessor.
    for (let i = 0; i < 2; i += 1) {
      const r = await events.append({
        circleId: CIRCLE,
        type: "ACTIVITY_CREATED",
        actorUserId: U1,
      });
      expect(r.outcome).toBe("APPENDED");
    }
  });

  // ── Concurrency: the part a single-threaded test cannot show ──────────────

  it("lets exactly one of two simultaneous exchanges win", async () => {
    await newActivity("act-race");
    const minted = await service.mintInvitation({
      circleId: CIRCLE,
      activityId: "act-race",
      createdByMemberId: MEMBER,
    });

    const results = await Promise.allSettled([
      service.exchange(minted.rawToken),
      service.exchange(minted.rawToken),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // The loser gets the SAME answer as somebody who guessed a token that never
    // existed. Losing a race is not a distinguishable outcome.
    const reason = (lost[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(CirclesError);
    expect((reason as CirclesError).code).toBe("CIRCLE_INVITATION_UNUSABLE");

    // And exactly one guest session exists for that activity.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleGuestSession" WHERE "activityId"='act-race'`,
    );
    expect(rows[0].n).toBe(1);
  }, 30_000);

  it("refuses a duplicate hash even when both inserts race", async () => {
    const hash = fakeHash(42);
    // Distinct activities, so the ONLY thing the two rows have in common is the
    // hash — otherwise a pass could come from the one-live-per-activity index.
    const [a, b] = [await newActivity(), await newActivity()];
    const results = await Promise.allSettled([
      insertInvitation({ id: "inv-race-a", activityId: a, tokenHash: hash }),
      insertInvitation({ id: "inv-race-b", activityId: b, tokenHash: hash }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason.code).toBe("23505");
  });

  // ── The service, end to end, against the real thing ───────────────────────

  it("stores only hashes, and returns the raw secret exactly once", async () => {
    await newActivity("act-mint");
    const minted = await service.mintInvitation({
      circleId: CIRCLE,
      activityId: "act-mint",
      createdByMemberId: MEMBER,
    });
    expect(minted.rawCode).not.toBeNull();

    const { rows } = await pool.query(
      `SELECT "tokenHash","codeHash" FROM "CircleInvitation" WHERE id=$1`,
      [minted.invitationId],
    );
    expect(rows[0].tokenHash).toBe(hashSecret(minted.rawToken));
    expect(rows[0].codeHash).toBe(hashSecret(minted.rawCode as string));

    // The raw values appear NOWHERE in the row, in any column.
    const dump = await pool.query(
      `SELECT to_jsonb(i) AS row FROM "CircleInvitation" i WHERE id=$1`,
      [minted.invitationId],
    );
    const serialized = JSON.stringify(dump.rows[0].row);
    expect(serialized).not.toContain(minted.rawToken);
    expect(serialized).not.toContain(minted.rawCode);
  });

  it("accepts the short code as well as the link token", async () => {
    await newActivity("act-code");
    const minted = await service.mintInvitation({
      circleId: CIRCLE,
      activityId: "act-code",
      createdByMemberId: MEMBER,
    });
    // Typed the way a person would: lowercase, with a separator.
    const typed = (minted.rawCode as string)
      .toLowerCase()
      .replace(/(.{4})/g, "$1-");
    await expect(service.inspect(typed)).resolves.toBe(true);
    const session = await service.exchange(typed);
    expect(session.rawGuestToken).toBeTruthy();
  });

  it("does not spend an invitation when it is merely inspected", async () => {
    await newActivity("act-inspect");
    const minted = await service.mintInvitation({
      circleId: CIRCLE,
      activityId: "act-inspect",
      createdByMemberId: MEMBER,
    });

    // Opening a link twice, a prefetch, a link scanner in a messaging app.
    await expect(service.inspect(minted.rawToken)).resolves.toBe(true);
    await expect(service.inspect(minted.rawToken)).resolves.toBe(true);

    const { rows } = await pool.query(
      `SELECT "consumedAt","acceptedAt" FROM "CircleInvitation" WHERE id=$1`,
      [minted.invitationId],
    );
    expect(rows[0].consumedAt).toBeNull();
    expect(rows[0].acceptedAt).toBeNull();

    // Acceptance, when it happens, is the separate act.
    await service.exchange(minted.rawToken);
    const after = await pool.query(
      `SELECT "consumedAt" FROM "CircleInvitation" WHERE id=$1`,
      [minted.invitationId],
    );
    expect(after.rows[0].consumedAt).not.toBeNull();
  });

  it("answers identically for missing, expired, used, declined and revoked", async () => {
    const codes: string[] = [];
    const collect = async (secret: string) => {
      try {
        await service.inspect(secret);
        codes.push("RESOLVED");
      } catch (err) {
        codes.push((err as CirclesError).code);
      }
    };

    // Never existed.
    await collect(mintInvitationToken().raw);
    // Structurally impossible.
    await collect("!!!");

    const scenarios: Array<[string, string]> = [
      [
        "exp",
        `UPDATE "CircleInvitation" SET "createdAt"=now() - interval '2 days', "expiresAt"=now() - interval '1 day' WHERE id=$1`,
      ],
      ["used", `UPDATE "CircleInvitation" SET "consumedAt"=now() WHERE id=$1`],
      [
        "declined",
        `UPDATE "CircleInvitation" SET "declinedAt"=now() WHERE id=$1`,
      ],
      [
        "revoked",
        `UPDATE "CircleInvitation" SET "revokedAt"=now() WHERE id=$1`,
      ],
    ];
    for (const [tag, sql] of scenarios) {
      const activityId = `act-uniform-${tag}`;
      await newActivity(activityId);
      const minted = await service.mintInvitation({
        circleId: CIRCLE,
        activityId,
        createdByMemberId: MEMBER,
      });
      await pool.query(sql, [minted.invitationId]);
      await collect(minted.rawToken);
    }

    // Six causes, one answer. If any of these ever diverges, the divergence is
    // an oracle: it tells a guesser their value was structurally right.
    expect(new Set(codes)).toEqual(new Set(["CIRCLE_INVITATION_UNUSABLE"]));
    expect(codes).toHaveLength(6);
  }, 30_000);

  it("binds the guest session to the one activity and seat it was minted for", async () => {
    await newActivity("act-bind");
    const minted = await service.mintInvitation({
      circleId: CIRCLE,
      activityId: "act-bind",
      createdByMemberId: MEMBER,
    });
    const session = await service.exchange(minted.rawToken);

    const row = await guestSessions.findByTokenHash(
      hashSecret(session.rawGuestToken),
    );
    expect(row).not.toBeNull();
    expect(row?.activityId).toBe("act-bind");
    expect(row?.participantId).toBe(minted.participantId);

    // The seat moved to ACCEPTED, and it is still the only one for the seat.
    const seats = await pool.query(
      `SELECT "status" FROM "CircleActivityParticipant" WHERE "activityId"='act-bind'`,
    );
    expect(seats.rows.map((r) => r.status)).toEqual(["ACCEPTED"]);

    // Revoking bites on the next read, because the read is the authority.
    await guestSessions.revoke(row?.id as string, new Date());
    const after = await guestSessions.findByTokenHash(
      hashSecret(session.rawGuestToken),
    );
    expect(after?.revokedAt).not.toBeNull();
  }, 30_000);
});
