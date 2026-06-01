import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from "@nestjs/config";
import type { Plan } from "@prisma/client";
import type {
  VoiceTranscribeResponse,
  VoiceUsageReportResponse,
} from "@psico/types";
import type { Env } from "../config";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { PLAN_QUOTAS } from "../subscription/quotas";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UsageService } from "../subscription/usage.service";
import type { IVoiceProvider } from "./providers/voice-provider.interface";
import {
  DEEPGRAM_PROVIDER,
  WHISPER_PROVIDER,
} from "./providers/voice-provider.interface";

/**
 * VoiceService — Sprint S8 orchestrator.
 *
 * Pre-flight + provider dispatch + post-flight metering. Per the decision
 * matrix in docs/informes/sprint-s8-voice.md §3:
 *
 *   1. Reject FREE-tier callers up front (quota for FREE is 0 minutes).
 *   2. Pull current period usage from UsageService (read-through cache).
 *   3. If `minutesUsed >= quota`, return 402 VOICE_QUOTA_EXCEEDED so the
 *      client never spends OpenAI dollars on a transcription it can't show.
 *   4. Dispatch to the active IVoiceProvider (Whisper or Deepgram).
 *   5. INSERT VoiceTranscription audit row (no audio content).
 *   6. Invalidate UsageService cache so the new total shows up immediately
 *      on the next /usage fetch.
 *   7. Return transcript + remaining minutes (clamped at zero).
 *
 * Quota arithmetic uses seconds end-to-end and only converts to minutes for
 * the user-facing field. Avoids the floor() ambiguity of "did the user
 * consume 119.4 minutes or 120?".
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageService: UsageService,
    private readonly config: ConfigService<Env, true>,
    @Inject(WHISPER_PROVIDER) private readonly whisper: IVoiceProvider,
    @Inject(DEEPGRAM_PROVIDER) private readonly deepgram: IVoiceProvider,
  ) {}

  // ─── Provider selection ────────────────────────────────────────────────────

  /**
   * Returns the provider matching VOICE_PROVIDER. Exposed so tests can
   * assert the wiring without going through `transcribe`.
   */
  selectProvider(): IVoiceProvider {
    const choice = this.config.get("VOICE_PROVIDER", { infer: true });
    return choice === "deepgram" ? this.deepgram : this.whisper;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async transcribe(
    userId: string,
    audio: Buffer,
    mimeType: string,
    language: string | undefined,
  ): Promise<VoiceTranscribeResponse> {
    if (!audio || audio.length === 0) {
      throw new BadRequestException("AUDIO_EMPTY");
    }

    const { plan, quotaMinutes, usedSeconds, remainingSeconds } =
      await this.assertQuotaAvailable(userId);

    const provider = this.selectProvider();
    const result = await provider.transcribe({
      audio,
      mimeType,
      language: language ?? null,
    });

    // Persist the audit row. We never store the audio buffer.
    await this.prisma.voiceTranscription.create({
      data: {
        userId,
        durationSec: result.durationSec,
        language: result.language,
        provider: provider.name,
      },
    });

    // Bust the usage cache so the next /usage call counts this transcription.
    await this.usageService.invalidate(userId);

    const remainingAfter = Math.max(0, remainingSeconds - result.durationSec);

    this.logger.log(
      `Transcribed ${result.durationSec.toFixed(1)}s for user ${userId} ` +
        `via ${provider.name} (plan=${plan}, used=${usedSeconds.toFixed(1)}s, ` +
        `quota=${quotaMinutes ?? "unlimited"}min)`,
    );

    return {
      ok: true,
      transcript: result.transcript,
      durationSec: result.durationSec,
      language: result.language,
      provider: provider.name,
      remainingMinutesThisPeriod:
        quotaMinutes === null
          ? Number.POSITIVE_INFINITY // serialized as `null` by Nest (Infinity → null)
          : Number((remainingAfter / 60).toFixed(2)),
    };
  }

  /**
   * `/voz/usage` — design spec endpoint. v1 is a passthrough: the server
   * already counted on `/transcribe`, so the client report is informational.
   * We still return the authoritative remaining-minutes value so a buggy
   * client can sync if its local counter drifted.
   */
  async reportUsage(userId: string): Promise<VoiceUsageReportResponse> {
    const { quotaMinutes, remainingSeconds } = await this.computeUsage(userId);
    return {
      ok: true,
      remainingMinutesThisPeriod:
        quotaMinutes === null
          ? Number.POSITIVE_INFINITY
          : Number((Math.max(0, remainingSeconds) / 60).toFixed(2)),
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async assertQuotaAvailable(userId: string): Promise<{
    plan: Plan;
    quotaMinutes: number | null;
    usedSeconds: number;
    remainingSeconds: number;
  }> {
    const usage = await this.computeUsage(userId);
    if (usage.quotaMinutes !== null && usage.remainingSeconds <= 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: "VOICE_QUOTA_EXCEEDED",
          message:
            "You have used all your voice minutes for this period. The cap resets at the start of your next billing cycle.",
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return usage;
  }

  /**
   * Computes the (plan, quota, usedSeconds, remainingSeconds) tuple for the
   * current billing period. Both `assertQuotaAvailable` and `reportUsage`
   * funnel through here so the math lives in one place.
   */
  private async computeUsage(userId: string): Promise<{
    plan: Plan;
    quotaMinutes: number | null;
    usedSeconds: number;
    remainingSeconds: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const plan: Plan = user?.plan ?? "FREE";
    const quotaMinutes = PLAN_QUOTAS[plan].voice;

    // FREE explicitly gets 0 minutes — fail loudly with a 403 rather than
    // letting them spend our OpenAI budget for free.
    if (quotaMinutes === 0) {
      throw new ForbiddenException("VOICE_REQUIRES_PRO");
    }

    const period = await this.resolvePeriod(userId);
    const aggregate = await this.prisma.voiceTranscription.aggregate({
      where: {
        userId,
        createdAt: { gte: period.start, lt: period.end },
      },
      _sum: { durationSec: true },
    });
    const usedSeconds = aggregate._sum.durationSec ?? 0;

    const remainingSeconds =
      quotaMinutes === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, quotaMinutes * 60 - usedSeconds);

    return { plan, quotaMinutes, usedSeconds, remainingSeconds };
  }

  /**
   * Period resolution matches UsageService: active subscription wins, else
   * fall back to the calendar month in UTC. Inline duplication is fine here
   * because the math is one query — exporting from UsageService would make
   * a circular import.
   */
  private async resolvePeriod(
    userId: string,
  ): Promise<{ start: Date; end: Date }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        currentPeriodStart: true,
        currentPeriodEnd: true,
        status: true,
      },
    });
    if (
      sub &&
      (sub.status === "ACTIVE" ||
        sub.status === "TRIALING" ||
        sub.status === "PAST_DUE")
    ) {
      return { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };
    }
    const now = new Date();
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
  }
}
