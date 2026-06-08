import { beforeEach, describe, expect, it, vi } from "vitest";
import { InactiveNudgeProcessor } from "./inactive-nudge.processor";
import { JobName } from "../queue-names";
import type { Job } from "bullmq";

function buildPrisma(
  candidates: unknown[] = [],
  extra: Record<string, unknown> = {},
) {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue(candidates),
      update: vi.fn().mockResolvedValue({}),
    },
    deviceToken: { deleteMany: vi.fn() },
    ...extra,
  } as never;
}

function buildPush(
  receipts: Array<{ status: "ok" | "error"; invalidToken?: string }> = [],
) {
  return {
    sendToTokens: vi.fn().mockResolvedValue(receipts),
  } as never;
}

/**
 * Sprint S53 — Pin `nowIso` to 18:00 UTC so the per-user TZ gate fires
 * for users with `profile.timezone === null` (the gate falls back to
 * UTC, and 18:00 UTC matches the nudge target). Tests of the gate
 * itself override this.
 */
const LEGACY_18_UTC = "2026-06-08T18:00:00Z";

function jobOf<T extends Record<string, unknown>>(
  data: T,
  opts: { defaultNow?: boolean } = { defaultNow: true },
): Job<T> {
  const merged =
    opts.defaultNow && data.nowIso === undefined
      ? ({ ...data, nowIso: LEGACY_18_UTC } as T)
      : data;
  return { name: JobName.SEND_INACTIVE_NUDGE, data: merged } as Job<T>;
}

describe("InactiveNudgeProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown job names", async () => {
    const proc = new InactiveNudgeProcessor(buildPrisma(), buildPush());
    await expect(
      proc.process({ name: "wrong-name", data: {} } as never),
    ).rejects.toThrow(/unknown job/);
  });

  it("queries with the correct silence + nudge cutoffs", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = buildPrisma([], {
      user: { findMany, update: vi.fn() },
    });
    const proc = new InactiveNudgeProcessor(prisma, buildPush());

    await proc.process(jobOf({}));

    expect(findMany).toHaveBeenCalledOnce();
    const where = (
      findMany.mock.calls[0]![0] as { where: Record<string, unknown> }
    ).where;
    expect(where.notificationSettings).toEqual({ is: { dailyReminder: true } });
    expect(where.diaryEntries).toEqual({ some: {} });
    // The NOT-some clause expresses "no entries in the last SILENCE_DAYS days"
    expect(where.NOT).toEqual({
      diaryEntries: {
        some: { createdAt: expect.objectContaining({ gte: expect.any(Date) }) },
      },
    });
    // OR ensures we don't spam recently-nudged users.
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { lastNudgedAt: null },
        { lastNudgedAt: { lt: expect.any(Date) } },
      ]),
    );
  });

  it("skips users with no device tokens (can't reach them)", async () => {
    const prisma = buildPrisma([
      { id: "u-1", firstName: "X", deviceTokens: [] },
    ]);
    const push = buildPush();
    const proc = new InactiveNudgeProcessor(prisma, push);

    await proc.process(jobOf({}));

    expect(push.sendToTokens).not.toHaveBeenCalled();
  });

  it("sends push + bumps lastNudgedAt when any receipt is ok", async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = buildPrisma(
      [
        {
          id: "u-1",
          firstName: "Carla",
          deviceTokens: [{ token: "ExponentPushToken[a]" }],
        },
      ],
      {
        user: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "u-1",
              firstName: "Carla",
              deviceTokens: [{ token: "ExponentPushToken[a]" }],
            },
          ]),
          update,
        },
      },
    );
    const push = buildPush([{ status: "ok" }]);
    const proc = new InactiveNudgeProcessor(prisma, push);

    await proc.process(jobOf({}));

    expect(push.sendToTokens).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { lastNudgedAt: expect.any(Date) },
    });
  });

  it("does NOT bump lastNudgedAt if all receipts are stale (lets next nightly retry)", async () => {
    const update = vi.fn();
    const deleteMany = vi.fn();
    const prisma = buildPrisma([], {
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "u-1",
            firstName: "X",
            deviceTokens: [{ token: "ExponentPushToken[stale]" }],
          },
        ]),
        update,
      },
      deviceToken: { deleteMany },
    });
    const push = buildPush([
      {
        status: "error",
        invalidToken: "ExponentPushToken[stale]",
      },
    ]);
    const proc = new InactiveNudgeProcessor(prisma, push);

    await proc.process(jobOf({}));

    expect(deleteMany).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("dryRun mode logs but does not push or update", async () => {
    const update = vi.fn();
    const prisma = buildPrisma([], {
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "u-1",
            firstName: "X",
            deviceTokens: [{ token: "ExponentPushToken[x]" }],
          },
        ]),
        update,
      },
    });
    const push = buildPush();
    const proc = new InactiveNudgeProcessor(prisma, push);

    await proc.process(jobOf({ dryRun: true }));

    expect(push.sendToTokens).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  // ─── Sprint S53 — timezone gate ─────────────────────────────────────────

  describe("timezone gate", () => {
    it("nudges a Guayaquil user when UTC is 23:00 (local 18:00)", async () => {
      const candidate = {
        id: "u-ecu",
        firstName: "Inés",
        deviceTokens: [{ token: "ExponentPushToken[a]" }],
        profile: { timezone: "America/Guayaquil" },
      };
      const prisma = buildPrisma([candidate]);
      const push = buildPush([{ status: "ok" }]);
      const proc = new InactiveNudgeProcessor(prisma, push);

      // 23:00 UTC === 18:00 ECT
      await proc.process(
        jobOf({ nowIso: "2026-06-08T23:00:00Z" }, { defaultNow: false }),
      );
      expect(push.sendToTokens).toHaveBeenCalledOnce();
    });

    it("SKIPS the Guayaquil user when UTC is 18:00 (local 13:00 — wrong hour)", async () => {
      const candidate = {
        id: "u-ecu",
        firstName: "Inés",
        deviceTokens: [{ token: "ExponentPushToken[a]" }],
        profile: { timezone: "America/Guayaquil" },
      };
      const prisma = buildPrisma([candidate]);
      const push = buildPush([{ status: "ok" }]);
      const proc = new InactiveNudgeProcessor(prisma, push);

      await proc.process(
        jobOf({ nowIso: "2026-06-08T18:00:00Z" }, { defaultNow: false }),
      );
      expect(push.sendToTokens).not.toHaveBeenCalled();
    });

    it("legacy candidate without profile.timezone falls back to UTC — sent at 18:00 UTC", async () => {
      const candidate = {
        id: "u-legacy",
        firstName: "Sam",
        deviceTokens: [{ token: "ExponentPushToken[a]" }],
        profile: null,
      };
      const prisma = buildPrisma([candidate]);
      const push = buildPush([{ status: "ok" }]);
      const proc = new InactiveNudgeProcessor(prisma, push);

      await proc.process(
        jobOf({ nowIso: "2026-06-08T18:00:00Z" }, { defaultNow: false }),
      );
      expect(push.sendToTokens).toHaveBeenCalledOnce();
    });
  });
});
