import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
import { JobName, QueueName, type DailyUsageJobPayload } from "../queue-names";

/**
 * Sprint S7 — Nightly usage rollup.
 *
 * Scans every user with activity in the target day (UTC midnight to next UTC
 * midnight) and upserts a `BillingUsageDay` row keyed on (userId, day).
 *
 * What this DOES write:
 *   - `diaryEntries`    — count of DiaryEntry rows created in the window.
 *   - `booksCompleted`  — count of distinct books where the user's LAST
 *                         chapter (i.e., chapter for which UserProgress was
 *                         created in the window) is also the last published
 *                         chapter of that book.
 *   - `voiceMinutes`    — Sprint S8: SUM(durationSec) on VoiceTranscription
 *                         in the window, divided by 60. Rounded to 0.1 min.
 *   - `ecoMessages`     — Sprint S10: COUNT(EcoMessage) where kind=USER in
 *                         the window. Assistant replies don't count.
 *
 * Idempotency: the (userId, day) unique constraint plus an `upsert` makes
 * re-running for the same day safe. Useful when ops needs to backfill a
 * day after a data fix.
 *
 * Why a single fan-out job over per-user jobs:
 *   - One row per active user per day → bounded by DAU, not by total users.
 *   - A long-running job that touches Prisma in batches is simpler to
 *     debug than thousands of tiny jobs that fight for the same table.
 *   - If/when DAU grows past ~50k we'll split per-user with `BulkAdd`.
 */
@Processor(QueueName.DAILY_USAGE)
export class DailyUsageProcessor extends WorkerHost {
  private readonly logger = new Logger(DailyUsageProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<DailyUsageJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_DAILY_USAGE_ROLLUP) {
      throw new Error(`DailyUsageProcessor unknown job name: ${job.name}`);
    }

    const day = this.resolveTargetDay(job.data.targetDay);
    const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    this.logger.log(
      `Rolling up usage for day=${day.toISOString().slice(0, 10)}`,
    );

    // ── Diary entries ──────────────────────────────────────────────────────
    // groupBy userId where createdAt in [day, dayEnd) — one query, no fan-out.
    const diaryGroups = await this.prisma.diaryEntry.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: day, lt: dayEnd } },
      _count: { _all: true },
    });

    // ── Voice minutes (Sprint S8) ───────────────────────────────────────────
    // SUM durationSec per user; we'll convert to minutes when writing.
    const voiceGroups = await this.prisma.voiceTranscription.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: day, lt: dayEnd } },
      _sum: { durationSec: true },
    });
    const voiceSecondsByUser = new Map<string, number>(
      voiceGroups.map((g) => [g.userId, g._sum.durationSec ?? 0]),
    );

    // ── Eco messages (Sprint S10) ───────────────────────────────────────────
    // Count USER-kind EcoMessages per user. Threads carry the userId; we
    // join via the thread relation. Assistant replies don't count.
    const ecoRows = await this.prisma.ecoMessage.findMany({
      where: {
        kind: "USER",
        createdAt: { gte: day, lt: dayEnd },
      },
      select: { thread: { select: { userId: true } } },
    });
    const ecoCountByUser = new Map<string, number>();
    for (const row of ecoRows) {
      const uid = row.thread.userId;
      ecoCountByUser.set(uid, (ecoCountByUser.get(uid) ?? 0) + 1);
    }

    // ── Books completed: a book counts if the user finished its last chapter
    //    in the window. Cheap heuristic: count books where the user has any
    //    progress row in the window AND has total-chapters progress rows
    //    overall. We approximate by checking, per affected user/book, whether
    //    the all-time progress count equals book.totalChapters. The exact
    //    "completed in this window" semantics are documented in the bitácora.
    const progressInWindow = await this.prisma.userProgress.findMany({
      where: { completedAt: { gte: day, lt: dayEnd } },
      select: {
        userId: true,
        chapter: {
          select: {
            bookId: true,
            book: { select: { totalChapters: true } },
          },
        },
      },
    });

    const candidateByUser = new Map<string, Map<string, number>>();
    const totalChaptersByBook = new Map<string, number>();
    for (const row of progressInWindow) {
      const userId = row.userId;
      const bookId = row.chapter.bookId;
      totalChaptersByBook.set(bookId, row.chapter.book.totalChapters);
      const userBooks =
        candidateByUser.get(userId) ?? new Map<string, number>();
      userBooks.set(bookId, (userBooks.get(bookId) ?? 0) + 1);
      candidateByUser.set(userId, userBooks);
    }

    // For each (user, book) candidate, look up all-time chapter completion
    // counts. We batch the query per user so the WHERE IN clause stays small.
    const booksCompletedByUser = new Map<string, number>();
    for (const [userId, books] of candidateByUser) {
      if (books.size === 0) continue;
      const allTime = await this.prisma.userProgress.findMany({
        where: {
          userId,
          chapter: { bookId: { in: [...books.keys()] } },
        },
        select: { chapter: { select: { bookId: true } } },
      });
      const allTimeByBook = new Map<string, number>();
      for (const r of allTime) {
        const bookId = r.chapter.bookId;
        allTimeByBook.set(bookId, (allTimeByBook.get(bookId) ?? 0) + 1);
      }
      let completed = 0;
      for (const [bookId, count] of allTimeByBook) {
        const total = totalChaptersByBook.get(bookId) ?? 0;
        if (total > 0 && count >= total) completed += 1;
      }
      booksCompletedByUser.set(userId, completed);
    }

    // ── Aggregate the union of "users with activity today" ──────────────────
    const activeUserIds = new Set<string>([
      ...diaryGroups.map((g) => g.userId),
      ...candidateByUser.keys(),
      ...voiceSecondsByUser.keys(),
      ...ecoCountByUser.keys(),
    ]);

    let written = 0;
    for (const userId of activeUserIds) {
      const diaryCount =
        diaryGroups.find((g) => g.userId === userId)?._count?._all ?? 0;
      const booksCompleted = booksCompletedByUser.get(userId) ?? 0;
      const voiceMinutes = Number(
        ((voiceSecondsByUser.get(userId) ?? 0) / 60).toFixed(1),
      );
      const ecoMessages = ecoCountByUser.get(userId) ?? 0;

      await this.prisma.billingUsageDay.upsert({
        where: { userId_day: { userId, day } },
        create: {
          userId,
          day,
          diaryEntries: diaryCount,
          booksCompleted,
          voiceMinutes,
          ecoMessages,
        },
        update: {
          diaryEntries: diaryCount,
          booksCompleted,
          voiceMinutes,
          ecoMessages,
        },
      });
      written += 1;
    }

    this.logger.log(
      `Rolled up usage · day=${day.toISOString().slice(0, 10)} · users=${written}`,
    );
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  /**
   * Returns the UTC midnight of the target day. When the payload provides
   * `targetDay` ("YYYY-MM-DD") we use it as-is; otherwise we default to
   * "yesterday in UTC" — the day whose data has just finished accumulating.
   */
  private resolveTargetDay(iso: string | undefined): Date {
    if (iso) {
      const parsed = new Date(`${iso}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid targetDay: ${iso}`);
      }
      return parsed;
    }
    const now = new Date();
    const utcMidnightToday = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    return new Date(utcMidnightToday - 24 * 60 * 60 * 1000);
  }
}
