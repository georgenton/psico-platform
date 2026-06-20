import { Injectable, NotFoundException } from "@nestjs/common";
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
 * The mood string is validated against `OnboardingMood` rows (the same
 * authoritative catalog HomeService.updateMood uses) — if a token isn't in
 * there, we throw 404 so we never write garbage to the time series.
 */
@Injectable()
export class MoodService {
  constructor(private readonly prisma: PrismaService) {}

  async log(userId: string, mood: string): Promise<LogMoodResponse> {
    const moodRow = await this.prisma.onboardingMood.findUnique({
      where: { id: mood },
      select: { id: true, swatch: true },
    });
    if (!moodRow) throw new NotFoundException(`Mood '${mood}' not found`);

    // Append to the time series + sync the denormalized "current" cache. The
    // two writes are independent so we don't need a transaction.
    const [entry] = await Promise.all([
      this.prisma.moodLog.create({
        data: { userId, mood: moodRow.id },
        select: { id: true, mood: true, createdAt: true },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { mood: moodRow.id, moodUpdatedAt: new Date() },
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
      swatch: moodRow.swatch,
    };
  }
}
