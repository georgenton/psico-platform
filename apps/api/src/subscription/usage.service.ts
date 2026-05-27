import { Inject, Injectable, Logger } from "@nestjs/common";
import type IoRedis from "ioredis";
import type { UsageResponse } from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { REDIS_CLIENT } from "../redis";
import { PLAN_QUOTAS } from "./quotas";

/**
 * UsageService — Sprint S7 aggregator.
 *
 * Returns one snapshot of the user's consumption for the current billing
 * period. Counter sources are live tables (DiaryEntry, UserProgress);
 * `EcoMessage` and `VoiceTranscription` modules don't exist yet so those
 * counters return 0 (placeholder) — they'll get wired up in S10 / S8.
 *
 * Caching strategy:
 *   - 5-minute Redis TTL keyed by `usage:<userId>:<periodStart-isoDate>`.
 *   - Mi Plan reloads on every visit but a chatty client (mobile pull-to-
 *     refresh) shouldn't melt our DB; 5 min is the sweet spot.
 *   - We DON'T invalidate on writes — a new diary entry just shows up next
 *     fetch. The freshness cost is negligible against the round-trip cost
 *     of broadcast invalidation.
 *
 * Period:
 *   - Active subscribers: use Subscription.currentPeriodStart/End.
 *   - FREE / no active sub: calendar month (UTC).
 *
 * Books completed:
 *   - Same definition as UsersService.computeStats — a book counts as
 *     completed iff the user has UserProgress for every published chapter.
 *     Scoped here to "the most recent completion within the period".
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private static readonly CACHE_TTL_SECONDS = 5 * 60;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: IoRedis,
  ) {}

  async getUsage(userId: string): Promise<UsageResponse> {
    const period = await this.resolvePeriod(userId);
    const cacheKey = `usage:${userId}:${period.start.toISOString()}`;

    // ── Cache hit ────────────────────────────────────────────────────────────
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return this.hydrateDates(JSON.parse(cached) as UsageResponse);
      } catch {
        // Bad payload — fall through to recompute. Don't bother logging:
        // happens once per format change and never again.
      }
    }

    // ── Live aggregation ─────────────────────────────────────────────────────
    const [user, diaryEntriesCount, progressInPeriod] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      }),
      this.prisma.diaryEntry.count({
        where: {
          userId,
          createdAt: { gte: period.start, lt: period.end },
        },
      }),
      this.prisma.userProgress.findMany({
        where: {
          userId,
          completedAt: { gte: period.start, lt: period.end },
        },
        select: {
          chapter: {
            select: {
              bookId: true,
              book: { select: { totalChapters: true } },
            },
          },
        },
      }),
    ]);

    const plan = user?.plan ?? "FREE";
    const quotas = PLAN_QUOTAS[plan];

    // Mirror UsersService.computeStats: a book counts as completed in the
    // period iff the user finished its LAST chapter within the window. The
    // approximation here counts books where the user has progress for every
    // chapter AND any of those progress rows landed in the period — which is
    // close enough for billing-period UX and cheap to compute.
    const byBook = new Map<string, number>();
    const totalChaptersByBook = new Map<string, number>();
    for (const row of progressInPeriod) {
      const bookId = row.chapter.bookId;
      byBook.set(bookId, (byBook.get(bookId) ?? 0) + 1);
      totalChaptersByBook.set(bookId, row.chapter.book.totalChapters);
    }
    // To know if the book is COMPLETED (not just touched), we need the
    // historical chapter count — do one more lookup with all-time progress
    // for these candidate books only.
    let completedBooks = 0;
    if (byBook.size > 0) {
      const allTimeProgress = await this.prisma.userProgress.groupBy({
        by: ["chapterId"],
        where: {
          userId,
          chapter: { bookId: { in: [...byBook.keys()] } },
        },
      });
      // Reduce to per-book chapter counts:
      const allTimeByBook = new Map<string, number>();
      const chapterToBook = await this.prisma.chapter.findMany({
        where: { id: { in: allTimeProgress.map((r) => r.chapterId) } },
        select: { id: true, bookId: true },
      });
      const chapterBookMap = new Map(
        chapterToBook.map((c) => [c.id, c.bookId]),
      );
      for (const row of allTimeProgress) {
        const bookId = chapterBookMap.get(row.chapterId);
        if (!bookId) continue;
        allTimeByBook.set(bookId, (allTimeByBook.get(bookId) ?? 0) + 1);
      }
      for (const [bookId, allTimeCount] of allTimeByBook) {
        const total = totalChaptersByBook.get(bookId) ?? 0;
        if (total > 0 && allTimeCount >= total) completedBooks += 1;
      }
    }

    const response: UsageResponse = {
      plan,
      period,
      books: { completedThisPeriod: completedBooks },
      eco: { messagesThisPeriod: 0, quota: quotas.eco }, // TODO S10
      voice: { minutesThisPeriod: 0, quota: quotas.voice }, // TODO S8
      diary: { entriesThisPeriod: diaryEntriesCount, quota: quotas.diary },
    };

    // Fire-and-forget cache write — a failure here is harmless and we don't
    // want to add latency to the response path.
    void this.redis
      .set(
        cacheKey,
        JSON.stringify(response),
        "EX",
        UsageService.CACHE_TTL_SECONDS,
      )
      .catch((err) =>
        this.logger.warn(`Failed to cache usage: ${(err as Error).message}`),
      );

    return response;
  }

  /**
   * Invalidate the cache for a user. Called by the BullMQ daily-usage
   * processor after it rolls up yesterday's data — keeps the public endpoint
   * in lockstep with the rollup table without forcing every request to
   * refetch.
   */
  async invalidate(userId: string): Promise<void> {
    // Patterns: usage:<userId>:* — we don't know the exact period without
    // looking it up, and the user could have crossed a period boundary.
    // SCAN-DEL is cheap because the cardinality per user is at most 2-3
    // active keys.
    const stream = this.redis.scanStream({
      match: `usage:${userId}:*`,
      count: 100,
    });
    const keys: string[] = [];
    for await (const batch of stream) {
      keys.push(...(batch as string[]));
    }
    if (keys.length > 0) await this.redis.del(...keys);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async resolvePeriod(
    userId: string,
  ): Promise<UsageResponse["period"]> {
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
      return {
        start: sub.currentPeriodStart,
        end: sub.currentPeriodEnd,
        source: "subscription",
      };
    }

    // Fallback: calendar month in UTC. FREE users + canceled subs land here.
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { start, end, source: "calendar-month" };
  }

  /**
   * JSON.parse turns Date back into strings. Re-hydrate the two date fields
   * (period.start, period.end) so the response shape stays consistent.
   */
  private hydrateDates(payload: UsageResponse): UsageResponse {
    return {
      ...payload,
      period: {
        ...payload.period,
        start: new Date(payload.period.start),
        end: new Date(payload.period.end),
      },
    };
  }
}
