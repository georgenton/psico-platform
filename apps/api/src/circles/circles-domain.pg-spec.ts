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
import { CircleMemberRepository } from "./circle-member.repository";
import type { CircleMemberDb } from "./circle-member.repository";
import { CirclesService } from "./circles.service";
import { CirclesRolloutService } from "./circles-rollout.service";
import { resolveCirclesRolloutConfig } from "./circles-rollout";
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
const U2 = "u-circles-other";
const CIRCLE = "c-circles-one";
/** Somebody else's circle. Every cross-aggregate case points at this one. */
const OTHER_CIRCLE = "c-circles-two";
const MEMBER = "m-circles-one";
const OTHER_MEMBER = "m-circles-two";
const OTHER_ACTIVITY_IN_OTHER_CIRCLE = "act-circles-other-circle";
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
  let members: CircleMemberRepository;
  let service: CirclesService;

  /**
   * A service wired to a specific rollout posture, over the SAME database.
   *
   * The pilot gate is a property of the service, not of the rows, so the only
   * honest way to test it is to build a second service with a different
   * allowlist and point it at the same invitations.
   */
  const serviceWith = (mode: string, allowlist?: string) =>
    new CirclesService(
      prisma as unknown as ConstructorParameters<typeof CirclesService>[0],
      invitations,
      guestSessions,
      events,
      members,
      new CirclesRolloutService(
        resolveCirclesRolloutConfig({
          CIRCLES_ROLLOUT_MODE: mode,
          CIRCLES_PILOT_USER_IDS: allowlist,
        }),
      ),
    );

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
    circleId?: string;
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
         ("id","circleId","activityId","memberId","invitationId","status",
          "ciphertext","nonce","keyVersion","readyAt","withdrawnAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6::"CircleParticipantStatus",$7,$8,$9,$10,$11,now())`,
      [
        cols.id,
        cols.circleId ?? CIRCLE,
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
    members = new CircleMemberRepository(prisma);
    // The default service runs under `on`: the pilot gate has its own block.
    service = serviceWith("on");

    await prisma.user.createMany({
      data: [
        { id: U1, email: "circles-owner@test.local", name: "Circles Owner" },
        { id: U2, email: "circles-other@test.local", name: "Circles Other" },
      ],
    });
    await pool.query(
      `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
       VALUES ($1,'DUO','ACTIVE',$2,2,now())`,
      [CIRCLE, U1],
    );
    await pool.query(
      `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
       VALUES ($1,'DUO','ACTIVE',$2,2,now())`,
      [OTHER_CIRCLE, U2],
    );
    await pool.query(
      `INSERT INTO "CircleMember" ("id","circleId","userId","role","status")
       VALUES ($1,$2,$3,'ORGANIZER','ACTIVE')`,
      [MEMBER, CIRCLE, U1],
    );
    await pool.query(
      `INSERT INTO "CircleMember" ("id","circleId","userId","role","status")
       VALUES ($1,$2,$3,'ORGANIZER','ACTIVE')`,
      [OTHER_MEMBER, OTHER_CIRCLE, U2],
    );
    await pool.query(
      `INSERT INTO "CircleActivity"
         ("id","circleId","templateKey","templateVersion","status",
          "requiredParticipants","updatedAt")
       VALUES ($1,$2,'fixture-duo-template',1,'INVITING',2,now())`,
      [OTHER_ACTIVITY_IN_OTHER_CIRCLE, OTHER_CIRCLE],
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
      /**
       * Everything in `public`, so "unchanged" means unchanged.
       *
       * The `::text` casts are load-bearing: `pg_tables.tablename` is `name`,
       * and node-pg has no parser for `name[]` — the column would arrive as a
       * raw string and every array comparison below would quietly become a
       * string comparison that passes for the wrong reason.
       */
      const snapshot = async () => {
        const { rows } = await baselinePool.query(
          `SELECT
             (SELECT array_agg(tablename::text ORDER BY tablename)
                FROM pg_tables WHERE schemaname='public') AS tables,
             (SELECT array_agg(t.typname::text ORDER BY t.typname)
                FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
               WHERE n.nspname='public' AND t.typtype='e') AS enums,
             (SELECT array_agg(p.proname::text ORDER BY p.proname)
                FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public') AS functions`,
        );
        return rows[0] as {
          tables: string[];
          enums: string[];
          functions: string[] | null;
        };
      };

      const beforeState = await snapshot();
      expect(
        beforeState.tables.filter((t) => t.startsWith("Circle")),
        "the baseline has no Círculos table",
      ).toEqual([]);

      await baselinePool.query(
        readFileSync(
          join(MIGRATIONS_DIR, THIS_MIGRATION, "migration.sql"),
          "utf8",
        ),
      );

      const afterState = await snapshot();
      expect(afterState.tables.filter((t) => t.startsWith("Circle"))).toEqual([
        "Circle",
        "CircleActivity",
        "CircleActivityParticipant",
        "CircleArtifact",
        "CircleEvent",
        "CircleGuestSession",
        "CircleInvitation",
        "CircleMember",
      ]);
      // Additive means additive: not one pre-existing table disappeared and not
      // one pre-existing enum changed.
      expect(afterState.tables).toEqual(
        expect.arrayContaining(beforeState.tables),
      );
      expect(afterState.enums).toEqual(
        expect.arrayContaining(beforeState.enums),
      );

      // ── The logical rollback ─────────────────────────────────────────────
      //
      // Prisma writes no DOWN migration, so "we can roll this back" would
      // otherwise be a claim with nothing behind it. Here it is exercised, on a
      // database this test created and will drop — never on a persistent one.
      //
      // Dropping only what the migration added has to leave the baseline EXACTLY
      // as it was. If the migration had quietly altered something pre-existing,
      // this comparison is where it would show up, because undoing the additions
      // would not undo that.
      await baselinePool.query(`
        DROP TABLE IF EXISTS
          "CircleEvent", "CircleArtifact", "CircleGuestSession",
          "CircleActivityParticipant", "CircleActivity", "CircleInvitation",
          "CircleMember", "Circle" CASCADE;
        DROP FUNCTION IF EXISTS "circle_activity_pin_is_immutable"() CASCADE;
        DROP FUNCTION IF EXISTS "circle_event_is_append_only"() CASCADE;
        DROP TYPE IF EXISTS
          "CircleEventType", "CircleFollowUpDecision", "CircleArtifactStatus",
          "CircleArtifactKind", "CircleSharingMode", "CircleParticipantStatus",
          "CircleActivityStatus", "CircleMemberStatus", "CircleMemberRole",
          "CircleStatus", "CircleKind";
      `);

      const rolledBack = await snapshot();
      expect(rolledBack.tables).toEqual(beforeState.tables);
      expect(rolledBack.enums).toEqual(beforeState.enums);
      expect(rolledBack.functions).toEqual(beforeState.functions);
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

  it("gives each identity exactly one seat per activity", async () => {
    const activityId = await newActivity();
    await insertParticipant({ id: "p-seat-a", activityId, memberId: MEMBER });
    const twice = await refusalOf(() =>
      insertParticipant({ id: "p-seat-b", activityId, memberId: MEMBER }),
    );
    expect(twice.code).toBe("23505");

    await insertInvitation({
      id: "inv-seat",
      activityId,
      tokenHash: fakeHash(30),
    });
    await insertParticipant({
      id: "p-seat-guest",
      activityId,
      invitationId: "inv-seat",
    });
    const guestTwice = await refusalOf(() =>
      insertParticipant({
        id: "p-seat-guest-2",
        activityId,
        invitationId: "inv-seat",
      }),
    );
    expect(guestTwice.code).toBe("23505");
  });

  // ── The remaining CHECKs, named one by one ────────────────────────────────
  //
  // Written as a table because the interesting thing about each is the same:
  // the DATABASE refuses it. `Circle_kind_duo_only` is deliberately absent —
  // `CircleKind` has exactly one value today, so there is no second value to
  // insert, and the CHECK exists for the day somebody adds one. That is a
  // constraint whose test is the enum itself.

  it.each([
    [
      "a DUO circle with room for three",
      "Circle_duo_two_participants",
      () =>
        pool.query(
          `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
           VALUES ('c-three','DUO','ACTIVE',$1,3,now())`,
          [U1],
        ),
    ],
    [
      "a CLOSED circle with no closing time",
      "Circle_closed_has_timestamp",
      () =>
        pool.query(
          `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
           VALUES ('c-closed','DUO','CLOSED',$1,2,now())`,
          [U1],
        ),
    ],
    [
      "a member who LEFT at no particular time",
      "CircleMember_left_has_timestamp",
      () =>
        pool.query(
          `INSERT INTO "CircleMember" ("id","circleId","userId","role","status")
           VALUES ('m-left-nots',$1,$2,'MEMBER','LEFT')`,
          [CIRCLE, U1],
        ),
    ],
    [
      "an activity pinned to template version zero",
      "CircleActivity_template_version_positive",
      () =>
        pool.query(
          `INSERT INTO "CircleActivity"
             ("id","circleId","templateKey","templateVersion","status",
              "requiredParticipants","updatedAt")
           VALUES ('act-v0',$1,'fixture-duo-template',0,'INVITING',2,now())`,
          [CIRCLE],
        ),
    ],
    [
      "a shared activity that requires one participant",
      "CircleActivity_required_participants_exactly_two",
      () =>
        pool.query(
          `INSERT INTO "CircleActivity"
             ("id","circleId","templateKey","templateVersion","status",
              "requiredParticipants","updatedAt")
           VALUES ('act-solo',$1,'fixture-duo-template',1,'INVITING',1,now())`,
          [CIRCLE],
        ),
    ],
    [
      "a REVEALED activity with no reveal time",
      "CircleActivity_revealed_has_timestamp",
      () =>
        pool.query(
          `INSERT INTO "CircleActivity"
             ("id","circleId","templateKey","templateVersion","status",
              "requiredParticipants","updatedAt")
           VALUES ('act-revealed',$1,'fixture-duo-template',1,'REVEALED',2,now())`,
          [CIRCLE],
        ),
    ],
    [
      "a CANCELLED activity with no cancellation time",
      "CircleActivity_cancelled_has_timestamp",
      () =>
        pool.query(
          `INSERT INTO "CircleActivity"
             ("id","circleId","templateKey","templateVersion","status",
              "requiredParticipants","updatedAt")
           VALUES ('act-cancelled',$1,'fixture-duo-template',1,'CANCELLED',2,now())`,
          [CIRCLE],
        ),
    ],
  ])("refuses %s", async (_label, constraint, insert) => {
    const refusal = await refusalOf(insert);
    expect(refusal.constraint).toBe(constraint);
  });

  // ── Artifacts: one live result, versions that only go up ──────────────────

  it("keeps one active artifact per activity, versioned monotonically", async () => {
    const activityId = await newActivity();
    await insertParticipant({
      id: "p-artifact",
      activityId,
      memberId: MEMBER,
    });
    const artifact = (id: string, version: number, status: string) =>
      pool.query(
        `INSERT INTO "CircleArtifact"
           ("id","activityId","version","kind","status","ciphertext","nonce",
            "keyVersion","createdByParticipantId","updatedAt","agreedAt")
         VALUES ($1,$2,$3,'AGREEMENT',$4::"CircleArtifactStatus",'ct','nonce',1,
                 'p-artifact',now(),$5)`,
        [
          id,
          activityId,
          version,
          status,
          status === "AGREED" ? new Date() : null,
        ],
      );

    await artifact("art-1", 1, "PROPOSED");

    // A second live artifact would make "the result of this activity" ambiguous.
    const second = await refusalOf(() => artifact("art-2", 2, "PROPOSED"));
    expect(second.code).toBe("23505");

    // Superseding the first frees the slot; the version has to move forward.
    await pool.query(
      `UPDATE "CircleArtifact" SET "status"='SUPERSEDED' WHERE id='art-1'`,
    );
    await artifact("art-3", 2, "AGREED");
    const reused = await refusalOf(() => artifact("art-4", 2, "PROPOSED"));
    expect(reused.code).toBe("23505");

    const zero = await refusalOf(() => artifact("art-0", 0, "PROPOSED"));
    expect(zero.constraint).toBe("CircleArtifact_version_positive");

    const unagreed = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleArtifact"
           ("id","activityId","version","kind","status","ciphertext","nonce",
            "keyVersion","createdByParticipantId","updatedAt","agreedAt")
         VALUES ('art-5',$1,9,'AGREEMENT','AGREED','ct','nonce',1,'p-artifact',
                 now(),NULL)`,
        [activityId],
      ),
    );
    expect(unagreed.constraint).toBe("CircleArtifact_agreed_has_timestamp");
  });

  // ── Guest sessions: pinned to one activity, structurally ──────────────────

  /**
   * Two whole, internally consistent activities. Building the cross-activity
   * cases needs them, because the seat-to-invitation composite key now refuses
   * the shortcut of pointing one seat at another activity's invitation — which
   * is itself the improvement, and is asserted separately below.
   */
  const twoConsistentActivities = async () => {
    const seq = 500 + activitySeq * 10;
    const a = await newActivity();
    const b = await newActivity();
    await insertInvitation({
      id: `inv-a-${seq}`,
      activityId: a,
      tokenHash: fakeHash(seq + 1),
    });
    await insertInvitation({
      id: `inv-b-${seq}`,
      activityId: b,
      tokenHash: fakeHash(seq + 2),
    });
    await insertParticipant({
      id: `p-a-${seq}`,
      activityId: a,
      invitationId: `inv-a-${seq}`,
    });
    await insertParticipant({
      id: `p-b-${seq}`,
      activityId: b,
      invitationId: `inv-b-${seq}`,
    });
    return {
      a,
      b,
      invA: `inv-a-${seq}`,
      invB: `inv-b-${seq}`,
      seatA: `p-a-${seq}`,
      seatB: `p-b-${seq}`,
      seq,
    };
  };

  it("refuses a guest session whose invitation belongs elsewhere", async () => {
    // The seat is right and the invitation is wrong. That combination has to be
    // refused on its own: otherwise a session could be minted from a link into
    // a different activity, and the actor built from it would be scoped to a
    // world it does not live in.
    const w = await twoConsistentActivities();
    const refusal = await refusalOf(() =>
      insertGuestSession({
        id: `gs-wrong-inv-${w.seq}`,
        invitationId: w.invB,
        activityId: w.a,
        participantId: w.seatA,
        tokenHash: fakeHash(w.seq + 3),
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleGuestSession_invitationId_activityId_fkey",
    );
    expect(refusal.code).toBe("23503");
  });

  it("refuses a guest session pointing at another activity's participant", async () => {
    // And the mirror: the invitation is right and the seat is wrong. Without
    // these two keys, `activityId` would be a denormalised column two writers
    // could disagree about — and the guest actor is built from it.
    const w = await twoConsistentActivities();
    const refusal = await refusalOf(() =>
      insertGuestSession({
        id: `gs-wrong-seat-${w.seq}`,
        invitationId: w.invA,
        activityId: w.a,
        participantId: w.seatB,
        tokenHash: fakeHash(w.seq + 4),
      }),
    );
    expect(refusal.code).toBe("23503"); // foreign_key_violation
    expect(refusal.constraint).toBe(
      "CircleGuestSession_participantId_activityId_fkey",
    );
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
    const activityId = await newActivity();
    await insertInvitation({
      id: "inv-ev",
      activityId,
      tokenHash: fakeHash(15),
    });
    await insertParticipant({ id: "p-ev", activityId, invitationId: "inv-ev" });
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent"
           ("id","circleId","activityId","type","actorUserId","actorParticipantId")
         VALUES ('ev-two',$1,$2,'ACTIVITY_CREATED',$3,'p-ev')`,
        [CIRCLE, activityId, U1],
      ),
    );
    expect(refusal.constraint).toBe("CircleEvent_at_most_one_actor");
  });

  // ── The metadata grammar ──────────────────────────────────────────────────
  //
  // The old constraint capped `length(metadata::text)` at 2 kB and called that
  // a guarantee. 2 kB is several paragraphs, and every case below fits inside
  // it comfortably — which is exactly why a size cap was never the guarantee it
  // looked like.

  it.each([
    ["a bare string", "ACTIVITY_CREATED", JSON.stringify("una respuesta")],
    [
      "an answer under a plausible key",
      "ACTIVITY_CREATED",
      JSON.stringify({ hasCode: true, note: "me senti sola esa semana" }),
    ],
    [
      "an unknown key on its own",
      "INVITATION_CREATED",
      JSON.stringify({ reason: "porque si" }),
    ],
    [
      "the right key with the wrong type",
      "INVITATION_CREATED",
      JSON.stringify({ hasCode: "true" }),
    ],
    [
      "an extra key alongside the right one",
      "INVITATION_CREATED",
      JSON.stringify({ hasCode: true, extra: 1 }),
    ],
    [
      "a nested object",
      "INVITATION_CREATED",
      JSON.stringify({ hasCode: { value: true } }),
    ],
    ["an array", "INVITATION_CREATED", JSON.stringify([{ hasCode: true }])],
    [
      "metadata on a type that takes none",
      "GUEST_SESSION_CREATED",
      JSON.stringify({ hasCode: true }),
    ],
    ["a number", "ACTIVITY_CREATED", "1"],
  ])("refuses %s as metadata", async (label, type, metadata) => {
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","type","metadata")
         VALUES ($1,$2,$3::"CircleEventType",$4::jsonb)`,
        [`ev-meta-${label.replace(/[^a-z]+/gi, "-")}`, CIRCLE, type, metadata],
      ),
    );
    expect(refusal.constraint).toBe("CircleEvent_metadata_closed_grammar");
  });

  it("refuses INVITATION_CREATED carrying no metadata at all", async () => {
    // The trap this constraint is written around: a CHECK whose expression
    // evaluates to NULL PASSES. `metadata IN (...)` on its own would have
    // admitted a null here, and the grammar would have had a hole in it from
    // the first day.
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","type","metadata")
         VALUES ('ev-meta-missing',$1,'INVITATION_CREATED',NULL)`,
        [CIRCLE],
      ),
    );
    expect(refusal.constraint).toBe("CircleEvent_metadata_closed_grammar");
  });

  it("accepts exactly the two values the grammar names", async () => {
    for (const [i, hasCode] of [true, false].entries()) {
      await pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","type","metadata")
         VALUES ($1,$2,'INVITATION_CREATED',$3::jsonb)`,
        [`ev-meta-ok-${i}`, CIRCLE, JSON.stringify({ hasCode })],
      );
    }
    await pool.query(
      `INSERT INTO "CircleEvent" ("id","circleId","type","metadata")
       VALUES ('ev-meta-ok-null',$1,'ACTIVITY_CREATED',NULL)`,
      [CIRCLE],
    );
  });

  it("makes a replayed command a NOOP through a unique index, not a read", async () => {
    const first = await events.append({
      circleId: CIRCLE,
      activityId: ACTIVITY,
      type: "INVITATION_CREATED",
      actorUserId: U1,
      idempotencyKey: "receipt-key-1",
      metadata: { hasCode: true },
    });
    expect(first.outcome).toBe("APPENDED");

    const replay = await events.append({
      circleId: CIRCLE,
      activityId: ACTIVITY,
      type: "INVITATION_CREATED",
      actorUserId: U1,
      idempotencyKey: "receipt-key-1",
      metadata: { hasCode: true },
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

  // ═══════════════════════════════════════════════════════════════════════
  // Aggregate integrity — no row may name two worlds at once
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Nine relationships span two rows that must agree about which circle or
  // which activity they belong to. Each is a composite foreign key, and each
  // gets a case here that goes around Prisma entirely: raw SQL, so what refuses
  // it is the database and not a branch somebody could delete.

  it("refuses an invitation whose circle and activity disagree", async () => {
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleInvitation"
           ("id","circleId","activityId","createdByMemberId","tokenHash",
            "expiresAt","createdAt")
         VALUES ('inv-cross-circle',$1,$2,$3,$4,$5,$6)`,
        [
          CIRCLE,
          OTHER_ACTIVITY_IN_OTHER_CIRCLE, // …an activity of a different circle.
          MEMBER,
          fakeHash(60),
          pgTs(future()),
          pgTs(new Date()),
        ],
      ),
    );
    expect(refusal.constraint).toBe(
      "CircleInvitation_activityId_circleId_fkey",
    );
    expect(refusal.code).toBe("23503");
  });

  it("refuses an invitation minted by a member of another circle", async () => {
    const activityId = await newActivity();
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleInvitation"
           ("id","circleId","activityId","createdByMemberId","tokenHash",
            "expiresAt","createdAt")
         VALUES ('inv-cross-member',$1,$2,$3,$4,$5,$6)`,
        [
          CIRCLE,
          activityId,
          OTHER_MEMBER, // …who belongs to OTHER_CIRCLE.
          fakeHash(61),
          pgTs(future()),
          pgTs(new Date()),
        ],
      ),
    );
    expect(refusal.constraint).toBe(
      "CircleInvitation_createdByMemberId_circleId_fkey",
    );
  });

  it("refuses a seat held by a member of another circle", async () => {
    const activityId = await newActivity();
    const refusal = await refusalOf(() =>
      insertParticipant({
        id: "p-cross-member",
        activityId,
        memberId: OTHER_MEMBER,
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_memberId_circleId_fkey",
    );
  });

  it("refuses a seat whose circle disagrees with its activity", async () => {
    // The scope column is not free-floating: the composite key to the activity
    // forces it to agree, so it cannot drift into naming a different circle.
    const activityId = await newActivity();
    const refusal = await refusalOf(() =>
      insertParticipant({
        id: "p-cross-scope",
        circleId: OTHER_CIRCLE,
        activityId,
        memberId: OTHER_MEMBER,
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_activityId_circleId_fkey",
    );
  });

  it("refuses a seat holding another activity's invitation", async () => {
    const here = await newActivity();
    const elsewhere = await newActivity();
    await insertInvitation({
      id: "inv-seat-cross",
      activityId: elsewhere,
      tokenHash: fakeHash(62),
    });
    const refusal = await refusalOf(() =>
      insertParticipant({
        id: "p-seat-cross",
        activityId: here,
        invitationId: "inv-seat-cross",
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_invitationId_activityId_fkey",
    );
  });

  it("refuses an artifact attributed to another activity's seat", async () => {
    // This is the shape of "somebody else's answer appearing in your result",
    // which is why it is a key and not a code review.
    const w = await twoConsistentActivities();
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleArtifact"
           ("id","activityId","version","kind","status","ciphertext","nonce",
            "keyVersion","createdByParticipantId","updatedAt")
         VALUES ($1,$2,1,'AGREEMENT','PROPOSED','ct','nonce',1,$3,now())`,
        [`art-cross-${w.seq}`, w.a, w.seatB],
      ),
    );
    expect(refusal.constraint).toBe(
      "CircleArtifact_createdByParticipantId_activityId_fkey",
    );
  });

  it("refuses an event naming an activity from another circle", async () => {
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","activityId","type")
         VALUES ('ev-cross-circle',$1,$2,'ACTIVITY_CREATED')`,
        [CIRCLE, OTHER_ACTIVITY_IN_OTHER_CIRCLE],
      ),
    );
    expect(refusal.constraint).toBe("CircleEvent_activityId_circleId_fkey");
  });

  it("refuses an event whose acting seat is from another activity", async () => {
    const w = await twoConsistentActivities();
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent"
           ("id","circleId","activityId","type","actorParticipantId")
         VALUES ($1,$2,$3,'PARTICIPANT_READY',$4)`,
        [`ev-cross-seat-${w.seq}`, CIRCLE, w.a, w.seatB],
      ),
    );
    expect(refusal.constraint).toBe(
      "CircleEvent_actorParticipantId_activityId_fkey",
    );
  });

  it("refuses an acting seat without an activity to scope it", async () => {
    // A composite key is only enforced when every column is non-null. Leaving
    // `activityId` null would skip the key that proves the seat belongs to the
    // activity — so the CHECK closes that door before the key is even asked.
    const w = await twoConsistentActivities();
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent"
           ("id","circleId","activityId","type","actorParticipantId")
         VALUES ($1,$2,NULL,'PARTICIPANT_READY',$3)`,
        [`ev-noactivity-${w.seq}`, CIRCLE, w.seatA],
      ),
    );
    expect(refusal.constraint).toBe(
      "CircleEvent_participant_actor_needs_activity",
    );
  });

  it("refuses an event naming a user who does not exist", async () => {
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","type","actorUserId")
         VALUES ('ev-ghost-actor',$1,'ACTIVITY_CREATED','u-does-not-exist')`,
        [CIRCLE],
      ),
    );
    expect(refusal.constraint).toBe("CircleEvent_actorUserId_fkey");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Dúo is 2/2/2, exactly
  // ═══════════════════════════════════════════════════════════════════════

  it.each([1, 3, 4, 99])(
    "refuses an activity requiring %i participants",
    async (n) => {
      const refusal = await refusalOf(() =>
        pool.query(
          `INSERT INTO "CircleActivity"
             ("id","circleId","templateKey","templateVersion","status",
              "requiredParticipants","updatedAt")
           VALUES ($1,$2,'fixture-duo-template',1,'INVITING',$3,now())`,
          [`act-req-${n}`, CIRCLE, n],
        ),
      );
      expect(refusal.constraint).toBe(
        "CircleActivity_required_participants_exactly_two",
      );
    },
  );

  it.each([1, 3, 10])("refuses a circle with room for %i", async (n) => {
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
         VALUES ($1,'DUO','ACTIVE',$2,$3,now())`,
        [`c-max-${n}`, U1, n],
      ),
    );
    expect(refusal.constraint).toBe("Circle_duo_two_participants");
  });

  // ═══════════════════════════════════════════════════════════════════════
  // The ledger is append-only, and the database is what says so
  // ═══════════════════════════════════════════════════════════════════════

  it("refuses UPDATE, DELETE and TRUNCATE on the event ledger", async () => {
    await pool.query(
      `INSERT INTO "CircleEvent" ("id","circleId","type")
       VALUES ('ev-immutable',$1,'ACTIVITY_CREATED')`,
      [CIRCLE],
    );

    const updated = await refusalOf(() =>
      pool.query(
        `UPDATE "CircleEvent" SET "type"='ACTIVITY_CLOSED' WHERE id='ev-immutable'`,
      ),
    );
    expect(updated.message).toContain("CIRCLE_EVENT_APPEND_ONLY");

    const deleted = await refusalOf(() =>
      pool.query(`DELETE FROM "CircleEvent" WHERE id='ev-immutable'`),
    );
    expect(deleted.message).toContain("CIRCLE_EVENT_APPEND_ONLY");

    // Row triggers do not see TRUNCATE. A table protected against DELETE and
    // open to TRUNCATE is not protected.
    const truncated = await refusalOf(() =>
      pool.query(`TRUNCATE TABLE "CircleEvent" CASCADE`),
    );
    expect(truncated.message).toContain("CIRCLE_EVENT_APPEND_ONLY");

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent" WHERE id='ev-immutable'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("has no application path that could turn the protection off", async () => {
    // The instruction is that disabling this needs a reviewed migration or the
    // destruction of an ephemeral test database — not a flag, not a repository
    // method, not a `session_replication_role` toggle somebody found.
    const src = readFileSync(
      join(API_DIR, "src/circles/circle-event.repository.ts"),
      "utf8",
    );
    for (const forbidden of [
      "circleEvent.update",
      "circleEvent.delete",
      "circleEvent.deleteMany",
      "circleEvent.updateMany",
      "session_replication_role",
      "ALTER TABLE",
      "DISABLE TRIGGER",
    ]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // The pilot gate — a guest inherits the inviter's enablement
  // ═══════════════════════════════════════════════════════════════════════
  //
  // The rollout answers "is Círculos on for a USER". A guest has no user, so
  // without this the guest surface would be the way around the allowlist: mint
  // a link while enabled, hand it to anybody, and it works forever. The gate
  // re-derives the inviter's eligibility on every use, and every way it can
  // fail produces the SAME answer as a secret that never existed.

  /** Mint through a service under `on`, so the fixture is never the thing under test. */
  const mintIn = async (activityId: string, memberId = MEMBER) => {
    await newActivity(activityId);
    return serviceWith("on").mintInvitation({
      circleId: memberId === MEMBER ? CIRCLE : OTHER_CIRCLE,
      activityId,
      createdByMemberId: memberId,
    });
  };

  const unusableCodeOf = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      return (err as CirclesError).code;
    }
    return "RESOLVED";
  };

  it("lets an allowlisted, active inviter through under pilot", async () => {
    const minted = await mintIn("act-pilot-ok");
    const pilot = serviceWith("pilot", U1);
    await expect(pilot.inspect(minted.rawToken)).resolves.toBe(true);
    const session = await pilot.exchange(minted.rawToken);
    expect(session.rawGuestToken).toBeTruthy();
  });

  it("refuses an inviter who is not in the allowlist", async () => {
    const minted = await mintIn("act-pilot-outside");
    const pilot = serviceWith("pilot", "somebody_else");
    expect(await unusableCodeOf(() => pilot.inspect(minted.rawToken))).toBe(
      "CIRCLE_INVITATION_UNUSABLE",
    );
    expect(await unusableCodeOf(() => pilot.exchange(minted.rawToken))).toBe(
      "CIRCLE_INVITATION_UNUSABLE",
    );
    // And the refusal did not spend it.
    const { rows } = await pool.query(
      `SELECT "consumedAt" FROM "CircleInvitation" WHERE id=$1`,
      [minted.invitationId],
    );
    expect(rows[0].consumedAt).toBeNull();
  });

  it("stops working when the inviter is removed from the allowlist", async () => {
    // Minted while enabled. The link does not carry the enablement with it.
    const minted = await mintIn("act-pilot-removed");
    await expect(
      serviceWith("pilot", U1).inspect(minted.rawToken),
    ).resolves.toBe(true);

    const afterRemoval = serviceWith("pilot", "someone_new");
    expect(
      await unusableCodeOf(() => afterRemoval.exchange(minted.rawToken)),
    ).toBe("CIRCLE_INVITATION_UNUSABLE");
  });

  it("refuses an inviter who has left the circle", async () => {
    const minted = await mintIn("act-pilot-left");
    const pilot = serviceWith("pilot", U1);
    await expect(pilot.inspect(minted.rawToken)).resolves.toBe(true);

    await pool.query(
      `UPDATE "CircleMember" SET "status"='LEFT', "leftAt"=now() WHERE id=$1`,
      [MEMBER],
    );
    try {
      expect(await unusableCodeOf(() => pilot.inspect(minted.rawToken))).toBe(
        "CIRCLE_INVITATION_UNUSABLE",
      );
      expect(await unusableCodeOf(() => pilot.exchange(minted.rawToken))).toBe(
        "CIRCLE_INVITATION_UNUSABLE",
      );
    } finally {
      await pool.query(
        `UPDATE "CircleMember" SET "status"='ACTIVE', "leftAt"=NULL WHERE id=$1`,
        [MEMBER],
      );
    }
  });

  it("re-checks inside the exchange transaction, not only before it", async () => {
    // The window this closes: `inspect` said yes, and by the time the canje ran
    // the member had left. The check inside the transaction sees the row under
    // the same lock the consume took, so the canje unwinds instead of landing.
    const minted = await mintIn("act-pilot-window");
    const pilot = serviceWith("pilot", U1);
    await expect(pilot.inspect(minted.rawToken)).resolves.toBe(true);

    await pool.query(
      `UPDATE "CircleMember" SET "status"='LEFT', "leftAt"=now() WHERE id=$1`,
      [MEMBER],
    );
    try {
      expect(await unusableCodeOf(() => pilot.exchange(minted.rawToken))).toBe(
        "CIRCLE_INVITATION_UNUSABLE",
      );
      // Nothing landed: not consumed, no session, no guest-session event.
      const inv = await pool.query(
        `SELECT "consumedAt","acceptedAt" FROM "CircleInvitation" WHERE id=$1`,
        [minted.invitationId],
      );
      expect(inv.rows[0].consumedAt).toBeNull();
      expect(inv.rows[0].acceptedAt).toBeNull();
      const sessions = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleGuestSession" WHERE "activityId"='act-pilot-window'`,
      );
      expect(sessions.rows[0].n).toBe(0);
      const seat = await pool.query(
        `SELECT "status" FROM "CircleActivityParticipant" WHERE "activityId"='act-pilot-window'`,
      );
      expect(seat.rows[0].status).toBe("INVITED");
    } finally {
      await pool.query(
        `UPDATE "CircleMember" SET "status"='ACTIVE', "leftAt"=NULL WHERE id=$1`,
        [MEMBER],
      );
    }
  });

  it("catches a member who leaves DURING the exchange", async () => {
    // The previous test proves the canje is refused. It does not prove WHERE:
    // the check outside the transaction already catches a member who left
    // before the call, so removing the in-transaction one would not fail it.
    //
    // This forces the actual window. The member repository is wrapped so that
    // the FIRST read — the one outside the transaction — returns an ACTIVE row
    // and then, before returning, commits the member as LEFT from a separate
    // connection. The outside check therefore passes on a row that is already
    // stale by the time it is used, and only the read inside the transaction
    // can catch it.
    const minted = await mintIn("act-pilot-race");

    let reads = 0;
    class FlipsAfterFirstRead extends CircleMemberRepository {
      async findById(memberId: string, db?: CircleMemberDb) {
        const row = await super.findById(memberId, db);
        reads += 1;
        if (reads === 1) {
          // A separate connection, committed: READ COMMITTED means the read
          // inside the open transaction will see it.
          await pool.query(
            `UPDATE "CircleMember" SET "status"='LEFT', "leftAt"=now() WHERE id=$1`,
            [MEMBER],
          );
        }
        return row;
      }
    }

    const racing = new CirclesService(
      prisma as unknown as ConstructorParameters<typeof CirclesService>[0],
      invitations,
      guestSessions,
      events,
      new FlipsAfterFirstRead(prisma),
      new CirclesRolloutService(
        resolveCirclesRolloutConfig({
          CIRCLES_ROLLOUT_MODE: "pilot",
          CIRCLES_PILOT_USER_IDS: U1,
        }),
      ),
    );

    try {
      expect(await unusableCodeOf(() => racing.exchange(minted.rawToken))).toBe(
        "CIRCLE_INVITATION_UNUSABLE",
      );
      expect(reads, "both checks ran").toBeGreaterThanOrEqual(2);

      // And the transaction unwound: the invitation is untouched, no session
      // exists, and the seat never moved.
      const inv = await pool.query(
        `SELECT "consumedAt","acceptedAt" FROM "CircleInvitation" WHERE id=$1`,
        [minted.invitationId],
      );
      expect(inv.rows[0].consumedAt).toBeNull();
      expect(inv.rows[0].acceptedAt).toBeNull();
      const sessions = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleGuestSession" WHERE "activityId"='act-pilot-race'`,
      );
      expect(sessions.rows[0].n).toBe(0);
      const seat = await pool.query(
        `SELECT "status" FROM "CircleActivityParticipant" WHERE "activityId"='act-pilot-race'`,
      );
      expect(seat.rows[0].status).toBe("INVITED");
    } finally {
      await pool.query(
        `UPDATE "CircleMember" SET "status"='ACTIVE', "leftAt"=NULL WHERE id=$1`,
        [MEMBER],
      );
    }
  });

  it("needs no allowlist under `on`", async () => {
    const minted = await mintIn("act-pilot-on");
    const open = serviceWith("on");
    await expect(open.inspect(minted.rawToken)).resolves.toBe(true);
    await expect(open.exchange(minted.rawToken)).resolves.toBeTruthy();
  });

  it("answers identically however the inviter fails", async () => {
    // Four causes — not allowlisted, left the circle, both, and a secret that
    // never existed — and one answer. A difference here would confirm that the
    // invitation is real, which is the one thing a guesser wants to know.
    const notListed = await mintIn("act-pilot-same-a");
    const left = await mintIn("act-pilot-same-b");
    await pool.query(
      `UPDATE "CircleMember" SET "status"='LEFT', "leftAt"=now() WHERE id=$1`,
      [MEMBER],
    );
    let codes: string[];
    try {
      const pilot = serviceWith("pilot", U1);
      const outside = serviceWith("pilot", "nobody_here");
      codes = [
        await unusableCodeOf(() => outside.inspect(notListed.rawToken)),
        await unusableCodeOf(() => pilot.inspect(left.rawToken)),
        await unusableCodeOf(() => outside.inspect(left.rawToken)),
        await unusableCodeOf(() => pilot.inspect(mintInvitationToken().raw)),
      ];
    } finally {
      await pool.query(
        `UPDATE "CircleMember" SET "status"='ACTIVE', "leftAt"=NULL WHERE id=$1`,
        [MEMBER],
      );
    }
    expect(new Set(codes)).toEqual(new Set(["CIRCLE_INVITATION_UNUSABLE"]));
  });

  // ═══════════════════════════════════════════════════════════════════════
  // The seat has to actually move from INVITED to ACCEPTED
  // ═══════════════════════════════════════════════════════════════════════

  it("aborts the whole exchange when the seat is gone", async () => {
    const minted = await mintIn("act-seat-missing");
    await pool.query(`DELETE FROM "CircleActivityParticipant" WHERE id=$1`, [
      minted.participantId,
    ]);

    expect(await unusableCodeOf(() => service.exchange(minted.rawToken))).toBe(
      "CIRCLE_STORAGE_FAILURE",
    );

    // Rolled back completely: the invitation is still usable, and nothing else
    // was written. A half-applied exchange is the state this check exists for.
    const inv = await pool.query(
      `SELECT "consumedAt","acceptedAt" FROM "CircleInvitation" WHERE id=$1`,
      [minted.invitationId],
    );
    expect(inv.rows[0].consumedAt).toBeNull();
    expect(inv.rows[0].acceptedAt).toBeNull();
    const sessions = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleGuestSession" WHERE "activityId"='act-seat-missing'`,
    );
    expect(sessions.rows[0].n).toBe(0);
    const events = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "activityId"='act-seat-missing' AND "type"='GUEST_SESSION_CREATED'`,
    );
    expect(events.rows[0].n).toBe(0);
  });

  it("aborts when the seat is in any state but INVITED", async () => {
    const minted = await mintIn("act-seat-declined");
    await pool.query(
      `UPDATE "CircleActivityParticipant" SET "status"='DECLINED' WHERE id=$1`,
      [minted.participantId],
    );

    expect(await unusableCodeOf(() => service.exchange(minted.rawToken))).toBe(
      "CIRCLE_STORAGE_FAILURE",
    );

    const inv = await pool.query(
      `SELECT "consumedAt" FROM "CircleInvitation" WHERE id=$1`,
      [minted.invitationId],
    );
    expect(inv.rows[0].consumedAt).toBeNull();
    const seat = await pool.query(
      `SELECT "status" FROM "CircleActivityParticipant" WHERE id=$1`,
      [minted.participantId],
    );
    expect(seat.rows[0].status).toBe("DECLINED");
    const sessions = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleGuestSession" WHERE "activityId"='act-seat-declined'`,
    );
    expect(sessions.rows[0].n).toBe(0);
  });

  it("cannot be handed a seat from an incompatible activity", async () => {
    // There is no test for "the service rejects a seat from another activity",
    // because the composite key makes such a seat unstorable — the refusal
    // happens two layers earlier. This asserts THAT, so the absence of the
    // service-level case is a recorded fact rather than a gap.
    const here = await newActivity();
    const elsewhere = await newActivity();
    await insertInvitation({
      id: "inv-incompatible",
      activityId: elsewhere,
      tokenHash: fakeHash(70),
    });
    const refusal = await refusalOf(() =>
      insertParticipant({
        id: "p-incompatible",
        activityId: here,
        invitationId: "inv-incompatible",
      }),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_invitationId_activityId_fkey",
    );
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
