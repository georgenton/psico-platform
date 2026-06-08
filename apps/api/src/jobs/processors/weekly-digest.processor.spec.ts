import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyDigestProcessor } from "./weekly-digest.processor";
import { JobName } from "../queue-names";
import type { Job } from "bullmq";

function buildPrisma(
  users: unknown[] = [],
  extraOverrides: Record<string, unknown> = {},
) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(users) },
    diaryEntry: { findMany: vi.fn().mockResolvedValue([]) },
    ecoMessage: { count: vi.fn().mockResolvedValue(0) },
    deviceToken: { deleteMany: vi.fn() },
    // Sprint S45: WeeklySummary lookup. Default null so existing tests
    // exercise the "no narrative" branch; tests opt in by overriding.
    weeklySummary: { findUnique: vi.fn().mockResolvedValue(null) },
    ...extraOverrides,
  } as never;
}

function buildResend() {
  return { send: vi.fn().mockResolvedValue(undefined) } as never;
}

function buildPush(
  receipts: Array<{ status: "ok" | "error"; invalidToken?: string }> = [],
) {
  return {
    sendToTokens: vi.fn().mockResolvedValue(receipts),
  } as never;
}

/**
 * Sprint S53 — Tests pin `nowIso` to Monday 07:00 UTC so the per-user
 * TZ gate fires for users whose `profile.timezone` is null (the gate
 * falls back to UTC for those, and Monday 07:00 UTC matches the digest
 * target). Tests that exercise the gate itself override this.
 */
const LEGACY_MONDAY_07_UTC = "2026-06-08T07:00:00Z";

function jobOf<T extends Record<string, unknown>>(
  data: T,
  opts: { defaultNow?: boolean } = { defaultNow: true },
): Job<T> {
  const merged =
    opts.defaultNow && data.nowIso === undefined
      ? ({ ...data, nowIso: LEGACY_MONDAY_07_UTC } as T)
      : data;
  return { name: JobName.RUN_WEEKLY_DIGEST, data: merged } as Job<T>;
}

describe("WeeklyDigestProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown job names — defensive against queue misconfiguration", async () => {
    const proc = new WeeklyDigestProcessor(
      buildPrisma(),
      buildResend(),
      buildPush(),
    );
    await expect(
      proc.process({ name: "wrong-name", data: {} } as never),
    ).rejects.toThrow(/unknown job/);
  });

  it("sends email + push to a user opted-in to both, with stats from last week", async () => {
    const userRow = {
      id: "u-1",
      email: "u1@test.com",
      firstName: "Carla",
      name: "Carla Pérez",
      notificationSettings: { dailyReminder: true },
      deviceTokens: [{ token: "ExponentPushToken[abc]" }],
    };
    const entries = [
      { mood: "calma", tags: ["familia", "trabajo"] },
      { mood: "ansiedad", tags: ["trabajo"] },
      { mood: "calma", tags: [] },
    ];
    const prisma = buildPrisma([userRow], {
      diaryEntry: { findMany: vi.fn().mockResolvedValue(entries) },
      ecoMessage: { count: vi.fn().mockResolvedValue(7) },
      deviceToken: { deleteMany: vi.fn() },
    });
    const resend = buildResend();
    const push = buildPush([{ status: "ok" }]);
    const proc = new WeeklyDigestProcessor(prisma, resend, push);

    await proc.process(jobOf({}));

    expect(resend.send).toHaveBeenCalledTimes(1);
    const emailArg = (resend.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(emailArg.to).toBe("u1@test.com");
    expect(emailArg.text).toContain("3 entradas");
    expect(emailArg.text).toContain("7 mensajes");
    // Dominant mood is "calma" (2 vs 1).
    expect(emailArg.text).toContain("calma");

    expect(push.sendToTokens).toHaveBeenCalledTimes(1);
    const [tokens] = (push.sendToTokens as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(tokens).toEqual(["ExponentPushToken[abc]"]);
  });

  it("skips push when user has no device tokens (email only)", async () => {
    const prisma = buildPrisma([
      {
        id: "u-1",
        email: "u1@test.com",
        firstName: "X",
        name: "X",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
      },
    ]);
    const resend = buildResend();
    const push = buildPush();
    const proc = new WeeklyDigestProcessor(prisma, resend, push);

    await proc.process(jobOf({}));

    expect(resend.send).toHaveBeenCalledOnce();
    expect(push.sendToTokens).not.toHaveBeenCalled();
  });

  it("skips push when dailyReminder is false (email only — weeklyReport stays opt-in)", async () => {
    const prisma = buildPrisma([
      {
        id: "u-1",
        email: "u1@test.com",
        firstName: "X",
        name: "X",
        notificationSettings: { dailyReminder: false },
        deviceTokens: [{ token: "ExponentPushToken[x]" }],
      },
    ]);
    const resend = buildResend();
    const push = buildPush();
    const proc = new WeeklyDigestProcessor(prisma, resend, push);

    await proc.process(jobOf({}));

    expect(resend.send).toHaveBeenCalledOnce();
    expect(push.sendToTokens).not.toHaveBeenCalled();
  });

  it("prunes stale Expo tokens flagged DeviceNotRegistered", async () => {
    const deleteMany = vi.fn();
    const prisma = buildPrisma(
      [
        {
          id: "u-1",
          email: "u1@test.com",
          firstName: "X",
          name: "X",
          notificationSettings: { dailyReminder: true },
          deviceTokens: [
            { token: "ExponentPushToken[good]" },
            { token: "ExponentPushToken[stale]" },
          ],
        },
      ],
      {
        deviceToken: { deleteMany },
      },
    );
    const push = buildPush([
      { status: "ok" },
      { status: "error", invalidToken: "ExponentPushToken[stale]" },
    ]);
    const proc = new WeeklyDigestProcessor(prisma, buildResend(), push);

    await proc.process(jobOf({}));

    expect(deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ["ExponentPushToken[stale]"] } },
    });
  });

  it("uses 'no activity' copy when the user wrote nothing last week", async () => {
    const prisma = buildPrisma(
      [
        {
          id: "u-1",
          email: "u1@test.com",
          firstName: "X",
          name: "X",
          notificationSettings: { dailyReminder: true },
          deviceTokens: [],
        },
      ],
      {
        diaryEntry: { findMany: vi.fn().mockResolvedValue([]) },
        ecoMessage: { count: vi.fn().mockResolvedValue(0) },
      },
    );
    const resend = buildResend();
    const proc = new WeeklyDigestProcessor(prisma, resend, buildPush());

    await proc.process(jobOf({}));

    const emailArg = (resend.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      subject: string;
      text: string;
    };
    expect(emailArg.subject).toContain("Tu espacio");
    expect(emailArg.text).toContain("no escribiste");
  });

  it("includes the WeeklySummary LLM narrative when one exists for the week (S45)", async () => {
    const userRow = {
      id: "u-1",
      email: "u1@test.com",
      firstName: "X",
      name: "X",
      notificationSettings: { dailyReminder: true },
      deviceTokens: [],
    };
    const findUnique = vi.fn().mockResolvedValue({
      headline: "Una semana con foco en familia",
      narrative: "Notamos que la familia volvió varias veces…",
    });
    const prisma = buildPrisma([userRow], {
      diaryEntry: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ mood: "calma", tags: ["familia"] }]),
      },
      ecoMessage: { count: vi.fn().mockResolvedValue(2) },
      weeklySummary: { findUnique },
    });
    const resend = buildResend();
    const proc = new WeeklyDigestProcessor(prisma, resend, buildPush());

    await proc.process(jobOf({}));

    // The findUnique was scoped to (userId, weekStart).
    expect(findUnique).toHaveBeenCalledOnce();
    const arg = findUnique.mock.calls[0]![0] as {
      where: { userId_weekStart: { userId: string; weekStart: Date } };
    };
    expect(arg.where.userId_weekStart.userId).toBe("u-1");
    expect(arg.where.userId_weekStart.weekStart).toBeInstanceOf(Date);

    const emailArg = (resend.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { html: string; text: string };
    expect(emailArg.html).toContain("Una semana con foco en familia");
    expect(emailArg.html).toContain("Notamos que la familia volvió");
    expect(emailArg.text).toContain("Una semana con foco en familia");
  });

  it("does not abort the run if one user's send fails", async () => {
    const users = [
      {
        id: "u-1",
        email: "u1@test.com",
        firstName: "A",
        name: "A",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
      },
      {
        id: "u-2",
        email: "u2@test.com",
        firstName: "B",
        name: "B",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
      },
    ];
    const prisma = buildPrisma(users);
    const resend = {
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error("u1 failed"))
        .mockResolvedValueOnce(undefined),
    } as never;
    const proc = new WeeklyDigestProcessor(prisma, resend, buildPush());

    await expect(proc.process(jobOf({}))).resolves.toBeUndefined();
    expect(
      (resend as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledTimes(2);
  });

  // ─── Sprint S53 — timezone-aware fan-out ──────────────────────────────────

  describe("timezone gate (Sprint S53)", () => {
    it("sends to a Guayaquil user when UTC is Monday 12:00 (local 07:00)", async () => {
      const userRow = {
        id: "u-ecu",
        email: "ecu@test.com",
        firstName: "Inés",
        name: "Inés Q.",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
        profile: { timezone: "America/Guayaquil" },
      };
      const prisma = buildPrisma([userRow]);
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(prisma, resend, buildPush());

      // Monday 12:00 UTC === Monday 07:00 Guayaquil
      await proc.process(
        jobOf({ nowIso: "2026-06-08T12:00:00Z" }, { defaultNow: false }),
      );
      expect(
        (resend as { send: ReturnType<typeof vi.fn> }).send,
      ).toHaveBeenCalledTimes(1);
    });

    it("SKIPS a Guayaquil user when UTC is Monday 07:00 (local 02:00 Sunday — wrong hour AND day)", async () => {
      const userRow = {
        id: "u-ecu",
        email: "ecu@test.com",
        firstName: "Inés",
        name: "Inés Q.",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
        profile: { timezone: "America/Guayaquil" },
      };
      const prisma = buildPrisma([userRow]);
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(prisma, resend, buildPush());

      await proc.process(
        jobOf({ nowIso: "2026-06-08T07:00:00Z" }, { defaultNow: false }),
      );
      expect(
        (resend as { send: ReturnType<typeof vi.fn> }).send,
      ).not.toHaveBeenCalled();
    });

    it("sends to a Tokyo user when UTC is Sunday 22:00 (local Monday 07:00) — day rollover", async () => {
      const userRow = {
        id: "u-jpn",
        email: "jpn@test.com",
        firstName: "Yui",
        name: "Yui K.",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
        profile: { timezone: "Asia/Tokyo" },
      };
      const prisma = buildPrisma([userRow]);
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(prisma, resend, buildPush());

      await proc.process(
        jobOf({ nowIso: "2026-06-07T22:00:00Z" }, { defaultNow: false }),
      );
      expect(
        (resend as { send: ReturnType<typeof vi.fn> }).send,
      ).toHaveBeenCalledTimes(1);
    });

    it("legacy users without `profile.timezone` fall back to UTC — get sent at Monday 07:00 UTC", async () => {
      const userRow = {
        id: "u-legacy",
        email: "legacy@test.com",
        firstName: "Sam",
        name: "Sam Legacy",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
        profile: null,
      };
      const prisma = buildPrisma([userRow]);
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(prisma, resend, buildPush());

      await proc.process(
        jobOf({ nowIso: "2026-06-08T07:00:00Z" }, { defaultNow: false }),
      );
      expect(
        (resend as { send: ReturnType<typeof vi.fn> }).send,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
