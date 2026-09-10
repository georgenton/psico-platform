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

  const build = (mode = "on") => {
    const invitations = new CircleInvitationRepository(prisma);
    const guestSessions = new CircleGuestSessionRepository(prisma);
    const events = new CircleEventRepository(prisma);
    const members = new CircleMemberRepository(prisma);
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
        cipher,
        registry,
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
  async function fastDuo(): Promise<Duo> {
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
      [id.activity, id.circle, TEMPLATE.templateKey],
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
    );
    expect(counterpartBody).toContain("lo del invitado");
    const own = service.openEnvelope(ctx.self, ctx.activity);
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
    const body = service.openEnvelope(ctx.counterpart!, ctx.activity);
    expect(body).toBe(JSON.stringify({ mode: "KEEP_PRIVATE" }));
    const row = await pool.query(
      `SELECT "fieldKeys","sharingMode"::text AS m FROM "CircleActivityParticipant" WHERE id=$1`,
      [duo.guestSeatId],
    );
    expect(row.rows[0]).toMatchObject({ fieldKeys: [], m: "KEEP_PRIVATE" });
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

  it("counts one confirmation per seat per artifact, however many times it is sent", async () => {
    const duo = await revealedDuo();
    const proposal = await service.proposeArtifact(
      duo.organizer,
      duo.activityId,
      "una vez",
      randomUUID(),
    );
    await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      proposal.artifactId,
      proposal.version,
      randomUUID(),
    );
    const replay = await service.confirmArtifact(
      duo.organizer,
      duo.activityId,
      proposal.artifactId,
      proposal.version,
      randomUUID(),
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
});
