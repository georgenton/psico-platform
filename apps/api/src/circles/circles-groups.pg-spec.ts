import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CircleTemplateRegistry } from "@psico/types";
import type { CircleActivityDefinition } from "@psico/types";
import { CircleActivityRepository } from "./circle-activity.repository";
import { CircleArtifactRepository } from "./circle-artifact.repository";
import { CircleEventRepository } from "./circle-event.repository";
import { CircleGuestSessionRepository } from "./circle-guest-session.repository";
import { CircleInvitationRepository } from "./circle-invitation.repository";
import { CircleMemberRepository } from "./circle-member.repository";
import { CircleParticipantRepository } from "./circle-participant.repository";
import { CirclesParticipationService } from "./circles-participation.service";
import { CirclesCipher } from "./circles-crypto";
import type { CirclesError } from "./circles-http-errors";
import { CirclesRolloutService } from "./circles-rollout.service";
import {
  resolveCirclesRolloutConfig,
  type CirclesRolloutEnv,
} from "./circles-rollout";
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
});
