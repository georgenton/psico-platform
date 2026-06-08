import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type IoRedis from "ioredis";
import type {
  PulsoOverviewBusinessBlock,
  PulsoOverviewContentBlock,
  PulsoOverviewDeltas,
  PulsoOverviewEngagementBlock,
  PulsoOverviewResponse,
  PulsoOverviewSeries,
  PulsoOverviewUsersBlock,
  PulsoReportListResponse,
  PulsoReportRow,
  PulsoReportStatus,
  PulsoReportSummary,
  PulsoReportReason,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { REDIS_CLIENT } from "../redis";

/**
 * PulsoService — Sprint S42 (reports) + S48 (overview).
 *
 * Read-only admin surface. Two slices today:
 *   - `getEcoReportSummary` / `listEcoReports` (S42) — Eco message reports.
 *   - `getOverview` (S48) — platform KPIs for the admin dashboard.
 *
 * Privacy contract:
 * - The USER message that triggered a report is `textCiphertext`. We NEVER
 *   decrypt nor expose it to admins.
 * - The ASSISTANT message (which is what the user reported) is plaintext
 *   from the LLM and is safe to surface in `listEcoReports`.
 * - `getOverview` exposes ONLY aggregate counts — no userId, email, IP,
 *   or content snippet appears in its response.
 *
 * Caching (S48):
 *   - 5-minute Redis TTL keyed by `pulso:overview` (single global key —
 *     ADMIN sees one platform view, not per-user).
 *   - Counts are slightly stale but admin dashboards don't need real-time;
 *     the cost of the multi-table aggregation justifies the cache.
 */
@Injectable()
export class PulsoService {
  private readonly logger = new Logger(PulsoService.name);
  private static readonly OVERVIEW_CACHE_KEY = "pulso:overview";
  private static readonly OVERVIEW_CACHE_TTL_SECONDS = 5 * 60;
  /**
   * Sprint S50 — how many trailing days of history we pull from
   * `PlatformMetricDaily` for sparklines. 30 covers the longest "vs last
   * 7d" delta plus 2 reference weeks of context.
   */
  private static readonly SERIES_WINDOW_DAYS = 30;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: IoRedis,
  ) {}

  // ── GET /api/pulso/reports/eco/summary ──────────────────────────────

  /**
   * Counts of reports grouped by reason. Used by the admin shell to render
   * the chips at the top of the page. Always returns one row per reason
   * (zero-filled).
   *
   * Sprint S49 — accepts an optional `status` filter so the summary chips
   * reflect what's actually visible in the list below (open by default).
   */
  async getEcoReportSummary(
    status: PulsoReportStatus = "open",
  ): Promise<PulsoReportSummary> {
    const groups = await this.prisma.ecoMessageReport.groupBy({
      by: ["reason"],
      where: statusWhereClause(status),
      _count: { _all: true },
    });

    const total = groups.reduce((acc, g) => acc + g._count._all, 0);
    const byReason: Record<PulsoReportReason, number> = {
      HALLUCINATION: 0,
      OFF_TONE: 0,
      SENSITIVE_CONTENT: 0,
      CRISIS_MISHANDLED: 0,
      OTHER: 0,
    };
    for (const g of groups) {
      byReason[g.reason as PulsoReportReason] = g._count._all;
    }

    return { total, byReason };
  }

  // ── GET /api/pulso/reports/eco ──────────────────────────────────────

  async listEcoReports(params: {
    reason?: PulsoReportReason;
    /** Sprint S49 — `open` by default; `resolved` or `all` opt-in. */
    status?: PulsoReportStatus;
    limit?: number;
    cursor?: string;
  }): Promise<PulsoReportListResponse> {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const status = params.status ?? "open";

    const rows = await this.prisma.ecoMessageReport.findMany({
      where: {
        ...(params.reason ? { reason: params.reason } : {}),
        ...statusWhereClause(status),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // peek one ahead to know if there's a next page
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        message: {
          select: {
            id: true,
            threadId: true,
            assistantText: true,
            kind: true,
            createdAt: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items: PulsoReportRow[] = page.map((r) => ({
      id: r.id,
      reason: r.reason as PulsoReportReason,
      comment: r.comment,
      createdAt: r.createdAt,
      userId: r.userId,
      messageId: r.messageId,
      threadId: r.message.threadId,
      messageKind: r.message.kind as PulsoReportRow["messageKind"],
      // The assistant text IS plaintext (LLM output, not user content).
      // We trim aggressively to keep the table compact.
      assistantTextSnippet: snippet(r.message.assistantText, 240),
      resolvedAt: r.resolvedAt,
      resolvedBy: r.resolvedBy,
      resolutionNote: r.resolutionNote,
    }));

    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return { items, nextCursor, hasMore };
  }

  // ── POST /api/pulso/reports/eco/:id/resolve ─────────────────────────

  /**
   * Sprint S49 — mark a report as triaged. Idempotent in spirit: if the row
   * is already resolved, we OVERWRITE the timestamp + admin + note (the new
   * action wins). That matches admin-side expectations more than a 409: if
   * you're re-marking, you're probably correcting your own previous note.
   *
   * Side effects:
   *   - Busts the `pulso:overview` cache so the backlog count refreshes.
   */
  async markResolved(
    reportId: string,
    adminUserId: string,
    note: string | null,
  ): Promise<PulsoReportRow> {
    const existing = await this.prisma.ecoMessageReport.findUnique({
      where: { id: reportId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("REPORT_NOT_FOUND");
    }

    const updated = await this.prisma.ecoMessageReport.update({
      where: { id: reportId },
      data: {
        resolvedAt: new Date(),
        resolvedBy: adminUserId,
        resolutionNote: note,
      },
      include: {
        message: {
          select: {
            id: true,
            threadId: true,
            assistantText: true,
            kind: true,
          },
        },
      },
    });

    await this.invalidateOverviewCache();

    return {
      id: updated.id,
      reason: updated.reason as PulsoReportReason,
      comment: updated.comment,
      createdAt: updated.createdAt,
      userId: updated.userId,
      messageId: updated.messageId,
      threadId: updated.message.threadId,
      messageKind: updated.message.kind as PulsoReportRow["messageKind"],
      assistantTextSnippet: snippet(updated.message.assistantText, 240),
      resolvedAt: updated.resolvedAt,
      resolvedBy: updated.resolvedBy,
      resolutionNote: updated.resolutionNote,
    };
  }

  // ── POST /api/pulso/reports/eco/:id/unresolve ───────────────────────

  /**
   * Sprint S49 — reopen a previously-resolved report. Clears all three
   * resolution columns. Symmetric inverse of `markResolved`.
   */
  async markUnresolved(reportId: string): Promise<PulsoReportRow> {
    const existing = await this.prisma.ecoMessageReport.findUnique({
      where: { id: reportId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("REPORT_NOT_FOUND");
    }

    const updated = await this.prisma.ecoMessageReport.update({
      where: { id: reportId },
      data: {
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      },
      include: {
        message: {
          select: {
            id: true,
            threadId: true,
            assistantText: true,
            kind: true,
          },
        },
      },
    });

    await this.invalidateOverviewCache();

    return {
      id: updated.id,
      reason: updated.reason as PulsoReportReason,
      comment: updated.comment,
      createdAt: updated.createdAt,
      userId: updated.userId,
      messageId: updated.messageId,
      threadId: updated.message.threadId,
      messageKind: updated.message.kind as PulsoReportRow["messageKind"],
      assistantTextSnippet: snippet(updated.message.assistantText, 240),
      resolvedAt: updated.resolvedAt,
      resolvedBy: updated.resolvedBy,
      resolutionNote: updated.resolutionNote,
    };
  }

  /**
   * Sprint S49 — proactively invalidate the overview cache when the backlog
   * count is likely to have changed (resolve/unresolve). Fire-and-forget;
   * a failure here just means the admin sees stale data for up to 5min,
   * which is acceptable.
   */
  private async invalidateOverviewCache(): Promise<void> {
    try {
      await this.redis.del(PulsoService.OVERVIEW_CACHE_KEY);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate pulso overview cache: ${(err as Error).message}`,
      );
    }
  }

  // ── GET /api/pulso/overview ─────────────────────────────────────────

  /**
   * Sprint S48 — platform overview KPIs.
   *
   * Single multi-block payload covering users, engagement, content, and
   * business. The response shape is intentionally narrow: integer counts
   * only, no per-user identifiers, no content snippets. That makes it safe
   * to log + share inside the team.
   *
   * Period semantics:
   *   - "Today"     → last 24h from now (UTC).
   *   - "This week" → last 7 days from now (UTC).
   *   - "This month"→ last 30 days from now (UTC).
   * Rolling windows, NOT calendar boundaries — gives smoother delta
   * indicators when we add "vs previous period" in S49+.
   *
   * Cost:
   *   - 12 cheap `count` queries against indexed columns.
   *   - 4 `findMany({ select: { id }, distinct: ['userId'] })` style joins
   *     for DAU/WAU/MAU.
   *   On a 50k-user base the aggregate is <100ms uncached. We still cache
   *   5min because admin dashboards reload aggressively.
   */
  async getOverview(): Promise<PulsoOverviewResponse> {
    // ── Cache hit ────────────────────────────────────────────────────
    const cached = await this.redis
      .get(PulsoService.OVERVIEW_CACHE_KEY)
      .catch(() => null);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as PulsoOverviewResponse;
        return {
          ...parsed,
          generatedAt: new Date(parsed.generatedAt),
        };
      } catch {
        // Bad payload (format change) — recompute and refresh.
      }
    }

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const day = new Date(now.getTime() - dayMs);
    const week = new Date(now.getTime() - 7 * dayMs);
    const month = new Date(now.getTime() - 30 * dayMs);

    // ── Users block ─────────────────────────────────────────────────
    const [usersTotal, newToday, newWeek, newMonth] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: day } } }),
      this.prisma.user.count({ where: { createdAt: { gte: week } } }),
      this.prisma.user.count({ where: { createdAt: { gte: month } } }),
    ]);
    const users: PulsoOverviewUsersBlock = {
      total: usersTotal,
      newToday,
      newThisWeek: newWeek,
      newThisMonth: newMonth,
    };

    // ── Engagement block (DAU/WAU/MAU) ──────────────────────────────
    // Active = at least one diary entry, eco user-message, voice transcription,
    // or reading session in the period. We union the distinct userIds.
    const [dau, wau, mau] = await Promise.all([
      this.countActiveUsers(day),
      this.countActiveUsers(week),
      this.countActiveUsers(month),
    ]);
    const engagement: PulsoOverviewEngagementBlock = { dau, wau, mau };

    // ── Content block ───────────────────────────────────────────────
    const [
      diaryEntriesThisWeek,
      ecoMessagesThisWeek,
      ecoCrisisThisWeek,
      voiceSecondsThisWeek,
      readingSessionsThisWeek,
    ] = await Promise.all([
      this.prisma.diaryEntry.count({ where: { createdAt: { gte: week } } }),
      this.prisma.ecoMessage.count({
        where: { createdAt: { gte: week }, kind: "USER" },
      }),
      this.prisma.ecoMessage.count({
        where: { createdAt: { gte: week }, kind: "CRISIS" },
      }),
      this.prisma.voiceTranscription.aggregate({
        where: { createdAt: { gte: week } },
        _sum: { durationSec: true },
      }),
      this.prisma.readingSession.count({
        where: {
          // Heartbeat (S6 lector) bumps `lastSeenAt` every 5s while the user
          // is actively reading — treat that as the "session happened"
          // signal rather than startedAt (a started-but-abandoned session
          // shouldn't count).
          lastSeenAt: { gte: week },
        },
      }),
    ]);
    const voiceSecTotal = voiceSecondsThisWeek._sum.durationSec ?? 0;
    const content: PulsoOverviewContentBlock = {
      diaryEntriesThisWeek,
      ecoMessagesThisWeek,
      ecoCrisisThisWeek,
      // Round to nearest minute; admin dashboards don't care about seconds.
      voiceMinutesThisWeek: Math.round(voiceSecTotal / 60),
      readingSessionsThisWeek,
    };

    // ── Business block ───────────────────────────────────────────────
    const [paidUsers, reportsBacklog] = await Promise.all([
      this.prisma.user.count({
        where: { plan: { in: ["PRO", "ANNUAL", "B2B"] } },
      }),
      // Sprint S49 — backlog narrows to open (unresolved) reports. The
      // resolvedAt column is null for triaged-pending rows; the index
      // EcoMessageReport_resolvedAt_createdAt_idx makes this count cheap.
      this.prisma.ecoMessageReport.count({
        where: { resolvedAt: null },
      }),
    ]);
    const business: PulsoOverviewBusinessBlock = {
      paidUsers,
      reportsBacklog,
    };

    // Sprint S50 — time series + deltas. Pulled from the materialised
    // PlatformMetricDaily table written nightly by the snapshot processor.
    const { series, deltas } = await this.buildSeriesAndDeltas(now);

    const response: PulsoOverviewResponse = {
      generatedAt: now,
      period: {
        from: month.toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10),
      },
      users,
      engagement,
      content,
      business,
      series,
      deltas,
    };

    // Fire-and-forget cache write.
    this.redis
      .setex(
        PulsoService.OVERVIEW_CACHE_KEY,
        PulsoService.OVERVIEW_CACHE_TTL_SECONDS,
        JSON.stringify(response),
      )
      .catch((err) =>
        this.logger.warn(
          `Failed to cache pulso overview: ${(err as Error).message}`,
        ),
      );

    return response;
  }

  /**
   * Count distinct users with ANY activity since `since` (diary, eco user
   * message, voice transcription, or reading session). We do this by
   * unioning the distinct userIds across tables instead of relying on
   * a single "last_active" column we don't have yet.
   */
  private async countActiveUsers(since: Date): Promise<number> {
    const [diary, eco, voice, reader] = await Promise.all([
      this.prisma.diaryEntry.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.ecoMessage.findMany({
        where: { createdAt: { gte: since }, kind: "USER" },
        select: { thread: { select: { userId: true } } },
        distinct: ["threadId"],
      }),
      this.prisma.voiceTranscription.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.readingSession.findMany({
        where: { lastSeenAt: { gte: since } },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

    const set = new Set<string>();
    for (const row of diary) set.add(row.userId);
    for (const row of eco) {
      if (row.thread?.userId) set.add(row.thread.userId);
    }
    for (const row of voice) set.add(row.userId);
    for (const row of reader) set.add(row.userId);
    return set.size;
  }

  /**
   * Sprint S50 — build the daily time series + percent deltas from
   * `PlatformMetricDaily`. The table is written nightly by the snapshot
   * processor; if it hasn't accumulated history yet, we return zero-filled
   * arrays + null deltas so the frontend can degrade gracefully.
   *
   * Zero-fill strategy: we pad the window to exactly N days (oldest →
   * newest) by walking the calendar from `now - N` and looking up each
   * day in a Map. Missing days become 0, so the sparkline draws a clean
   * baseline rather than guessing dates from sparse data.
   */
  private async buildSeriesAndDeltas(now: Date): Promise<{
    series: PulsoOverviewSeries;
    deltas: PulsoOverviewDeltas;
  }> {
    const N = PulsoService.SERIES_WINDOW_DAYS;
    const dayMs = 24 * 60 * 60 * 1000;
    const todayUtc = new Date(now);
    todayUtc.setUTCHours(0, 0, 0, 0);
    // Window: the last N days INCLUDING yesterday (snapshots are built for
    // closed days, so "today" hasn't been written yet).
    const windowEnd = new Date(todayUtc.getTime() - dayMs); // yesterday 00:00 UTC
    const windowStart = new Date(windowEnd.getTime() - (N - 1) * dayMs);

    const rows = await this.prisma.platformMetricDaily.findMany({
      where: { day: { gte: windowStart, lte: windowEnd } },
      orderBy: { day: "asc" },
    });

    const byDay = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      byDay.set(r.day.toISOString().slice(0, 10), r);
    }

    const dau: number[] = [];
    const paidUsers: number[] = [];
    const diaryEntries: number[] = [];
    const ecoMessages: number[] = [];
    const ecoCrisis: number[] = [];
    const reportsOpened: number[] = [];
    const reportsResolved: number[] = [];

    for (let i = 0; i < N; i++) {
      const day = new Date(windowStart.getTime() + i * dayMs);
      const key = day.toISOString().slice(0, 10);
      const row = byDay.get(key);
      dau.push(row?.dau ?? 0);
      paidUsers.push(row?.paidUsers ?? 0);
      diaryEntries.push(row?.diaryEntries ?? 0);
      ecoMessages.push(row?.ecoMessages ?? 0);
      ecoCrisis.push(row?.ecoCrisis ?? 0);
      reportsOpened.push(row?.reportsOpened ?? 0);
      reportsResolved.push(row?.reportsResolved ?? 0);
    }

    const series: PulsoOverviewSeries = {
      windowDays: N,
      dau,
      paidUsers,
      diaryEntries,
      ecoMessages,
      ecoCrisis,
      reportsOpened,
      reportsResolved,
    };

    const deltas: PulsoOverviewDeltas = {
      dau: percentDelta(dau),
      diaryEntries: percentDelta(diaryEntries),
      ecoMessages: percentDelta(ecoMessages),
      reportsOpened: percentDelta(reportsOpened),
      reportsResolved: percentDelta(reportsResolved),
    };

    return { series, deltas };
  }
}

/**
 * Sprint S50 — percent change of last-7 vs prev-7 days from a length-N
 * series (oldest → newest). Returns:
 *   - `null` when the series is too short (< 14 days of history).
 *   - `null` when the previous-week sum is 0 AND the current-week sum is
 *     also 0 (no signal).
 *   - `Infinity` mapped to a large clamped value when previous is 0 and
 *     current isn't — we surface "+999%" rather than divide by zero.
 *   - Otherwise a number rounded to one decimal.
 *
 * Why last-7 vs prev-7 rather than last-day vs prev-day:
 *   - Less noisy. A single weekday spike doesn't dominate.
 *   - Matches the weekly cadence admins are used to comparing.
 */
function percentDelta(series: readonly number[]): number | null {
  if (series.length < 14) return null;
  const last7 = series.slice(-7).reduce((a, b) => a + b, 0);
  const prev7 = series.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (prev7 === 0 && last7 === 0) return null;
  if (prev7 === 0) return 999; // clamp; the UI renders "+>999%"
  const pct = ((last7 - prev7) / prev7) * 100;
  return Math.round(pct * 10) / 10;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function snippet(text: string | null, max: number): string {
  if (!text) return "";
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Sprint S49 — translate a status filter into a Prisma where fragment.
 *
 *  - `open`     → resolvedAt IS NULL
 *  - `resolved` → resolvedAt IS NOT NULL
 *  - `all`      → no constraint (empty object spreads as a no-op)
 *
 * Returned as a partial object so callers can `...spread` it alongside
 * other clauses without nullish checks.
 */
function statusWhereClause(status: PulsoReportStatus): {
  resolvedAt?: null | { not: null };
} {
  if (status === "open") return { resolvedAt: null };
  if (status === "resolved") return { resolvedAt: { not: null } };
  return {};
}
