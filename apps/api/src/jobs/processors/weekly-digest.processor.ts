import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PushService } from "../../notifications/push.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ResendService } from "../../notifications/resend.service";
import { weeklyDigestEmail } from "../../notifications/templates/weekly-digest.template";
import {
  JobName,
  QueueName,
  type WeeklyDigestJobPayload,
} from "../queue-names";
import { userLocalHour, userLocalWeekday } from "../utils/timezone";

/**
 * Sprint S53 — target local time at which a user receives the weekly
 * digest. Sunday=0, Monday=1, ..., Saturday=6 (matches `Date.getDay()`).
 */
const DIGEST_TARGET_HOUR = 7;
const DIGEST_TARGET_WEEKDAY = 1; // Monday

/**
 * Sprint S44 — WeeklyDigestProcessor (revised in S53 to be timezone-aware).
 *
 * Cron fires HOURLY UTC. For each user with `NotificationSettings
 * .weeklyReport === true`, we compute the user's local hour + local
 * weekday at the cron's `now` using `Profile.timezone`. If both match
 * the digest target (Monday 07:00), we send. Users without a timezone
 * fall back to UTC — preserves S44 behavior for legacy accounts until
 * the client auto-detects on next login.
 *
 * Sends:
 *   - Email digest via Resend (always — every user has an email).
 *   - Push notification via Expo (only when the user has device tokens
 *     AND `dailyReminder === true` — we reuse dailyReminder as the
 *     "I'm OK with push" gate; the dedicated weeklyReport flag controls
 *     the email).
 *
 * Privacy contract: the LLM is NEVER called here, and the email body
 * NEVER includes diary text or ciphertext. Only categorical counts and
 * the user's own tag tokens (plaintext metadata).
 *
 * Idempotency: re-running for the same Monday is safe — no DB writes
 * beyond optional `lastNudgedAt` bump (which we don't update from this
 * processor; that field belongs to the InactiveNudgeProcessor).
 */
@Processor(QueueName.WEEKLY_DIGEST)
export class WeeklyDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(WeeklyDigestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resend: ResendService,
    private readonly push: PushService,
  ) {
    super();
  }

  async process(job: Job<WeeklyDigestJobPayload>): Promise<void> {
    if (job.name !== JobName.RUN_WEEKLY_DIGEST) {
      throw new Error(`WeeklyDigestProcessor unknown job: ${job.name}`);
    }

    const weekStart = this.resolveWeekStart(job.data.targetWeekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    // Sprint S53 — Capture `now` once per run so all per-user TZ checks
    // use a consistent reference instant. Tests may inject `nowIso` to
    // exercise the TZ gate at arbitrary moments without wall-clock noise.
    const now = job.data.nowIso
      ? new Date(job.data.nowIso)
      : job.data.targetWeekStart
        ? weekStart
        : new Date();
    this.logger.log(
      `WeeklyDigest start · weekStart=${weekStart.toISOString().slice(0, 10)} · nowUtcHour=${now.getUTCHours()}`,
    );

    // Fetch all users opted-in to the weekly report. We filter by JOIN
    // here so we don't iterate inactive accounts. `profile.timezone`
    // pulled in so the per-user TZ gate has what it needs.
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        notificationSettings: { is: { weeklyReport: true } },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        name: true,
        notificationSettings: { select: { dailyReminder: true } },
        deviceTokens: { select: { token: true } },
        profile: { select: { timezone: true } },
      },
    });

    this.logger.log(`WeeklyDigest fanout · candidates=${users.length}`);

    // Sprint S53 — Per-user TZ gate. If `targetWeekStart` was passed in
    // the payload, skip the gate entirely (manual replay / test path).
    const replayMode = Boolean(job.data.targetWeekStart);

    let sent = 0;
    let skipped = 0;
    for (const u of users) {
      try {
        if (!replayMode) {
          const tz = u.profile?.timezone ?? null;
          const localHour = userLocalHour(now, tz);
          const localWeekday = userLocalWeekday(now, tz);
          if (
            localHour !== DIGEST_TARGET_HOUR ||
            localWeekday !== DIGEST_TARGET_WEEKDAY
          ) {
            skipped++;
            continue;
          }
        }
        await this.sendDigestForUser(u, weekStart, weekEnd);
        sent++;
      } catch (err) {
        // One user's failure must not abort the entire run.
        this.logger.error(
          `WeeklyDigest failed for user=${u.id}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `WeeklyDigest done · sent=${sent} · skippedByTz=${skipped} · total=${users.length}`,
    );
  }

  // ─── Per-user processing ─────────────────────────────────────────────

  private async sendDigestForUser(
    user: {
      id: string;
      email: string;
      firstName: string | null;
      name: string;
      notificationSettings: { dailyReminder: boolean } | null;
      deviceTokens: Array<{ token: string }>;
    },
    weekStart: Date,
    weekEnd: Date,
  ): Promise<void> {
    const entries = await this.prisma.diaryEntry.findMany({
      where: { userId: user.id, createdAt: { gte: weekStart, lt: weekEnd } },
      // PR-2B — the digest reports only moods the server vouches for. Raw
      // `mood` may hold an ineligible/legacy value; we count the normalized
      // mood ONLY when the row is eligible for dynamics. Tags are independent
      // and always count (see the loop below).
      select: {
        moodNormalized: true,
        moodEligibleForDynamics: true,
        tags: true,
      },
    });
    const ecoMessages = await this.prisma.ecoMessage.count({
      where: {
        kind: "USER",
        thread: { userId: user.id },
        createdAt: { gte: weekStart, lt: weekEnd },
      },
    });

    const moodCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    for (const e of entries) {
      // PR-2A/2B — a reflexión without an eligible explicit check-in is not a
      // mood observation, so it contributes no mood count (its tags still
      // count). Only an eligible, normalized mood is counted; a null or
      // ineligible mood is never coalesced into a neutral bucket.
      const mood =
        e.moodEligibleForDynamics && e.moodNormalized != null
          ? e.moodNormalized
          : null;
      if (mood != null) moodCounts[mood] = (moodCounts[mood] ?? 0) + 1;
      for (const t of e.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
    const dominantMood =
      Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t);

    // Sprint S45: pull the WeeklySummary row (S38 LLM narrative) if one
    // was generated for the target week. We don't generate one here —
    // that's PatronesService's job, triggered by the user or by ops.
    // The digest is purely a consumer: if a narrative exists, it lives
    // at the top of the email; if not, the stats stand on their own.
    const summary = await this.prisma.weeklySummary.findUnique({
      where: { userId_weekStart: { userId: user.id, weekStart } },
      select: { headline: true, narrative: true },
    });

    // Email — always send to opted-in users (the JOIN already filtered).
    const email = weeklyDigestEmail({
      firstName: user.firstName ?? user.name,
      weekStartIso: weekStart.toISOString().slice(0, 10),
      diaryEntries: entries.length,
      ecoMessages,
      dominantMood,
      topTags,
      // Web base URL — config later. Hardcoded for v1 (matches Vercel).
      patronesUrl: "https://psico-platform-web.vercel.app/dashboard/patrones",
      narrative: summary
        ? { headline: summary.headline, body: summary.narrative }
        : undefined,
    });
    await this.resend.send({
      to: user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tag: email.tag,
    });

    // Push — only if the user has tokens AND dailyReminder is true. The
    // weeklyReport flag controls email; dailyReminder gates push (it's
    // the "I'm OK being interrupted" flag).
    const pushOk = user.notificationSettings?.dailyReminder ?? true;
    if (pushOk && user.deviceTokens.length > 0) {
      const tokens = user.deviceTokens.map((d) => d.token);
      try {
        const receipts = await this.push.sendToTokens(tokens, {
          title:
            entries.length === 0
              ? "Tu espacio te espera"
              : `Tu semana · ${entries.length} ${entries.length === 1 ? "entrada" : "entradas"}`,
          body:
            entries.length === 0
              ? "Esta semana no escribiste. Empieza con una entrada hoy."
              : `${entries.length} entradas, ${ecoMessages} con Eco. Revisa tu mapa.`,
          url: "/(tabs)/patrones",
        });
        // Self-cleaning: prune Expo's DeviceNotRegistered tokens.
        const stales = receipts
          .map((r) => r.invalidToken)
          .filter((t): t is string => Boolean(t));
        if (stales.length > 0) {
          await this.prisma.deviceToken.deleteMany({
            where: { token: { in: stales } },
          });
          this.logger.log(
            `WeeklyDigest pruned ${stales.length} stale tokens for user=${user.id}`,
          );
        }
      } catch (err) {
        // Push transport error doesn't fail the digest — email is the
        // canonical channel.
        this.logger.warn(
          `WeeklyDigest push failed for user=${user.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * "Last week's Monday in UTC" by default, or the override from the
   * payload (for ops backfills). Always returns Monday 00:00:00 UTC.
   */
  private resolveWeekStart(override: string | undefined): Date {
    if (override) {
      const d = new Date(`${override}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    // 0 (Sun) → 6 (previous Sat), 1 (Mon) → 0 (today is Monday), etc.
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    now.setUTCDate(now.getUTCDate() - diff - 7); // back one full week
    return now;
  }
}
