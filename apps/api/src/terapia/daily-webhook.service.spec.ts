import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import {
  DailyWebhookService,
  sessionIdFromRoomName,
  type DailyWebhookEvent,
} from "./daily-webhook.service";

const SECRET = "test-secret-32-chars-aaaaaaaaaa";

function makeConfig(secret: string | undefined = SECRET): ConfigService {
  const vals: Record<string, string | undefined> = {
    DAILY_WEBHOOK_SECRET: secret,
  };
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

function makePrisma() {
  return {
    therapySession: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("DailyWebhookService.isConfigured", () => {
  it("false when secret unset", () => {
    const svc = new DailyWebhookService(makeConfig(""), makePrisma() as never);
    expect(svc.isConfigured()).toBe(false);
  });

  it("true when secret present", () => {
    const svc = new DailyWebhookService(makeConfig(), makePrisma() as never);
    expect(svc.isConfigured()).toBe(true);
  });
});

describe("DailyWebhookService.verifySignature", () => {
  let svc: DailyWebhookService;
  beforeEach(() => {
    svc = new DailyWebhookService(makeConfig(), makePrisma() as never);
  });

  it("accepts a valid HMAC signature", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(svc.verifySignature(body, sign(body))).toBe(true);
  });

  it("rejects a mismatched signature", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(svc.verifySignature(body, sign(body, "other-secret"))).toBe(false);
  });

  it("rejects when signature header is missing", () => {
    expect(svc.verifySignature("{}", undefined)).toBe(false);
  });

  it("rejects when secret is not configured", () => {
    const noSecret = new DailyWebhookService(
      makeConfig(""),
      makePrisma() as never,
    );
    const body = JSON.stringify({ hello: "world" });
    expect(noSecret.verifySignature(body, sign(body))).toBe(false);
  });
});

describe("DailyWebhookService.process", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: DailyWebhookService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new DailyWebhookService(makeConfig(), prisma as never);
  });

  function event(
    type: DailyWebhookEvent["type"],
    payload: Partial<DailyWebhookEvent["payload"]> = {},
    eventTs = 1781120000,
  ): DailyWebhookEvent {
    return {
      version: "1.0",
      type,
      id: "evt_" + Math.random().toString(36).slice(2),
      event_ts: eventTs,
      payload: { room: "session-abc", ...payload },
    };
  }

  it("ignores when payload.room is missing", async () => {
    const result = await svc.process({
      ...event("meeting.started"),
      payload: {},
    });
    expect(result.status).toBe("ignored");
  });

  it("ignores when room name doesn't follow session-* convention", async () => {
    const result = await svc.process(
      event("meeting.started", { room: "random-room" }),
    );
    expect(result.status).toBe("ignored");
  });

  it("ignores when the session doesn't exist", async () => {
    prisma.therapySession.findUnique.mockResolvedValue(null);
    const result = await svc.process(event("meeting.started"));
    expect(result.status).toBe("ignored");
    expect(prisma.therapySession.update).not.toHaveBeenCalled();
  });

  it("meeting.started: sets startedAt + IN_PROGRESS when SCHEDULED", async () => {
    prisma.therapySession.findUnique.mockResolvedValue({
      id: "abc",
      status: "SCHEDULED",
      startedAt: null,
      endedAt: null,
      scheduledAt: new Date(),
    });
    const result = await svc.process(
      event("meeting.started", { start_ts: 1781120000 }),
    );
    expect(result.status).toBe("applied");
    expect(prisma.therapySession.update).toHaveBeenCalledWith({
      where: { id: "abc" },
      data: {
        startedAt: new Date(1781120000 * 1000),
        status: "IN_PROGRESS",
      },
    });
  });

  it("meeting.started: idempotent when startedAt already set", async () => {
    prisma.therapySession.findUnique.mockResolvedValue({
      id: "abc",
      status: "IN_PROGRESS",
      startedAt: new Date(),
      endedAt: null,
      scheduledAt: new Date(),
    });
    const result = await svc.process(event("meeting.started"));
    expect(result.status).toBe("duplicate");
    expect(prisma.therapySession.update).not.toHaveBeenCalled();
  });

  it("meeting.started: doesn't override CANCELLED status", async () => {
    prisma.therapySession.findUnique.mockResolvedValue({
      id: "abc",
      status: "CANCELLED",
      startedAt: null,
      endedAt: null,
      scheduledAt: new Date(),
    });
    await svc.process(event("meeting.started", { start_ts: 1781120000 }));
    const call = prisma.therapySession.update.mock.calls[0][0];
    expect(call.data.startedAt).toBeInstanceOf(Date);
    expect(call.data.status).toBeUndefined();
  });

  it("meeting.ended: sets endedAt + actualDurationSec + COMPLETED", async () => {
    prisma.therapySession.findUnique.mockResolvedValue({
      id: "abc",
      status: "IN_PROGRESS",
      startedAt: new Date(1781119000 * 1000),
      endedAt: null,
      scheduledAt: new Date(),
    });
    const result = await svc.process(
      event("meeting.ended", {
        end_ts: 1781122000,
        duration: 3000, // Daily-reported duration
      }),
    );
    expect(result.status).toBe("applied");
    expect(prisma.therapySession.update).toHaveBeenCalledWith({
      where: { id: "abc" },
      data: {
        endedAt: new Date(1781122000 * 1000),
        actualDurationSec: 3000,
        status: "COMPLETED",
      },
    });
  });

  it("meeting.ended: derives duration from startedAt when Daily omits it", async () => {
    prisma.therapySession.findUnique.mockResolvedValue({
      id: "abc",
      status: "IN_PROGRESS",
      startedAt: new Date(1781119000 * 1000),
      endedAt: null,
      scheduledAt: new Date(),
    });
    await svc.process(event("meeting.ended", { end_ts: 1781120800 }));
    const call = prisma.therapySession.update.mock.calls[0][0];
    expect(call.data.actualDurationSec).toBe(1800);
  });

  it("meeting.ended: idempotent when endedAt already set", async () => {
    prisma.therapySession.findUnique.mockResolvedValue({
      id: "abc",
      status: "COMPLETED",
      startedAt: new Date(),
      endedAt: new Date(),
      scheduledAt: new Date(),
    });
    const result = await svc.process(event("meeting.ended"));
    expect(result.status).toBe("duplicate");
    expect(prisma.therapySession.update).not.toHaveBeenCalled();
  });

  it("meeting.ended: doesn't promote CANCELLED to COMPLETED", async () => {
    prisma.therapySession.findUnique.mockResolvedValue({
      id: "abc",
      status: "CANCELLED",
      startedAt: null,
      endedAt: null,
      scheduledAt: new Date(),
    });
    await svc.process(event("meeting.ended", { end_ts: 1781120800 }));
    const call = prisma.therapySession.update.mock.calls[0][0];
    expect(call.data.status).toBeUndefined();
  });

  it("participant events are no-ops", async () => {
    prisma.therapySession.findUnique.mockResolvedValue({
      id: "abc",
      status: "IN_PROGRESS",
      startedAt: new Date(),
      endedAt: null,
      scheduledAt: new Date(),
    });
    const result = await svc.process(event("participant.joined"));
    expect(result.status).toBe("ignored");
    expect(prisma.therapySession.update).not.toHaveBeenCalled();
  });
});

describe("sessionIdFromRoomName", () => {
  it("extracts id from session-<id>", () => {
    expect(sessionIdFromRoomName("session-abc123")).toBe("abc123");
  });

  it("returns null for non-session rooms", () => {
    expect(sessionIdFromRoomName("test-room")).toBe(null);
  });

  it("returns null for empty id", () => {
    expect(sessionIdFromRoomName("session-")).toBe(null);
  });

  it("works with full Daily URL", () => {
    expect(
      sessionIdFromRoomName("https://psico-platform.daily.co/session-xyz"),
    ).toBe("xyz");
  });
});
