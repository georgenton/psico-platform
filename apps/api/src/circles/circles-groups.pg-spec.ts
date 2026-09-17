import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CircleTemplateRegistry } from "@psico/types";
import type { CircleActivityDefinition, CircleActor } from "@psico/types";
import { CircleActivityRepository } from "./circle-activity.repository";
import { CircleArtifactRepository } from "./circle-artifact.repository";
import { CircleEventRepository } from "./circle-event.repository";
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { CircleInvitationRepository } from "./circle-invitation.repository";
import { CircleMemberRepository } from "./circle-member.repository";
import { CircleParticipantRepository } from "./circle-participant.repository";
import { CirclesParticipationService } from "./circles-participation.service";
import { CirclesParticipationFacade } from "./circles-participation.facade";
import { CirclesAccountDeletionService } from "./circles-account-deletion.service";
import { CirclesAnalyticsService } from "./circles-analytics.service";
import { CirclesCipher } from "./circles-crypto";
import type { CirclesError } from "./circles-http-errors";
import { CirclesRolloutService } from "./circles-rollout.service";
import {
  resolveCirclesRolloutConfig,
  type CirclesRolloutEnv,
} from "./circles-rollout";
import { CirclesService } from "./circles.service";
import { CirclesSweepService } from "./circles-sweep.service";
import { hashSecret } from "./circles-secrets";

/**
 * Adult GROUPS, against real PostgreSQL.
 *
 * What is under test here is not "does a group get created" — it is the set of
 * rules that make a group a group rather than a Dúo with extra rows: the size
 * is fixed by the template and by the database, the modality switch cannot be
 * argued out of by anything a caller sends, and one seat gets exactly one
 * single-use secret.
 *
 * These live against PostgreSQL rather than a mock because half of the rules
 * are CHECK constraints and a composite foreign key. A mock would let a test
 * assert the service's intention while the column that actually enforces it
 * had been dropped.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "circles_groups_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/** A structurally valid PUBLISHED Dúo, held in a fixture registry. */
const DUO: CircleActivityDefinition = {
  templateKey: "fixture-groups-duo",
  templateVersion: 1,
  status: "PUBLISHED",
  audience: "DUO_ADULT",
  title: "Plantilla de dos",
  summary:
    "Texto sintetico para ejercitar el dominio. No es contenido editorial.",
  estimatedMinutes: 20,
  source: { bookSlug: "libro-de-prueba", chapterOrder: 2 },
  participants: { min: 2, max: 2, required: 2 },
  privatePreparation: [
    {
      fieldKey: "campo-a",
      label: "Campo A",
      kind: "SHORT_TEXT",
      maxLength: 200,
    },
    { fieldKey: "campo-b", label: "Campo B", kind: "LONG_TEXT" },
  ],
  sharing: {
    allowedModes: ["SELECTED_FIELDS", "EDITED_SUMMARY", "KEEP_PRIVATE"],
  },
  reveal: { strategy: "ALL_CONFIRMED" },
  conversation: { turns: ["Turno uno.", "Turno dos."] },
  outcome: { kind: "AGREEMENT" },
  followUp: { afterHours: 168 },
  safety: {
    level: "LOW",
    privateGateRequired: false,
    doNotSuggestWhen: ["Situacion sintetica de prueba."],
  },
  ecoMode: "NONE",
};

/** The same shape, for three to six adults. */
const GROUP: CircleActivityDefinition = {
  ...DUO,
  templateKey: "fixture-groups-group",
  audience: "GROUP_ADULT",
  title: "Plantilla de grupo",
  participants: { min: 3, max: 6, required: 3 },
};

const KEY = randomBytes(32).toString("base64");
const ORGANIZER = "u-groups-organizer";
const OUTSIDER = "u-groups-outsider";

/** A fresh 256-bit invitation secret, the shape the DTO requires. */
const mintToken = () => randomBytes(32).toString("base64url");
/** N distinct secrets, one per seat that is not the organiser's. */
const mintTokens = (n: number) => Array.from({ length: n }, mintToken);

suite("circles · adult groups (real PostgreSQL)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let registry: CircleTemplateRegistry;
  let cipher: CirclesCipher;

  /** The domain, with the rollout resolved from an env bag like production's. */
  const build = (env: CirclesRolloutEnv) => {
    const p = prisma as unknown as ConstructorParameters<
      typeof CirclesParticipationService
    >[0];
    return new CirclesParticipationService(
      p,
      new CircleActivityRepository(prisma),
      new CircleParticipantRepository(prisma),
      new CircleArtifactRepository(prisma),
      new CircleEventRepository(prisma),
      new CircleMemberRepository(prisma),
      new CircleGuestSessionRepository(prisma),
      new CircleInvitationRepository(prisma),
      new CirclesRolloutService(resolveCirclesRolloutConfig(env)),
      cipher,
      registry,
    );
  };

  /** The access service, for exchanging a link for a guest session. */
  const buildAccess = (env: CirclesRolloutEnv) =>
    new CirclesService(
      prisma as unknown as ConstructorParameters<typeof CirclesService>[0],
      new CircleInvitationRepository(prisma),
      new CircleGuestSessionRepository(prisma),
      new CircleEventRepository(prisma),
      new CircleMemberRepository(prisma),
      new CirclesRolloutService(resolveCirclesRolloutConfig(env)),
      new CircleActivityRepository(prisma),
    );

  /** Groups open, for an allowlisted organiser. The pilot, as it will be run. */
  const OPEN: CirclesRolloutEnv = {
    CIRCLES_ROLLOUT_MODE: "pilot",
    CIRCLES_PILOT_USER_IDS: `${ORGANIZER},${OUTSIDER}`,
    CIRCLES_GROUPS: "on",
  };
  /** The same pilot with the modality switch shut — production, today. */
  const CLOSED: CirclesRolloutEnv = {
    CIRCLES_ROLLOUT_MODE: "pilot",
    CIRCLES_PILOT_USER_IDS: `${ORGANIZER},${OUTSIDER}`,
  };

  let open: CirclesParticipationService;
  let closed: CirclesParticipationService;
  let access: CirclesService;
  /**
   * The READ path, through the real facade rather than the domain.
   *
   * Half of the access rules under test live there — the facade decides
   * whether an envelope is decrypted at all — so a spec that called the
   * projection directly would be testing the second lock and calling it the
   * door.
   */
  let facade: CirclesParticipationFacade;
  const facadeRead = (actor: CircleActor, activityId: string) =>
    facade.read(actor, activityId);

  const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
      await fn();
      return "RESOLVED";
    } catch (err) {
      if (process.env.CIRCLES_SPEC_TRACE) console.error("[trace]", err);
      return (err as CirclesError).code ?? "UNKNOWN";
    }
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

    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    registry = new CircleTemplateRegistry([DUO, GROUP]);
    cipher = new CirclesCipher(Buffer.from(KEY, "base64"));
    open = build(OPEN);
    closed = build(CLOSED);
    access = buildAccess(OPEN);
    facade = new CirclesParticipationFacade(
      open,
      new CirclesAnalyticsService(prisma as never),
    );

    await prisma.user.createMany({
      data: [
        { id: ORGANIZER, email: "groups-organizer@test.local", name: "Org" },
        { id: OUTSIDER, email: "groups-outsider@test.local", name: "Out" },
      ],
    });
  }, 240_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  }, 60_000);

  /** Create a group of `size` with the modality open. */
  const createGroup = (size: number, userId = ORGANIZER) =>
    open.createDuo({
      userId,
      templateKey: GROUP.templateKey,
      templateVersion: GROUP.templateVersion,
      invitationTokens: mintTokens(size - 1),
      size,
      idempotencyKey: randomUUID(),
    });

  // ══ The size is the template's, and the database agrees ══════════════════

  describe("the Dúo still requires exactly two", () => {
    it("creates two seats and one invitation when no size is sent", async () => {
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [mintToken()],
        idempotencyKey: randomUUID(),
      });
      const row = await pool.query(
        `SELECT a."requiredParticipants" AS required, a."kind" AS kind,
                c."maxParticipants" AS max, c."kind" AS circle_kind,
                (SELECT count(*)::int FROM "CircleActivityParticipant" p
                   WHERE p."activityId" = a."id") AS seats,
                (SELECT count(*)::int FROM "CircleInvitation" i
                   WHERE i."activityId" = a."id") AS invitations
           FROM "CircleActivity" a JOIN "Circle" c ON c."id" = a."circleId"
          WHERE a."id" = $1`,
        [created.activityId],
      );
      expect(row.rows[0]).toMatchObject({
        required: 2,
        kind: "DUO",
        circle_kind: "DUO",
        max: 2,
        seats: 2,
        invitations: 1,
      });
    });

    it("refuses three on a Dúo template, and writes nothing", async () => {
      // The regression groups made possible: `3` is now a number the engine
      // understands. On a DUO_ADULT template it is still not a size.
      const before = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleActivity" WHERE "templateKey"=$1`,
        [DUO.templateKey],
      );
      expect(
        await codeOf(() =>
          open.createDuo({
            userId: ORGANIZER,
            templateKey: DUO.templateKey,
            templateVersion: DUO.templateVersion,
            invitationTokens: mintTokens(2),
            size: 3,
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe("CIRCLE_INVALID_PAYLOAD");
      const after = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleActivity" WHERE "templateKey"=$1`,
        [DUO.templateKey],
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it("refuses a Dúo that asks for two secrets", async () => {
      // A second secret on a Dúo would be a link into a seat that does not
      // exist — or, if honoured, a third person in a conversation for two.
      expect(
        await codeOf(() =>
          open.createDuo({
            userId: ORGANIZER,
            templateKey: DUO.templateKey,
            templateVersion: DUO.templateVersion,
            invitationTokens: mintTokens(2),
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe("CIRCLE_INVALID_PAYLOAD");
    });

    it("refuses a Dúo of three at the database, even without the service", async () => {
      // The service is not the only thing standing here. If a future caller
      // reached Prisma directly, the CHECK still refuses.
      await expect(
        pool.query(
          `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","createdAt","updatedAt")
             VALUES ($1,'DUO','ACTIVE',$2,3,now(),now())`,
          [`c-duo-of-three-${randomUUID()}`, ORGANIZER],
        ),
      ).rejects.toThrow();
    });
  });

  describe("a group admits three to six, and nothing else", () => {
    it.each([3, 4, 5, 6])("creates a group of %i", async (size) => {
      const created = await createGroup(size);
      const row = await pool.query(
        `SELECT a."requiredParticipants" AS required, a."kind" AS kind,
                c."maxParticipants" AS max, c."kind" AS circle_kind,
                (SELECT count(*)::int FROM "CircleActivityParticipant" p
                   WHERE p."activityId" = a."id") AS seats,
                (SELECT count(*)::int FROM "CircleInvitation" i
                   WHERE i."activityId" = a."id") AS invitations,
                (SELECT count(DISTINCT i."tokenHash")::int FROM "CircleInvitation" i
                   WHERE i."activityId" = a."id") AS distinct_secrets
           FROM "CircleActivity" a JOIN "Circle" c ON c."id" = a."circleId"
          WHERE a."id" = $1`,
        [created.activityId],
      );
      expect(row.rows[0]).toMatchObject({
        required: size,
        kind: "GROUP_ADULT",
        circle_kind: "GROUP_ADULT",
        max: size,
        // N seats INCLUDING the organiser's, and one secret for each of the
        // others: N−1 invitations, no two alike.
        seats: size,
        invitations: size - 1,
        distinct_secrets: size - 1,
      });
    });

    it("gives the organiser the only accepted seat at creation", async () => {
      const created = await createGroup(5);
      const rows = await pool.query(
        `SELECT "status", "memberId" IS NOT NULL AS is_member,
                "invitationId" IS NOT NULL AS has_invitation
           FROM "CircleActivityParticipant" WHERE "activityId"=$1`,
        [created.activityId],
      );
      const accepted = rows.rows.filter((r) => r.status === "ACCEPTED");
      const invited = rows.rows.filter((r) => r.status === "INVITED");
      expect(accepted).toHaveLength(1);
      expect(accepted[0].is_member).toBe(true);
      expect(invited).toHaveLength(4);
      // Every seat that is not the organiser's is reached by its own link.
      expect(invited.every((r) => r.has_invitation === true)).toBe(true);
      expect(invited.every((r) => r.is_member === false)).toBe(true);
    });

    it.each([2, 7, 12])("refuses a group of %i", async (size) => {
      expect(
        await codeOf(() =>
          open.createDuo({
            userId: ORGANIZER,
            templateKey: GROUP.templateKey,
            templateVersion: GROUP.templateVersion,
            invitationTokens: mintTokens(Math.max(size - 1, 1)),
            size,
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe("CIRCLE_INVALID_PAYLOAD");
    });

    it("refuses a group of seven at the database too", async () => {
      await expect(
        pool.query(
          `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","createdAt","updatedAt")
             VALUES ($1,'GROUP_ADULT','ACTIVE',$2,7,now(),now())`,
          [`c-group-of-seven-${randomUUID()}`, ORGANIZER],
        ),
      ).rejects.toThrow();
    });

    it("refuses a secret count that disagrees with the size", async () => {
      // Four people and two links is two seats nobody can reach; four people
      // and four links is a link the group has no room for.
      for (const tokens of [2, 4]) {
        expect(
          await codeOf(() =>
            open.createDuo({
              userId: ORGANIZER,
              templateKey: GROUP.templateKey,
              templateVersion: GROUP.templateVersion,
              invitationTokens: mintTokens(tokens),
              size: 4,
              idempotencyKey: randomUUID(),
            }),
          ),
          `${tokens} secrets for 4 seats`,
        ).toBe("CIRCLE_INVALID_PAYLOAD");
      }
    });

    it("refuses the same secret twice, which would be one link for two seats", async () => {
      const shared = mintToken();
      expect(
        await codeOf(() =>
          open.createDuo({
            userId: ORGANIZER,
            templateKey: GROUP.templateKey,
            templateVersion: GROUP.templateVersion,
            invitationTokens: [shared, shared],
            size: 3,
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe("CIRCLE_INVALID_PAYLOAD");
    });

    it("opens one numbered seat per link, all live at once", async () => {
      // The rule the foundation wrote as "at most one live invitation per
      // activity" — true of a Dúo, and false of a room. It is now per SEAT, so
      // five links can be open together and a second link into seat 3 still
      // cannot.
      const created = await createGroup(6);
      const rows = await pool.query(
        `SELECT "seatIndex" FROM "CircleInvitation"
          WHERE "activityId"=$1 AND "consumedAt" IS NULL
            AND "revokedAt" IS NULL AND "declinedAt" IS NULL
          ORDER BY "seatIndex"`,
        [created.activityId],
      );
      expect(rows.rows.map((r) => r.seatIndex)).toEqual([1, 2, 3, 4, 5]);
    });

    it("still refuses a second live link into a seat that already has one", async () => {
      const created = await createGroup(4);
      const circle = await pool.query(
        `SELECT "circleId" FROM "CircleActivity" WHERE "id"=$1`,
        [created.activityId],
      );
      const member = await pool.query(
        `SELECT "id" FROM "CircleMember" WHERE "circleId"=$1 LIMIT 1`,
        [circle.rows[0].circleId],
      );
      await expect(
        pool.query(
          `INSERT INTO "CircleInvitation"
             ("id","circleId","activityId","createdByMemberId","tokenHash","seatIndex","expiresAt","createdAt")
             VALUES ($1,$2,$3,$4,$5,2,now()+interval '14 days',now())`,
          [
            `i-dup-seat-${randomUUID()}`,
            circle.rows[0].circleId,
            created.activityId,
            member.rows[0].id,
            hashSecret(mintToken()),
          ],
        ),
      ).rejects.toThrow();
    });

    it("refuses a seat number no admitted shape has", async () => {
      const created = await createGroup(3);
      const circle = await pool.query(
        `SELECT "circleId" FROM "CircleActivity" WHERE "id"=$1`,
        [created.activityId],
      );
      const member = await pool.query(
        `SELECT "id" FROM "CircleMember" WHERE "circleId"=$1 LIMIT 1`,
        [circle.rows[0].circleId],
      );
      for (const seat of [0, 6, 99]) {
        await expect(
          pool.query(
            `INSERT INTO "CircleInvitation"
               ("id","circleId","activityId","createdByMemberId","tokenHash","seatIndex","expiresAt","createdAt")
               VALUES ($1,$2,$3,$4,$5,$6,now()+interval '14 days',now())`,
            [
              `i-bad-seat-${randomUUID()}`,
              circle.rows[0].circleId,
              created.activityId,
              member.rows[0].id,
              hashSecret(mintToken()),
              seat,
            ],
          ),
        ).rejects.toThrow();
      }
    });

    it("never persists a secret, only its hash", async () => {
      const tokens = mintTokens(3);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 4,
        idempotencyKey: randomUUID(),
      });
      const rows = await pool.query(
        `SELECT to_jsonb(i) AS row FROM "CircleInvitation" i WHERE "activityId"=$1`,
        [created.activityId],
      );
      const serialized = JSON.stringify(rows.rows.map((r) => r.row));
      for (const token of tokens) {
        expect(serialized).not.toContain(token);
        expect(serialized).toContain(hashSecret(token));
      }
    });
  });

  // ══ The modality gate ════════════════════════════════════════════════════

  describe("generic creation cannot argue its way past the gate", () => {
    it("refuses a group template while the switch is shut", async () => {
      expect(
        await codeOf(() =>
          closed.createDuo({
            userId: ORGANIZER,
            templateKey: GROUP.templateKey,
            templateVersion: GROUP.templateVersion,
            invitationTokens: mintTokens(2),
            size: 3,
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe("CIRCLES_UNAVAILABLE");
    });

    it("refuses a group template that sends no size at all", async () => {
      // The request a caller makes when it lets the template decide. `size` is
      // optional, so this is an ordinary shape — and the gate must read the
      // RESOLVED template's audience, not the number in the request. A gate
      // written against `input.size` skips this case entirely and creates a
      // group with the modality shut; a negative control found exactly that
      // hole, and nothing here covered it.
      const before = await pool.query(
        `SELECT count(*)::int AS n FROM "Circle" WHERE "kind"='GROUP_ADULT'`,
      );
      expect(
        await codeOf(() =>
          closed.createDuo({
            userId: ORGANIZER,
            templateKey: GROUP.templateKey,
            templateVersion: GROUP.templateVersion,
            // Two secrets, because the template's default is three people.
            invitationTokens: mintTokens(2),
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe("CIRCLES_UNAVAILABLE");
      const after = await pool.query(
        `SELECT count(*)::int AS n FROM "Circle" WHERE "kind"='GROUP_ADULT'`,
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it("says the same thing to an allowlisted member and to a stranger", async () => {
      // Opaque on purpose: somebody the modality is closed for must not be
      // able to learn from the refusal that adult groups exist at all.
      const stranger = build({
        CIRCLES_ROLLOUT_MODE: "pilot",
        CIRCLES_PILOT_USER_IDS: OUTSIDER,
        CIRCLES_GROUPS: "on",
      });
      const refusedForModality = await codeOf(() =>
        closed.createDuo({
          userId: ORGANIZER,
          templateKey: GROUP.templateKey,
          templateVersion: GROUP.templateVersion,
          invitationTokens: mintTokens(2),
          size: 3,
          idempotencyKey: randomUUID(),
        }),
      );
      const refusedForAllowlist = await codeOf(() =>
        stranger.createDuo({
          userId: ORGANIZER,
          templateKey: GROUP.templateKey,
          templateVersion: GROUP.templateVersion,
          invitationTokens: mintTokens(2),
          size: 3,
          idempotencyKey: randomUUID(),
        }),
      );
      expect(refusedForModality).toBe(refusedForAllowlist);
      expect(refusedForModality).toBe("CIRCLES_UNAVAILABLE");
    });

    it("leaves the Dúo working while the switch is shut", async () => {
      // The reason there are two switches at all. Closing groups must not be
      // the same act as closing the product that is live in production.
      const created = await closed.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [mintToken()],
        idempotencyKey: randomUUID(),
      });
      expect(created.replayed).toBe(false);
      const row = await pool.query(
        `SELECT "kind","requiredParticipants" FROM "CircleActivity" WHERE "id"=$1`,
        [created.activityId],
      );
      expect(row.rows[0]).toMatchObject({
        kind: "DUO",
        requiredParticipants: 2,
      });
    });

    it("cannot be opened by sending a group-sized request on a Dúo template", async () => {
      // The gate reads the RESOLVED TEMPLATE, so `size` is not a way in. This
      // is refused for the size, and no GROUP_ADULT row appears either way.
      const before = await pool.query(
        `SELECT count(*)::int AS n FROM "Circle" WHERE "kind"='GROUP_ADULT'`,
      );
      for (const size of [3, 4, 6]) {
        expect(
          await codeOf(() =>
            closed.createDuo({
              userId: ORGANIZER,
              templateKey: DUO.templateKey,
              templateVersion: DUO.templateVersion,
              invitationTokens: mintTokens(size - 1),
              size,
              idempotencyKey: randomUUID(),
            }),
          ),
          `size ${size}`,
        ).toBe("CIRCLE_INVALID_PAYLOAD");
      }
      const after = await pool.query(
        `SELECT count(*)::int AS n FROM "Circle" WHERE "kind"='GROUP_ADULT'`,
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it("takes the modality from the catalogue, never from the request", async () => {
      // There is no field a caller can send that makes a Dúo template produce
      // a GROUP_ADULT activity: `kind` is derived from `definition.audience`.
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [mintToken()],
        size: 2,
        idempotencyKey: randomUUID(),
      });
      const row = await pool.query(
        `SELECT a."kind" AS activity_kind, c."kind" AS circle_kind
           FROM "CircleActivity" a JOIN "Circle" c ON c."id" = a."circleId"
          WHERE a."id"=$1`,
        [created.activityId],
      );
      expect(row.rows[0]).toMatchObject({
        activity_kind: "DUO",
        circle_kind: "DUO",
      });
    });

    it("does not strand a group that already exists when the switch shuts", async () => {
      // Closing the modality stops NEW groups. It is not a way to break the
      // people already in one, so the row stays exactly as it was.
      const created = await createGroup(3);
      const later = build(CLOSED);
      expect(
        await codeOf(() =>
          later.createDuo({
            userId: ORGANIZER,
            templateKey: GROUP.templateKey,
            templateVersion: GROUP.templateVersion,
            invitationTokens: mintTokens(2),
            size: 3,
            idempotencyKey: randomUUID(),
          }),
        ),
      ).toBe("CIRCLES_UNAVAILABLE");
      const row = await pool.query(
        `SELECT "status","kind","requiredParticipants" FROM "CircleActivity" WHERE "id"=$1`,
        [created.activityId],
      );
      expect(row.rows[0]).toMatchObject({
        status: "INVITING",
        kind: "GROUP_ADULT",
        requiredParticipants: 3,
      });
    });
  });

  // ══ Retries ══════════════════════════════════════════════════════════════

  describe("a retry returns the same group, and a different request never does", () => {
    it("replays the identical request without creating a second group", async () => {
      const tokens = mintTokens(3);
      const key = randomUUID();
      const request = {
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 4,
        idempotencyKey: key,
      };
      const first = await open.createDuo(request);
      const replay = await open.createDuo(request);
      expect(replay.replayed).toBe(true);
      expect(replay.activityId).toBe(first.activityId);

      const rows = await pool.query(
        `SELECT (SELECT count(*)::int FROM "CircleActivityParticipant"
                   WHERE "activityId"=$1) AS seats,
                (SELECT count(*)::int FROM "CircleInvitation"
                   WHERE "activityId"=$1) AS invitations,
                (SELECT count(*)::int FROM "CircleEvent"
                   WHERE "type"='CIRCLE_CREATED' AND "idempotencyKey"=$2) AS receipts`,
        [first.activityId, key],
      );
      // The retry must not have minted a second set of links: the four people
      // already hold the four they were sent.
      expect(rows.rows[0]).toMatchObject({
        seats: 4,
        invitations: 3,
        receipts: 1,
      });
    });

    it("conflicts when the retry asks for a different size", async () => {
      // Four, timed out, retried asking for six. Returning the group of four
      // as success would report two invitations that were never sent.
      const tokens = mintTokens(3);
      const key = randomUUID();
      await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 4,
        idempotencyKey: key,
      });
      expect(
        await codeOf(() =>
          open.createDuo({
            userId: ORGANIZER,
            templateKey: GROUP.templateKey,
            templateVersion: GROUP.templateVersion,
            invitationTokens: [...tokens, mintToken(), mintToken()],
            size: 6,
            idempotencyKey: key,
          }),
        ),
      ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");
    });

    it("conflicts when the retry keeps the size but changes a later secret", async () => {
      // The first secret still matches, so a comparison that looked only at
      // that one would call this a replay — and the person holding the third
      // link would never be able to use it.
      const tokens = mintTokens(3);
      const key = randomUUID();
      await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 4,
        idempotencyKey: key,
      });
      expect(
        await codeOf(() =>
          open.createDuo({
            userId: ORGANIZER,
            templateKey: GROUP.templateKey,
            templateVersion: GROUP.templateVersion,
            invitationTokens: [tokens[0], tokens[1], mintToken()],
            size: 4,
            idempotencyKey: key,
          }),
        ),
      ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");
    });

    it("conflicts when the retry switches modality under the same key", async () => {
      const token = mintToken();
      const key = randomUUID();
      await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: key,
      });
      expect(
        await codeOf(() =>
          open.createDuo({
            userId: ORGANIZER,
            templateKey: GROUP.templateKey,
            templateVersion: GROUP.templateVersion,
            invitationTokens: [token, mintToken()],
            size: 3,
            idempotencyKey: key,
          }),
        ),
      ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");
    });

    it("creates exactly one group when two identical requests race", async () => {
      const tokens = mintTokens(2);
      const key = randomUUID();
      const request = {
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: key,
      };
      const [a, b] = await Promise.all([
        open.createDuo(request),
        open.createDuo(request),
      ]);
      expect(a.activityId).toBe(b.activityId);
      // One of them created it and the other replayed; which one is the
      // scheduler's business, and both got the same group.
      expect([a.replayed, b.replayed].filter(Boolean)).toHaveLength(1);
      const rows = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "type"='CIRCLE_CREATED' AND "idempotencyKey"=$1`,
        [key],
      );
      expect(rows.rows[0].n).toBe(1);
    });
  });

  // ══ Rolling deploy ═══════════════════════════════════════════════════════

  describe("an older instance is unaffected by the new column", () => {
    it("accepts an activity written without `kind`, as a Dúo", async () => {
      // During a rolling deploy the previous API image is still serving and
      // does not know the column exists. Its inserts must keep working, and
      // must land as what they are.
      const circleId = `c-rolling-${randomUUID()}`;
      const activityId = `a-rolling-${randomUUID()}`;
      await pool.query(
        `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","createdAt","updatedAt")
           VALUES ($1,'DUO','ACTIVE',$2,2,now(),now())`,
        [circleId, ORGANIZER],
      );
      await pool.query(
        `INSERT INTO "CircleActivity"
           ("id","circleId","templateKey","templateVersion","status","requiredParticipants","createdAt","updatedAt")
           VALUES ($1,$2,$3,1,'INVITING',2,now(),now())`,
        [activityId, circleId, DUO.templateKey],
      );
      const row = await pool.query(
        `SELECT "kind" FROM "CircleActivity" WHERE "id"=$1`,
        [activityId],
      );
      expect(row.rows[0].kind).toBe("DUO");
    });

    it("refuses an activity whose size disagrees with its modality", async () => {
      const circleId = `c-mismatch-${randomUUID()}`;
      await pool.query(
        `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","createdAt","updatedAt")
           VALUES ($1,'GROUP_ADULT','ACTIVE',$2,4,now(),now())`,
        [circleId, ORGANIZER],
      );
      // A GROUP_ADULT activity claiming two participants, and a DUO claiming
      // four: both are refused by the CHECK, not by the service.
      await expect(
        pool.query(
          `INSERT INTO "CircleActivity"
             ("id","circleId","templateKey","templateVersion","status","kind","requiredParticipants","createdAt","updatedAt")
             VALUES ($1,$2,$3,1,'INVITING','GROUP_ADULT',2,now(),now())`,
          [`a-mismatch-${randomUUID()}`, circleId, GROUP.templateKey],
        ),
      ).rejects.toThrow();
      await expect(
        pool.query(
          `INSERT INTO "CircleActivity"
             ("id","circleId","templateKey","templateVersion","status","kind","requiredParticipants","createdAt","updatedAt")
             VALUES ($1,$2,$3,1,'INVITING','DUO',4,now(),now())`,
          [`a-mismatch2-${randomUUID()}`, circleId, DUO.templateKey],
        ),
      ).rejects.toThrow();
    });

    it("refuses an activity whose modality disagrees with its circle's", async () => {
      // The composite foreign key: an activity cannot claim a modality its
      // own circle does not have.
      const circleId = `c-kindfk-${randomUUID()}`;
      await pool.query(
        `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","createdAt","updatedAt")
           VALUES ($1,'DUO','ACTIVE',$2,2,now(),now())`,
        [circleId, ORGANIZER],
      );
      await expect(
        pool.query(
          `INSERT INTO "CircleActivity"
             ("id","circleId","templateKey","templateVersion","status","kind","requiredParticipants","createdAt","updatedAt")
             VALUES ($1,$2,$3,1,'INVITING','GROUP_ADULT',3,now(),now())`,
          [`a-kindfk-${randomUUID()}`, circleId, GROUP.templateKey],
        ),
      ).rejects.toThrow();
    });
  });

  // ══ The barrier ══════════════════════════════════════════════════════════

  describe("everybody, not a quorum", () => {
    /** A group of `size` with every guest seat accepted. */
    async function seatedGroup(size: number) {
      const tokens = mintTokens(size - 1);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size,
        idempotencyKey: randomUUID(),
      });
      const seats = await pool.query(
        `SELECT "id","memberId" FROM "CircleActivityParticipant"
          WHERE "activityId"=$1 ORDER BY "id"`,
        [created.activityId],
      );
      const guests = [];
      for (const token of tokens) {
        const exchanged = await access.exchange(token);
        // The exchange returns a session, not a seat. Which seat it opened is
        // on the session row, and asking the database is the only answer that
        // cannot drift from the one the guards will use.
        const seat = await pool.query(
          `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
          [exchanged.guestSessionId],
        );
        guests.push({
          kind: "GUEST" as const,
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        });
      }
      // Everybody is seated, so the organiser continues with everybody — the
      // room reaches `PREPARING` the way it does now.
      await continueWithEveryone(created.activityId);
      return {
        ...created,
        organizer: { kind: "USER" as const, userId: ORGANIZER },
        guests,
        seatIds: seats.rows.map((r) => r.id as string),
      };
    }

    const share = (value: string) =>
      ({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value }],
      }) as const;

    const statusOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT "status" FROM "CircleActivity" WHERE "id"=$1`,
        [activityId],
      );
      return row.rows[0].status as string;
    };

    it("does not reveal a group of four while one seat is missing", async () => {
      const group = await seatedGroup(4);
      await open.confirmShare(
        group.organizer,
        group.activityId,
        share("del organizador"),
        randomUUID(),
      );
      await open.confirmShare(
        group.guests[0]!,
        group.activityId,
        share("del segundo"),
        randomUUID(),
      );
      await open.confirmShare(
        group.guests[1]!,
        group.activityId,
        share("del tercero"),
        randomUUID(),
      );
      // Three of four. A Dúo's rule — "everybody has confirmed" — is the same
      // sentence, and three quarters of a room is not everybody.
      expect(await statusOf(group.activityId)).toBe("PREPARING");
      const view = await open.readActivity(group.organizer, group.activityId);
      expect(view.ctx.activity.status).toBe("PREPARING");
    }, 30_000);

    it("reveals only when the last seat confirms", async () => {
      const group = await seatedGroup(3);
      await open.confirmShare(
        group.organizer,
        group.activityId,
        share("del organizador"),
        randomUUID(),
      );
      expect(await statusOf(group.activityId)).toBe("PREPARING");
      await open.confirmShare(
        group.guests[0]!,
        group.activityId,
        share("del segundo"),
        randomUUID(),
      );
      expect(await statusOf(group.activityId)).toBe("PREPARING");
      await open.confirmShare(
        group.guests[1]!,
        group.activityId,
        share("del tercero"),
        randomUUID(),
      );
      expect(await statusOf(group.activityId)).toBe("REVEALED");

      // Exactly one ACTIVITY_REVEALED, whoever got there last.
      const events = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type"='ACTIVITY_REVEALED'`,
        [group.activityId],
      );
      expect(events.rows[0].n).toBe(1);
    }, 30_000);

    it("gives each person every other answer, labelled and whole", async () => {
      const group = await seatedGroup(3);
      await open.confirmShare(
        group.organizer,
        group.activityId,
        share("lo del organizador"),
        randomUUID(),
      );
      await open.confirmShare(
        group.guests[0]!,
        group.activityId,
        share("lo del segundo"),
        randomUUID(),
      );
      // Three SHARED answers. Keeping it private is no longer an option that
      // reaches a reveal in a group — it ends the activity — and this scenario
      // is about what a reveal contains.
      await open.confirmShare(
        group.guests[1]!,
        group.activityId,
        share("lo del tercero"),
        randomUUID(),
      );

      const { ctx } = await open.readActivity(
        group.organizer,
        group.activityId,
      );
      expect(ctx.others).toHaveLength(2);
      // Every viewer numbers the same seat the same way, and the organiser's
      // seat is 1 because it is the one holding the membership.
      const organizerSeat = ctx.participants.find((p) => p.memberId !== null)!;
      expect(ctx.positions.get(organizerSeat.id)).toBe(1);
      expect([...ctx.positions.values()].sort()).toEqual([1, 2, 3]);

      // And the same order for a GUEST reading the same room.
      const guestCtx = await open.readActivity(
        group.guests[0]!,
        group.activityId,
      );
      expect(guestCtx.ctx.positions.get(organizerSeat.id)).toBe(1);
      for (const [id, position] of ctx.positions) {
        expect(guestCtx.ctx.positions.get(id), id).toBe(position);
      }
    }, 30_000);

    it("blocks the reveal when a seat exists that the size does not admit", async () => {
      // "Should be impossible" is an argument about other code. This is the
      // statement that decides whether private answers become visible, so an
      // anomalous row blocks the reveal rather than riding it.
      const group = await seatedGroup(3);
      const circle = await pool.query(
        `SELECT "circleId" FROM "CircleActivity" WHERE "id"=$1`,
        [group.activityId],
      );
      const member = await pool.query(
        `SELECT "id" FROM "CircleMember" WHERE "circleId"=$1 LIMIT 1`,
        [circle.rows[0].circleId],
      );
      const extraInvitation = `i-extra-${randomUUID()}`;
      await pool.query(
        `INSERT INTO "CircleInvitation"
           ("id","circleId","activityId","createdByMemberId","tokenHash","seatIndex","expiresAt","createdAt")
           VALUES ($1,$2,$3,$4,$5,4,now()+interval '14 days',now())`,
        [
          extraInvitation,
          circle.rows[0].circleId,
          group.activityId,
          member.rows[0].id,
          hashSecret(mintToken()),
        ],
      );
      await pool.query(
        `INSERT INTO "CircleActivityParticipant"
           ("id","circleId","activityId","invitationId","status","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,'INVITED',now(),now())`,
        [
          `p-extra-${randomUUID()}`,
          circle.rows[0].circleId,
          group.activityId,
          extraInvitation,
        ],
      );

      await open.confirmShare(
        group.organizer,
        group.activityId,
        share("uno"),
        randomUUID(),
      );
      await open.confirmShare(
        group.guests[0]!,
        group.activityId,
        share("dos"),
        randomUUID(),
      );
      await open.confirmShare(
        group.guests[1]!,
        group.activityId,
        share("tres"),
        randomUUID(),
      );
      // Three READY on an activity that requires three — and a fourth seat
      // that gave nothing. The reveal stays shut.
      expect(await statusOf(group.activityId)).toBe("PREPARING");
    }, 30_000);

    it("reveals once when the whole room confirms at the same instant", async () => {
      const group = await seatedGroup(5);
      const actors = [group.organizer, ...group.guests];
      await Promise.all(
        actors.map((actor, index) =>
          open.confirmShare(
            actor,
            group.activityId,
            share(`respuesta ${index}`),
            randomUUID(),
          ),
        ),
      );
      expect(await statusOf(group.activityId)).toBe("REVEALED");
      const events = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type"='ACTIVITY_REVEALED'`,
        [group.activityId],
      );
      // Five simultaneous confirmations, one reveal. The barrier is a single
      // conditional UPDATE, so exactly one of them can win it.
      expect(events.rows[0].n).toBe(1);
    }, 45_000);

    it("stops a withdrawal from opening the room it left", async () => {
      const group = await seatedGroup(3);
      await open.confirmShare(
        group.organizer,
        group.activityId,
        share("uno"),
        randomUUID(),
      );
      await open.withdraw(group.guests[0]!, group.activityId, randomUUID());
      await open
        .confirmShare(
          group.guests[1]!,
          group.activityId,
          share("tres"),
          randomUUID(),
        )
        .catch(() => undefined);
      // Whatever the second confirmation did, a room one person left does not
      // reveal: the seat count no longer matches and never will again.
      expect(await statusOf(group.activityId)).not.toBe("REVEALED");
    }, 30_000);
  });

  // ══ Agreement and follow-up ══════════════════════════════════════════════

  describe("an agreement in a room needs the room", () => {
    /** A revealed group of three, every seat READY. */
    async function revealedGroup() {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      const guests = [];
      for (const token of tokens) {
        const exchanged = await access.exchange(token);
        const seat = await pool.query(
          `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
          [exchanged.guestSessionId],
        );
        guests.push({
          kind: "GUEST" as const,
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        });
      }
      const organizer = { kind: "USER" as const, userId: ORGANIZER };
      // The group is the group before anybody confirms: under the flexible
      // rules the last acceptance does not open the room, the organiser does.
      await continueWithEveryone(created.activityId);
      for (const actor of [organizer, ...guests]) {
        await open.confirmShare(
          actor,
          created.activityId,
          {
            mode: "SELECTED_FIELDS",
            fields: [{ fieldKey: "campo-a", value: "algo" }],
          },
          randomUUID(),
        );
      }
      return { ...created, organizer, guests };
    }

    it("stays a proposal until the third person confirms it", async () => {
      const group = await revealedGroup();
      const proposed = await open.proposeArtifact(
        group.organizer,
        group.activityId,
        "lo que vamos a intentar",
        randomUUID(),
      );
      // Proposing is not agreeing: the organiser confirms their own text like
      // everybody else, which is why three confirmations are needed and not
      // two-plus-a-proposal.
      const first = await open.confirmArtifact(
        group.organizer,
        group.activityId,
        proposed.artifactId,
        proposed.version,
        randomUUID(),
      );
      expect(first.agreed).toBe(false);
      const second = await open.confirmArtifact(
        group.guests[0]!,
        group.activityId,
        proposed.artifactId,
        proposed.version,
        randomUUID(),
      );
      // Two of three. In a Dúo two confirmations ARE everybody; here they are
      // not, and the difference is `requiredParticipants`, not a constant.
      expect(second.agreed).toBe(false);
      const third = await open.confirmArtifact(
        group.guests[1]!,
        group.activityId,
        proposed.artifactId,
        proposed.version,
        randomUUID(),
      );
      expect(third.agreed).toBe(true);
    }, 45_000);

    it("does not carry confirmations across a new version", async () => {
      const group = await revealedGroup();
      const first = await open.proposeArtifact(
        group.organizer,
        group.activityId,
        "primera propuesta",
        randomUUID(),
      );
      await open.confirmArtifact(
        group.organizer,
        group.activityId,
        first.artifactId,
        first.version,
        randomUUID(),
      );
      await open.confirmArtifact(
        group.guests[0]!,
        group.activityId,
        first.artifactId,
        first.version,
        randomUUID(),
      );
      // Somebody rewrites it. Everyone has to agree to the TEXT in front of
      // them, so the earlier confirmation cannot count towards the new one.
      const second = await open.proposeArtifact(
        group.guests[1]!,
        group.activityId,
        "segunda propuesta",
        randomUUID(),
      );
      expect(second.artifactId).not.toBe(first.artifactId);
      const confirmed = await open.confirmArtifact(
        group.organizer,
        group.activityId,
        second.artifactId,
        second.version,
        randomUUID(),
      );
      expect(confirmed.agreed).toBe(false);
      const agreedRows = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleArtifact"
          WHERE "activityId"=$1 AND "agreedAt" IS NOT NULL`,
        [group.activityId],
      );
      expect(agreedRows.rows[0].n).toBe(0);
    }, 45_000);

    it("closes on the last follow-up decision, not on the second", async () => {
      const group = await revealedGroup();
      const status = async () => {
        const row = await pool.query(
          `SELECT "status" FROM "CircleActivity" WHERE "id"=$1`,
          [group.activityId],
        );
        return row.rows[0].status as string;
      };
      // The template's follow-up is a week out. Moving the due date is how the
      // suite reaches the stage without waiting for a week or faking a clock
      // the domain would not read anyway.
      await pool.query(
        `UPDATE "CircleActivity" SET "followUpDueAt" = now() - interval '1 hour'
          WHERE "id"=$1`,
        [group.activityId],
      );
      await open.recordFollowUp(
        group.organizer,
        group.activityId,
        "KEEP",
        randomUUID(),
      );
      await open.recordFollowUp(
        group.guests[0]!,
        group.activityId,
        "KEEP",
        randomUUID(),
      );
      expect(await status()).not.toBe("CLOSED");
      await open.recordFollowUp(
        group.guests[1]!,
        group.activityId,
        "CLOSE",
        randomUUID(),
      );
      expect(await status()).toBe("CLOSED");
    }, 45_000);
  });

  // ══ The corrective block ═════════════════════════════════════════════════

  describe("the ORGANISER decides when preparation begins", () => {
    /** A group of `size` with its invitations minted and nobody in yet. */
    async function invitedGroup(size: number) {
      const tokens = mintTokens(size - 1);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size,
        idempotencyKey: randomUUID(),
      });
      return { ...created, tokens };
    }

    const statusOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT "status"::text AS s FROM "CircleActivity" WHERE "id"=$1`,
        [activityId],
      );
      return row.rows[0].s as string;
    };

    const acceptAs = async (token: string, activityId: string) => {
      const exchanged = await access.exchange(token);
      const seat = await pool.query(
        `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
        [exchanged.guestSessionId],
      );
      return {
        kind: "GUEST" as const,
        guestSessionId: exchanged.guestSessionId,
        activityId,
        participantId: seat.rows[0].participantId as string,
      };
    };

    it("stays INVITING however many accept, until the organiser continues", async () => {
      // REPLACES the roster rule, and keeps the half of it that still holds.
      //
      // The original bug was the FIRST acceptance opening preparation, which
      // left a room with an empty seat that could never reveal. The fix then
      // was "wait for the LAST one"; the fix now is "wait for the person who
      // owns the room", which also covers the case the roster rule could not:
      // somebody who never answers at all.
      //
      // What must still hold — and is why preparing early is safe — is that
      // ACCEPTING does not open the room. Nobody's audience is fixed behind
      // their back.
      const group = await invitedGroup(3);
      expect(await statusOf(group.activityId)).toBe("INVITING");

      await acceptAs(group.tokens[0]!, group.activityId);
      expect(await statusOf(group.activityId)).toBe("INVITING");

      await acceptAs(group.tokens[1]!, group.activityId);
      expect(
        await statusOf(group.activityId),
        "even a FULL room waits for the organiser",
      ).toBe("INVITING");

      await open.closeOnboarding(
        { kind: "USER", userId: ORGANIZER },
        group.activityId,
        randomUUID(),
      );
      expect(await statusOf(group.activityId)).toBe("PREPARING");
    }, 30_000);

    it("refuses a confirmation while the group is not fixed, and SAYS so", async () => {
      const group = await invitedGroup(3);
      const guest = await acceptAs(group.tokens[0]!, group.activityId);
      const organizer = { kind: "USER" as const, userId: ORGANIZER };

      for (const actor of [organizer, guest]) {
        expect(
          await codeOf(() =>
            open.confirmShare(
              actor,
              group.activityId,
              {
                mode: "SELECTED_FIELDS",
                fields: [{ fieldKey: "campo-a", value: "temprano" }],
              },
              randomUUID(),
            ),
          ),
          // The code changed with the rule, and that is the point of the
          // change: the old opaque answer was rendered as «esta actividad ya
          // no admite cambios» to somebody whose room was simply still open.
        ).toBe("CIRCLE_ONBOARDING_OPEN");
      }
      // And nothing was written on the way to refusing.
      const ready = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleActivityParticipant"
          WHERE "activityId"=$1 AND "status"='READY'`,
        [group.activityId],
      );
      expect(ready.rows[0].n).toBe(0);
    }, 30_000);

    it("leaves a Dúo exactly as it was", async () => {
      const token = mintToken();
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: randomUUID(),
      });
      expect(await statusOf(created.activityId)).toBe("INVITING");
      await access.exchange(token);
      // One guest: the first acceptance IS the last, so the Dúo reaches
      // PREPARING on exactly the event it always did.
      expect(await statusOf(created.activityId)).toBe("PREPARING");
    }, 30_000);
  });

  describe("keeping it private ends a group, and names nobody", () => {
    /** A group of three with every seat accepted and nobody confirmed. */
    async function preparingGroup() {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      const guests = [];
      for (const token of tokens) {
        const exchanged = await access.exchange(token);
        const seat = await pool.query(
          `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
          [exchanged.guestSessionId],
        );
        guests.push({
          kind: "GUEST" as const,
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        });
      }
      // Everybody is in, so the organiser continues with everybody. The room
      // reaches `PREPARING` the way it does now: because somebody said so.
      await continueWithEveryone(created.activityId);
      return {
        ...created,
        organizer: { kind: "USER" as const, userId: ORGANIZER },
        guests,
      };
    }

    const share = (value: string) =>
      ({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value }],
      }) as const;

    it("cancels the activity instead of taking a snapshot", async () => {
      const group = await preparingGroup();
      await open.confirmShare(
        group.organizer,
        group.activityId,
        share("lo del organizador"),
        randomUUID(),
      );

      const result = await open.confirmShare(
        group.guests[0]!,
        group.activityId,
        { mode: "KEEP_PRIVATE" },
        randomUUID(),
      );
      expect(result.cancelled).toBe(true);
      expect(result.revealed).toBe(false);

      const row = await pool.query(
        `SELECT "status"::text AS s, "revealedAt" FROM "CircleActivity" WHERE "id"=$1`,
        [group.activityId],
      );
      expect(row.rows[0].s).toBe("CANCELLED");
      expect(row.rows[0].revealedAt).toBeNull();

      // No seat went READY for that choice, and the organiser's confirmed
      // envelope — sealed for a conversation that will not happen — is gone.
      const seats = await pool.query(
        `SELECT count(*) FILTER (WHERE "status"='READY')::int AS ready,
                count(*) FILTER (WHERE "ciphertext" IS NOT NULL)::int AS sealed
           FROM "CircleActivityParticipant" WHERE "activityId"=$1`,
        [group.activityId],
      );
      expect(seats.rows[0]).toMatchObject({ ready: 0, sealed: 0 });

      // Everything derived from the activity is revoked.
      const live = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM "CircleInvitation"
             WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS invitations,
           (SELECT count(*)::int FROM "CircleGuestSession"
             WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS sessions`,
        [group.activityId],
      );
      expect(live.rows[0]).toMatchObject({ invitations: 0, sessions: 0 });
    }, 30_000);

    it("leaves a record that cannot say which exit it was", async () => {
      const group = await preparingGroup();
      await open.confirmShare(
        group.guests[1]!,
        group.activityId,
        { mode: "KEEP_PRIVATE" },
        randomUUID(),
      );
      const events = await pool.query(
        // ORDER BY the TEXT, not the enum: PostgreSQL sorts an enum by its
        // DECLARATION order, so `ORDER BY "type"` is stable but not the order
        // anybody reading this would guess.
        `SELECT "type"::text AS t, "metadata" FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type" IN ('PARTICIPANT_WITHDRAWN','ACTIVITY_CANCELLED')
          ORDER BY "type"::text`,
        [group.activityId],
      );
      // The same two rows a plain withdrawal writes, and no metadata on
      // either: the ledger's grammar has nowhere to record a reason.
      expect(events.rows.map((r) => r.t)).toEqual([
        "ACTIVITY_CANCELLED",
        "PARTICIPANT_WITHDRAWN",
      ]);
      expect(events.rows.every((r) => r.metadata === null)).toBe(true);
      // And no sharing mode survives anywhere on the roster.
      const modes = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleActivityParticipant"
          WHERE "activityId"=$1 AND "sharingMode" IS NOT NULL`,
        [group.activityId],
      );
      expect(modes.rows[0].n).toBe(0);
    }, 30_000);

    it("tells the others nothing about who chose it", async () => {
      const group = await preparingGroup();
      await open.confirmShare(
        group.guests[0]!,
        group.activityId,
        { mode: "KEEP_PRIVATE" },
        randomUUID(),
      );
      const view = await facadeRead(group.organizer, group.activityId);
      expect(view.status).toBe("CANCELLED");
      expect(view.revealed).toBeNull();
      // Not a label, not a seat id, not a sharing mode.
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain("KEEP_PRIVATE");
      expect(serialized).not.toContain(group.guests[0]!.participantId);
      expect(serialized).not.toContain("Participante");
    }, 30_000);

    it("replays the same key instead of failing on a cancelled activity", async () => {
      // The organiser chooses it, because a MEMBER keeps their session after
      // the exit and can therefore retry. A guest cannot, by design: the exit
      // revokes the credential, and that asymmetry is documented on
      // `withdraw` rather than engineered away.
      const group = await preparingGroup();
      const key = randomUUID();
      const first = await open.confirmShare(
        group.organizer,
        group.activityId,
        { mode: "KEEP_PRIVATE" },
        key,
      );
      expect(first.cancelled).toBe(true);
      expect(first.replayed).toBe(false);

      const replay = await open.confirmShare(
        group.organizer,
        group.activityId,
        { mode: "KEEP_PRIVATE" },
        key,
      );
      // The same answer, not "this activity is unavailable" — which is what a
      // dropped connection would otherwise have been told about the very
      // request that worked.
      expect(replay).toMatchObject({ cancelled: true, replayed: true });

      // And exactly one exit was recorded, whatever the caller did.
      const events = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type"='PARTICIPANT_WITHDRAWN'`,
        [group.activityId],
      );
      expect(events.rows[0].n).toBe(1);

      // A DIFFERENT key on a cancelled activity is refused rather than
      // silently replayed.
      expect(
        await codeOf(() =>
          open.confirmShare(
            group.organizer,
            group.activityId,
            { mode: "KEEP_PRIVATE" },
            randomUUID(),
          ),
        ),
      ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    }, 30_000);

    it("keeps the Dúo's meaning of KEEP_PRIVATE", async () => {
      const token = mintToken();
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: randomUUID(),
      });
      const exchanged = await access.exchange(token);
      const seat = await pool.query(
        `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
        [exchanged.guestSessionId],
      );
      const guest = {
        kind: "GUEST" as const,
        guestSessionId: exchanged.guestSessionId,
        activityId: created.activityId,
        participantId: seat.rows[0].participantId as string,
      };
      await open.confirmShare(
        { kind: "USER" as const, userId: ORGANIZER },
        created.activityId,
        share("lo mio"),
        randomUUID(),
      );
      const result = await open.confirmShare(
        guest,
        created.activityId,
        { mode: "KEEP_PRIVATE" },
        randomUUID(),
      );
      // Unchanged: a confirmation that shares nothing, a READY seat, and the
      // barrier opens the exchange.
      expect(result.cancelled).toBeUndefined();
      expect(result.revealed).toBe(true);
      const row = await pool.query(
        `SELECT "status"::text AS s FROM "CircleActivity" WHERE "id"=$1`,
        [created.activityId],
      );
      expect(row.rows[0].s).toBe("REVEALED");
    }, 30_000);
  });

  describe("leaving a revealed room closes it for everybody", () => {
    const share = (value: string) =>
      ({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value }],
      }) as const;

    /** A revealed group of three, every seat READY. */
    async function revealed(size = 3) {
      const tokens = mintTokens(size - 1);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size,
        idempotencyKey: randomUUID(),
      });
      const guests = [];
      for (const token of tokens) {
        const exchanged = await access.exchange(token);
        const seat = await pool.query(
          `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
          [exchanged.guestSessionId],
        );
        guests.push({
          kind: "GUEST" as const,
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        });
      }
      const organizer = { kind: "USER" as const, userId: ORGANIZER };
      // The organiser continues with everybody before anybody confirms.
      await continueWithEveryone(created.activityId);
      for (const [index, actor] of [organizer, ...guests].entries()) {
        await open.confirmShare(
          actor,
          created.activityId,
          share(`respuesta ${index}`),
          randomUUID(),
        );
      }
      return { ...created, organizer, guests };
    }

    it("serves nothing to the ORGANISER after a guest leaves", async () => {
      const group = await revealed();
      // An AGREED artifact first, so "the shared result disappears" is a claim
      // about content that was demonstrably being served a moment earlier.
      const proposal = await open.proposeArtifact(
        group.organizer,
        group.activityId,
        "lo que vamos a intentar",
        randomUUID(),
      );
      for (const actor of [group.organizer, ...group.guests]) {
        await open.confirmArtifact(
          actor,
          group.activityId,
          proposal.artifactId,
          proposal.version,
          randomUUID(),
        );
      }

      const before = await facadeRead(group.organizer, group.activityId);
      expect(before.revealed?.participants).toHaveLength(2);
      expect(before.artifact?.body).toBe("lo que vamos a intentar");

      await open.withdraw(group.guests[0]!, group.activityId, randomUUID());

      const after = await facadeRead(group.organizer, group.activityId);
      expect(after.status).toBe("CLOSED");
      expect(after.revealed, "no selections at all").toBeNull();
      expect(after.artifact, "and no shared result either").toBeNull();
      // Not an empty list to count, and not a sentence anybody wrote.
      const serialized = JSON.stringify(after);
      expect(serialized).not.toContain("respuesta 1");
      expect(serialized).not.toContain("respuesta 2");
      expect(serialized).not.toContain("lo que vamos a intentar");
      // The artifact row is untouched — this is authorization, not deletion.
      const kept = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleArtifact"
          WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL`,
        [group.activityId],
      );
      expect(kept.rows[0].n).toBe(1);
      // Their OWN confirmed answer is still theirs to read back.
      expect(after.you.confirmed).not.toBeNull();
    }, 45_000);

    it("serves nothing to a REMAINING guest either", async () => {
      const group = await revealed();
      await open.withdraw(group.organizer, group.activityId, randomUUID());

      // The remaining guest's session was revoked with everybody's, so the
      // guard refuses before the read even happens. Both layers are checked:
      // the credential, and — below — the projection for a member who has no
      // guest session to revoke.
      const live = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleGuestSession"
          WHERE "activityId"=$1 AND "revokedAt" IS NULL`,
        [group.activityId],
      );
      expect(live.rows[0].n).toBe(0);

      const invitations = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleInvitation"
          WHERE "activityId"=$1 AND "revokedAt" IS NULL`,
        [group.activityId],
      );
      expect(invitations.rows[0].n).toBe(0);
    }, 45_000);

    it("refuses new commands on the closed conversation", async () => {
      const group = await revealed();
      await open.withdraw(group.guests[0]!, group.activityId, randomUUID());

      for (const attempt of [
        () =>
          open.proposeArtifact(
            group.organizer,
            group.activityId,
            "un acuerdo tardío",
            randomUUID(),
          ),
        () =>
          open.recordFollowUp(
            group.organizer,
            group.activityId,
            "KEEP",
            randomUUID(),
          ),
        () => open.withdraw(group.organizer, group.activityId, randomUUID()),
        () =>
          open.confirmShare(
            group.organizer,
            group.activityId,
            share("otra vez"),
            randomUUID(),
          ),
      ]) {
        expect(await codeOf(attempt)).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
      }
    }, 45_000);

    it("keeps the rows: this is authorization, not deletion", async () => {
      const group = await revealed();
      const before = await pool.query(
        `SELECT count(*) FILTER (WHERE "ciphertext" IS NOT NULL)::int AS sealed
           FROM "CircleActivityParticipant" WHERE "activityId"=$1`,
        [group.activityId],
      );
      await open.withdraw(group.guests[1]!, group.activityId, randomUUID());
      const after = await pool.query(
        `SELECT count(*) FILTER (WHERE "ciphertext" IS NOT NULL)::int AS sealed
           FROM "CircleActivityParticipant" WHERE "activityId"=$1`,
        [group.activityId],
      );
      // One envelope goes — the leaver's own, as it always has. The rest stay
      // exactly where they were: retention is governed by the approved policy,
      // and closing access is not a licence to rewrite it.
      expect(after.rows[0].sealed).toBe(before.rows[0].sealed - 1);
    }, 45_000);

    it("leaves the Dúo's post-reveal rule alone", async () => {
      const token = mintToken();
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: randomUUID(),
      });
      const exchanged = await access.exchange(token);
      const seat = await pool.query(
        `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
        [exchanged.guestSessionId],
      );
      const guest = {
        kind: "GUEST" as const,
        guestSessionId: exchanged.guestSessionId,
        activityId: created.activityId,
        participantId: seat.rows[0].participantId as string,
      };
      const organizer = { kind: "USER" as const, userId: ORGANIZER };
      for (const actor of [organizer, guest]) {
        await open.confirmShare(
          actor,
          created.activityId,
          share("lo de cada quien"),
          randomUUID(),
        );
      }
      const proposal = await open.proposeArtifact(
        organizer,
        created.activityId,
        "el acuerdo de dos",
        randomUUID(),
      );
      for (const actor of [organizer, guest]) {
        await open.confirmArtifact(
          actor,
          created.activityId,
          proposal.artifactId,
          proposal.version,
          randomUUID(),
        );
      }
      await open.withdraw(guest, created.activityId, randomUUID());

      // Unchanged and deliberate. The leaver's own envelope is purged — that
      // has always been true, in both shapes — but the agreed result stays
      // readable for the person who is still there, because in a two-person
      // exchange it is half theirs and they have already seen it. A group is
      // where that stops being true, and the test above is where that is
      // asserted.
      const view = await facadeRead(organizer, created.activityId);
      expect(view.status).toBe("CLOSED");
      expect(view.artifact?.body).toBe("el acuerdo de dos");
      expect(view.you.confirmed).not.toBeNull();
    }, 45_000);
  });

  describe("the waiting response counts nobody", () => {
    it("omits readyCount entirely while a group prepares", async () => {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      for (const token of tokens) await access.exchange(token);
      // Everybody accepted, so the organiser continues with everybody.
      await continueWithEveryone(created.activityId);
      const organizer = { kind: "USER" as const, userId: ORGANIZER };
      await open.confirmShare(
        organizer,
        created.activityId,
        {
          mode: "SELECTED_FIELDS",
          fields: [{ fieldKey: "campo-a", value: "lo mio" }],
        },
        randomUUID(),
      );

      const view = await facadeRead(organizer, created.activityId);
      // ABSENT, not zero and not stale: the key is not in the object at all,
      // so there is nothing for a reader to reconstruct from.
      expect("readyCount" in view).toBe(false);
      expect(JSON.stringify(view)).not.toContain("readyCount");
      // The SIZE stays — somebody agreed to write for three people and is
      // entitled to keep seeing that it is three.
      expect(view.requiredParticipants).toBe(3);
      // And nothing per seat: one status for the room, and no timestamps.
      expect(Object.keys(view.counterpart)).toEqual(["status"]);
      expect(JSON.stringify(view)).not.toContain("readyAt");
    }, 45_000);

    it("sends it again once there is nothing left to wait for", async () => {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      const actors: CircleActor[] = [{ kind: "USER", userId: ORGANIZER }];
      for (const token of tokens) {
        const exchanged = await access.exchange(token);
        const seat = await pool.query(
          `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
          [exchanged.guestSessionId],
        );
        actors.push({
          kind: "GUEST",
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        });
      }
      // The group is the group before anybody confirms.
      await continueWithEveryone(created.activityId);
      for (const actor of actors) {
        await open.confirmShare(
          actor,
          created.activityId,
          {
            mode: "SELECTED_FIELDS",
            fields: [{ fieldKey: "campo-a", value: "algo" }],
          },
          randomUUID(),
        );
      }
      const view = await facadeRead(actors[0]!, created.activityId);
      // After the reveal every seat is READY by construction, so the number
      // carries no timing information about anybody.
      expect(view.readyCount).toBe(3);
    }, 45_000);

    it("keeps sending it for a Dúo, at every stage", async () => {
      const token = mintToken();
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: randomUUID(),
      });
      await access.exchange(token);
      const view = await facadeRead(
        { kind: "USER", userId: ORGANIZER },
        created.activityId,
      );
      expect(view.readyCount).toBe(0);
    }, 30_000);
  });

  describe("a clock ends what a person can no longer finish", () => {
    const sweeper = () =>
      new CirclesSweepService(
        prisma as never,
        new CircleActivityRepository(prisma),
        new CircleEventRepository(prisma),
        new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
        new CircleParticipantRepository(prisma),
        new CircleInvitationRepository(prisma),
        new CircleGuestSessionRepository(prisma),
      );

    const statusOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT "status"::text AS s FROM "CircleActivity" WHERE "id"=$1`,
        [activityId],
      );
      return row.rows[0].s as string;
    };

    /** A group of three with `accepted` of its guest seats filled. */
    async function partiallyAccepted(accepted: number) {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      // The pre-change rules, which is what this suite is about: one dead
      // link ends a room where every invited seat was essential.
      await asLegacyFixedRoom(created.activityId);
      for (const token of tokens.slice(0, accepted)) {
        await access.exchange(token);
      }
      return { ...created, tokens };
    }

    it("cancels a group whose remaining link has expired", async () => {
      const group = await partiallyAccepted(1);
      expect(await statusOf(group.activityId)).toBe("INVITING");

      // The DATA is aged, not the clock. One essential seat can no longer be
      // filled, and with a fixed roster that is enough — the sweep does not
      // wait for the links that are still alive.
      await pool.query(
        // BOTH ends move. `CircleInvitation_expires_after_creation` refuses a
        // row whose expiry precedes its creation, so an invitation cannot be
        // aged by pushing only one of them into the past.
        `UPDATE "CircleInvitation"
            SET "createdAt" = now() - interval '15 days',
                "expiresAt" = now() - interval '1 hour'
          WHERE "activityId"=$1 AND "consumedAt" IS NULL`,
        [group.activityId],
      );

      const summary = await sweeper().sweep();
      expect(summary.incompleteGroupsCancelled).toBeGreaterThanOrEqual(1);
      expect(await statusOf(group.activityId)).toBe("CANCELLED");

      // Everything derived is revoked and nothing sealed is left pending.
      const rows = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM "CircleGuestSession"
             WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS sessions,
           (SELECT count(*)::int FROM "CircleInvitation"
             WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS invitations,
           (SELECT count(*)::int FROM "CircleActivityParticipant"
             WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL) AS sealed`,
        [group.activityId],
      );
      expect(rows.rows[0]).toMatchObject({
        sessions: 0,
        invitations: 0,
        sealed: 0,
      });

      // A clock did this. The ledger says the activity was cancelled and
      // nothing else: no actor, no participant event, no metadata.
      const events = await pool.query(
        `SELECT "type"::text AS t, "actorUserId", "actorParticipantId", "metadata"
           FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type"='ACTIVITY_CANCELLED'`,
        [group.activityId],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0]).toMatchObject({
        actorUserId: null,
        actorParticipantId: null,
        metadata: null,
      });
      const withdrawals = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type"='PARTICIPANT_WITHDRAWN'`,
        [group.activityId],
      );
      expect(withdrawals.rows[0].n, "an expiry is not a decision").toBe(0);
    }, 60_000);

    it("cancels a legacy group the old code left in PREPARING", async () => {
      // The state the previous cut created: moved on the FIRST acceptance,
      // with a seat still INVITED. Selecting by status alone would step over
      // exactly the rooms this sweep was added for.
      const group = await partiallyAccepted(1);
      await pool.query(
        `UPDATE "CircleActivity" SET "status"='PREPARING' WHERE "id"=$1`,
        [group.activityId],
      );
      await pool.query(
        // BOTH ends move. `CircleInvitation_expires_after_creation` refuses a
        // row whose expiry precedes its creation, so an invitation cannot be
        // aged by pushing only one of them into the past.
        `UPDATE "CircleInvitation"
            SET "createdAt" = now() - interval '15 days',
                "expiresAt" = now() - interval '1 hour'
          WHERE "activityId"=$1 AND "consumedAt" IS NULL`,
        [group.activityId],
      );

      await sweeper().sweep();
      expect(await statusOf(group.activityId)).toBe("CANCELLED");
    }, 60_000);

    it("leaves a group whose links are all still alive", async () => {
      const group = await partiallyAccepted(1);
      await sweeper().sweep();
      // Nothing has gone wrong yet: somebody can still accept.
      expect(await statusOf(group.activityId)).toBe("INVITING");
    }, 60_000);

    it("lets the last acceptance win a race against the expiry", async () => {
      const group = await partiallyAccepted(1);
      // The link is dead by the clock AND somebody is redeeming it at the same
      // moment. Only one outcome may stand: either the room completes, or it
      // is cancelled — never a cancelled room with a fresh guest inside it.
      await pool.query(
        // BOTH ends move. `CircleInvitation_expires_after_creation` refuses a
        // row whose expiry precedes its creation, so an invitation cannot be
        // aged by pushing only one of them into the past.
        `UPDATE "CircleInvitation"
            SET "createdAt" = now() - interval '15 days',
                "expiresAt" = now() - interval '1 hour'
          WHERE "activityId"=$1 AND "consumedAt" IS NULL`,
        [group.activityId],
      );
      const [accepted, swept] = await Promise.allSettled([
        access.exchange(group.tokens[1]!),
        sweeper().sweep(),
      ]);
      void swept;

      const status = await statusOf(group.activityId);
      if (accepted.status === "fulfilled") {
        // An expired link should not have been redeemable at all — but if the
        // domain admitted it, the room must be usable rather than cancelled.
        expect(status).toBe("PREPARING");
      } else {
        expect(status).toBe("CANCELLED");
        const live = await pool.query(
          `SELECT count(*)::int AS n FROM "CircleGuestSession"
            WHERE "activityId"=$1 AND "revokedAt" IS NULL`,
          [group.activityId],
        );
        expect(live.rows[0].n, "no session survives a cancelled room").toBe(0);
      }
    }, 60_000);

    it("closes a group's follow-up when its window runs out", async () => {
      const share = (value: string) =>
        ({
          mode: "SELECTED_FIELDS",
          fields: [{ fieldKey: "campo-a", value }],
        }) as const;
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      const actors: CircleActor[] = [{ kind: "USER", userId: ORGANIZER }];
      for (const token of tokens) {
        const exchanged = await access.exchange(token);
        const seat = await pool.query(
          `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
          [exchanged.guestSessionId],
        );
        actors.push({
          kind: "GUEST",
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        });
      }
      // The group is the group before anybody confirms.
      await continueWithEveryone(created.activityId);
      for (const [index, actor] of actors.entries()) {
        await open.confirmShare(
          actor,
          created.activityId,
          share(`respuesta ${index}`),
          randomUUID(),
        );
      }

      // INSIDE the window first: the follow-up opens on its date and stays
      // open, because two days is not seven.
      await pool.query(
        `UPDATE "CircleActivity"
            SET "followUpDueAt" = now() - interval '2 days'
          WHERE "id"=$1`,
        [created.activityId],
      );
      const first = await sweeper().sweep();
      expect(first.followUpOpened).toBeGreaterThanOrEqual(1);
      expect(first.followUpClosed).toBe(0);
      expect(await statusOf(created.activityId)).toBe("FOLLOW_UP");

      // PAST the window. The data is aged, not the clock, and not the
      // production deadline.
      await pool.query(
        `UPDATE "CircleActivity"
            SET "followUpDueAt" = now() - interval '8 days'
          WHERE "id"=$1`,
        [created.activityId],
      );
      const second = await sweeper().sweep();
      expect(second.followUpClosed).toBeGreaterThanOrEqual(1);
      expect(await statusOf(created.activityId)).toBe("CLOSED");

      // Closed by time, with nothing that looks like an answer.
      const decisions = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleActivityParticipant"
          WHERE "activityId"=$1 AND "followUpDecision" IS NOT NULL`,
        [created.activityId],
      );
      expect(decisions.rows[0].n, "a timer decides nothing").toBe(0);
      const recorded = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type"='FOLLOW_UP_RECORDED'`,
        [created.activityId],
      );
      expect(recorded.rows[0].n).toBe(0);

      // Idempotent: a second run finds nothing left to close.
      const third = await sweeper().sweep();
      expect(third.followUpClosed).toBe(0);
    }, 90_000);

    it("does not close a Dúo's follow-up on time", async () => {
      const token = mintToken();
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: randomUUID(),
      });
      const exchanged = await access.exchange(token);
      const seat = await pool.query(
        `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
        [exchanged.guestSessionId],
      );
      const share = {
        mode: "SELECTED_FIELDS" as const,
        fields: [{ fieldKey: "campo-a", value: "lo de cada quien" }],
      };
      for (const actor of [
        { kind: "USER" as const, userId: ORGANIZER },
        {
          kind: "GUEST" as const,
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        },
      ]) {
        await open.confirmShare(actor, created.activityId, share, randomUUID());
      }
      await pool.query(
        `UPDATE "CircleActivity"
            SET "followUpDueAt" = now() - interval '30 days'
          WHERE "id"=$1`,
        [created.activityId],
      );
      await sweeper().sweep();
      await sweeper().sweep();
      // The Dúo's follow-up policy is untouched by this cut: it opens on time
      // and it is not closed by a timer.
      expect(await statusOf(created.activityId)).toBe("FOLLOW_UP");
    }, 90_000);
  });

  // ══ The corrective block: expiry, locks and idempotency ══════════════════

  describe("expiry cleans up whatever route it takes", () => {
    const sweeper = () =>
      new CirclesSweepService(
        prisma as never,
        new CircleActivityRepository(prisma),
        new CircleEventRepository(prisma),
        new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
        new CircleParticipantRepository(prisma),
        new CircleInvitationRepository(prisma),
        new CircleGuestSessionRepository(prisma),
      );

    const statusOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT "status"::text AS s FROM "CircleActivity" WHERE "id"=$1`,
        [activityId],
      );
      return row.rows[0].s as string;
    };

    /** Everything derived from an activity that is still usable. */
    const liveOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM "CircleGuestSession"
             WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS sessions,
           (SELECT count(*)::int FROM "CircleInvitation"
             WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS invitations,
           (SELECT count(*)::int FROM "CircleActivityParticipant"
             WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL) AS envelopes,
           (SELECT count(*)::int FROM "CircleEvent"
             WHERE "activityId"=$1 AND "type"='ACTIVITY_CANCELLED') AS cancellations,
           (SELECT count(*)::int FROM "CircleEvent"
             WHERE "activityId"=$1 AND "type"='PARTICIPANT_WITHDRAWN') AS withdrawals`,
        [activityId],
      );
      return row.rows[0] as {
        sessions: number;
        invitations: number;
        envelopes: number;
        cancellations: number;
        withdrawals: number;
      };
    };

    /** Age an invitation at BOTH ends; a CHECK requires expiry after creation. */
    const expireInvitations = (activityId: string, onlyUnconsumed = false) =>
      pool.query(
        `UPDATE "CircleInvitation"
            SET "createdAt" = now() - interval '15 days',
                "expiresAt" = now() - interval '1 hour'
          WHERE "activityId"=$1 ${onlyUnconsumed ? 'AND "consumedAt" IS NULL' : ""}`,
        [activityId],
      );

    /** A group of three with `accepted` guest seats filled. */
    async function partiallyAccepted(accepted: number) {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      // These suites are about the rules a room created BEFORE this change
      // runs on, and the sweep still owes those rooms the old policy.
      await asLegacyFixedRoom(created.activityId);
      const sessions: string[] = [];
      for (const token of tokens.slice(0, accepted)) {
        const exchanged = await access.exchange(token);
        sessions.push(exchanged.guestSessionId);
      }
      return { ...created, tokens, sessions };
    }

    it("cleans up a group whose links ALL expired, consumed one included", async () => {
      // The route the finding is about. With every invitation dead — the one
      // an accepted guest already consumed as well — the activity also matches
      // the Dúo rule, which runs FIRST and cancels without revoking anything.
      // The group-specific pass then skips it for being CANCELLED already, and
      // a live guest session is left pointing at a cancelled room.
      const group = await partiallyAccepted(1);
      await expireInvitations(group.activityId);
      const before = await liveOf(group.activityId);
      expect(before.sessions, "a session is live before the sweep").toBe(1);

      await sweeper().sweep();

      expect(await statusOf(group.activityId)).toBe("CANCELLED");
      const after = await liveOf(group.activityId);
      expect(after.sessions, "no session survives").toBe(0);
      expect(after.invitations, "no invitation survives").toBe(0);
      expect(after.envelopes, "no envelope survives").toBe(0);
      expect(after.cancellations, "exactly one cancellation").toBe(1);
      expect(after.withdrawals, "an expiry is not a decision").toBe(0);

      // Idempotent: a second pass finds nothing left to do.
      const again = await sweeper().sweep();
      expect(again.incompleteGroupsCancelled).toBe(0);
      expect(again.invitingCancelled).toBe(0);
      const twice = await liveOf(group.activityId);
      expect(twice.cancellations).toBe(1);
    }, 90_000);

    it("cleans up a group with ONE dead link and others alive", async () => {
      const group = await partiallyAccepted(1);
      await expireInvitations(group.activityId, true);
      await sweeper().sweep();
      expect(await statusOf(group.activityId)).toBe("CANCELLED");
      const after = await liveOf(group.activityId);
      expect(after).toMatchObject({
        sessions: 0,
        invitations: 0,
        envelopes: 0,
        cancellations: 1,
      });
    }, 90_000);

    it("cleans up a legacy group the old code left in PREPARING", async () => {
      const group = await partiallyAccepted(1);
      await pool.query(
        `UPDATE "CircleActivity" SET "status"='PREPARING' WHERE "id"=$1`,
        [group.activityId],
      );
      await expireInvitations(group.activityId);
      await sweeper().sweep();
      expect(await statusOf(group.activityId)).toBe("CANCELLED");
      const after = await liveOf(group.activityId);
      expect(after).toMatchObject({
        sessions: 0,
        invitations: 0,
        cancellations: 1,
      });
    }, 90_000);

    it("leaves the Dúo's own expiry route exactly where it was", async () => {
      const token = mintToken();
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: randomUUID(),
      });
      await expireInvitations(created.activityId);
      const summary = await sweeper().sweep();
      expect(
        summary.invitingCancelled,
        "a Dúo is still cancelled by the Dúo rule",
      ).toBeGreaterThanOrEqual(1);
      expect(await statusOf(created.activityId)).toBe("CANCELLED");
    }, 90_000);
  });

  /**
   * Everybody accepted, so the organiser continues with everybody.
   *
   * The replacement for a rule this block intentionally removed. The roster
   * completing used to open the preparation by itself; now a room waits for
   * the person who owns it to say the group is the group — even when the
   * group happens to be everyone invited. The fixtures below want a room in
   * `PREPARING`, and this is how a room gets there.
   */
  const continueWithEveryone = (activityId: string) =>
    open.closeOnboarding(
      { kind: "USER", userId: ORGANIZER },
      activityId,
      randomUUID(),
    );

  /**
   * Make a room that predates flexible onboarding — the only way there is.
   *
   * `onboarding` is immutable by trigger, deliberately: a room offered under
   * one set of rules cannot be switched to the other while people are inside
   * it. That is right, and it also means a room created by today's code can
   * never BE a legacy room, so the compatibility these suites check —
   * «las salas ya creadas conservan las reglas con las que entraron sus
   * participantes» — would be untestable without manufacturing one.
   *
   * So the trigger is lifted for exactly one statement, on a database this
   * suite owns, and put back immediately. Nothing in the product can do this;
   * if this helper ever stops raising when removed, the trigger is gone.
   */
  const asLegacyFixedRoom = async (activityId: string) => {
    await pool.query(
      `ALTER TABLE "CircleActivity" DISABLE TRIGGER "CircleActivity_pin_immutable"`,
    );
    try {
      await pool.query(
        `UPDATE "CircleActivity" SET "onboarding"='FIXED' WHERE "id"=$1`,
        [activityId],
      );
    } finally {
      await pool.query(
        `ALTER TABLE "CircleActivity" ENABLE TRIGGER "CircleActivity_pin_immutable"`,
      );
    }
  };

  // ══ The race harness: two transactions, both named, no sleeps ═══════════
  //
  // Shared by every race below. It is here rather than inside one suite
  // because the same machinery answers the same question about three
  // different commands, and three copies of it would drift.

  /**
   * One transaction's seat in the race.
   *
   * A race that is arranged with a sleep proves nothing: it asserts that a
   * number was large enough on the machine that ran it. What this holds
   * instead is the transaction itself — parked inside a repository call,
   * between the statement that takes a lock and the one that takes the
   * next — and it carries the PostgreSQL backend the transaction is running
   * on, so the wait below can name both sides of the contention rather than
   * hope for it.
   */
  type Seam = {
    /** The backend pid, as soon as the transaction reaches the seam. */
    readonly pid: Promise<number>;
    /** Resolves once the transaction is parked WITH its locks held. */
    readonly parked: Promise<void>;
    /** Let it continue. */
    release(): void;
    /** Called from a repository BEFORE the statement that takes the lock. */
    enter(tx: RawCapable): Promise<void>;
    /** Called AFTER it, where the lock is held. */
    hold(): Promise<void>;
  };

  /** Enough of a Prisma client or transaction to ask it a raw question. */
  type RawCapable = {
    $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
  };

  const seamOf = (park: boolean): Seam => {
    let announcePid: (pid: number) => void = () => {};
    const pid = new Promise<number>((r) => (announcePid = r));
    let announceParked: () => void = () => {};
    const parked = new Promise<void>((r) => (announceParked = r));
    let release: () => void = () => {};
    const released = new Promise<void>((r) => (release = r));
    let entered = false;
    let held = false;
    return {
      pid,
      parked,
      release: () => release(),
      async enter(tx) {
        if (entered) return;
        entered = true;
        const rows = await tx.$queryRaw<{ pid: number }[]>(
          Prisma.sql`SELECT pg_backend_pid()::int AS pid`,
        );
        announcePid(rows[0]!.pid);
      },
      async hold() {
        if (held) return;
        held = true;
        if (!park) return;
        announceParked();
        await released;
      },
    };
  };

  /**
   * The real repositories, with the seam wrapped around the real call.
   *
   * Subclasses rather than fakes: what runs is the production query, taking
   * the production lock. The only thing the test decides is WHEN the next
   * statement is issued — which is the whole of what an interleaving is.
   *
   * Scoped to one activity, because a sweep processes every stranded room
   * the suite has left behind and parking on the first one it happens to
   * reach would arrange a race between this test and an unrelated fixture.
   */
  class SeamedActivities extends CircleActivityRepository {
    constructor(
      db: ConstructorParameters<typeof CircleActivityRepository>[0],
      private readonly seam: Seam,
      private readonly target: string,
    ) {
      super(db);
    }
    override async lockById(
      activityId: string,
      tx: Parameters<CircleActivityRepository["lockById"]>[1],
    ) {
      if (activityId !== this.target)
        return await super.lockById(activityId, tx);
      await this.seam.enter(tx as unknown as RawCapable);
      const row = await super.lockById(activityId, tx);
      await this.seam.hold();
      return row;
    }
  }

  /** The same, for the row set the corrected order takes FIRST. */
  class SeamedSweepInvitations extends CircleInvitationRepository {
    constructor(
      db: ConstructorParameters<typeof CircleInvitationRepository>[0],
      private readonly seam: Seam,
      private readonly target: string,
    ) {
      super(db);
    }
    override async lockForActivity(
      activityId: string,
      tx: Parameters<CircleInvitationRepository["lockForActivity"]>[1],
    ) {
      if (activityId !== this.target) {
        return await super.lockForActivity(activityId, tx);
      }
      // BEFORE the call, deliberately: under the corrected order this is
      // the statement that blocks, and a pid announced after it would never
      // be announced at all.
      await this.seam.enter(tx as unknown as RawCapable);
      const rows = await super.lockForActivity(activityId, tx);
      await this.seam.hold();
      return rows;
    }
  }

  /** And for the acceptance, whose lock on the link is the other half. */
  class SeamedExchangeInvitations extends CircleInvitationRepository {
    constructor(
      db: ConstructorParameters<typeof CircleInvitationRepository>[0],
      private readonly seam: Seam,
    ) {
      super(db);
    }
    override async consume(
      invitationId: string,
      now: Date,
      db: Parameters<CircleInvitationRepository["consume"]>[2] = this
        .prismaForSeam,
    ) {
      await this.seam.enter(db as unknown as RawCapable);
      const won = await super.consume(invitationId, now, db);
      await this.seam.hold();
      return won;
    }
    private get prismaForSeam() {
      return prisma as unknown as Parameters<
        CircleInvitationRepository["consume"]
      >[2];
    }
  }

  const sweeperWith = (
    activities: CircleActivityRepository,
    invitations: CircleInvitationRepository,
  ) =>
    new CirclesSweepService(
      prisma as never,
      activities,
      new CircleEventRepository(prisma),
      new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
      new CircleParticipantRepository(prisma),
      invitations,
      new CircleGuestSessionRepository(prisma),
    );

  const accessWith = (invitations: CircleInvitationRepository) =>
    new CirclesService(
      prisma as unknown as ConstructorParameters<typeof CirclesService>[0],
      invitations,
      new CircleGuestSessionRepository(prisma),
      new CircleEventRepository(prisma),
      new CircleMemberRepository(prisma),
      new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
      new CircleActivityRepository(prisma),
    );

  /**
   * Wait until `blocked` is waiting on a lock `holder` is holding.
   *
   * Both sides are named. `pg_blocking_pids` is asked from the blocked
   * side — a row lock that loses waits on the holder's `transactionid`, and
   * a `transactionid` lock carries no relation, so asking for an ungranted
   * lock ON a table finds nothing — and the answer has to contain the exact
   * backend the other transaction announced from inside itself.
   *
   * There is no sleep anywhere in this: the loop yields to the event loop
   * and re-asks PostgreSQL. The deadline is not a timing assumption, it is
   * the failure message — if it is ever reached, the two transactions never
   * contended and whatever the test concluded afterwards was luck.
   */
  async function waitUntilBlockedBy(
    blocked: number,
    holder: number,
    deadlineMs = 20_000,
  ): Promise<void> {
    const until = Date.now() + deadlineMs;
    for (;;) {
      const r = await pool.query(
        `SELECT $2::int = ANY (pg_blocking_pids($1::int)) AS blocked`,
        [blocked, holder],
      );
      if (r.rows[0].blocked === true) return;
      if (Date.now() > until) {
        throw new Error(
          `backend ${blocked} never waited on a lock held by ${holder} — ` +
            "the two transactions did not contend, so this run proves " +
            "nothing about the order they take their locks in",
        );
      }
      await new Promise((r2) => setImmediate(r2));
    }
  }

  describe("the sweep and an acceptance, racing for the same room", () => {
    /**
     * A group of three that can never be completed, and one live link.
     *
     * Seat 2's invitation is dead, so the sweep has a real reason to cancel
     * the room. Seat 3's is alive and its token is handed back, so an
     * acceptance can genuinely reach the transaction and contend for the same
     * rows — which is the part a test that expires the very link it then
     * redeems does not have: there the acceptance dies before the race.
     */
    async function unfinishableWithOneLiveLink() {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      // A room on the pre-change rules: this race is about the sweep's
      // FIXED policy, which those rooms still get.
      await asLegacyFixedRoom(created.activityId);
      await pool.query(
        `UPDATE "CircleInvitation"
            SET "createdAt" = now() - interval '15 days',
                "expiresAt" = now() - interval '1 hour'
          WHERE "activityId"=$1 AND "tokenHash"=$2`,
        [created.activityId, hashSecret(tokens[0]!)],
      );
      return { ...created, liveToken: tokens[1]! };
    }

    type Settled =
      | { readonly ok: true }
      | { readonly ok: false; readonly code: string; readonly message: string };

    const settleOf = <T>(p: Promise<T>): Promise<Settled> =>
      p.then(
        () => ({ ok: true }) as Settled,
        (err: unknown) =>
          ({
            ok: false,
            code: (err as CirclesError)?.code ?? "UNKNOWN",
            message: (err as Error)?.message ?? String(err),
          }) as Settled,
      );

    const stateOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT a."status"::text AS status,
                (SELECT count(*)::int FROM "CircleGuestSession"
                  WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS sessions,
                (SELECT count(*)::int FROM "CircleInvitation"
                  WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS invitations,
                (SELECT count(*)::int FROM "CircleActivityParticipant"
                  WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL) AS envelopes,
                (SELECT count(*)::int FROM "CircleEvent"
                  WHERE "activityId"=$1 AND "type"='ACTIVITY_CANCELLED') AS cancellations
           FROM "CircleActivity" a WHERE a."id"=$1`,
        [activityId],
      );
      return row.rows[0] as {
        status: string;
        sessions: number;
        invitations: number;
        envelopes: number;
        cancellations: number;
      };
    };

    /**
     * Whatever the interleaving produced, it has to be one of two endings —
     * and neither of them may be a deadlock.
     *
     * A deadlock does not announce itself as a deadlock up here: the sweep
     * surfaces it as a rejected promise, and the acceptance launders it into
     * `CIRCLE_STORAGE_FAILURE`. So both are checked, because which of the two
     * PostgreSQL chooses as the victim is not something a test gets to pick,
     * and a suite that only watched one side would pass half the time with
     * the inversion still in place.
     *
     * `CIRCLE_INVITATION_UNUSABLE` is the acceptance's LEGITIMATE loss: the
     * room was cancelled before the link was redeemed, and the person is told
     * the link no longer works. That is a correct ending, not a failure.
     */
    const assertOneOfTheTwoEndings = async (
      activityId: string,
      accepted: Settled,
      swept: Settled,
      where: string,
    ) => {
      if (!swept.ok) {
        throw new Error(
          `${where}: the sweep was rejected (${swept.code}) — ${swept.message}`,
        );
      }
      if (!accepted.ok && accepted.code !== "CIRCLE_INVITATION_UNUSABLE") {
        throw new Error(
          `${where}: the acceptance failed for a reason that is not "the ` +
            `link is gone" (${accepted.code}) — ${accepted.message}`,
        );
      }

      const state = await stateOf(activityId);
      if (state.status === "CANCELLED") {
        // The sweep won, or the acceptance landed first and the room was
        // still unfinishable. Either way the cleanup is the whole point:
        // nothing derived from the room may outlive it.
        expect(state.sessions, `${where}: no credential survives`).toBe(0);
        expect(state.invitations, `${where}: no link survives`).toBe(0);
        expect(state.envelopes, `${where}: no envelope survives`).toBe(0);
        expect(state.cancellations, `${where}: exactly one cancellation`).toBe(
          1,
        );
      } else {
        // The only other admissible ending: the acceptance stood and the room
        // is still waiting for its remaining seat.
        expect(state.status, `${where}: still waiting`).toBe("INVITING");
        expect(accepted.ok, `${where}: the acceptance stood`).toBe(true);
        expect(state.cancellations, `${where}: nothing was cancelled`).toBe(0);
      }
    };

    it("does not deadlock when the acceptance holds the link first", async () => {
      const group = await unfinishableWithOneLiveLink();

      const exchangeSeam = seamOf(true);
      const accepted = settleOf(
        accessWith(
          new SeamedExchangeInvitations(prisma, exchangeSeam),
        ).exchange(group.liveToken),
      );
      // Inside its transaction, holding the invitation row.
      await exchangeSeam.parked;
      const exchangePid = await exchangeSeam.pid;

      const sweepSeam = seamOf(false);
      const swept = settleOf(
        sweeperWith(
          new SeamedActivities(prisma, sweepSeam, group.activityId),
          new SeamedSweepInvitations(prisma, sweepSeam, group.activityId),
        ).sweep(),
      );
      const sweepPid = await sweepSeam.pid;

      // Named on both sides: THIS sweep is waiting on THIS acceptance.
      await waitUntilBlockedBy(sweepPid, exchangePid);
      exchangeSeam.release();

      const [a, s] = await Promise.all([accepted, swept]);
      await assertOneOfTheTwoEndings(
        group.activityId,
        a,
        s,
        "acceptance first",
      );
    }, 120_000);

    it("does not deadlock when the sweep takes its locks first", async () => {
      const group = await unfinishableWithOneLiveLink();

      const sweepSeam = seamOf(true);
      const swept = settleOf(
        sweeperWith(
          new SeamedActivities(prisma, sweepSeam, group.activityId),
          new SeamedSweepInvitations(prisma, sweepSeam, group.activityId),
        ).sweep(),
      );
      // Inside its transaction, holding whatever its FIRST lock is — which is
      // precisely the thing this correction changes.
      await sweepSeam.parked;
      const sweepPid = await sweepSeam.pid;

      const exchangeSeam = seamOf(false);
      const accepted = settleOf(
        accessWith(
          new SeamedExchangeInvitations(prisma, exchangeSeam),
        ).exchange(group.liveToken),
      );
      const exchangePid = await exchangeSeam.pid;

      await waitUntilBlockedBy(exchangePid, sweepPid);
      sweepSeam.release();

      const [a, s] = await Promise.all([accepted, swept]);
      await assertOneOfTheTwoEndings(group.activityId, a, s, "sweep first");
    }, 120_000);
  });

  describe("a withdrawal receipt is not a licence to replay anything", () => {
    /** A group of three, every seat accepted, still preparing. */
    async function preparing() {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      const guests = [];
      for (const token of tokens) {
        const exchanged = await access.exchange(token);
        const seat = await pool.query(
          `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
          [exchanged.guestSessionId],
        );
        guests.push({
          kind: "GUEST" as const,
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        });
      }
      // Everybody is in, so the organiser continues with everybody. The room
      // reaches `PREPARING` the way it does now: because somebody said so.
      await continueWithEveryone(created.activityId);
      return {
        ...created,
        organizer: { kind: "USER" as const, userId: ORGANIZER },
        guests,
      };
    }

    const share = (value: string) =>
      ({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value }],
      }) as const;

    const envelopesOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleActivityParticipant"
          WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL`,
        [activityId],
      );
      return row.rows[0].n as number;
    };

    it("refuses a confirmation that reuses a withdrawal's key", async () => {
      // The finding. `withdraw` and the group's KEEP_PRIVATE exit write the
      // SAME event — deliberately, so the ledger cannot say which button was
      // pressed — and the receipt lookup accepted that event as proof that
      // ANY request under the key had succeeded. So a key spent on leaving
      // could be presented again with a body full of answers, and the caller
      // was told its confirmation had been replayed. Nothing of the sort had
      // been stored, and nothing ever would be: the activity is cancelled.
      const group = await preparing();
      const key = randomUUID();
      const left = await open.withdraw(group.organizer, group.activityId, key);
      expect(left.outcome).toBe("CANCELLED");

      expect(
        await codeOf(() =>
          open.confirmShare(
            group.organizer,
            group.activityId,
            share("esto sí lo comparto"),
            key,
          ),
        ),
        "a shared answer is not a replay of leaving",
      ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

      // And the refusal is not a write: nothing was stored under either
      // meaning of the key.
      expect(await envelopesOf(group.activityId)).toBe(0);
      const events = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type"='PARTICIPANT_READY'`,
        [group.activityId],
      );
      expect(events.rows[0].n, "no confirmation was recorded").toBe(0);
    }, 30_000);

    it("refuses a Dúo's KEEP_PRIVATE that reuses a withdrawal's key", async () => {
      // In a Dúo, KEEP_PRIVATE is a CONFIRMATION — the seat goes READY and
      // the barrier may open. It is not the exit it is in a group. So the
      // same key cannot stand for both: telling this caller their private
      // confirmation was replayed would claim a reveal that cannot happen on
      // an activity they cancelled by leaving.
      const token = mintToken();
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: randomUUID(),
      });
      await access.exchange(token);
      const organizer = { kind: "USER" as const, userId: ORGANIZER };
      const key = randomUUID();
      await open.withdraw(organizer, created.activityId, key);

      expect(
        await codeOf(() =>
          open.confirmShare(
            organizer,
            created.activityId,
            { mode: "KEEP_PRIVATE" },
            key,
          ),
        ),
      ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");
    }, 30_000);

    it("refuses a KEEP_PRIVATE that reuses the key of a withdrawal after the reveal", async () => {
      // Leaving a REVEALED room CLOSES it; the group's private exit CANCELS a
      // PREPARING one. Two different endings, so one key cannot answer for
      // both — and an activity that is `CLOSED` is proof the receipt under
      // this key was not the exit being replayed.
      const group = await preparing();
      for (const actor of [group.organizer, ...group.guests]) {
        await open.confirmShare(
          actor,
          group.activityId,
          share("antes de la revelación"),
          randomUUID(),
        );
      }
      const status = await pool.query(
        `SELECT "status"::text AS s FROM "CircleActivity" WHERE "id"=$1`,
        [group.activityId],
      );
      expect(status.rows[0].s).toBe("REVEALED");

      const key = randomUUID();
      const left = await open.withdraw(group.organizer, group.activityId, key);
      expect(left.outcome).toBe("CLOSED");

      expect(
        await codeOf(() =>
          open.confirmShare(
            group.organizer,
            group.activityId,
            { mode: "KEEP_PRIVATE" },
            key,
          ),
        ),
      ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");
    }, 30_000);

    it("still replays the group's own private exit", async () => {
      // The regression this correction must not cause. A member whose
      // connection dropped on «prefiero no compartir» retries it and gets the
      // same answer, rather than being told the activity is unavailable about
      // the very request that worked.
      const group = await preparing();
      const key = randomUUID();
      const first = await open.confirmShare(
        group.organizer,
        group.activityId,
        { mode: "KEEP_PRIVATE" },
        key,
      );
      expect(first).toMatchObject({ cancelled: true, replayed: false });
      const replay = await open.confirmShare(
        group.organizer,
        group.activityId,
        { mode: "KEEP_PRIVATE" },
        key,
      );
      expect(replay).toMatchObject({ cancelled: true, replayed: true });
    }, 30_000);

    it("treats leaving and keeping it private as the same act, on purpose", async () => {
      // NOT a defect, and the only case the narrower receipt still accepts.
      //
      // In a group these two requests ARE one act: both call
      // `exitWithoutSharing`, both cancel the room, both leave exactly
      // `PARTICIPANT_WITHDRAWN` and `ACTIVITY_CANCELLED`. That they cannot be
      // told apart is the privacy property — a ledger that distinguished them
      // would be a ledger that records which button somebody pressed — so a
      // key spent on one of them replays the other, and there is nothing
      // stored anywhere that could refuse it without also being the very
      // marker this design forbids.
      const group = await preparing();
      const key = randomUUID();
      await open.withdraw(group.organizer, group.activityId, key);
      const replay = await open.confirmShare(
        group.organizer,
        group.activityId,
        { mode: "KEEP_PRIVATE" },
        key,
      );
      expect(replay).toMatchObject({ cancelled: true, replayed: true });

      // One exit, whichever name the caller gave it.
      const events = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId"=$1 AND "type"='PARTICIPANT_WITHDRAWN'`,
        [group.activityId],
      );
      expect(events.rows[0].n).toBe(1);
    }, 30_000);
  });

  describe("the sweep and a person leaving, racing for the same room", () => {
    /**
     * The participation service, with one repository replaced by a seam.
     *
     * Same eleven dependencies the module wires, so what runs is the real
     * command taking the real locks.
     */
    const participationWith = (overrides: {
      activities?: CircleActivityRepository;
      invitations?: CircleInvitationRepository;
    }) =>
      new CirclesParticipationService(
        prisma as unknown as ConstructorParameters<
          typeof CirclesParticipationService
        >[0],
        overrides.activities ?? new CircleActivityRepository(prisma),
        new CircleParticipantRepository(prisma),
        new CircleArtifactRepository(prisma),
        new CircleEventRepository(prisma),
        new CircleMemberRepository(prisma),
        new CircleGuestSessionRepository(prisma),
        overrides.invitations ?? new CircleInvitationRepository(prisma),
        new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
        cipher,
        registry,
      );

    const sweeperWith = (overrides: {
      activities?: CircleActivityRepository;
      invitations?: CircleInvitationRepository;
    }) =>
      new CirclesSweepService(
        prisma as never,
        overrides.activities ?? new CircleActivityRepository(prisma),
        new CircleEventRepository(prisma),
        new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
        new CircleParticipantRepository(prisma),
        overrides.invitations ?? new CircleInvitationRepository(prisma),
        new CircleGuestSessionRepository(prisma),
      );

    const deleterWith = (overrides: {
      activities?: CircleActivityRepository;
      invitations?: CircleInvitationRepository;
    }) =>
      new CirclesAccountDeletionService(
        new CircleParticipantRepository(prisma),
        overrides.activities ?? new CircleActivityRepository(prisma),
        new CircleEventRepository(prisma),
        new CircleMemberRepository(prisma),
        overrides.invitations ?? new CircleInvitationRepository(prisma),
        new CircleGuestSessionRepository(prisma),
        new CircleArtifactRepository(prisma),
      );

    /**
     * A group of three the sweep has a reason to cancel, with both guests in.
     *
     * One seat's invitation is dead, so the roster can never complete and
     * `cancelIncompleteGroups` selects it. The other seats are filled, so a
     * real person — the organiser, or either guest — is inside the room and
     * can leave it while the sweep is cancelling it. That is the race: not a
     * contrived pair of statements, but two things the product does.
     */
    async function unfinishableWithPeopleInside() {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      // A room on the pre-change rules, for the same reason as above.
      await asLegacyFixedRoom(created.activityId);
      // Accept the HIGHEST invitation id, and kill the other one.
      //
      // Deliberate, and the whole reason the guest race is deterministic: the
      // sweep walks the invitation rows in `id` order, so the guest holding
      // the LAST one means the sweep has already taken every earlier row
      // before it blocks. With the ids the other way round the sweep blocks
      // holding nothing, there is no cycle, and the test would pass for a
      // reason that has nothing to do with the correction.
      const rows = await pool.query(
        `SELECT "id", "tokenHash" FROM "CircleInvitation"
          WHERE "activityId"=$1 ORDER BY "id"`,
        [created.activityId],
      );
      const byHash = new Map(tokens.map((t) => [hashSecret(t), t] as const));
      const lastToken = byHash.get(rows.rows.at(-1)!.tokenHash as string)!;
      const firstToken = byHash.get(rows.rows[0]!.tokenHash as string)!;

      const exchanged = await access.exchange(lastToken);
      const seat = await pool.query(
        `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
        [exchanged.guestSessionId],
      );
      // The other link dies, so the roster can never be completed.
      await pool.query(
        `UPDATE "CircleInvitation"
            SET "createdAt" = now() - interval '15 days',
                "expiresAt" = now() - interval '1 hour'
          WHERE "activityId"=$1 AND "tokenHash"=$2`,
        [created.activityId, hashSecret(firstToken)],
      );
      return {
        ...created,
        organizer: { kind: "USER" as const, userId: ORGANIZER },
        guest: {
          kind: "GUEST" as const,
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        },
      };
    }

    const stateOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT a."status"::text AS status,
                (SELECT count(*)::int FROM "CircleGuestSession"
                  WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS sessions,
                (SELECT count(*)::int FROM "CircleInvitation"
                  WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS invitations,
                (SELECT count(*)::int FROM "CircleActivityParticipant"
                  WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL) AS envelopes,
                (SELECT count(*)::int FROM "CircleEvent"
                  WHERE "activityId"=$1 AND "type"='ACTIVITY_CANCELLED') AS cancellations,
                (SELECT count(*)::int FROM "CircleEvent"
                  WHERE "activityId"=$1 AND "type"='PARTICIPANT_WITHDRAWN') AS withdrawals
           FROM "CircleActivity" a WHERE a."id"=$1`,
        [activityId],
      );
      return row.rows[0] as {
        status: string;
        sessions: number;
        invitations: number;
        envelopes: number;
        cancellations: number;
        withdrawals: number;
      };
    };

    type Settled =
      | { readonly ok: true }
      | { readonly ok: false; readonly code: string; readonly message: string };

    const settleOf = <T>(p: Promise<T>): Promise<Settled> =>
      p.then(
        () => ({ ok: true }) as Settled,
        (err: unknown) =>
          ({
            ok: false,
            code: (err as CirclesError)?.code ?? "UNKNOWN",
            message: (err as Error)?.message ?? String(err),
          }) as Settled,
      );

    /**
     * One ending, reached once, with nothing left over.
     *
     * A deadlock does not arrive labelled as one: the sweep surfaces it raw
     * and the participation service launders it into
     * `CIRCLE_STORAGE_FAILURE`, so both sides are checked. The person leaving
     * may legitimately lose — the room was cancelled first, and they are told
     * it is unavailable — but "the storage failed" is never a legitimate
     * answer to somebody pressing «retirarme».
     */
    const assertSettled = async (
      activityId: string,
      left: Settled,
      swept: Settled,
      where: string,
    ) => {
      if (!swept.ok) {
        throw new Error(
          `${where}: the sweep was rejected (${swept.code}) — ${swept.message}`,
        );
      }
      if (!left.ok && left.code !== "CIRCLE_ACTIVITY_UNAVAILABLE") {
        throw new Error(
          `${where}: leaving failed for a reason that is not "this activity ` +
            `is over" (${left.code}) — ${left.message}`,
        );
      }
      const state = await stateOf(activityId);
      // Whoever got there first, the room is over and nothing derived from it
      // is still usable.
      expect(state.status, `${where}: terminal`).toBe("CANCELLED");
      expect(state.sessions, `${where}: no credential survives`).toBe(0);
      expect(state.invitations, `${where}: no link survives`).toBe(0);
      expect(state.envelopes, `${where}: no envelope survives`).toBe(0);
      // Exactly once. Two cancellations would mean both transactions wrote
      // the same ending, which is what a status guard is for.
      expect(state.cancellations, `${where}: one cancellation`).toBe(1);
      expect(
        state.withdrawals,
        `${where}: a withdrawal is recorded only if somebody withdrew`,
      ).toBe(left.ok ? 1 : 0);
    };

    it("does not deadlock when the withdrawal holds the activity first", async () => {
      const group = await unfinishableWithPeopleInside();

      const leaveSeam = seamOf(true);
      const left = settleOf(
        participationWith({
          activities: new SeamedActivities(prisma, leaveSeam, group.activityId),
          invitations: new SeamedSweepInvitations(
            prisma,
            leaveSeam,
            group.activityId,
          ),
        }).withdraw(group.organizer, group.activityId, randomUUID()),
      );
      // Inside its transaction, holding whatever it takes FIRST — which is
      // exactly what this correction changes.
      await leaveSeam.parked;
      const leavePid = await leaveSeam.pid;

      const sweepSeam = seamOf(false);
      const swept = settleOf(
        sweeperWith({
          activities: new SeamedActivities(prisma, sweepSeam, group.activityId),
          invitations: new SeamedSweepInvitations(
            prisma,
            sweepSeam,
            group.activityId,
          ),
        }).sweep(),
      );
      const sweepPid = await sweepSeam.pid;

      await waitUntilBlockedBy(sweepPid, leavePid);
      leaveSeam.release();

      const [l, s] = await Promise.all([left, swept]);
      await assertSettled(group.activityId, l, s, "withdrawal first");
    }, 120_000);

    it("does not deadlock when the sweep takes its locks first", async () => {
      const group = await unfinishableWithPeopleInside();

      const sweepSeam = seamOf(true);
      const swept = settleOf(
        sweeperWith({
          activities: new SeamedActivities(prisma, sweepSeam, group.activityId),
          invitations: new SeamedSweepInvitations(
            prisma,
            sweepSeam,
            group.activityId,
          ),
        }).sweep(),
      );
      await sweepSeam.parked;
      const sweepPid = await sweepSeam.pid;

      const leaveSeam = seamOf(false);
      const left = settleOf(
        participationWith({
          activities: new SeamedActivities(prisma, leaveSeam, group.activityId),
          invitations: new SeamedSweepInvitations(
            prisma,
            leaveSeam,
            group.activityId,
          ),
        }).withdraw(group.organizer, group.activityId, randomUUID()),
      );
      const leavePid = await leaveSeam.pid;

      await waitUntilBlockedBy(leavePid, sweepPid);
      sweepSeam.release();

      const [l, s] = await Promise.all([left, swept]);
      await assertSettled(group.activityId, l, s, "sweep first");
    }, 120_000);

    it("does not deadlock when a GUEST is the one leaving", async () => {
      // The guest path locks its OWN invitation and its OWN session on the
      // way in, and then revokes EVERYBODY's — so it reaches for rows it does
      // not hold, after the activity. The fixture puts the guest on the
      // highest invitation id precisely so the sweep is holding the earlier
      // one when it blocks.
      const group = await unfinishableWithPeopleInside();

      const leaveSeam = seamOf(true);
      const left = settleOf(
        participationWith({
          activities: new SeamedActivities(prisma, leaveSeam, group.activityId),
          invitations: new SeamedSweepInvitations(
            prisma,
            leaveSeam,
            group.activityId,
          ),
        }).withdraw(group.guest, group.activityId, randomUUID()),
      );
      await leaveSeam.parked;
      const leavePid = await leaveSeam.pid;

      const sweepSeam = seamOf(false);
      const swept = settleOf(
        sweeperWith({
          activities: new SeamedActivities(prisma, sweepSeam, group.activityId),
          invitations: new SeamedSweepInvitations(
            prisma,
            sweepSeam,
            group.activityId,
          ),
        }).sweep(),
      );
      const sweepPid = await sweepSeam.pid;

      await waitUntilBlockedBy(sweepPid, leavePid);
      leaveSeam.release();

      const [l, s] = await Promise.all([left, swept]);
      await assertSettled(group.activityId, l, s, "guest leaving");
    }, 120_000);

    it("does not deadlock when account deletion races the same sweep", async () => {
      // This one is expected to hold already — the deletion service walks the
      // canonical order and says so. The test exists because "expected to
      // hold" and "observed to hold" are different claims, and because the
      // correction moves all three onto ONE implementation of that order: if
      // that move breaks the deletion path, this is what says so.
      const group = await unfinishableWithPeopleInside();

      const deleteSeam = seamOf(true);
      const deleter = deleterWith({
        activities: new SeamedActivities(prisma, deleteSeam, group.activityId),
        invitations: new SeamedSweepInvitations(
          prisma,
          deleteSeam,
          group.activityId,
        ),
      });
      // In ONE transaction the CALLER owns. The service opens none of its own
      // — that is the point of its authority fix — so a test that handed it
      // the raw client would run every statement in autocommit, hold nothing,
      // and contend with nobody. The first version of this test did exactly
      // that and reported both sides on the same backend.
      const deleted = settleOf(
        prisma.$transaction(
          (tx) => deleter.detachUser(ORGANIZER, tx as never),
          { timeout: 60_000 },
        ),
      );
      await deleteSeam.parked;
      const deletePid = await deleteSeam.pid;

      const sweepSeam = seamOf(false);
      const swept = settleOf(
        sweeperWith({
          activities: new SeamedActivities(prisma, sweepSeam, group.activityId),
          invitations: new SeamedSweepInvitations(
            prisma,
            sweepSeam,
            group.activityId,
          ),
        }).sweep(),
      );
      const sweepPid = await sweepSeam.pid;

      await waitUntilBlockedBy(sweepPid, deletePid);
      deleteSeam.release();

      const [d, s] = await Promise.all([deleted, swept]);
      if (!s.ok) {
        throw new Error(
          `account deletion: the sweep was rejected (${s.code}) — ${s.message}`,
        );
      }
      if (!d.ok) {
        throw new Error(
          `account deletion: the deletion was rejected (${d.code}) — ${d.message}`,
        );
      }
      const state = await stateOf(group.activityId);
      expect(state.status, "the room is over").toBe("CANCELLED");
      expect(state.sessions, "no credential survives").toBe(0);
      expect(state.invitations, "no link survives").toBe(0);
      expect(state.cancellations, "one cancellation").toBe(1);
    }, 120_000);
  });

  // ══ Flexible onboarding ══════════════════════════════════════════════════

  describe("a room that continues with whoever accepted", () => {
    const participationFor = (env: CirclesRolloutEnv = OPEN) => build(env);

    const statusOf = async (activityId: string) =>
      (
        await pool.query(
          `SELECT "status"::text AS s FROM "CircleActivity" WHERE "id"=$1`,
          [activityId],
        )
      ).rows[0].s as string;

    const shapeOf = async (activityId: string) => {
      const row = await pool.query(
        `SELECT "onboarding"::text AS policy,
                "requiredParticipants" AS capacity,
                "confirmedParticipants" AS "group",
                (SELECT count(*)::int FROM "CircleActivityParticipant"
                  WHERE "activityId"=$1) AS seats,
                (SELECT count(*)::int FROM "CircleActivityParticipant"
                  WHERE "activityId"=$1 AND "status"='ACCEPTED') AS accepted,
                (SELECT count(*)::int FROM "CircleInvitation"
                  WHERE "activityId"=$1 AND "revokedAt" IS NULL
                    AND "consumedAt" IS NULL) AS pending
           FROM "CircleActivity" WHERE "id"=$1`,
        [activityId],
      );
      return row.rows[0] as {
        policy: string;
        capacity: number;
        group: number | null;
        seats: number;
        accepted: number;
        pending: number;
      };
    };

    /** A room for `size`, with `accepting` of its guests actually in. */
    async function room(size: number, accepting: number) {
      const tokens = mintTokens(size - 1);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size,
        idempotencyKey: randomUUID(),
      });
      const guests = [];
      for (const token of tokens.slice(0, accepting)) {
        const exchanged = await access.exchange(token, undefined, null);
        const seat = await pool.query(
          `SELECT "participantId" FROM "CircleGuestSession" WHERE "id"=$1`,
          [exchanged.guestSessionId],
        );
        guests.push({
          kind: "GUEST" as const,
          guestSessionId: exchanged.guestSessionId,
          activityId: created.activityId,
          participantId: seat.rows[0].participantId as string,
        });
      }
      return {
        ...created,
        tokens,
        guests,
        organizer: { kind: "USER" as const, userId: ORGANIZER },
      };
    }

    const share = (value: string) =>
      ({
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value }],
      }) as const;

    it("creates a group under the flexible rules and a Dúo under the old ones", async () => {
      const group = await room(4, 0);
      expect((await shapeOf(group.activityId)).policy).toBe("FLEXIBLE");

      const token = mintToken();
      const duo = await open.createDuo({
        userId: ORGANIZER,
        templateKey: DUO.templateKey,
        templateVersion: DUO.templateVersion,
        invitationTokens: [token],
        idempotencyKey: randomUUID(),
      });
      // A Dúo is two people by definition: "continue with whoever accepted"
      // is either both of them or nobody, so its rules are left alone.
      expect((await shapeOf(duo.activityId)).policy).toBe("FIXED");
    }, 60_000);

    it("does not open the preparation just because somebody accepted", async () => {
      const group = await room(3, 1);
      // The old rule moved the room on the LAST acceptance. Under the flexible
      // rules the organiser decides, so a partly-filled room stays open.
      expect(await statusOf(group.activityId)).toBe("INVITING");
    }, 60_000);

    it("tells a person preparing early that the group is not fixed YET", async () => {
      // The bug this block exists to fix. Confirming while the room is still
      // taking people in used to answer CIRCLE_ACTIVITY_UNAVAILABLE, which the
      // screen rendered as «esta actividad ya no admite cambios» — about a
      // room that was working perfectly.
      const group = await room(3, 1);
      expect(
        await codeOf(() =>
          participationFor().confirmShare(
            group.organizer,
            group.activityId,
            share("preparado temprano"),
            randomUUID(),
          ),
        ),
      ).toBe("CIRCLE_ONBOARDING_OPEN");
      // And nothing was written: preparing is not sending.
      const envelopes = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleActivityParticipant"
          WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL`,
        [group.activityId],
      );
      expect(envelopes.rows[0].n).toBe(0);
    }, 60_000);

    it("refuses to continue with one person", async () => {
      const group = await room(3, 0);
      expect(
        await codeOf(() =>
          participationFor().closeOnboarding(
            group.organizer,
            group.activityId,
            randomUUID(),
          ),
        ),
      ).toBe("CIRCLE_GROUP_TOO_SMALL");
      expect(await statusOf(group.activityId)).toBe("INVITING");
    }, 60_000);

    it("continues with TWO when the room was planned for three", async () => {
      const group = await room(3, 1);
      const closed = await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        randomUUID(),
      );
      expect(closed).toMatchObject({ group: 2, replayed: false });

      const after = await shapeOf(group.activityId);
      // Capacity is what people were SHOWN. The group is who is here.
      expect(after.capacity, "capacity is untouched").toBe(3);
      expect(after.group, "the group is fixed").toBe(2);
      expect(after.seats, "no seat nobody sat in survives").toBe(2);
      expect(after.pending, "no link still admits anybody").toBe(0);
      expect(await statusOf(group.activityId)).toBe("PREPARING");
    }, 90_000);

    it("reveals on the GROUP's confirmations, not the capacity", async () => {
      const group = await room(3, 1);
      await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        randomUUID(),
      );
      const first = await participationFor().confirmShare(
        group.organizer,
        group.activityId,
        share("lo mío"),
        randomUUID(),
      );
      expect(first.revealed, "one of two is not the room").toBe(false);
      const second = await participationFor().confirmShare(
        group.guests[0]!,
        group.activityId,
        share("lo mío también"),
        randomUUID(),
      );
      // Two of two. Under the old barrier this room would have waited forever
      // for a third person who was never coming.
      expect(second.revealed, "the group completed").toBe(true);
      expect(await statusOf(group.activityId)).toBe("REVEALED");
    }, 90_000);

    it("continues with three when three accepted", async () => {
      const group = await room(4, 2);
      const closed = await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        randomUUID(),
      );
      expect(closed.group).toBe(3);
      for (const actor of [group.organizer, ...group.guests]) {
        await participationFor().confirmShare(
          actor,
          group.activityId,
          share("de cada quien"),
          randomUUID(),
        );
      }
      expect(await statusOf(group.activityId)).toBe("REVEALED");
    }, 120_000);

    it("shuts the door: a link that was never redeemed stops working", async () => {
      const group = await room(3, 1);
      await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        randomUUID(),
      );
      // The second token was never used. Arriving now is too late, and the
      // answer is the ordinary one for a link that no longer works.
      expect(await codeOf(() => access.exchange(group.tokens[1]!))).toBe(
        "CIRCLE_INVITATION_UNUSABLE",
      );
      const after = await shapeOf(group.activityId);
      expect(after.group).toBe(2);
      expect(after.seats).toBe(2);
    }, 90_000);

    it("replays the close under the same key, and refuses a different one", async () => {
      const group = await room(3, 1);
      const key = randomUUID();
      const first = await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        key,
      );
      expect(first.replayed).toBe(false);
      const replay = await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        key,
      );
      expect(replay).toMatchObject({ group: 2, replayed: true });
      // A DIFFERENT key on a room whose group is already fixed is not a
      // replay: it is a second attempt to decide something already decided.
      expect(
        await codeOf(() =>
          participationFor().closeOnboarding(
            group.organizer,
            group.activityId,
            randomUUID(),
          ),
        ),
      ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    }, 90_000);

    it("is the organiser's to close, nobody else's", async () => {
      const group = await room(3, 1);
      expect(
        await codeOf(() =>
          participationFor().closeOnboarding(
            group.guests[0]!,
            group.activityId,
            randomUUID(),
          ),
        ),
      ).toBe("CIRCLE_FORBIDDEN");
    }, 60_000);

    it("does not let a timer cancel a flexible room that can still continue", async () => {
      const sweeper = () =>
        new CirclesSweepService(
          prisma as never,
          new CircleActivityRepository(prisma),
          new CircleEventRepository(prisma),
          new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
          new CircleParticipantRepository(prisma),
          new CircleInvitationRepository(prisma),
          new CircleGuestSessionRepository(prisma),
        );
      const group = await room(3, 1);
      // The person who never answered lets their link die. Under the old rule
      // one dead link cancelled the room; under these rules it cancels
      // nobody — two people are here and they can still do this.
      await pool.query(
        `UPDATE "CircleInvitation"
            SET "createdAt" = now() - interval '15 days',
                "expiresAt" = now() - interval '1 hour'
          WHERE "activityId"=$1 AND "consumedAt" IS NULL`,
        [group.activityId],
      );
      await sweeper().sweep();
      expect(await statusOf(group.activityId)).toBe("INVITING");

      // And the organiser can still continue with the two who are here.
      const closed = await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        randomUUID(),
      );
      expect(closed.group).toBe(2);
    }, 120_000);

    it("does end a flexible room nobody ever joined", async () => {
      const sweeper = () =>
        new CirclesSweepService(
          prisma as never,
          new CircleActivityRepository(prisma),
          new CircleEventRepository(prisma),
          new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
          new CircleParticipantRepository(prisma),
          new CircleInvitationRepository(prisma),
          new CircleGuestSessionRepository(prisma),
        );
      const group = await room(3, 0);
      await pool.query(
        `UPDATE "CircleInvitation"
            SET "createdAt" = now() - interval '15 days',
                "expiresAt" = now() - interval '1 hour'
          WHERE "activityId"=$1`,
        [group.activityId],
      );
      await sweeper().sweep();
      // Every link dead and nobody inside: this one really can never happen.
      expect(await statusOf(group.activityId)).toBe("CANCELLED");
    }, 120_000);

    it("lists who JOINED, and pending links as invitations — never both", async () => {
      // Caught on the hosted candidate, not here: the seats exist from the
      // moment the invitations are minted, so a room of three with nobody in
      // it listed two «Participante N» who had answered nothing — and then
      // the same two again, correctly, as pending invitations.
      const group = await room(3, 1);
      const view = await facadeRead(group.organizer, group.activityId);
      const roster = view.onboarding!.roster;
      expect(view.onboarding!.accepted, "organiser plus one guest").toBe(2);
      expect(roster.filter((r) => r.state === "PARTICIPATES")).toHaveLength(1);
      expect(roster.filter((r) => r.state === "ORGANIZES")).toHaveLength(1);
      // One link still waiting, listed once, as an invitation.
      expect(roster.filter((r) => r.state === "INVITED")).toHaveLength(1);
      expect(roster).toHaveLength(3);
    }, 60_000);

    it("keeps an alias on the seat and nowhere else", async () => {
      const tokens = mintTokens(2);
      const created = await open.createDuo({
        userId: ORGANIZER,
        templateKey: GROUP.templateKey,
        templateVersion: GROUP.templateVersion,
        invitationTokens: tokens,
        size: 3,
        idempotencyKey: randomUUID(),
      });
      await access.exchange(tokens[0]!, undefined, "  Ana  ");
      const row = await pool.query(
        `SELECT "alias" FROM "CircleActivityParticipant"
          WHERE "activityId"=$1 AND "alias" IS NOT NULL`,
        [created.activityId],
      );
      expect(row.rows[0].alias, "trimmed, not raw").toBe("Ana");
      // An alias is a name for the room. It is never an event's payload —
      // the ledger's grammar has nowhere to put one, and this asserts the
      // grammar was not widened to make room.
      const events = await pool.query(
        `SELECT count(*)::int AS n FROM "CircleEvent"
          WHERE "activityId"=$1 AND "metadata"::text ILIKE '%Ana%'`,
        [created.activityId],
      );
      expect(events.rows[0].n).toBe(0);
    }, 60_000);

    // ══ The whole cycle, at the size the group actually is ══════════════════

    it("a room offered to SIX that continued with two reaches an agreement", async () => {
      // The reported failure, at its widest. Capacity six, one guest in.
      const group = await room(6, 1);
      const closed = await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        randomUUID(),
      );
      expect(closed.group).toBe(2);

      const shape = await shapeOf(group.activityId);
      expect(shape.capacity, "capacity is what people were shown").toBe(6);
      expect(shape.group, "the group is who is here").toBe(2);

      for (const actor of [group.organizer, group.guests[0]!]) {
        await participationFor().confirmShare(
          actor,
          group.activityId,
          share("lo mío"),
          randomUUID(),
        );
      }
      expect(await statusOf(group.activityId)).toBe("REVEALED");

      const proposed = await open.proposeArtifact(
        group.organizer,
        group.activityId,
        "lo que vamos a intentar",
        randomUUID(),
      );
      const first = await open.confirmArtifact(
        group.organizer,
        group.activityId,
        proposed.artifactId,
        proposed.version,
        randomUUID(),
      );
      expect(first.agreed, "one of two is not the room").toBe(false);
      const second = await open.confirmArtifact(
        group.guests[0]!,
        group.activityId,
        proposed.artifactId,
        proposed.version,
        randomUUID(),
      );
      // The decisive one. Against CAPACITY this room needed six confirmations
      // and had two people to give them: it could reveal and then never agree.
      expect(second.agreed, "the group agreed").toBe(true);
    }, 120_000);

    it("closes the follow-up on the GROUP's decisions, with no worker", async () => {
      const group = await room(6, 1);
      await participationFor().closeOnboarding(
        group.organizer,
        group.activityId,
        randomUUID(),
      );
      for (const actor of [group.organizer, group.guests[0]!]) {
        await participationFor().confirmShare(
          actor,
          group.activityId,
          share("lo mío"),
          randomUUID(),
        );
      }
      await pool.query(
        `UPDATE "CircleActivity" SET "followUpDueAt" = now() - interval '1 hour'
          WHERE "id"=$1`,
        [group.activityId],
      );

      await open.recordFollowUp(
        group.organizer,
        group.activityId,
        "KEEP",
        randomUUID(),
      );
      expect(
        await statusOf(group.activityId),
        "one decision of two does not end it",
      ).not.toBe("CLOSED");
      await open.recordFollowUp(
        group.guests[0]!,
        group.activityId,
        "CLOSE",
        randomUUID(),
      );
      // Counted against capacity, these two could never reach six decisions:
      // the room stayed open until a clock closed it a week later, and nothing
      // the people inside did could ever have finished it themselves.
      expect(await statusOf(group.activityId)).toBe("CLOSED");
    }, 120_000);

    it("a group of three still needs THREE, not the four it was offered to", async () => {
      const group = await room(4, 2);
      expect(
        (
          await participationFor().closeOnboarding(
            group.organizer,
            group.activityId,
            randomUUID(),
          )
        ).group,
      ).toBe(3);
      for (const actor of [group.organizer, ...group.guests]) {
        await participationFor().confirmShare(
          actor,
          group.activityId,
          share("de cada quien"),
          randomUUID(),
        );
      }
      const proposed = await open.proposeArtifact(
        group.organizer,
        group.activityId,
        "un plan entre tres",
        randomUUID(),
      );
      const seen = [];
      for (const actor of [group.organizer, ...group.guests]) {
        seen.push(
          (
            await open.confirmArtifact(
              actor,
              group.activityId,
              proposed.artifactId,
              proposed.version,
              randomUUID(),
            )
          ).agreed,
        );
      }
      // The group's size, not a constant and not the capacity: two is not
      // enough and three is not one too many.
      expect(seen).toEqual([false, false, true]);
    }, 120_000);

    // ══ The sweep is not occupied by the rooms it must preserve ═════════════

    it("reaches an unfinishable room past a batch full of viable ones", async () => {
      const sweeper = () =>
        new CirclesSweepService(
          prisma as never,
          new CircleActivityRepository(prisma),
          new CircleEventRepository(prisma),
          new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
          new CircleParticipantRepository(prisma),
          new CircleInvitationRepository(prisma),
          new CircleGuestSessionRepository(prisma),
        );

      // Drain whatever earlier tests left cancellable, so the only rooms this
      // one has to reason about are its own.
      await sweeper().sweep();

      /** Age EVERY link, consumed ones included — fourteen days pass for all. */
      const ageAllLinks = (activityId: string) =>
        pool.query(
          `UPDATE "CircleInvitation"
              SET "createdAt" = now() - interval '15 days',
                  "expiresAt" = now() - interval '1 hour'
            WHERE "activityId"=$1`,
          [activityId],
        );

      // Two rooms the sweep must NOT touch: every link long dead, but people
      // inside. This is an ordinary room a month old, not a contrivance.
      const viable = [await room(3, 1), await room(3, 1)];
      for (const v of viable) await ageAllLinks(v.activityId);

      // And one it must end: nobody ever came, and nobody can any more.
      const unfinishable = await room(3, 0);
      await ageAllLinks(unfinishable.activityId);

      // The scan is ordered by id and cut at `batchSize`. Stated, not assumed:
      // if cuids ever stop being monotonic this fails loudly instead of
      // quietly testing nothing.
      expect(
        viable.every((v) => v.activityId < unfinishable.activityId),
        "the preserved rooms sort ahead of the one that must be cancelled",
      ).toBe(true);

      const summary = await sweeper().sweep({ batchSize: viable.length });

      // Before the selection was tightened, the batch was filled by the two
      // rooms the sweep is not allowed to cancel, and the third was never
      // looked at — on this run and on every run after it.
      expect(await statusOf(unfinishable.activityId)).toBe("CANCELLED");
      expect(summary.incompleteGroupsCancelled).toBe(1);
      // And the way past them was not to cancel them.
      for (const v of viable) {
        expect(await statusOf(v.activityId)).toBe("INVITING");
      }
    }, 180_000);

    // ══ An acceptance and the organiser closing, for the same room ══════════
    //
    // Where they actually meet is `CircleMember`. `exchange` locks the
    // inviter's row before it touches the invitation; the organiser's path
    // locks the same row as step 1 of the canonical order. So they queue on
    // the FIRST element of that order, which is why they cannot deadlock —
    // and seaming them anywhere further down produced a test that proved
    // nothing, because the blocked side never reached its own seam.
    //
    // Beyond deadlock, the thing that must hold is this block's own subject:
    // if the group were recorded as a number that did not match who is inside,
    // the room would be right back to revealing and never agreeing.

    /** The seam on the row both paths take first. */
    class SeamedMembers extends CircleMemberRepository {
      constructor(
        db: ConstructorParameters<typeof CircleMemberRepository>[0],
        private readonly seam: Seam,
      ) {
        super(db);
      }
      override async lockById(
        memberId: string,
        tx: Parameters<CircleMemberRepository["lockById"]>[1],
      ) {
        // BEFORE the call: this is the statement that blocks, and a pid
        // announced after it would never be announced at all.
        await this.seam.enter(tx as unknown as RawCapable);
        const row = await super.lockById(memberId, tx);
        await this.seam.hold();
        return row;
      }
    }

    const acceptingWith = (members: CircleMemberRepository) =>
      new CirclesService(
        prisma as unknown as ConstructorParameters<typeof CirclesService>[0],
        new CircleInvitationRepository(prisma),
        new CircleGuestSessionRepository(prisma),
        new CircleEventRepository(prisma),
        members,
        new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
        new CircleActivityRepository(prisma),
      );

    const closingWith = (members: CircleMemberRepository) =>
      new CirclesParticipationService(
        prisma as unknown as ConstructorParameters<
          typeof CirclesParticipationService
        >[0],
        new CircleActivityRepository(prisma),
        new CircleParticipantRepository(prisma),
        new CircleArtifactRepository(prisma),
        new CircleEventRepository(prisma),
        members,
        new CircleGuestSessionRepository(prisma),
        new CircleInvitationRepository(prisma),
        new CirclesRolloutService(resolveCirclesRolloutConfig(OPEN)),
        cipher,
        registry,
      );

    type Ended =
      | { readonly ok: true }
      | { readonly ok: false; readonly code: string; readonly message: string };

    const endOf = <T>(p: Promise<T>): Promise<Ended> =>
      p.then(
        () => ({ ok: true }) as Ended,
        (err: unknown) =>
          ({
            ok: false,
            code: (err as CirclesError)?.code ?? "UNKNOWN",
            message: (err as Error)?.message ?? String(err),
          }) as Ended,
      );

    /**
     * Whatever the interleaving produced, the number must describe the room.
     *
     * A deadlock arrives here laundered — both paths surface one as
     * `CIRCLE_STORAGE_FAILURE` — so both sides are read, because which
     * transaction PostgreSQL picks as the victim is not a test's to choose.
     */
    const assertGroupDescribesTheRoom = async (
      activityId: string,
      accepted: Ended,
      closed: Ended,
      where: string,
    ) => {
      for (const [who, end] of [
        ["the acceptance", accepted],
        ["the close", closed],
      ] as const) {
        if (!end.ok && end.code === "CIRCLE_STORAGE_FAILURE") {
          throw new Error(
            `${where}: ${who} failed with CIRCLE_STORAGE_FAILURE — ${end.message}`,
          );
        }
      }

      const row = await pool.query(
        `SELECT a."confirmedParticipants" AS "group",
                (SELECT count(*)::int FROM "CircleActivityParticipant"
                  WHERE "activityId"=$1 AND "status" IN ('ACCEPTED','READY'))
                  AS inside
           FROM "CircleActivity" a WHERE a."id"=$1`,
        [activityId],
      );
      const { group, inside } = row.rows[0] as {
        group: number | null;
        inside: number;
      };

      if (group === null) {
        // The close lost outright: nothing is fixed, the organiser presses
        // again, and the room is exactly where it was.
        expect(
          closed.ok,
          `${where}: an unclosed room means the close did not succeed`,
        ).toBe(false);
        return;
      }
      // The one thing that must never happen: a group that is not the people.
      // Either the late guest got in and was counted, or was shut out and was
      // not — never counted out while sitting inside.
      expect(group, `${where}: the group IS who is inside`).toBe(inside);
      expect(group).toBeGreaterThanOrEqual(2);
      if (!accepted.ok) {
        expect(
          accepted.code,
          `${where}: a shut-out guest is told the link is gone`,
        ).toBe("CIRCLE_INVITATION_UNUSABLE");
      }
    };

    /** A flexible room with one guest already in and one link still live. */
    async function roomWithOneLiveLink() {
      const group = await room(3, 1);
      return { ...group, liveToken: group.tokens[1]! };
    }

    it("acceptance first, then the organiser closes", async () => {
      const group = await roomWithOneLiveLink();

      const acceptSeam = seamOf(true);
      const accepted = endOf(
        acceptingWith(new SeamedMembers(prisma, acceptSeam)).exchange(
          group.liveToken,
        ),
      );
      await acceptSeam.parked;
      const acceptPid = await acceptSeam.pid;

      const closeSeam = seamOf(false);
      const closed = endOf(
        closingWith(new SeamedMembers(prisma, closeSeam)).closeOnboarding(
          group.organizer,
          group.activityId,
          randomUUID(),
        ),
      );
      const closePid = await closeSeam.pid;

      // Named on both sides: THIS close is waiting on THIS acceptance.
      await waitUntilBlockedBy(closePid, acceptPid);
      acceptSeam.release();

      const [a, c] = await Promise.all([accepted, closed]);
      await assertGroupDescribesTheRoom(
        group.activityId,
        a,
        c,
        "acceptance first",
      );
    }, 120_000);

    it("the organiser closes first, then the acceptance arrives", async () => {
      const group = await roomWithOneLiveLink();

      const closeSeam = seamOf(true);
      const closed = endOf(
        closingWith(new SeamedMembers(prisma, closeSeam)).closeOnboarding(
          group.organizer,
          group.activityId,
          randomUUID(),
        ),
      );
      await closeSeam.parked;
      const closePid = await closeSeam.pid;

      const acceptSeam = seamOf(false);
      const accepted = endOf(
        acceptingWith(new SeamedMembers(prisma, acceptSeam)).exchange(
          group.liveToken,
        ),
      );
      const acceptPid = await acceptSeam.pid;

      await waitUntilBlockedBy(acceptPid, closePid);
      closeSeam.release();

      const [a, c] = await Promise.all([accepted, closed]);
      await assertGroupDescribesTheRoom(group.activityId, a, c, "close first");
    }, 120_000);
  });
});
