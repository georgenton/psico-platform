import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
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
import { CirclesCipher } from "./circles-crypto";
import type { CirclesError } from "./circles-http-errors";
import { CirclesRolloutService } from "./circles-rollout.service";
import { resolveCirclesRolloutConfig } from "./circles-rollout";
import { CirclesService } from "./circles.service";
import { hashSecret } from "./circles-secrets";

/**
 * Participation against REAL PostgreSQL (PR3 · spec §N).
 *
 * The barrier, the races and the artifact are the part of this product where a
 * bug is not a broken screen but a broken promise — one person seeing the
 * other's answer before both confirmed. None of that can be tested against a
 * mock: what is under test IS what PostgreSQL does when two transactions want
 * the same rows.
 *
 * ── No sleeps ──────────────────────────────────────────────────────────────
 *
 * Every race here is driven by `Promise.all` over real connections, by
 * controlled barriers, or by `lock_timeout` and PostgreSQL error codes. A test
 * that waits 200ms and hopes is a test that passes on a fast laptop and fails
 * in CI, and a flaky concurrency test is worse than none: it teaches people to
 * re-run.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "circles_participation_db";
const API_DIR = process.cwd();

function withDatabase(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/**
 * A structurally valid PUBLISHED template, held in a fixture registry.
 *
 * `PRODUCTION_CIRCLE_TEMPLATES` stays empty — publishing one is an editorial
 * decision with its own approval, never a way to make a test go green. The
 * registry is injected, so the successful path is exercised end to end without
 * anything being published.
 */
const TEMPLATE: CircleActivityDefinition = {
  templateKey: "fixture-participation-template",
  templateVersion: 1,
  status: "PUBLISHED",
  audience: "DUO_ADULT",
  title: "Plantilla de participación",
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

const DRAFT_TEMPLATE: CircleActivityDefinition = {
  ...TEMPLATE,
  templateKey: "fixture-participation-draft",
  status: "DRAFT",
};
const ARCHIVED_TEMPLATE: CircleActivityDefinition = {
  ...TEMPLATE,
  templateKey: "fixture-participation-archived",
  status: "ARCHIVED",
};
/**
 * A SECOND published template, and a published v2 of the first.
 *
 * Both exist for one reason: to make "same key, different request" reachable.
 * A DRAFT or ARCHIVED key is rejected by `getPublished` before the replay
 * comparison runs, so a test built on those two would assert the registry's
 * behaviour and call it idempotency — which is exactly what the negative
 * control caught the first version of this suite doing.
 */
const ALT_TEMPLATE: CircleActivityDefinition = {
  ...TEMPLATE,
  templateKey: "fixture-participation-alt",
};
const TEMPLATE_V2: CircleActivityDefinition = {
  ...TEMPLATE,
  templateVersion: 2,
};

/**
 * A published template that produces NO shared result.
 *
 * `outcome.kind: "NONE"` is an editorial decision — some conversations are
 * meant to end as a conversation. It is not a gap for the API to fill.
 */
const NO_OUTCOME_TEMPLATE: CircleActivityDefinition = {
  ...TEMPLATE,
  templateKey: "fixture-participation-no-outcome",
  outcome: { kind: "NONE" },
};

const KEY = randomBytes(32).toString("base64");
const U1 = "u-part-organizer";
const U2 = "u-part-outsider";

/** A fresh 256-bit invitation token, the shape the DTO requires. */
const mintToken = () => randomBytes(32).toString("base64url");

suite("circles · participation (real PostgreSQL)", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let service: CirclesParticipationService;
  let access: CirclesService;
  let registry: CircleTemplateRegistry;
  let cipher: CirclesCipher;

  const rollout = (mode: string) =>
    new CirclesRolloutService(
      resolveCirclesRolloutConfig({ CIRCLES_ROLLOUT_MODE: mode }),
    );

  /**
   * Assemble the domain, optionally with a seam in place of one collaborator.
   *
   * The seams exist because the properties under test are about WHEN a check
   * runs, and a test that cannot control the interleaving can only observe
   * that the check exists somewhere. Passing a wrapped repository lets a test
   * stop the command at an exact point, commit an interfering change on
   * another connection, and then let it continue — deterministically, with no
   * sleeps and no reliance on which transaction the scheduler picks.
   */
  interface Seams {
    readonly guestSessions?: CircleGuestSessionRepository;
    readonly members?: CircleMemberRepository;
    readonly rolloutOverride?: CirclesRolloutService;
    /** Swap the catalogue, to model editorial archiving a live version. */
    readonly registry?: CircleTemplateRegistry;
  }

  const build = (mode = "on", seams: Seams = {}) => {
    const invitations = new CircleInvitationRepository(prisma);
    const guestSessions =
      seams.guestSessions ?? new CircleGuestSessionRepository(prisma);
    const events = new CircleEventRepository(prisma);
    const members = seams.members ?? new CircleMemberRepository(prisma);
    const activities = new CircleActivityRepository(prisma);
    const participants = new CircleParticipantRepository(prisma);
    const artifacts = new CircleArtifactRepository(prisma);
    const p = prisma as unknown as ConstructorParameters<
      typeof CirclesParticipationService
    >[0];
    return {
      participation: new CirclesParticipationService(
        p,
        activities,
        participants,
        artifacts,
        events,
        members,
        guestSessions,
        invitations,
        seams.rolloutOverride ?? rollout(mode),
        cipher,
        seams.registry ?? registry,
      ),
      accessService: new CirclesService(
        p,
        invitations,
        guestSessions,
        events,
        members,
        rollout(mode),
        activities,
      ),
    };
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

    // A deliberately small pool. This suite needs at most four concurrent
    // connections, and the pg-spec files run in parallel threads against one
    // PostgreSQL server — a generous pool here is connection pressure that
    // lands on somebody else's timing-sensitive suite, not on this one.
    pool = new Pool({ connectionString: url, max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    registry = new CircleTemplateRegistry([
      TEMPLATE,
      DRAFT_TEMPLATE,
      ARCHIVED_TEMPLATE,
      NO_OUTCOME_TEMPLATE,
      ALT_TEMPLATE,
      TEMPLATE_V2,
    ]);
    cipher = new CirclesCipher(Buffer.from(KEY, "base64"));
    const built = build();
    service = built.participation;
    access = built.accessService;

    await prisma.user.createMany({
      data: [
        { id: U1, email: "part-organizer@test.local", name: "Organizer" },
        { id: U2, email: "part-outsider@test.local", name: "Outsider" },
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

  // ── Fixture: a Dúo with both seats accepted and ready to confirm ─────────

  interface Duo {
    circleId: string;
    activityId: string;
    organizer: CircleActor;
    guest: CircleActor;
    organizerSeatId: string;
    guestSeatId: string;
    guestSessionId: string;
  }

  /** Create a Dúo and take it through acceptance, so both seats are ACCEPTED. */
  async function makeDuo(options: { accept?: boolean } = {}): Promise<Duo> {
    const token = mintToken();
    const created = await service.createDuo({
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: randomUUID(),
    });

    const seats = await pool.query(
      `SELECT "id","status","memberId" FROM "CircleActivityParticipant"
        WHERE "activityId"=$1 ORDER BY "createdAt"`,
      [created.activityId],
    );
    const organizerSeatId = seats.rows.find((r) => r.memberId !== null)!.id;
    const guestSeatId = seats.rows.find((r) => r.memberId === null)!.id;

    let guestSessionId = "";
    if (options.accept !== false) {
      const exchanged = await access.exchange(token);
      guestSessionId = exchanged.guestSessionId;
    }

    return {
      circleId: created.circleId,
      activityId: created.activityId,
      organizer: { kind: "USER", userId: U1 },
      guest: {
        kind: "GUEST",
        guestSessionId,
        activityId: created.activityId,
        participantId: guestSeatId,
      },
      organizerSeatId,
      guestSeatId,
      guestSessionId,
    };
  }

  /**
   * The same Dúo, assembled with SQL instead of with the create/accept path.
   *
   * The hundred-race loop is about `confirmShare`, not about how the rows got
   * there — and going through `createDuo` + `exchange` a hundred times costs
   * ~500 transactions of setup for 200 transactions of subject. That cost is
   * not free: these pg-spec files run in parallel threads against one server,
   * and starving a sibling suite that measures lock timing is a real way to
   * make somebody else's test flaky.
   *
   * The tests that are ABOUT creation and acceptance still use `makeDuo`.
   */
  let fastSeq = 0;
  async function fastDuo(
    templateKey: string = TEMPLATE.templateKey,
  ): Promise<Duo> {
    const n = ++fastSeq;
    const id = {
      circle: `fc-${n}`,
      member: `fm-${n}`,
      activity: `fa-${n}`,
      organizerSeat: `fp-org-${n}`,
      guestSeat: `fp-gst-${n}`,
      invitation: `fi-${n}`,
      session: `fs-${n}`,
    };
    // 64 lowercase hex, the shape the hash CHECKs require.
    const hex = (seed: number) => seed.toString(16).padStart(64, "b");

    await pool.query(
      `INSERT INTO "Circle" ("id","kind","status","createdByUserId","maxParticipants","updatedAt")
       VALUES ($1,'DUO','ACTIVE',$2,2,now())`,
      [id.circle, U1],
    );
    await pool.query(
      `INSERT INTO "CircleMember" ("id","circleId","userId","role","status")
       VALUES ($1,$2,$3,'ORGANIZER','ACTIVE')`,
      [id.member, id.circle, U1],
    );
    await pool.query(
      `INSERT INTO "CircleActivity"
         ("id","circleId","templateKey","templateVersion","status",
          "requiredParticipants","updatedAt")
       VALUES ($1,$2,$3,1,'PREPARING',2,now())`,
      [id.activity, id.circle, templateKey],
    );
    await pool.query(
      `INSERT INTO "CircleInvitation"
         ("id","circleId","activityId","createdByMemberId","tokenHash",
          "expiresAt","createdAt","consumedAt","acceptedAt")
       VALUES ($1,$2,$3,$4,$5,now() + interval '7 days',now(),now(),now())`,
      [id.invitation, id.circle, id.activity, id.member, hex(n)],
    );
    await pool.query(
      `INSERT INTO "CircleActivityParticipant"
         ("id","circleId","activityId","memberId","status","updatedAt")
       VALUES ($1,$2,$3,$4,'ACCEPTED',now())`,
      [id.organizerSeat, id.circle, id.activity, id.member],
    );
    await pool.query(
      `INSERT INTO "CircleActivityParticipant"
         ("id","circleId","activityId","invitationId","status","updatedAt")
       VALUES ($1,$2,$3,$4,'ACCEPTED',now())`,
      [id.guestSeat, id.circle, id.activity, id.invitation],
    );
    await pool.query(
      `INSERT INTO "CircleGuestSession"
         ("id","invitationId","activityId","participantId","tokenHash",
          "expiresAt","acceptedAt","createdAt")
       VALUES ($1,$2,$3,$4,$5,now() + interval '7 days',now(),now())`,
      [id.session, id.invitation, id.activity, id.guestSeat, hex(n + 0xf0000)],
    );

    return {
      circleId: id.circle,
      activityId: id.activity,
      organizer: { kind: "USER", userId: U1 },
      guest: {
        kind: "GUEST",
        guestSessionId: id.session,
        activityId: id.activity,
        participantId: id.guestSeat,
      },
      organizerSeatId: id.organizerSeat,
      guestSeatId: id.guestSeat,
      guestSessionId: id.session,
    };
  }

  const share = (value: string) =>
    ({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value }],
    }) as const;

  const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
      await fn();
      return "RESOLVED";
    } catch (err) {
      if (process.env.CIRCLES_SPEC_TRACE) console.error("[trace]", err);
      return (err as CirclesError).code ?? "UNKNOWN";
    }
  };

  // ══ Creation ═════════════════════════════════════════════════════════════

  it("creates the circle, both seats and the invitation atomically", async () => {
    const duo = await makeDuo({ accept: false });
    const rows = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM "Circle" WHERE id=$1) AS circles,
         (SELECT count(*)::int FROM "CircleMember" WHERE "circleId"=$1) AS members,
         (SELECT count(*)::int FROM "CircleActivityParticipant" WHERE "activityId"=$2) AS seats,
         (SELECT count(*)::int FROM "CircleInvitation" WHERE "activityId"=$2) AS invitations,
         (SELECT "status"::text FROM "CircleActivity" WHERE id=$2) AS status`,
      [duo.circleId, duo.activityId],
    );
    expect(rows.rows[0]).toMatchObject({
      circles: 1,
      members: 1,
      seats: 2,
      invitations: 1,
      status: "INVITING",
    });
  });

  it("refuses a DRAFT or ARCHIVED template, and an unknown one", async () => {
    for (const key of [
      DRAFT_TEMPLATE.templateKey,
      ARCHIVED_TEMPLATE.templateKey,
      "no-such-template",
    ]) {
      expect(
        await codeOf(() =>
          service.createDuo({
            userId: U1,
            templateKey: key,
            templateVersion: 1,
            invitationToken: mintToken(),
            idempotencyKey: randomUUID(),
          }),
        ),
        key,
      ).toBe("CIRCLE_TEMPLATE_UNAVAILABLE");
    }
    // And nothing was created on the way to refusing.
    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleActivity"
        WHERE "templateKey" LIKE 'fixture-participation-draft%'
           OR "templateKey" LIKE 'fixture-participation-archived%'`,
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it("never persists the invitation token, only its hash", async () => {
    const token = mintToken();
    const created = await service.createDuo({
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: randomUUID(),
    });
    const row = await pool.query(
      `SELECT to_jsonb(i) AS row FROM "CircleInvitation" i WHERE "circleId"=$1`,
      [created.circleId],
    );
    const serialized = JSON.stringify(row.rows[0].row);
    expect(serialized).not.toContain(token);
    expect(serialized).toContain(hashSecret(token));
  });

  it("replays the same key with the same token, and conflicts on a different one", async () => {
    const token = mintToken();
    const key = randomUUID();
    const first = await service.createDuo({
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: key,
    });
    const replay = await service.createDuo({
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: key,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.circleId).toBe(first.circleId);
    expect(replay.activityId).toBe(first.activityId);

    // The same key with different content is a conflict, never a replay: the
    // caller believes a token is live that the server never saw.
    expect(
      await codeOf(() =>
        service.createDuo({
          userId: U1,
          templateKey: TEMPLATE.templateKey,
          templateVersion: TEMPLATE.templateVersion,
          invitationToken: mintToken(),
          idempotencyKey: key,
        }),
      ),
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    const count = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "type"='CIRCLE_CREATED' AND "idempotencyKey"=$1`,
      [key],
    );
    expect(count.rows[0].n, "one circle, one receipt").toBe(1);
  });

  // ══ Acceptance ═══════════════════════════════════════════════════════════

  it("moves INVITING → PREPARING in the same transaction as the acceptance", async () => {
    const duo = await makeDuo();
    const rows = await pool.query(
      `SELECT
         (SELECT "status"::text FROM "CircleActivity" WHERE id=$1) AS activity,
         (SELECT "status"::text FROM "CircleActivityParticipant" WHERE id=$2) AS seat,
         (SELECT count(*)::int FROM "CircleGuestSession" WHERE "activityId"=$1) AS sessions,
         (SELECT "consumedAt" IS NOT NULL FROM "CircleInvitation" WHERE "activityId"=$1) AS consumed`,
      [duo.activityId, duo.guestSeatId],
    );
    expect(rows.rows[0]).toMatchObject({
      activity: "PREPARING",
      seat: "ACCEPTED",
      sessions: 1,
      consumed: true,
    });
  });

  // ══ The reveal barrier ═══════════════════════════════════════════════════

  it("reveals only when both seats are READY, exactly once", async () => {
    const duo = await makeDuo();
    const first = await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("uno"),
      randomUUID(),
    );
    expect(first.revealed, "one READY is not a reveal").toBe(false);

    const mid = await pool.query(
      `SELECT "status"::text AS s FROM "CircleActivity" WHERE id=$1`,
      [duo.activityId],
    );
    expect(mid.rows[0].s).toBe("PREPARING");

    const second = await service.confirmShare(
      duo.guest,
      duo.activityId,
      share("dos"),
      randomUUID(),
    );
    expect(second.revealed).toBe(true);

    const events = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "activityId"=$1 AND "type"='ACTIVITY_REVEALED'`,
      [duo.activityId],
    );
    expect(events.rows[0].n, "exactly one reveal event").toBe(1);
  }, 30_000);

  it("never shows a partial reveal across a hundred races", async () => {
    // The property, stated as a loop: whatever the interleaving, the observable
    // state is one of exactly two complete ones. A hundred rounds is not proof,
    // but a single partial reveal in a hundred is a product defect, and this is
    // the shape of test that finds it.
    const rounds = 100;
    const outcomes: string[] = [];
    for (let i = 0; i < rounds; i += 1) {
      const duo = await fastDuo();
      const [a, b] = await Promise.allSettled([
        service.confirmShare(
          duo.organizer,
          duo.activityId,
          share("a"),
          randomUUID(),
        ),
        service.confirmShare(
          duo.guest,
          duo.activityId,
          share("b"),
          randomUUID(),
        ),
      ]);
      const state = await pool.query(
        `SELECT
           (SELECT "status"::text FROM "CircleActivity" WHERE id=$1) AS activity,
           (SELECT count(*)::int FROM "CircleActivityParticipant"
             WHERE "activityId"=$1 AND "status"='READY') AS ready,
           (SELECT count(*)::int FROM "CircleEvent"
             WHERE "activityId"=$1 AND "type"='ACTIVITY_REVEALED') AS reveals`,
        [duo.activityId],
      );
      const { activity, ready, reveals } = state.rows[0];
      const fulfilled = [a, b].filter((r) => r.status === "fulfilled").length;

      // Two complete states, and nothing else. In particular: never REVEALED
      // with one READY, and never two READY with more than one reveal event.
      const legal =
        (activity === "REVEALED" && ready === 2 && reveals === 1) ||
        (activity === "PREPARING" && ready === 1 && reveals === 0);
      expect(
        legal,
        `round ${i}: activity=${activity} ready=${ready} reveals=${reveals} fulfilled=${fulfilled}`,
      ).toBe(true);
      outcomes.push(activity);
    }
    // Both confirmations normally succeed, so the overwhelmingly common
    // outcome is a full reveal. The assertion above is what matters; this
    // records that the loop actually exercised the interesting path.
    expect(outcomes.filter((o) => o === "REVEALED").length).toBeGreaterThan(0);
  }, 300_000);

  it("lets only one of two simultaneous confirmations of the SAME seat win", async () => {
    const duo = await makeDuo();
    const results = await Promise.allSettled([
      service.confirmShare(
        duo.organizer,
        duo.activityId,
        share("x"),
        randomUUID(),
      ),
      service.confirmShare(
        duo.organizer,
        duo.activityId,
        share("y"),
        randomUUID(),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ready = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleActivityParticipant"
        WHERE "activityId"=$1 AND "status"='READY'`,
      [duo.activityId],
    );
    expect(ready.rows[0].n).toBe(1);
  }, 30_000);

  it("reaches the same place whichever participant confirms first", async () => {
    for (const order of [
      ["organizer", "guest"],
      ["guest", "organizer"],
    ] as const) {
      const duo = await makeDuo();
      for (const who of order) {
        await service.confirmShare(
          who === "organizer" ? duo.organizer : duo.guest,
          duo.activityId,
          share(who),
          randomUUID(),
        );
      }
      const state = await pool.query(
        `SELECT "status"::text AS s, "revealedAt" IS NOT NULL AS revealed
           FROM "CircleActivity" WHERE id=$1`,
        [duo.activityId],
      );
      expect(state.rows[0], order.join("→")).toMatchObject({
        s: "REVEALED",
        revealed: true,
      });
    }
  }, 60_000);

  it("treats an equal replay as a no-op and a different payload as a conflict", async () => {
    const duo = await makeDuo();
    const key = randomUUID();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("uno"),
      key,
    );
    const replay = await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("uno"),
      key,
    );
    expect(replay.replayed).toBe(true);

    const receipts = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "type"='PARTICIPANT_READY' AND "idempotencyKey"=$1`,
      [key],
    );
    expect(receipts.rows[0].n, "one receipt").toBe(1);

    // A SECOND key cannot overwrite a confirmation that already happened: the
    // seat is no longer ACCEPTED, so there is nothing to confirm.
    expect(
      await codeOf(() =>
        service.confirmShare(
          duo.organizer,
          duo.activityId,
          share("otro"),
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
  }, 30_000);

  // ══ Withdrawal ═══════════════════════════════════════════════════════════

  it("cancels completely or reveals completely when withdrawal races a confirmation", async () => {
    for (let i = 0; i < 12; i += 1) {
      const duo = await fastDuo();
      await service.confirmShare(
        duo.organizer,
        duo.activityId,
        share("uno"),
        randomUUID(),
      );
      const [,] = await Promise.allSettled([
        service.withdraw(duo.guest, duo.activityId, randomUUID()),
        service.confirmShare(
          duo.guest,
          duo.activityId,
          share("dos"),
          randomUUID(),
        ),
      ]);
      const state = await pool.query(
        `SELECT
           (SELECT "status"::text FROM "CircleActivity" WHERE id=$1) AS activity,
           (SELECT count(*)::int FROM "CircleActivityParticipant"
             WHERE "activityId"=$1 AND "status"='READY') AS ready,
           (SELECT count(*)::int FROM "CircleActivityParticipant"
             WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL) AS envelopes,
           (SELECT count(*)::int FROM "CircleEvent"
             WHERE "activityId"=$1 AND "type"='ACTIVITY_REVEALED') AS reveals`,
        [duo.activityId],
      );
      const { activity, ready, envelopes, reveals } = state.rows[0];

      // THREE complete states, not two — and finding the third is what this
      // loop was for. The spec anticipated "cancel completely or reveal
      // completely"; the run produced a legitimate composite:
      //
      //   1. the withdrawal wins → CANCELLED, both envelopes destroyed, no
      //      reveal;
      //   2. the confirmation wins → REVEALED with both seats READY;
      //   3. the confirmation wins AND the withdrawal then runs on the now
      //      REVEALED activity → CLOSED, the withdrawer's envelope purged, the
      //      other person's kept.
      //
      // The third is not a partial reveal. It is two operations that each
      // completed, in a serial order the contract declares: `PREPARING →
      // REVEALED` by the barrier, then `REVEALED → CLOSED` by WITHDRAW. At the
      // instant of the reveal both seats were READY, which is the property that
      // matters; what follows is somebody leaving a conversation that had
      // already started, and the product never promised to un-start it.
      const cancelledCleanly =
        activity === "CANCELLED" &&
        ready === 0 &&
        envelopes === 0 &&
        reveals === 0;
      const revealedCleanly =
        activity === "REVEALED" &&
        ready === 2 &&
        envelopes === 2 &&
        reveals === 1;
      const revealedThenLeft =
        activity === "CLOSED" &&
        ready === 1 &&
        envelopes === 1 &&
        reveals === 1;
      expect(
        cancelledCleanly || revealedCleanly || revealedThenLeft,
        `round ${i}: activity=${activity} ready=${ready} envelopes=${envelopes} reveals=${reveals}`,
      ).toBe(true);

      // The property underneath all three: a reveal, if it happened at all,
      // happened exactly once and never with fewer than two confirmations.
      expect(reveals, `round ${i}: at most one reveal`).toBeLessThanOrEqual(1);
      if (reveals === 1) {
        const readyEvents = await pool.query(
          `SELECT count(*)::int AS n FROM "CircleEvent"
            WHERE "activityId"=$1 AND "type"='PARTICIPANT_READY'`,
          [duo.activityId],
        );
        expect(
          readyEvents.rows[0].n,
          `round ${i}: a reveal needs two confirmations`,
        ).toBe(2);
      }
    }
  }, 120_000);

  it("destroys both pending envelopes when somebody leaves before the reveal", async () => {
    const duo = await makeDuo();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("mio"),
      randomUUID(),
    );
    const result = await service.withdraw(
      duo.guest,
      duo.activityId,
      randomUUID(),
    );
    expect(result.outcome).toBe("CANCELLED");

    const rows = await pool.query(
      `SELECT "status"::text AS s, "ciphertext", "nonce", "keyVersion",
              "readyAt", "sharingMode", "payloadHash", "fieldKeys"
         FROM "CircleActivityParticipant" WHERE "activityId"=$1`,
      [duo.activityId],
    );
    for (const row of rows.rows) {
      expect(row.ciphertext, row.s).toBeNull();
      expect(row.nonce, row.s).toBeNull();
      expect(row.keyVersion, row.s).toBeNull();
      expect(row.readyAt, row.s).toBeNull();
      expect(row.sharingMode, row.s).toBeNull();
      expect(row.payloadHash, row.s).toBeNull();
      expect(row.fieldKeys, row.s).toEqual([]);
    }
    // And the invitation and session are unusable afterwards.
    const revoked = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM "CircleInvitation"
           WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS live_invitations,
         (SELECT count(*)::int FROM "CircleGuestSession"
           WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS live_sessions`,
      [duo.activityId],
    );
    expect(revoked.rows[0]).toMatchObject({
      live_invitations: 0,
      live_sessions: 0,
    });
  }, 30_000);

  it("closes rather than cancels when somebody leaves after the reveal", async () => {
    const duo = await makeDuo();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("uno"),
      randomUUID(),
    );
    await service.confirmShare(
      duo.guest,
      duo.activityId,
      share("dos"),
      randomUUID(),
    );
    const result = await service.withdraw(
      duo.guest,
      duo.activityId,
      randomUUID(),
    );
    expect(result.outcome).toBe("CLOSED");

    const rows = await pool.query(
      `SELECT "id","status"::text AS s, "ciphertext" IS NULL AS purged
         FROM "CircleActivityParticipant" WHERE "activityId"=$1 ORDER BY "createdAt"`,
      [duo.activityId],
    );
    const organizer = rows.rows.find((r) => r.id === duo.organizerSeatId)!;
    const guest = rows.rows.find((r) => r.id === duo.guestSeatId)!;
    // The person who left keeps nothing. The person who stayed keeps what they
    // wrote — the product does not pretend the other can un-see it, and it does
    // not delete their own words either.
    expect(guest.purged, "the withdrawer's envelope is gone").toBe(true);
    expect(organizer.purged, "the other person's own words remain").toBe(false);
  }, 30_000);

  it("makes the organizer's withdrawal during INVITING terminal and silent", async () => {
    const duo = await makeDuo({ accept: false });
    const result = await service.withdraw(
      duo.organizer,
      duo.activityId,
      randomUUID(),
    );
    expect(result.outcome).toBe("CANCELLED");
    const state = await pool.query(
      `SELECT
         (SELECT "status"::text FROM "CircleActivity" WHERE id=$1) AS activity,
         (SELECT count(*)::int FROM "CircleInvitation"
           WHERE "activityId"=$1 AND "revokedAt" IS NULL) AS live_invitations,
         (SELECT count(*)::int FROM "CircleEvent"
           WHERE "activityId"=$1 AND "metadata" IS NOT NULL
             AND "type" <> 'INVITATION_CREATED') AS events_with_metadata`,
      [duo.activityId],
    );
    expect(state.rows[0]).toMatchObject({
      activity: "CANCELLED",
      live_invitations: 0,
      events_with_metadata: 0,
    });
  }, 30_000);

  it("rejects the acceptance when the inviter withdraws first", async () => {
    const token = mintToken();
    const created = await service.createDuo({
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: randomUUID(),
    });
    await service.withdraw(
      { kind: "USER", userId: U1 },
      created.activityId,
      randomUUID(),
    );
    // The link is revoked and the activity is terminal; the exchange refuses
    // with the same uniform answer as a token that never existed.
    expect(await codeOf(() => access.exchange(token))).toBe(
      "CIRCLE_INVITATION_UNUSABLE",
    );
  }, 30_000);

  // ══ Reads ════════════════════════════════════════════════════════════════

  it("never decrypts or serializes the counterpart's share before the reveal", async () => {
    const duo = await makeDuo();
    const secret = "una respuesta que la otra persona no puede ver";
    await service.confirmShare(
      duo.guest,
      duo.activityId,
      {
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: secret }],
      },
      randomUUID(),
    );

    const { ctx } = await service.readActivity(duo.organizer, duo.activityId);
    expect(ctx.activity.status).toBe("PREPARING");
    // The counterpart's row is in memory — it has to be, the barrier counts it
    // — but the projection is what decides, and the facade never decrypts it.
    // Assert on the observable: the plaintext is nowhere.
    const dump = JSON.stringify(ctx);
    expect(dump).not.toContain(secret);
  }, 30_000);

  it("gives each side the other's content only after the reveal", async () => {
    const duo = await makeDuo();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      {
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: "lo del organizador" }],
      },
      randomUUID(),
    );
    await service.confirmShare(
      duo.guest,
      duo.activityId,
      { mode: "EDITED_SUMMARY", summary: "lo del invitado" },
      randomUUID(),
    );

    const { ctx } = await service.readActivity(duo.organizer, duo.activityId);
    expect(ctx.activity.status).toBe("REVEALED");
    const counterpartBody = service.openEnvelope(
      ctx.counterpart!,
      ctx.activity,
      ctx.definition,
    );
    expect(counterpartBody).toContain("lo del invitado");
    const own = service.openEnvelope(ctx.self, ctx.activity, ctx.definition);
    expect(own).toContain("lo del organizador");
  }, 30_000);

  it("keeps KEEP_PRIVATE free of content, and says only that nothing was shared", async () => {
    const duo = await makeDuo();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("algo"),
      randomUUID(),
    );
    await service.confirmShare(
      duo.guest,
      duo.activityId,
      { mode: "KEEP_PRIVATE" },
      randomUUID(),
    );
    const { ctx } = await service.readActivity(duo.organizer, duo.activityId);
    const body = service.openEnvelope(
      ctx.counterpart!,
      ctx.activity,
      ctx.definition,
    );
    expect(body).toBe(JSON.stringify({ mode: "KEEP_PRIVATE" }));
    const row = await pool.query(
      `SELECT "fieldKeys","sharingMode"::text AS m FROM "CircleActivityParticipant" WHERE id=$1`,
      [duo.guestSeatId],
    );
    expect(row.rows[0]).toMatchObject({ fieldKeys: [], m: "KEEP_PRIVATE" });
  }, 30_000);

  it("stores a sealed envelope, never the confirmed text", async () => {
    // The row is what an operator, a backup, or somebody with a stolen dump
    // sees. What must not be there is the sentence the person wrote.
    const duo = await makeDuo();
    const written = "una frase que no puede aparecer en la fila";
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      {
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "campo-a", value: written }],
      },
      randomUUID(),
    );
    const row = await pool.query(
      `SELECT to_jsonb(p) AS row FROM "CircleActivityParticipant" p WHERE id=$1`,
      [duo.organizerSeatId],
    );
    const serialized = JSON.stringify(row.rows[0].row);
    expect(serialized).not.toContain(written);
    // And the ciphertext is not merely the body in another encoding.
    const stored = row.rows[0].row as { ciphertext: string };
    expect(
      Buffer.from(stored.ciphertext, "base64").toString("utf8"),
    ).not.toContain(written);
    // What IS there decrypts back, so this is encryption and not deletion.
    const { ctx } = await service.readActivity(duo.organizer, duo.activityId);
    expect(
      service.openEnvelope(ctx.self, ctx.activity, ctx.definition),
    ).toContain(written);
  }, 30_000);

  it("refuses a guest reading another activity, and a revoked session", async () => {
    const a = await makeDuo();
    const b = await makeDuo();
    // A guest actor naming another activity: no answer, not an explanation.
    expect(
      await codeOf(() => service.readActivity(a.guest, b.activityId)),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");

    // Revocation is read from PostgreSQL on every command, so it bites at once.
    await pool.query(
      `UPDATE "CircleGuestSession" SET "revokedAt"=now() WHERE id=$1`,
      [a.guestSessionId],
    );
    expect(
      await codeOf(() => service.readActivity(a.guest, a.activityId)),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
  }, 30_000);

  it("refuses a member of another circle", async () => {
    const duo = await makeDuo();
    expect(
      await codeOf(() =>
        service.readActivity({ kind: "USER", userId: U2 }, duo.activityId),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
  }, 30_000);

  // ══ Artifact ═════════════════════════════════════════════════════════════

  async function revealedDuo(): Promise<Duo> {
    const duo = await makeDuo();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("uno"),
      randomUUID(),
    );
    await service.confirmShare(
      duo.guest,
      duo.activityId,
      share("dos"),
      randomUUID(),
    );
    return duo;
  }

  it("versions the artifact monotonically and keeps one live", async () => {
    const duo = await revealedDuo();
    const first = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "primera versión",
      randomUUID(),
    );
    expect(first.version).toBe(1);
    const second = await service.proposeArtifact(
      duo.guest,
      duo.activityId,
      "segunda versión",
      randomUUID(),
    );
    expect(second.version).toBe(2);

    const rows = await pool.query(
      `SELECT "version","status"::text AS s FROM "CircleArtifact"
        WHERE "activityId"=$1 ORDER BY "version"`,
      [duo.activityId],
    );
    expect(rows.rows).toEqual([
      { version: 1, s: "SUPERSEDED" },
      { version: 2, s: "PROPOSED" },
    ]);
  }, 30_000);

  it("lets only one of two concurrent proposals take a version", async () => {
    const duo = await revealedDuo();
    const results = await Promise.allSettled([
      service.proposeArtifact(duo.organizer, duo.activityId, "a", randomUUID()),
      service.proposeArtifact(duo.guest, duo.activityId, "b", randomUUID()),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    // Both may succeed — they serialise on the activity lock — but the versions
    // must differ and only one may be live.
    const live = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleArtifact"
        WHERE "activityId"=$1 AND "status" <> 'SUPERSEDED'`,
      [duo.activityId],
    );
    expect(live.rows[0].n, "exactly one live artifact").toBe(1);
    const versions = await pool.query(
      `SELECT count(DISTINCT "version")::int AS n, count(*)::int AS total
         FROM "CircleArtifact" WHERE "activityId"=$1`,
      [duo.activityId],
    );
    expect(versions.rows[0].n).toBe(versions.rows[0].total);
    expect(ok.length).toBeGreaterThan(0);
  }, 30_000);

  it("agrees only when both seats confirmed the SAME artifact", async () => {
    const duo = await revealedDuo();
    const proposal = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "el acuerdo",
      randomUUID(),
    );

    const one = await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      proposal.artifactId,
      proposal.version,
      randomUUID(),
    );
    expect(one.agreed, "one confirmation is not an agreement").toBe(false);

    const two = await service.confirmArtifact(
      duo.guest,
      duo.activityId,
      proposal.artifactId,
      proposal.version,
      randomUUID(),
    );
    expect(two.agreed).toBe(true);

    const agreed = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleArtifact"
        WHERE id=$1 AND "status"='AGREED' AND "agreedAt" IS NOT NULL`,
      [proposal.artifactId],
    );
    expect(agreed.rows[0].n).toBe(1);
  }, 30_000);

  it("refuses a confirmation of a superseded artifact or a wrong version", async () => {
    const duo = await revealedDuo();
    const first = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "v1",
      randomUUID(),
    );
    const second = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "v2",
      randomUUID(),
    );

    // The old artifact is superseded: agreeing to text that is no longer the
    // shared result is exactly what "editing invalidates confirmations" means.
    expect(
      await codeOf(() =>
        service.confirmArtifact(
          duo.guest,
          duo.activityId,
          first.artifactId,
          first.version,
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");

    // And the right artifact with the wrong version is refused too, rather
    // than helpfully redirected to the current one.
    expect(
      await codeOf(() =>
        service.confirmArtifact(
          duo.guest,
          duo.activityId,
          second.artifactId,
          second.version + 1,
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
  }, 30_000);

  it("counts one confirmation per seat per artifact, replayed under its own key", async () => {
    // This test used to send the SECOND confirmation under a fresh key and
    // assert `replayed: true`. That assertion pinned the defect: a key that
    // received a successful response was never written to any receipt, so it
    // stayed free to be spent on a different artifact later. The refusal for
    // that case is covered in "refuses a second confirmation of the same
    // artifact under a new key".
    //
    // What survives is the claim that was always true and is worth keeping
    // separate: replaying under the ORIGINAL key resolves, and the ledger
    // still holds exactly one confirmation.
    const duo = await revealedDuo();
    const proposal = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "una vez",
      randomUUID(),
    );
    const key = randomUUID();
    const first = await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      proposal.artifactId,
      proposal.version,
      key,
    );
    expect(first.replayed).toBe(false);
    const replay = await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      proposal.artifactId,
      proposal.version,
      key,
    );
    expect(replay.replayed).toBe(true);
    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "artifactId"=$1 AND "type"='ARTIFACT_CONFIRMED'`,
      [proposal.artifactId],
    );
    expect(rows.rows[0].n).toBe(1);
  }, 30_000);

  // ══ Follow-up ════════════════════════════════════════════════════════════

  it("refuses a follow-up before its date and accepts it after", async () => {
    const duo = await revealedDuo();
    // The template's follow-up is a week out, so right now it is not due.
    expect(
      await codeOf(() =>
        service.recordFollowUp(
          duo.organizer,
          duo.activityId,
          "KEEP",
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");

    await pool.query(
      `UPDATE "CircleActivity" SET "followUpDueAt" = now() - interval '1 hour'
        WHERE id=$1`,
      [duo.activityId],
    );
    const first = await service.recordFollowUp(
      duo.organizer,
      duo.activityId,
      "KEEP",
      randomUUID(),
    );
    expect(first.closed, "one decision does not close it").toBe(false);
    const mid = await pool.query(
      `SELECT "status"::text AS s FROM "CircleActivity" WHERE id=$1`,
      [duo.activityId],
    );
    expect(mid.rows[0].s).toBe("FOLLOW_UP");

    const second = await service.recordFollowUp(
      duo.guest,
      duo.activityId,
      "CLOSE",
      randomUUID(),
    );
    expect(second.closed).toBe(true);
    const end = await pool.query(
      `SELECT "status"::text AS s, "closedAt" IS NOT NULL AS closed
         FROM "CircleActivity" WHERE id=$1`,
      [duo.activityId],
    );
    expect(end.rows[0]).toMatchObject({ s: "CLOSED", closed: true });
  }, 60_000);

  // ══ The SQL invariants PR3 adds ══════════════════════════════════════════

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

  it("refuses an artifact event without its three ids", async () => {
    const duo = await revealedDuo();
    const proposal = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "x",
      randomUUID(),
    );
    // No artifactId on an artifact event.
    const missing = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","activityId","type","actorParticipantId")
         VALUES ($1,$2,$3,'ARTIFACT_CONFIRMED',$4)`,
        [
          `ev-noart-${Date.now()}`,
          duo.circleId,
          duo.activityId,
          duo.organizerSeatId,
        ],
      ),
    );
    expect(missing.constraint).toBe("CircleEvent_artifact_binding");

    // An artifactId on an event type that does not take one.
    const smuggled = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","activityId","type","artifactId")
         VALUES ($1,$2,$3,'ACTIVITY_CLOSED',$4)`,
        [
          `ev-smuggle-${Date.now()}`,
          duo.circleId,
          duo.activityId,
          proposal.artifactId,
        ],
      ),
    );
    expect(smuggled.constraint).toBe("CircleEvent_artifact_binding");
  }, 30_000);

  it("refuses a second confirmation row for the same seat and artifact", async () => {
    const duo = await revealedDuo();
    const proposal = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "x",
      randomUUID(),
    );
    await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      proposal.artifactId,
      proposal.version,
      randomUUID(),
    );
    const refusal = await refusalOf(() =>
      pool.query(
        `INSERT INTO "CircleEvent" ("id","circleId","activityId","type","artifactId","actorParticipantId")
         VALUES ($1,$2,$3,'ARTIFACT_CONFIRMED',$4,$5)`,
        [
          `ev-dup-${Date.now()}`,
          duo.circleId,
          duo.activityId,
          proposal.artifactId,
          duo.organizerSeatId,
        ],
      ),
    );
    expect(refusal.code).toBe("23505");
  }, 30_000);

  it("refuses a READY seat missing its sharing mode or payload hash", async () => {
    const duo = await makeDuo();
    for (const column of ["sharingMode", "payloadHash"]) {
      await service
        .confirmShare(duo.organizer, duo.activityId, share("uno"), randomUUID())
        .catch(() => undefined);
      const refusal = await refusalOf(() =>
        pool.query(
          `UPDATE "CircleActivityParticipant" SET "${column}"=NULL WHERE id=$1`,
          [duo.organizerSeatId],
        ),
      );
      expect(refusal.constraint, column).toBe(
        "CircleActivityParticipant_ready_is_complete",
      );
    }
  }, 30_000);

  it("refuses WITHDRAW as a stored sharing mode", async () => {
    const duo = await makeDuo();
    const refusal = await refusalOf(() =>
      pool.query(
        `UPDATE "CircleActivityParticipant"
            SET "sharingMode"='WITHDRAW' WHERE id=$1`,
        [duo.organizerSeatId],
      ),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_withdraw_is_not_a_share",
    );
  }, 30_000);

  it("refuses a withdrawn seat that still holds an envelope", async () => {
    const duo = await makeDuo();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("uno"),
      randomUUID(),
    );
    const refusal = await refusalOf(() =>
      pool.query(
        `UPDATE "CircleActivityParticipant"
            SET "status"='WITHDRAWN', "withdrawnAt"=now() WHERE id=$1`,
        [duo.organizerSeatId],
      ),
    );
    expect(refusal.constraint).toBe(
      "CircleActivityParticipant_withdrawn_has_no_envelope",
    );
  }, 30_000);

  // ══ The guest's authority is serialized, not merely checked ══════════════

  /**
   * A guest-session repository that stops the command at a chosen point.
   *
   * `lockById` is where the command commits to a decision, so pausing just
   * before it is the exact window an attacker — or an unlucky retry — lives
   * in. The hook runs on the FIRST lock only: `resolveAuthority` is called
   * once per command, and re-pausing would deadlock the test rather than the
   * subject.
   */
  class PausingGuestSessions extends CircleGuestSessionRepository {
    private armed = true;
    constructor(
      db: ConstructorParameters<typeof CircleGuestSessionRepository>[0],
      private readonly hook: () => Promise<void>,
      /**
       * WHERE to stop, and it matters.
       *
       * `"lock"` parks the command after the member and invitation are
       * locked — the right window for revoking the SESSION, which those
       * locks do not cover.
       *
       * `"peek"` parks it at the very first unlocked read, before any lock
       * exists. That is the only usable window for interfering with the
       * MEMBER or the INVITATION: at `"lock"` the command already holds both
       * rows, so an UPDATE from the test's own connection would block on the
       * transaction it is trying to race and the test would time out —
       * proving nothing except that `FOR UPDATE` works.
       */
      private readonly at: "peek" | "lock" = "lock",
    ) {
      super(db);
    }
    private async fire(when: "peek" | "lock") {
      if (this.at !== when || !this.armed) return;
      this.armed = false;
      await this.hook();
    }
    override async findById(
      id: string,
      db?: Parameters<CircleGuestSessionRepository["findById"]>[1],
    ) {
      await this.fire("peek");
      return super.findById(id, db);
    }
    override async lockById(
      id: string,
      tx: Parameters<CircleGuestSessionRepository["lockById"]>[1],
    ) {
      await this.fire("lock");
      return super.lockById(id, tx);
    }
  }

  /** Every write a participation command could possibly have made. */
  async function footprint(activityId: string) {
    const r = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM "CircleEvent"
           WHERE "activityId"=$1 AND "type"='PARTICIPANT_READY') AS ready,
         (SELECT count(*)::int FROM "CircleEvent"
           WHERE "activityId"=$1
             AND "type" IN ('ARTIFACT_PROPOSED','ARTIFACT_CONFIRMED')) AS artifact,
         (SELECT count(*)::int FROM "CircleEvent"
           WHERE "activityId"=$1 AND "type"='FOLLOW_UP_RECORDED') AS followUp,
         (SELECT count(*)::int FROM "CircleActivityParticipant"
           WHERE "activityId"=$1 AND "status"<>'ACCEPTED') AS movedSeats,
         (SELECT count(*)::int FROM "CircleActivityParticipant"
           WHERE "activityId"=$1 AND "ciphertext" IS NOT NULL) AS envelopes,
         (SELECT count(*)::int FROM "CircleArtifact" WHERE "activityId"=$1) AS artifacts,
         (SELECT "status"::text FROM "CircleActivity" WHERE id=$1) AS status`,
      [activityId],
    );
    return r.rows[0] as {
      ready: number;
      artifact: number;
      followup: number;
      movedseats: number;
      envelopes: number;
      artifacts: number;
      status: string;
    };
  }

  it("refuses a guest whose session is revoked while the command is in flight", async () => {
    const duo = await fastDuo();
    // The revocation commits on a DIFFERENT connection, while the command is
    // parked immediately before it takes the session lock. No sleep decides
    // the order: the hook does.
    const seam = new PausingGuestSessions(prisma, async () => {
      await pool.query(
        `UPDATE "CircleGuestSession" SET "revokedAt"=now() WHERE id=$1`,
        [duo.guestSessionId],
      );
    });
    const { participation } = build("on", { guestSessions: seam });

    expect(
      await codeOf(() =>
        participation.confirmShare(
          duo.guest,
          duo.activityId,
          share("lo que el invitado iba a decir"),
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");

    // Revocation won, so the command left NOTHING behind.
    const after = await footprint(duo.activityId);
    expect(after.ready, "PARTICIPANT_READY_EVENTS").toBe(0);
    expect(after.artifact, "ARTIFACT_EVENTS").toBe(0);
    expect(after.followup, "FOLLOW_UP_EVENTS").toBe(0);
    expect(after.movedseats, "STATE_CHANGES").toBe(0);
    expect(after.envelopes, "no envelope was written").toBe(0);
    expect(after.status, "the activity did not move").toBe("PREPARING");
  }, 30_000);

  /**
   * Wait until a query is blocked on a lock held over `CircleGuestSession`.
   *
   * The evidence is the LOCK, not the clock. `pg_locks` is asked for a row
   * lock (`tuple` or `transactionid`) that has not been granted, on a
   * connection whose blocking counterpart holds a lock on that relation —
   * so what satisfies this function is PostgreSQL reporting a real waiter on
   * the real table, and nothing else can.
   *
   * The deadline measures nothing — on an idle machine the waiter appears in
   * milliseconds — but it must sit WELL INSIDE the surrounding test's own
   * timeout, and that is a lesson from getting it wrong. At 45s against a 40s
   * test timeout vitest aborted first, so the failure arrived as a bare "Test
   * timed out": the cause was right and the message said nothing, and the
   * negative control for `FOR UPDATE` could not be counted. 20s inside a 90s
   * test leaves the named error room to win, and still gives a loaded machine
   * far more time than it needs.
   *
   * If the deadline IS reached, the thrown message is the assertion: a
   * command that does not block here is a command reading a snapshot another
   * transaction is in the middle of changing.
   */
  async function waitUntilBlockedOnGuestSessionRow(
    deadlineMs = 20_000,
  ): Promise<void> {
    const until = Date.now() + deadlineMs;
    for (;;) {
      // `pg_blocking_pids` rather than an ungranted lock ON the relation: a
      // `FOR UPDATE` that loses the race waits on the holder's
      // `transactionid`, and a `transactionid` lock has no `relation`. So the
      // question is asked from the other side — somebody is blocked, and
      // whoever blocks them holds a granted lock on THIS table.
      const r = await pool.query(
        `SELECT count(*)::int AS n
           FROM pg_stat_activity a
          WHERE a.datname = current_database()
            AND cardinality(pg_blocking_pids(a.pid)) > 0
            AND EXISTS (
              SELECT 1 FROM pg_locks l
               WHERE l.pid = ANY (pg_blocking_pids(a.pid))
                 AND l.granted
                 AND l.relation = '"CircleGuestSession"'::regclass
            )`,
      );
      if (r.rows[0].n > 0) return;
      if (Date.now() > until) {
        throw new Error(
          'no ungranted lock on "CircleGuestSession" ever appeared — the ' +
            "command did not block on the session row, so it read a snapshot " +
            "another transaction was in the middle of changing",
        );
      }
      await new Promise((r2) => setImmediate(r2));
    }
  }

  it("blocks on the guest session row while a revocation is uncommitted", async () => {
    const duo = await fastDuo();
    // A revocation that has taken the row lock and NOT committed. This is the
    // window the `FOR UPDATE` exists for: an unlocked read here returns the
    // pre-revocation snapshot and the command proceeds on a credential that
    // is being destroyed.
    const revoker = await pool.connect();
    await revoker.query("BEGIN");
    await revoker.query(
      `UPDATE "CircleGuestSession" SET "revokedAt"=now() WHERE id=$1`,
      [duo.guestSessionId],
    );

    let reachedLock = () => {};
    const atLock = new Promise<void>((r) => (reachedLock = r));
    const seam = new PausingGuestSessions(
      prisma,
      async () => {
        reachedLock();
      },
      "lock",
    );
    const { participation } = build("on", { guestSessions: seam });

    const outcome = participation
      .confirmShare(
        duo.guest,
        duo.activityId,
        share("en la ventana"),
        randomUUID(),
      )
      .then(() => "RESOLVED")
      .catch((err: CirclesError) => err.code);

    // `finally`, because the interesting case is the one where the wait
    // THROWS. Leaving the revoker's transaction open there strands a pooled
    // connection, `afterAll` blocks on `pool.end()`, and the suite reports a
    // hook timeout stacked on top of the real failure — which is how one
    // honest red turns into two confusing ones.
    try {
      await atLock;
      await waitUntilBlockedOnGuestSessionRow();
    } finally {
      await revoker.query("COMMIT").catch(() => undefined);
      revoker.release();
    }

    expect(await outcome).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    const after = await footprint(duo.activityId);
    expect(after.ready, "PARTICIPANT_READY_EVENTS").toBe(0);
    expect(after.artifact, "ARTIFACT_EVENTS").toBe(0);
    expect(after.followup, "FOLLOW_UP_EVENTS").toBe(0);
    expect(after.movedseats, "STATE_CHANGES").toBe(0);
    expect(after.envelopes).toBe(0);
  }, 90_000);

  it("refuses a guest whose inviter leaves while the command is in flight", async () => {
    const duo = await fastDuo();
    const seam = new PausingGuestSessions(
      prisma,
      async () => {
        // The member who issued the invitation walks out. A guest holds no
        // membership of their own, so this removes the only thing their
        // authority rested on.
        // `CircleMember_left_has_timestamp` requires both columns to move
        // together — leaving without a moment of leaving is not a state.
        await pool.query(
          `UPDATE "CircleMember" SET "status"='LEFT', "leftAt"=now()
          WHERE "circleId"=$1`,
          [duo.circleId],
        );
      },
      "peek",
    );
    const { participation } = build("on", { guestSessions: seam });

    expect(
      await codeOf(() =>
        participation.confirmShare(
          duo.guest,
          duo.activityId,
          share("no debería quedar"),
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    const after = await footprint(duo.activityId);
    expect(after.ready).toBe(0);
    expect(after.envelopes).toBe(0);
    expect(after.status).toBe("PREPARING");
  }, 30_000);

  it("refuses a guest whose inviter drops out of the pilot allowlist mid-command", async () => {
    const duo = await fastDuo();
    // The seam is the ROLLOUT, not the clock: `isAvailable` answers yes the
    // first time — standing in for the coarse check at the door — and no
    // afterwards. That isolates the in-transaction re-derivation: a build
    // that only consulted the allowlist at the guard would still pass.
    let asked = 0;
    const flipping = {
      currentMode: () => "pilot" as const,
      isAvailable: () => ++asked === 1,
      isGuestSurfaceAvailable: () => true,
    } as unknown as CirclesRolloutService;
    const { participation } = build("pilot", { rolloutOverride: flipping });

    // Warm the first `true` so the command's own call gets the `false`.
    expect(flipping.isAvailable(U1)).toBe(true);

    expect(
      await codeOf(() =>
        participation.confirmShare(
          duo.guest,
          duo.activityId,
          share("tampoco debería quedar"),
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    expect(asked, "the command asked the allowlist itself").toBeGreaterThan(1);
    const after = await footprint(duo.activityId);
    expect(after.ready).toBe(0);
    expect(after.envelopes).toBe(0);
  }, 30_000);

  it("refuses an actor whose participant id is not the one its session names", async () => {
    const a = await fastDuo();
    const b = await fastDuo();
    // A guest actor carrying somebody else's seat. The guard builds the actor
    // from the session, so the two normally agree — which is exactly the
    // assumption worth attacking.
    const impostor = { ...a.guest, participantId: b.guestSeatId };
    expect(
      await codeOf(() =>
        service.confirmShare(
          impostor,
          a.activityId,
          share("de otro asiento"),
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    // And the organizer's own seat on the OTHER activity is untouched too.
    expect((await footprint(a.activityId)).ready).toBe(0);
    expect((await footprint(b.activityId)).ready).toBe(0);
  }, 30_000);

  it("refuses a guest whose invitation was revoked, session still live", async () => {
    const duo = await fastDuo();
    await pool.query(
      `UPDATE "CircleInvitation" SET "revokedAt"=now() WHERE "activityId"=$1`,
      [duo.activityId],
    );
    expect(
      await codeOf(() =>
        service.confirmShare(
          duo.guest,
          duo.activityId,
          share("invitación revocada"),
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    expect((await footprint(duo.activityId)).ready).toBe(0);
  }, 30_000);

  it("refuses a guest whose invitation was never legitimately exchanged", async () => {
    // A session exists only because an invitation was consumed. An invitation
    // that shows no consumption, or that was declined, describes a state the
    // exchange path cannot produce — so something else produced it, and the
    // safe reading of "something else" is no.
    for (const patch of [
      `SET "acceptedAt"=NULL, "consumedAt"=NULL`,
      `SET "acceptedAt"=NULL, "declinedAt"=now()`,
    ]) {
      const duo = await fastDuo();
      await pool.query(
        `UPDATE "CircleInvitation" ${patch} WHERE "activityId"=$1`,
        [duo.activityId],
      );
      expect(
        await codeOf(() =>
          service.confirmShare(
            duo.guest,
            duo.activityId,
            share("no debería entrar"),
            randomUUID(),
          ),
        ),
        patch,
      ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
      expect((await footprint(duo.activityId)).ready, patch).toBe(0);
    }
  }, 40_000);

  it("keeps a guest working past the invitation's own expiry", async () => {
    // Deliberate, and the one place this build does NOT re-derive an expiry:
    //
    //   INVITATION_EXPIRY_GOVERNS_EXCHANGE=true
    //   GUEST_SESSION_EXPIRY_GOVERNS_POST_EXCHANGE_COMMANDS=true
    //   INVITATION_EXPIRY_RECHECKED_AFTER_EXCHANGE=false
    //
    // The link's window governs whether it can still be exchanged; the
    // session lives longer on purpose, because a Dúo runs over days and the
    // link has already done its job. Enforcing invitation expiry per command
    // would cut somebody off mid-conversation, silently, behind a 404.
    const duo = await fastDuo();

    // The previous version of this test set `expiresAt = createdAt + 1s` and
    // then asserted the command works. That proves nothing: `createdAt` is
    // `now()` at fixture time, so the invitation may well still be LIVE when
    // the command runs, and the test would pass for a build that DID
    // re-check expiry. The precondition has to be established, not assumed.
    // `createdAt` moves back too: `CircleInvitation_expires_after_creation`
    // requires `expiresAt > createdAt`, and an invitation that expired
    // before it was created is not a state to test with — it is one the
    // database is right to refuse.
    await pool.query(
      `UPDATE "CircleInvitation"
          SET "createdAt" = now() - interval '20 days',
              "expiresAt" = now() - interval '1 second'
        WHERE "activityId"=$1`,
      [duo.activityId],
    );

    // Asserted from PostgreSQL, against the same clock the service reads, and
    // BEFORE the command runs.
    const pre = await pool.query(
      `SELECT
         (SELECT "expiresAt" < now() FROM "CircleInvitation"
           WHERE "activityId"=$1) AS invitation_expired,
         (SELECT "expiresAt" > now() FROM "CircleGuestSession"
           WHERE id=$2) AS session_live,
         (SELECT "revokedAt" IS NULL FROM "CircleGuestSession"
           WHERE id=$2) AS session_not_revoked,
         now() AS command_now`,
      [duo.activityId, duo.guestSessionId],
    );
    expect(pre.rows[0].invitation_expired, "invitation.expiresAt < now()").toBe(
      true,
    );
    expect(pre.rows[0].session_live, "guestSession.expiresAt > now()").toBe(
      true,
    );
    expect(
      pre.rows[0].session_not_revoked,
      "guestSession.revokedAt IS NULL",
    ).toBe(true);

    // Only now is the outcome meaningful: it succeeds BECAUSE the session is
    // live, not because the invitation happened to still be valid.
    const done = await service.confirmShare(
      duo.guest,
      duo.activityId,
      share("la conversación sigue"),
      randomUUID(),
    );
    expect(done.replayed).toBe(false);
    expect((await footprint(duo.activityId)).ready).toBe(1);

    // And the control on the other side: the session, not the invitation, is
    // what governs. Expire the SESSION and the same command is refused.
    const other = await fastDuo();
    await pool.query(
      `UPDATE "CircleGuestSession"
          SET "createdAt" = now() - interval '40 days',
              "expiresAt" = now() - interval '1 second'
        WHERE id=$1`,
      [other.guestSessionId],
    );
    expect(
      await codeOf(() =>
        service.confirmShare(
          other.guest,
          other.activityId,
          share("esta no debería entrar"),
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    expect((await footprint(other.activityId)).ready).toBe(0);
  }, 40_000);

  it("refuses a seat that belongs to another circle", async () => {
    // The composite foreign keys make this unrepresentable at the storage
    // layer, so the check can only be exercised by asking the resolver about
    // a seat from a different Dúo — which is the shape the guard could
    // conceivably be tricked into producing.
    const a = await fastDuo();
    const b = await fastDuo();
    expect(
      await codeOf(() =>
        service.confirmShare(
          {
            ...(a.guest as Extract<CircleActor, { kind: "GUEST" }>),
            participantId: b.guestSeatId,
          },
          a.activityId,
          share("de otro círculo"),
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    expect((await footprint(a.activityId)).ready).toBe(0);
    expect((await footprint(b.activityId)).ready).toBe(0);
  }, 30_000);

  // ══ The inviter's membership is checked in EVERY mode ═══════════════════

  /**
   * A Dúo that has been created but NOT accepted, with its raw token.
   *
   * `fastDuo` builds an already-exchanged pair, which is the wrong shape for
   * testing `inspect` and `exchange` — those need a live invitation nobody
   * has spent.
   */
  async function invitedDuo(): Promise<{
    circleId: string;
    activityId: string;
    token: string;
    guestSeatId: string;
  }> {
    const token = mintToken();
    const created = await service.createDuo({
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: randomUUID(),
    });
    const seats = await pool.query(
      `SELECT "id","memberId" FROM "CircleActivityParticipant"
        WHERE "activityId"=$1`,
      [created.activityId],
    );
    return {
      circleId: created.circleId,
      activityId: created.activityId,
      token,
      guestSeatId: seats.rows.find((r) => r.memberId === null)!.id,
    };
  }

  it.each(["on", "pilot"] as const)(
    "refuses inspect and exchange under `%s` when the inviter has LEFT",
    async (mode) => {
      // Under `on` this used to pass. `assertInviterEligible` and
      // `lockAndAssertInviter` both returned early — "no allowlist to
      // consult" was read as "nothing to check" — while PR3's participation
      // path revalidates the inviter in every mode. The system contradicted
      // itself where a person would feel it: the link inspects as usable,
      // the exchange commits everything, and the guest's first command is
      // refused with the Dúo already reported as started.
      const duo = await invitedDuo();
      await pool.query(
        `UPDATE "CircleMember" SET "status"='LEFT', "leftAt"=now()
          WHERE "circleId"=$1`,
        [duo.circleId],
      );
      const { participation: _p, accessService } = build(mode);

      expect(
        await codeOf(() => accessService.inspect(duo.token)),
        `${mode}: inspect`,
      ).toBe("CIRCLE_INVITATION_UNUSABLE");
      expect(
        await codeOf(() => accessService.exchange(duo.token)),
        `${mode}: exchange`,
      ).toBe("CIRCLE_INVITATION_UNUSABLE");

      const after = await pool.query(
        `SELECT
           (SELECT "consumedAt" IS NOT NULL FROM "CircleInvitation"
             WHERE "activityId"=$1) AS consumed,
           (SELECT "acceptedAt" IS NOT NULL FROM "CircleInvitation"
             WHERE "activityId"=$1) AS accepted,
           (SELECT count(*)::int FROM "CircleGuestSession"
             WHERE "activityId"=$1) AS sessions,
           (SELECT "status"::text FROM "CircleActivityParticipant"
             WHERE id=$2) AS seat,
           (SELECT "status"::text FROM "CircleActivity" WHERE id=$1) AS activity,
           (SELECT count(*)::int FROM "CircleEvent"
             WHERE "activityId"=$1
               AND "type" IN ('INVITATION_ACCEPTED','GUEST_SESSION_CREATED'))
             AS events`,
        [duo.activityId, duo.guestSeatId],
      );
      expect(after.rows[0], mode).toMatchObject({
        consumed: false, // INVITATION_CONSUMED=false
        accepted: false, // INVITATION_ACCEPTED=false
        sessions: 0, // GUEST_SESSIONS_CREATED=0
        seat: "INVITED", // SEAT_STATUS=INVITED
        activity: "INVITING", // ACTIVITY_STATUS=INVITING
        events: 0, // EVENTS_CREATED=0
      });
    },
    60_000,
  );

  it("serializes a member leaving against an exchange under `on`", async () => {
    // The authoritative check is `lockAndAssertInviter`, which takes
    // `CircleMember FOR UPDATE`. The departure commits while the exchange is
    // parked immediately before that lock, so the lock is the only thing
    // standing between "usable a moment ago" and the commit.
    const duo = await invitedDuo();

    class PausingMembers extends CircleMemberRepository {
      private armed = true;
      constructor(
        db: ConstructorParameters<typeof CircleMemberRepository>[0],
        private readonly hook: () => Promise<void>,
      ) {
        super(db);
      }
      override async lockById(
        id: string,
        tx: Parameters<CircleMemberRepository["lockById"]>[1],
      ) {
        if (this.armed) {
          this.armed = false;
          await this.hook();
        }
        return super.lockById(id, tx);
      }
    }

    const seam = new PausingMembers(prisma, async () => {
      await pool.query(
        `UPDATE "CircleMember" SET "status"='LEFT', "leftAt"=now()
          WHERE "circleId"=$1`,
        [duo.circleId],
      );
    });
    const { accessService } = build("on", { members: seam });

    expect(await codeOf(() => accessService.exchange(duo.token))).toBe(
      "CIRCLE_INVITATION_UNUSABLE",
    );
    const after = await pool.query(
      `SELECT
         (SELECT "consumedAt" IS NOT NULL FROM "CircleInvitation"
           WHERE "activityId"=$1) AS consumed,
         (SELECT count(*)::int FROM "CircleGuestSession"
           WHERE "activityId"=$1) AS sessions,
         (SELECT "status"::text FROM "CircleActivity" WHERE id=$1) AS activity`,
      [duo.activityId],
    );
    expect(after.rows[0]).toMatchObject({
      consumed: false,
      sessions: 0,
      activity: "INVITING",
    });
  }, 60_000);

  it("still exchanges under `on` while the inviter is ACTIVE", async () => {
    // The counterpart the two tests above need: the membership check must
    // refuse a LEFT inviter without refusing everybody.
    const duo = await invitedDuo();
    const { accessService } = build("on");
    const exchanged = await accessService.exchange(duo.token);
    expect(exchanged.guestSessionId).toBeTruthy();
    const after = await pool.query(
      `SELECT
         (SELECT "consumedAt" IS NOT NULL FROM "CircleInvitation"
           WHERE "activityId"=$1) AS consumed,
         (SELECT "status"::text FROM "CircleActivity" WHERE id=$1) AS activity`,
      [duo.activityId],
    );
    expect(after.rows[0]).toMatchObject({
      consumed: true,
      activity: "PREPARING",
    });
  }, 60_000);

  // ══ Idempotency is per-command, and compares the payload ═════════════════

  it("replays a Dúo creation only when template, version and token all match", async () => {
    const key = randomUUID();
    const token = mintToken();
    const first = await service.createDuo({
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: key,
    });

    // Same everything → the same aggregate, nothing new.
    const replay = await service.createDuo({
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: key,
    });
    expect(replay.circleId).toBe(first.circleId);
    expect(replay.activityId).toBe(first.activityId);
    expect(replay.replayed).toBe(true);

    // A different TEMPLATE under the same key used to replay happily and
    // return the first activity — so a caller who fixed a typo and retried
    // was told their correction had succeeded.
    //
    // Both cases below use PUBLISHED templates on purpose. An ARCHIVED key or
    // an unknown version is refused by the registry with
    // `CIRCLE_TEMPLATE_UNAVAILABLE` before the replay comparison is reached,
    // so a test written that way passes whether or not the comparison exists.
    // The exact code is asserted for the same reason.
    expect(
      await codeOf(() =>
        service.createDuo({
          userId: U1,
          templateKey: ALT_TEMPLATE.templateKey,
          templateVersion: ALT_TEMPLATE.templateVersion,
          invitationToken: token,
          idempotencyKey: key,
        }),
      ),
      "different template",
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // A different VERSION of the same template, also published.
    expect(
      await codeOf(() =>
        service.createDuo({
          userId: U1,
          templateKey: TEMPLATE_V2.templateKey,
          templateVersion: TEMPLATE_V2.templateVersion,
          invitationToken: token,
          idempotencyKey: key,
        }),
      ),
      "different version",
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // A different TOKEN.
    expect(
      await codeOf(() =>
        service.createDuo({
          userId: U1,
          templateKey: TEMPLATE.templateKey,
          templateVersion: TEMPLATE.templateVersion,
          invitationToken: mintToken(),
          idempotencyKey: key,
        }),
      ),
      "different token",
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // And exactly one circle exists for that key.
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "type"='CIRCLE_CREATED' AND "idempotencyKey"=$1`,
      [key],
    );
    expect(n.rows[0].n).toBe(1);
  }, 30_000);

  it("serializes two simultaneous creations under one key into one Dúo", async () => {
    const key = randomUUID();
    const token = mintToken();
    const call = () =>
      service.createDuo({
        userId: U1,
        templateKey: TEMPLATE.templateKey,
        templateVersion: TEMPLATE.templateVersion,
        invitationToken: token,
        idempotencyKey: key,
      });

    // Both start before either commits. Without the `User` row lock they both
    // find no receipt, both build a whole aggregate, and the loser dies on
    // the unique index at the very end — a storage error where the caller
    // should have received the same resource.
    const [a, b] = await Promise.all([call(), call()]);
    expect(a.circleId).toBe(b.circleId);
    expect(a.activityId).toBe(b.activityId);
    expect([a.replayed, b.replayed].filter(Boolean).length).toBe(1);

    const rows = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM "CircleEvent"
           WHERE "type"='CIRCLE_CREATED' AND "idempotencyKey"=$1) AS receipts,
         (SELECT count(*)::int FROM "Circle" WHERE id=$2) AS circles,
         (SELECT count(*)::int FROM "CircleActivityParticipant"
           WHERE "activityId"=$3) AS seats`,
      [key, a.circleId, a.activityId],
    );
    expect(rows.rows[0]).toMatchObject({ receipts: 1, circles: 1, seats: 2 });
  }, 30_000);

  it("refuses a share replay whose payload is not the one the key committed", async () => {
    const duo = await fastDuo();
    const key = randomUUID();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("lo que dije de verdad"),
      key,
    );

    // Same key, different answer. This used to return `replayed: true` while
    // the ORIGINAL snapshot stayed on the server — the caller believed it had
    // changed what it shares, and it had not.
    expect(
      await codeOf(() =>
        service.confirmShare(
          duo.organizer,
          duo.activityId,
          share("algo completamente distinto"),
          key,
        ),
      ),
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // A different MODE under the same key is a conflict too.
    expect(
      await codeOf(() =>
        service.confirmShare(
          duo.organizer,
          duo.activityId,
          { mode: "KEEP_PRIVATE" },
          key,
        ),
      ),
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // The exact same payload still replays.
    const again = await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("lo que dije de verdad"),
      key,
    );
    expect(again.replayed).toBe(true);

    // And the stored snapshot is still the first one.
    const { ctx } = await service.readActivity(duo.organizer, duo.activityId);
    expect(
      service.openEnvelope(ctx.self, ctx.activity, ctx.definition),
    ).toContain("lo que dije de verdad");
  }, 30_000);

  it("replays an artifact proposal without creating a new version", async () => {
    const duo = await revealedDuo();
    const key = randomUUID();
    const first = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "el acuerdo",
      key,
    );
    const replay = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "el acuerdo",
      key,
    );
    expect(replay).toEqual(first);

    const rows = await pool.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE "status"='SUPERSEDED')::int AS superseded
         FROM "CircleArtifact" WHERE "activityId"=$1`,
      [duo.activityId],
    );
    expect(rows.rows[0].n, "no second row").toBe(1);
    expect(rows.rows[0].superseded, "the live version was not disturbed").toBe(
      0,
    );
  }, 30_000);

  it("refuses an artifact proposal whose key committed different text", async () => {
    const duo = await revealedDuo();
    const key = randomUUID();
    await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "texto A",
      key,
    );
    expect(
      await codeOf(() =>
        service.proposeArtifact(duo.organizer, duo.activityId, "texto B", key),
      ),
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");
    // Nothing was superseded on the way to the refusal.
    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleArtifact" WHERE "activityId"=$1`,
      [duo.activityId],
    );
    expect(rows.rows[0].n).toBe(1);
  }, 30_000);

  it("binds an artifact confirmation key to the exact artifact and version", async () => {
    const duo = await revealedDuo();
    const v1 = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "primera versión",
      randomUUID(),
    );
    const key = randomUUID();
    await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      v1.artifactId,
      v1.version,
      key,
    );

    // Editing produces a new artifact; the old key must not confirm it.
    const v2 = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "segunda versión",
      randomUUID(),
    );
    expect(v2.artifactId).not.toBe(v1.artifactId);
    expect(
      await codeOf(() =>
        service.confirmArtifact(
          duo.organizer,
          duo.activityId,
          v2.artifactId,
          v2.version,
          key,
        ),
      ),
      "same key, other artifact",
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // Same key, right artifact, wrong version.
    expect(
      await codeOf(() =>
        service.confirmArtifact(
          duo.organizer,
          duo.activityId,
          v1.artifactId,
          v1.version + 1,
          key,
        ),
      ),
      "same key, other version",
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // And the original replay still works.
    const replay = await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      v1.artifactId,
      v1.version,
      key,
    );
    expect(replay.replayed).toBe(true);
  }, 30_000);

  it("refuses a follow-up replay that carries a different decision", async () => {
    const duo = await revealedDuo();
    await pool.query(
      `UPDATE "CircleActivity" SET "followUpDueAt"=now() - interval '1 hour'
        WHERE id=$1`,
      [duo.activityId],
    );
    const key = randomUUID();
    await service.recordFollowUp(duo.organizer, duo.activityId, "KEEP", key);

    expect(
      await codeOf(() =>
        service.recordFollowUp(duo.organizer, duo.activityId, "CLOSE", key),
      ),
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    const same = await service.recordFollowUp(
      duo.organizer,
      duo.activityId,
      "KEEP",
      key,
    );
    expect(same.replayed).toBe(true);

    const stored = await pool.query(
      `SELECT "followUpDecision"::text AS d FROM "CircleActivityParticipant"
        WHERE id=$1`,
      [duo.organizerSeatId],
    );
    expect(stored.rows[0].d, "the first decision stands").toBe("KEEP");
  }, 30_000);

  it("does not classify an unrelated unique violation as a replay", async () => {
    // The artifact-confirmation index enforces "one confirmation per seat per
    // artifact" and has nothing to do with idempotency. Treating every P2002
    // as a replay turned a genuinely refused second confirmation — under a
    // DIFFERENT key, so a different command — into a silent success.
    const duo = await revealedDuo();
    const proposal = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "para confirmar",
      randomUUID(),
    );
    const events = new CircleEventRepository(prisma);
    const shape = {
      circleId: duo.circleId,
      activityId: duo.activityId,
      type: "ARTIFACT_CONFIRMED" as const,
      artifactId: proposal.artifactId,
      actorParticipantId: duo.organizerSeatId,
    };
    const first = await events.append({
      ...shape,
      idempotencyKey: randomUUID(),
    });
    expect(first.outcome).toBe("APPENDED");

    // Same seat, same artifact, DIFFERENT key: the confirmation index fires,
    // and the honest answer is a failure, not "REPLAY".
    await expect(
      events.append({ ...shape, idempotencyKey: randomUUID() }),
    ).rejects.toThrow();

    // Whereas the same key genuinely is a replay.
    const key = randomUUID();
    const other = await revealedDuo();
    const otherProposal = await service.proposeArtifact(
      other.organizer,
      other.activityId,
      "otro",
      randomUUID(),
    );
    const shapeB = {
      circleId: other.circleId,
      activityId: other.activityId,
      type: "ARTIFACT_CONFIRMED" as const,
      artifactId: otherProposal.artifactId,
      actorParticipantId: other.organizerSeatId,
      idempotencyKey: key,
    };
    expect((await events.append(shapeB)).outcome).toBe("APPENDED");
    expect((await events.append(shapeB)).outcome).toBe("REPLAY");
  }, 60_000);

  it("refuses a second confirmation of the same artifact under a new key", async () => {
    // The hole this closes was an accounting one. Confirming A with K1 and
    // then again with K2 returned `{ replayed: true }` — a SUCCESS — while
    // skipping the append, so K2 was never recorded anywhere. The caller
    // could reasonably believe K2 now stood for "I confirmed A"; nothing
    // did, and the same K2 was still free to be spent on artifact B.
    const duo = await revealedDuo();
    const a = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "artefacto A",
      randomUUID(),
    );
    const k1 = randomUUID();
    const k2 = randomUUID();

    // 1 — confirm A with K1.
    const first = await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      a.artifactId,
      a.version,
      k1,
    );
    expect(first.replayed).toBe(false);

    const eventsAfterK1 = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "activityId"=$1 AND "type"='ARTIFACT_CONFIRMED'`,
      [duo.activityId],
    );
    expect(eventsAfterK1.rows[0].n).toBe(1);

    // 2/3 — the same act under K2 is NOT a success and NOT a replay.
    expect(
      await codeOf(() =>
        service.confirmArtifact(
          duo.organizer,
          duo.activityId,
          a.artifactId,
          a.version,
          k2,
        ),
      ),
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // 4 — and no second event was written.
    const eventsAfterK2 = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "activityId"=$1 AND "type"='ARTIFACT_CONFIRMED'`,
      [duo.activityId],
    );
    expect(eventsAfterK2.rows[0].n, "no second confirmation event").toBe(1);

    // 5 — K1 is bound to A. Pointed at B it conflicts.
    const b = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "artefacto B",
      randomUUID(),
    );
    expect(b.artifactId).not.toBe(a.artifactId);
    expect(
      await codeOf(() =>
        service.confirmArtifact(
          duo.organizer,
          duo.activityId,
          b.artifactId,
          b.version,
          k1,
        ),
      ),
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // 6 — nothing the refusals touched actually moved.
    const state = await pool.query(
      `SELECT id, "version", "status"::text AS status FROM "CircleArtifact"
        WHERE "activityId"=$1 ORDER BY "version"`,
      [duo.activityId],
    );
    expect(state.rows).toEqual([
      { id: a.artifactId, version: a.version, status: "SUPERSEDED" },
      { id: b.artifactId, version: b.version, status: "PROPOSED" },
    ]);
    const finalEvents = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "activityId"=$1 AND "type"='ARTIFACT_CONFIRMED'`,
      [duo.activityId],
    );
    expect(finalEvents.rows[0].n).toBe(1);

    // And K1's original replay still resolves, unchanged.
    const replay = await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      a.artifactId,
      a.version,
      k1,
    );
    expect(replay.replayed).toBe(true);
  }, 60_000);

  it("replays a creation whose template was archived afterwards", async () => {
    // Idempotency was expiring with the catalogue. `getPublished` ran before
    // the receipt was consulted, so a request that had ALREADY created a Dúo
    // stopped being reproducible the moment editorial archived that version
    // — the caller retried a timeout and got `CIRCLE_TEMPLATE_UNAVAILABLE`
    // for a resource that exists. A replay instantiates nothing, so it does
    // not need the template to be instantiable; the committed activity
    // carries the pin that decides replay from conflict.
    const key = randomUUID();
    const token = mintToken();
    const req = {
      userId: U1,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      invitationToken: token,
      idempotencyKey: key,
    };
    const first = await service.createDuo(req);
    expect(first.replayed).toBe(false);

    // Archive that exact version by swapping the injected registry.
    const archivedNow: CircleActivityDefinition = {
      ...TEMPLATE,
      status: "ARCHIVED",
    };
    const registryWithArchived = new CircleTemplateRegistry([
      archivedNow,
      DRAFT_TEMPLATE,
      ARCHIVED_TEMPLATE,
      NO_OUTCOME_TEMPLATE,
      ALT_TEMPLATE,
      TEMPLATE_V2,
    ]);
    const archivedBuild = build("on", { registry: registryWithArchived });
    const svc = archivedBuild.participation;

    // Exact replay → the original aggregate, template state notwithstanding.
    const replay = await svc.createDuo(req);
    expect(replay.replayed).toBe(true);
    expect(replay.circleId).toBe(first.circleId);
    expect(replay.activityId).toBe(first.activityId);

    // Same key, different request → the CONFLICT must be the observed cause,
    // so the other request names a template that is PUBLISHED in this
    // registry. Using an invalid template here would let
    // `CIRCLE_TEMPLATE_UNAVAILABLE` masquerade as the answer.
    expect(
      await codeOf(() =>
        svc.createDuo({
          ...req,
          templateKey: ALT_TEMPLATE.templateKey,
          templateVersion: ALT_TEMPLATE.templateVersion,
        }),
      ),
      "same key, other published template",
    ).toBe("CIRCLE_IDEMPOTENCY_CONFLICT");

    // A NEW key on the archived template is a real creation, and refused.
    expect(
      await codeOf(() =>
        svc.createDuo({
          ...req,
          invitationToken: mintToken(),
          idempotencyKey: randomUUID(),
        }),
      ),
      "new key, archived template",
    ).toBe("CIRCLE_TEMPLATE_UNAVAILABLE");

    // Exactly one aggregate, one receipt, and nothing extra.
    const rows = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM "CircleEvent"
           WHERE "type"='CIRCLE_CREATED' AND "idempotencyKey"=$1) AS receipts,
         (SELECT count(*)::int FROM "CircleActivity" WHERE "circleId"=$2) AS activities,
         (SELECT count(*)::int FROM "CircleActivityParticipant"
           WHERE "activityId"=$3) AS seats,
         (SELECT count(*)::int FROM "CircleInvitation"
           WHERE "activityId"=$3) AS invitations`,
      [key, first.circleId, first.activityId],
    );
    expect(rows.rows[0]).toMatchObject({
      receipts: 1,
      activities: 1,
      seats: 2,
      invitations: 1,
    });
  }, 60_000);

  // ══ Stages, outcomes and the exact-seat barrier ══════════════════════════

  it("refuses an artifact confirmation once the activity is closed", async () => {
    const duo = await revealedDuo();
    const proposal = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "algo acordado",
      randomUUID(),
    );
    await pool.query(
      `UPDATE "CircleActivity" SET "status"='CLOSED', "closedAt"=now() WHERE id=$1`,
      [duo.activityId],
    );
    expect(
      await codeOf(() =>
        service.confirmArtifact(
          duo.organizer,
          duo.activityId,
          proposal.artifactId,
          proposal.version,
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "activityId"=$1 AND "type"='ARTIFACT_CONFIRMED'`,
      [duo.activityId],
    );
    expect(n.rows[0].n).toBe(0);
  }, 30_000);

  it("refuses an artifact when the template's outcome is NONE", async () => {
    // Pinned to the no-outcome template from birth. The pin is immutable —
    // `circle_activity_pin_is_immutable()` refuses an UPDATE — which is the
    // right behaviour and means the fixture has to be built this way.
    const duo = await fastDuo(NO_OUTCOME_TEMPLATE.templateKey);
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("uno"),
      randomUUID(),
    );
    await service.confirmShare(
      duo.guest,
      duo.activityId,
      share("dos"),
      randomUUID(),
    );
    expect(
      await codeOf(() =>
        service.proposeArtifact(
          duo.organizer,
          duo.activityId,
          "un acuerdo que nadie pidió",
          randomUUID(),
        ),
      ),
    ).toBe("CIRCLE_ACTIVITY_UNAVAILABLE");
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleArtifact" WHERE "activityId"=$1`,
      [duo.activityId],
    );
    expect(n.rows[0].n, "no AGREEMENT was invented").toBe(0);
  }, 30_000);

  it("refuses to reveal two-of-three, even with two READY seats", async () => {
    const duo = await fastDuo();
    // An anomalous third row. It should be impossible; the barrier is the
    // statement that decides whether two people's private answers become
    // visible, so it does not rely on that.
    // Two constraints shape what an anomalous third seat can even look like:
    // `_exactly_one_identity` demands exactly one of member/invitation, and
    // `_one_per_invitation` forbids reusing the guest's. So it gets a member
    // of its own. It is still a third seat on a two-seat activity, which is
    // the only property this test is about.
    const extraMember = `xm-${duo.activityId}`;
    await pool.query(
      `INSERT INTO "CircleMember" ("id","circleId","userId","role","status")
       VALUES ($1,$2,$3,'MEMBER','ACTIVE')`,
      [extraMember, duo.circleId, U2],
    );
    await pool.query(
      `INSERT INTO "CircleActivityParticipant"
         ("id","circleId","activityId","memberId","status","updatedAt")
       VALUES ($1,$2,$3,$4,'ACCEPTED',now())`,
      [`extra-${duo.activityId}`, duo.circleId, duo.activityId, extraMember],
    );

    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("uno"),
      randomUUID(),
    );
    const second = await service.confirmShare(
      duo.guest,
      duo.activityId,
      share("dos"),
      randomUUID(),
    );
    expect(second.revealed, "two of three is not all of them").toBe(false);

    const row = await pool.query(
      `SELECT "status"::text AS s, "revealedAt" FROM "CircleActivity" WHERE id=$1`,
      [duo.activityId],
    );
    expect(row.rows[0].s).toBe("PREPARING");
    expect(row.rows[0].revealedAt).toBeNull();
    const events = await pool.query(
      `SELECT count(*)::int AS n FROM "CircleEvent"
        WHERE "activityId"=$1 AND "type"='ACTIVITY_REVEALED'`,
      [duo.activityId],
    );
    expect(events.rows[0].n).toBe(0);
  }, 30_000);

  // ══ The stored MAC is load-bearing ═══════════════════════════════════════

  it("refuses to open a snapshot whose payload hash was tampered with", async () => {
    const duo = await fastDuo();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("algo que sí escribí"),
      randomUUID(),
    );
    const before = await service.readActivity(duo.organizer, duo.activityId);
    expect(
      service.openEnvelope(
        before.ctx.self,
        before.ctx.activity,
        before.ctx.definition,
      ),
    ).toContain("algo que sí escribí");

    await pool.query(
      `UPDATE "CircleActivityParticipant" SET "payloadHash"=$2 WHERE id=$1`,
      [duo.organizerSeatId, "0".repeat(64)],
    );
    const after = await service.readActivity(duo.organizer, duo.activityId);
    expect(
      service.openEnvelope(
        after.ctx.self,
        after.ctx.activity,
        after.ctx.definition,
      ),
      "an altered hash is a refusal, not a shrug",
    ).toBeNull();
  }, 30_000);

  it("persists and verifies the artifact's own payload hash", async () => {
    const duo = await revealedDuo();
    const proposal = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "el resultado que ambos firman",
      randomUUID(),
    );
    const stored = await pool.query(
      `SELECT "payloadHash" AS h FROM "CircleArtifact" WHERE id=$1`,
      [proposal.artifactId],
    );
    expect(stored.rows[0].h, "a real HMAC, not an empty string").toMatch(
      /^[0-9a-f]{64}$/,
    );

    const { ctx, artifact } = await service.readActivity(
      duo.organizer,
      duo.activityId,
    );
    expect(service.openArtifact(artifact!, ctx.activity)).toBe(
      "el resultado que ambos firman",
    );

    await pool.query(
      `UPDATE "CircleArtifact" SET "payloadHash"=$2 WHERE id=$1`,
      [proposal.artifactId, "a".repeat(64)],
    );
    const tampered = await service.readActivity(duo.organizer, duo.activityId);
    expect(
      service.openArtifact(tampered.artifact!, tampered.ctx.activity),
    ).toBeNull();
  }, 30_000);

  it("refuses a decrypted payload carrying a field key the template never declared", async () => {
    const duo = await fastDuo();
    await service.confirmShare(
      duo.organizer,
      duo.activityId,
      share("legítimo"),
      randomUUID(),
    );
    // Re-seal a body the cipher will happily authenticate — same key, same
    // AAD, same everything — but whose field key the pinned template does not
    // declare. Authentic, and not a valid answer to any question that was
    // asked.
    const forged = JSON.stringify({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-inventado", value: "inyectado" }],
    });
    const context = {
      circleId: duo.circleId,
      activityId: duo.activityId,
      participantId: duo.organizerSeatId,
      templateKey: TEMPLATE.templateKey,
      templateVersion: TEMPLATE.templateVersion,
      sharingMode: "SELECTED_FIELDS",
      fieldKeys: ["campo-inventado"],
    };
    const envelope = cipher.seal(forged, context);
    await pool.query(
      `UPDATE "CircleActivityParticipant"
          SET "ciphertext"=$2,"nonce"=$3,"payloadHash"=$4,"fieldKeys"=$5
        WHERE id=$1`,
      [
        duo.organizerSeatId,
        envelope.ciphertext,
        envelope.nonce,
        envelope.payloadHash,
        ["campo-inventado"],
      ],
    );

    const { ctx } = await service.readActivity(duo.organizer, duo.activityId);
    expect(
      service.openEnvelope(ctx.self, ctx.activity, ctx.definition),
      "it decrypts, and it is still refused",
    ).toBeNull();
  }, 30_000);
});
