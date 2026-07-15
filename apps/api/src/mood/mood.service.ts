import { BadRequestException, Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmotionalMapService } from "../emotional-map";
import type {
  CheckinNextResponse,
  DiaryMoodId,
  LogCheckinResponse,
  LogMoodResponse,
} from "@psico/types";
import { CHECKIN_ITEMS } from "@psico/types";
import { deriveMoodNormalization } from "./mood-normalization";

/**
 * MoodService — Sprint B1.
 *
 * Owns the time series of mood check-ins. The Topbar MoodChip on the new
 * dashboard POSTs to `/api/mood` whenever the user picks a mood; we append a
 * `MoodLog` row, keep `User.mood` + `User.moodUpdatedAt` in sync as the
 * denormalized "current mood" cache, and read back the swatch so the UI can
 * confirm without a follow-up fetch.
 *
 * The mood string is validated by `LogMoodDto` against the shared
 * `DIARY_MOOD_IDS` catalog from `@psico/types` (compile-time source of
 * truth). We DO look up the `OnboardingMood` row to fetch the swatch,
 * but a missing row no longer 404s — Sprint B6b renamed the IDs from
 * legacy (calma/foco/…) to wellness (great/good/ok/low/hard), and any
 * DB that hasn't re-run the B6b seed would otherwise dead-end the chip
 * on every click. Instead, we fall back to a hardcoded swatch table that
 * mirrors `MOOD_SEED_CATALOG` and persist the entry anyway.
 */

const FALLBACK_SWATCH: Record<string, string> = {
  great: "#7FAE76",
  good: "#A8C7E4",
  ok: "#B8B3AA",
  low: "#8B71F5",
  hard: "#5E42C0",
};

@Injectable()
export class MoodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emotionalMap: EmotionalMapService,
  ) {}

  async log(userId: string, mood: string): Promise<LogMoodResponse> {
    // PR-2A · never persist an empty check-in. The DTO already rejects a
    // missing token; this is the server-side backstop — an absent mood creates
    // NO MoodLog row.
    if (!mood || mood.trim().length === 0) {
      throw new BadRequestException(
        "MOOD_REQUIRED: a check-in must carry a mood token",
      );
    }

    // Swatch enrichment is best-effort. The DTO has already validated `mood`
    // against the shared catalog; the DB lookup is just to surface a swatch
    // for the optimistic UI confirmation. If the row is missing (DB seeded
    // before Sprint B6b, fresh dev DB never seeded, etc.) we use the
    // hardcoded fallback so the chip never dead-ends.
    const moodRow = await this.prisma.onboardingMood.findUnique({
      where: { id: mood },
      select: { id: true, swatch: true },
    });
    const swatch =
      moodRow?.swatch ?? FALLBACK_SWATCH[mood] ?? "var(--color-warm-400)";

    // PR-2A · a check-in is inherently an EXPLICIT pick (the user taps a face)
    // in the canonical ordinal vocabulary (the DTO validated it), so the
    // server marks it MOOD_LOG / explicit and — being canonical — eligible.
    // Provenance/eligibility are server-owned; the client sends only the token.
    const normalization = deriveMoodNormalization({
      raw: mood,
      source: "MOOD_LOG",
      explicitlySelected: true,
    });

    // Append to the time series + sync the denormalized "current" cache. The
    // two writes are independent so we don't need a transaction.
    const [entry] = await Promise.all([
      this.prisma.moodLog.create({
        // The raw `mood` is preserved untouched; the normalization columns are
        // additive alongside it.
        data: { userId, mood, ...normalization },
        select: { id: true, mood: true, createdAt: true },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { mood, moodUpdatedAt: new Date() },
      }),
    ]);

    return {
      ok: true,
      entry: {
        id: entry.id,
        mood: entry.mood as DiaryMoodId,
        createdAt: entry.createdAt,
      },
      currentMood: entry.mood as DiaryMoodId,
      swatch,
    };
  }

  /**
   * Which micro-checkin question to ask next (Mapa Emocional · Etapa 2).
   *
   * Cadence: at most one question per rolling ~20h window (feels "daily"
   * without timezone math — an answer at 8pm unlocks the next one by ~4pm the
   * following day). Rotation: the item whose last answer is oldest goes first,
   * never-answered items before all of them, catalog order as tiebreak. Server
   * decides so web + mobile can't drift.
   */
  async nextCheckin(userId: string): Promise<CheckinNextResponse> {
    const windowStart = new Date(Date.now() - CHECKIN_COOLDOWN_MS);
    const recent = await this.prisma.checkinResponse.findFirst({
      where: { userId, createdAt: { gte: windowStart } },
      select: { id: true },
    });
    if (recent) return { item: null };

    const lastPerItem = await this.prisma.checkinResponse.groupBy({
      by: ["itemKey"],
      where: { userId },
      _max: { createdAt: true },
    });
    const lastAnswered = new Map(
      lastPerItem.map((r) => [r.itemKey, r._max.createdAt?.getTime() ?? 0]),
    );
    const item = [...CHECKIN_ITEMS].sort(
      (a, b) => (lastAnswered.get(a.key) ?? 0) - (lastAnswered.get(b.key) ?? 0),
    )[0];
    return { item };
  }

  /** Persist one checkin answer and bust the map cache so it reflects soon. */
  async logCheckin(
    userId: string,
    itemKey: string,
    score: number,
  ): Promise<LogCheckinResponse> {
    const row = await this.prisma.checkinResponse.create({
      data: { userId, itemKey, score },
      select: { id: true, itemKey: true, score: true, createdAt: true },
    });
    // Fire-and-forget — a stale map is annoying, not fatal.
    // Additive write: a stale map is a freshness bug, not a leak.
    void this.emotionalMap.invalidateBestEffort(userId);
    return { ok: true, ...row };
  }
}

/** ~20h rolling window so the checkin feels daily without timezone math. */
const CHECKIN_COOLDOWN_MS = 20 * 60 * 60 * 1000;
