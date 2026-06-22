import { Injectable } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type { DiaryMoodId, LogMoodResponse } from "@psico/types";

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
  constructor(private readonly prisma: PrismaService) {}

  async log(userId: string, mood: string): Promise<LogMoodResponse> {
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

    // Append to the time series + sync the denormalized "current" cache. The
    // two writes are independent so we don't need a transaction.
    const [entry] = await Promise.all([
      this.prisma.moodLog.create({
        data: { userId, mood },
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
}
