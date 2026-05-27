import { ForbiddenException, HttpException, HttpStatus } from "@nestjs/common";
import { Plan, SubscriptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceService } from "./voice.service";

vi.mock("@prisma/client", () => ({
  PrismaClient: class {},
  Plan: { FREE: "FREE", PRO: "PRO", ANNUAL: "ANNUAL", B2B: "B2B" },
  SubscriptionStatus: {
    ACTIVE: "ACTIVE",
    TRIALING: "TRIALING",
    PAST_DUE: "PAST_DUE",
    CANCELED: "CANCELED",
    INCOMPLETE: "INCOMPLETE",
  },
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────

const USER_ID = "user-abc";
const SUB_START = new Date("2026-05-01T00:00:00Z");
const SUB_END = new Date("2026-06-01T00:00:00Z");

function makePrisma(opts: {
  plan?: Plan;
  hasActiveSub?: boolean;
  usedSeconds?: number;
}) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ plan: opts.plan ?? Plan.PRO }),
    },
    subscription: {
      findUnique: vi.fn().mockResolvedValue(
        opts.hasActiveSub
          ? {
              currentPeriodStart: SUB_START,
              currentPeriodEnd: SUB_END,
              status: SubscriptionStatus.ACTIVE,
            }
          : null,
      ),
    },
    voiceTranscription: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { durationSec: opts.usedSeconds ?? 0 } }),
      create: vi.fn().mockResolvedValue({ id: "vt-1" }),
    },
  };
}

function makeUsageService() {
  return { invalidate: vi.fn().mockResolvedValue(undefined) };
}

function makeConfig(provider: "whisper" | "deepgram" = "whisper") {
  return { get: vi.fn().mockReturnValue(provider) };
}

function makeWhisper(opts: { durationSec?: number; transcript?: string } = {}) {
  return {
    name: "whisper" as const,
    transcribe: vi.fn().mockResolvedValue({
      transcript: opts.transcript ?? "hola mundo",
      durationSec: opts.durationSec ?? 30,
      language: "es",
    }),
  };
}

function makeDeepgram() {
  return {
    name: "deepgram" as const,
    transcribe: vi.fn().mockResolvedValue({
      transcript: "hola desde deepgram",
      durationSec: 25,
      language: "es-419",
    }),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("VoiceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("selectProvider", () => {
    it("returns Whisper when VOICE_PROVIDER=whisper", () => {
      const service = new VoiceService(
        makePrisma({}) as never,
        makeUsageService() as never,
        makeConfig("whisper") as never,
        makeWhisper() as never,
        makeDeepgram() as never,
      );
      expect(service.selectProvider().name).toBe("whisper");
    });

    it("returns Deepgram when VOICE_PROVIDER=deepgram", () => {
      const service = new VoiceService(
        makePrisma({}) as never,
        makeUsageService() as never,
        makeConfig("deepgram") as never,
        makeWhisper() as never,
        makeDeepgram() as never,
      );
      expect(service.selectProvider().name).toBe("deepgram");
    });
  });

  describe("transcribe — quota gate", () => {
    it("rejects FREE users with 403 VOICE_REQUIRES_PRO", async () => {
      const prisma = makePrisma({ plan: Plan.FREE });
      const service = new VoiceService(
        prisma as never,
        makeUsageService() as never,
        makeConfig() as never,
        makeWhisper() as never,
        makeDeepgram() as never,
      );
      await expect(
        service.transcribe(
          USER_ID,
          Buffer.from("audio"),
          "audio/webm",
          undefined,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects PRO users at quota with 402 VOICE_QUOTA_EXCEEDED", async () => {
      const prisma = makePrisma({
        plan: Plan.PRO,
        hasActiveSub: true,
        // PRO cap is 120 min = 7200s. Already used 7200s → 0 left.
        usedSeconds: 7200,
      });
      const service = new VoiceService(
        prisma as never,
        makeUsageService() as never,
        makeConfig() as never,
        makeWhisper() as never,
        makeDeepgram() as never,
      );
      await expect(
        service.transcribe(
          USER_ID,
          Buffer.from("audio"),
          "audio/webm",
          undefined,
        ),
      ).rejects.toMatchObject({
        getStatus: expect.any(Function),
      });
      try {
        await service.transcribe(
          USER_ID,
          Buffer.from("audio"),
          "audio/webm",
          undefined,
        );
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    });

    it("rejects an empty audio buffer with 400 AUDIO_EMPTY", async () => {
      const prisma = makePrisma({ plan: Plan.PRO, hasActiveSub: true });
      const service = new VoiceService(
        prisma as never,
        makeUsageService() as never,
        makeConfig() as never,
        makeWhisper() as never,
        makeDeepgram() as never,
      );
      await expect(
        service.transcribe(USER_ID, Buffer.alloc(0), "audio/webm", undefined),
      ).rejects.toThrow(/AUDIO_EMPTY/);
    });
  });

  describe("transcribe — happy path", () => {
    it("dispatches to Whisper, persists audit row, busts cache", async () => {
      const prisma = makePrisma({
        plan: Plan.PRO,
        hasActiveSub: true,
        usedSeconds: 600, // 10 min used → 110 min remaining
      });
      const usage = makeUsageService();
      const whisper = makeWhisper({ durationSec: 45 });
      const service = new VoiceService(
        prisma as never,
        usage as never,
        makeConfig("whisper") as never,
        whisper as never,
        makeDeepgram() as never,
      );

      const result = await service.transcribe(
        USER_ID,
        Buffer.from("audio"),
        "audio/webm",
        "es",
      );

      // Provider was called with the audio + language hint.
      expect(whisper.transcribe).toHaveBeenCalledWith({
        audio: expect.any(Buffer),
        mimeType: "audio/webm",
        language: "es",
      });
      // Audit row persisted with provider tag.
      expect(prisma.voiceTranscription.create).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          durationSec: 45,
          language: "es",
          provider: "whisper",
        },
      });
      // Cache invalidated.
      expect(usage.invalidate).toHaveBeenCalledWith(USER_ID);
      // Response shape.
      expect(result.ok).toBe(true);
      expect(result.transcript).toBe("hola mundo");
      expect(result.durationSec).toBe(45);
      expect(result.provider).toBe("whisper");
      // 7200s quota - 600s used - 45s new = 6555s = 109.25min
      expect(result.remainingMinutesThisPeriod).toBeCloseTo(109.25, 1);
    });

    it("dispatches to Deepgram when VOICE_PROVIDER=deepgram", async () => {
      const prisma = makePrisma({ plan: Plan.PRO, hasActiveSub: true });
      const deepgram = makeDeepgram();
      const service = new VoiceService(
        prisma as never,
        makeUsageService() as never,
        makeConfig("deepgram") as never,
        makeWhisper() as never,
        deepgram as never,
      );

      const result = await service.transcribe(
        USER_ID,
        Buffer.from("audio"),
        "audio/webm",
        undefined,
      );

      expect(deepgram.transcribe).toHaveBeenCalled();
      expect(result.provider).toBe("deepgram");
      expect(prisma.voiceTranscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ provider: "deepgram" }),
      });
    });

    it("returns Infinity remaining for B2B (unlimited quota)", async () => {
      const prisma = makePrisma({
        plan: Plan.B2B,
        hasActiveSub: true,
        usedSeconds: 999_999,
      });
      const service = new VoiceService(
        prisma as never,
        makeUsageService() as never,
        makeConfig() as never,
        makeWhisper({ durationSec: 30 }) as never,
        makeDeepgram() as never,
      );

      const result = await service.transcribe(
        USER_ID,
        Buffer.from("audio"),
        "audio/webm",
        undefined,
      );

      expect(result.remainingMinutesThisPeriod).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe("reportUsage", () => {
    it("returns the authoritative remaining-minutes value (PRO at 30 min used)", async () => {
      const prisma = makePrisma({
        plan: Plan.PRO,
        hasActiveSub: true,
        usedSeconds: 1800, // 30 min
      });
      const service = new VoiceService(
        prisma as never,
        makeUsageService() as never,
        makeConfig() as never,
        makeWhisper() as never,
        makeDeepgram() as never,
      );

      const result = await service.reportUsage(USER_ID);

      // 120 quota - 30 used = 90 remaining.
      expect(result.ok).toBe(true);
      expect(result.remainingMinutesThisPeriod).toBe(90);
    });
  });
});
