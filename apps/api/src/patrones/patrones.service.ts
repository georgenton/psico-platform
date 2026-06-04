import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Plan } from "@prisma/client";
import type {
  PatronesHourMoodBucket,
  PatronesMoodMapDay,
  PatronesPeriod,
  PatronesPeriodDescriptor,
  PatronesResponse,
  PatronesShareWithTherapistResponse,
  PatronesWeeklySummary,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AIService } from "../ai";

/**
 * PatronesService — Sprint S10.
 *
 * Pro-gated analytics over the user's diary metadata. We deliberately do
 * NOT touch `DiaryEntry.textCiphertext` — the privacy contract from
 * ADR 0007 is that the server only ever sees the cipher of the body. All
 * aggregations here run on plaintext metadata that already lives in the
 * DB indexed:
 *   - `mood` (categorical, captured at entry creation)
 *   - `createdAt` (timestamp)
 *
 * Anything that would require body text (themes, vocab, correlations
 * involving entry content) is left as an empty array in v1 — those need
 * client-side computation post-decrypt and ship in a follow-up sprint.
 */
@Injectable()
export class PatronesService {
  private readonly logger = new Logger(PatronesService.name);
  private static readonly MIN_ENTRIES_FOR_FULL_VIEW = 7;

  // Default swatch when the entry's moodId doesn't map to a catalog row.
  // OnboardingMood may not be seeded in dev — falling back keeps the
  // heatmap renderable instead of throwing.
  private static readonly FALLBACK_SWATCH = "#C7C0B5";

  constructor(
    private readonly prisma: PrismaService,
    // Sprint S38: nullable in spirit — we DO inject AIService, but every
    // call site wraps it in try/catch + rule-based fallback so a missing
    // `ANTHROPIC_API_KEY` or a transient LLM error never breaks the user
    // flow.
    private readonly aiService: AIService,
  ) {}

  // ── GET /api/patrones?period=30d ──────────────────────────────────────

  async getPatrones(
    userId: string,
    userPlan: Plan,
    period: PatronesPeriod,
  ): Promise<PatronesResponse> {
    const periodDescriptor = this.resolvePeriod(period);

    // FREE users get a `locked: true` shell so the UI can render the
    // paywall preview without us 403-ing the entire response. The UX
    // benefit of a soft-lock outweighs the small risk of metadata leak
    // (entryCount only).
    if (userPlan === "FREE") {
      const entryCount = await this.prisma.diaryEntry.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(`${periodDescriptor.from}T00:00:00.000Z`),
            lte: new Date(`${periodDescriptor.to}T23:59:59.999Z`),
          },
        },
      });
      return this.emptyResponse({
        tier: "free",
        period: periodDescriptor,
        entryCount,
        locked: true,
      });
    }

    // PRO+. Pull the entries' metadata for the period in a single query.
    const entries = await this.prisma.diaryEntry.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(`${periodDescriptor.from}T00:00:00.000Z`),
          lte: new Date(`${periodDescriptor.to}T23:59:59.999Z`),
        },
      },
      select: { mood: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    // Catalog lookup so we can resolve swatches for the heatmap.
    const catalog = await this.prisma.onboardingMood.findMany({
      where: { isActive: true },
      select: { id: true, swatch: true },
    });
    const swatchByMoodId = new Map<string, string>();
    for (const m of catalog) swatchByMoodId.set(m.id, m.swatch);

    const moodMap = this.aggregateMoodMap(entries, swatchByMoodId);
    const hourMood = this.aggregateHourMood(entries);

    // Latest weekly summary (if any). Worker S10 produces these every
    // Monday; the user can also force one via POST /weekly-summary/regenerate.
    const latest = await this.prisma.weeklySummary.findFirst({
      where: { userId },
      orderBy: { weekStart: "desc" },
    });

    return this.emptyResponse({
      tier: "pro",
      period: periodDescriptor,
      entryCount: entries.length,
      locked: false,
      moodMap,
      hourMood,
      weeklySummary: latest ? this.serialiseSummary(latest) : null,
    });
  }

  // ── POST /api/patrones/weekly-summary/regenerate ──────────────────────

  /**
   * Triggers a fresh weekly summary now. Used both by the UI button and
   * by the BullMQ worker (cron Monday 03:00 UTC).
   *
   * v1: we compose the narrative inline here instead of pushing to the
   * `weekly-summary` queue. The composition is short (~1 LLM call) so the
   * synchronous path keeps the UX simple. When usage grows enough that
   * concurrent regenerates choke the API, move it to the worker.
   *
   * Throws when:
   *  - FREE plan (caller layer handles 403 via @RequiredPlan PRO)
   *  - Less than MIN_ENTRIES_FOR_FULL_VIEW entries in the past week
   *    (422 from the controller — see comments there).
   */
  async regenerateWeeklySummary(
    userId: string,
    userPlan: Plan,
  ): Promise<PatronesWeeklySummary> {
    if (userPlan === "FREE") throw new ForbiddenException("PRO_REQUIRED");

    const weekStart = this.startOfThisISOWeek();
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const entries = await this.prisma.diaryEntry.findMany({
      where: { userId, createdAt: { gte: weekStart, lt: weekEnd } },
      // Sprint S38: include `tags` so the LLM can mention recurring topics
      // (the tag tokens are plaintext metadata, never the body cipher).
      select: { mood: true, createdAt: true, tags: true },
    });

    if (entries.length < PatronesService.MIN_ENTRIES_FOR_FULL_VIEW) {
      // Caller sees 422; tests assert.
      throw new Error("NOT_ENOUGH_ENTRIES");
    }

    // Sprint S38: try the LLM first. The aggregate stats we pass are
    // EXACTLY what the rule-based composer already had access to — no diary
    // body, no plaintext content, only categorical counts. If the LLM call
    // fails (missing key, network blip, parse mismatch), drop back to the
    // deterministic narrative so the user never sees an empty card.
    const { headline, narrative } = await this.buildNarrative(
      entries,
      weekStart,
    );

    const row = await this.prisma.weeklySummary.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      create: {
        userId,
        weekStart,
        headline,
        narrative,
        entriesUsed: entries.length,
        generatedAt: new Date(),
      },
      update: {
        headline,
        narrative,
        entriesUsed: entries.length,
        generatedAt: new Date(),
      },
    });

    return this.serialiseSummary(row);
  }

  // ── POST /api/patrones/share-with-therapist ───────────────────────────

  /**
   * v1 stub. Real implementation lands with TerapiaModule (Sprint S13).
   * Returns 200 with `{ status: "stub" }` so the UI can ack and surface a
   * "próximamente" toast instead of breaking.
   */
  shareWithTherapist(): PatronesShareWithTherapistResponse {
    return { ok: true, status: "stub" };
  }

  // ───────────────────────────────────────────────────────────────────
  // Aggregation helpers
  // ───────────────────────────────────────────────────────────────────

  private aggregateMoodMap(
    entries: Array<{ mood: string; createdAt: Date }>,
    swatchByMoodId: Map<string, string>,
  ): PatronesMoodMapDay[] {
    // Group by ISO date — keep the most recent mood per day. If a user
    // logs more than one entry the same day, the latest one drives the
    // heatmap cell color (matches what the user "left the day as").
    const byDate = new Map<string, { mood: string; createdAt: Date }>();
    for (const e of entries) {
      const iso = e.createdAt.toISOString().slice(0, 10);
      const existing = byDate.get(iso);
      if (!existing || existing.createdAt < e.createdAt) {
        byDate.set(iso, e);
      }
    }
    return Array.from(byDate.entries())
      .map(([date, { mood }]) => ({
        date,
        moodId: mood,
        swatch: swatchByMoodId.get(mood) ?? PatronesService.FALLBACK_SWATCH,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private aggregateHourMood(
    entries: Array<{ mood: string; createdAt: Date }>,
  ): PatronesHourMoodBucket[] {
    const buckets: Record<number, Record<string, number>> = {};
    for (let h = 0; h < 24; h++) buckets[h] = {};
    for (const e of entries) {
      const h = e.createdAt.getUTCHours();
      buckets[h]![e.mood] = (buckets[h]![e.mood] ?? 0) + 1;
    }
    return Object.entries(buckets).map(([hourStr, moodCounts]) => ({
      hour: Number(hourStr),
      moodCounts,
    }));
  }

  // ───────────────────────────────────────────────────────────────────
  // Narrative composition — Sprint S38: LLM-first with deterministic
  // fallback. Aggregates are computed once and shared between paths so the
  // LLM and the fallback see EXACTLY the same view of the week.
  // ───────────────────────────────────────────────────────────────────

  /**
   * Try the LLM-backed narrative; on any failure (missing key, network,
   * parse error) fall back to the deterministic composer. The aggregate
   * stats we pass to the model are metadata-only — no diary body, no
   * plaintext content.
   */
  private async buildNarrative(
    entries: Array<{ mood: string; createdAt: Date; tags: string[] }>,
    weekStart: Date,
  ): Promise<{ headline: string; narrative: string }> {
    const stats = computeWeeklyStats(entries, weekStart);
    try {
      return await this.aiService.generateWeeklyNarrative(stats);
    } catch (err) {
      this.logger.warn(
        `LLM weekly-narrative failed (${(err as Error).message}); using rule-based fallback`,
      );
      return this.composeNarrative(entries);
    }
  }

  /**
   * Deterministic fallback (also kept for the test path). Operates on the
   * SAME entry shape as `buildNarrative`, but only looks at mood + count.
   */
  private composeNarrative(entries: Array<{ mood: string; createdAt: Date }>): {
    headline: string;
    narrative: string;
  } {
    const moodCounts: Record<string, number> = {};
    for (const e of entries) {
      moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + 1;
    }
    const sorted = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0]?.[0] ?? "calma";
    const headline = `Esta semana llegaste a ${entries.length} entradas con ${dominant} como tono dominante.`;
    const narrative = [
      `Diste pasos pequeños y constantes esta semana — ${entries.length} entradas son una señal clara de que el espacio del diario te está sirviendo.`,
      `El estado emocional que más nombraste fue **${dominant}**. Notalo sin juzgar: tu cuerpo está haciendo un trabajo silencioso.`,
      `Para la próxima semana, intenta una sola cosa nueva: nombrar la emoción antes de describirla. A veces ese pequeño cambio de orden destraba la escritura.`,
    ].join("\n\n");
    return { headline, narrative };
  }

  // ───────────────────────────────────────────────────────────────────
  // Period / serialisation helpers
  // ───────────────────────────────────────────────────────────────────

  private resolvePeriod(period: PatronesPeriod): PatronesPeriodDescriptor {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const to = today.toISOString().slice(0, 10);
    const days = period === "30d" ? 30 : period === "90d" ? 90 : 365;
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const from = start.toISOString().slice(0, 10);
    const label =
      period === "30d"
        ? "Últimos 30 días"
        : period === "90d"
          ? "Últimos 3 meses"
          : "Último año";
    return { from, to, label };
  }

  private startOfThisISOWeek(): Date {
    // Monday 00:00 UTC of the current week.
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const day = now.getUTCDay(); // 0 (Sun) – 6 (Sat)
    const diff = day === 0 ? 6 : day - 1;
    now.setUTCDate(now.getUTCDate() - diff);
    return now;
  }

  private serialiseSummary(row: {
    weekStart: Date;
    headline: string;
    narrative: string;
    entriesUsed: number;
    generatedAt: Date;
  }): PatronesWeeklySummary {
    return {
      weekStart: row.weekStart,
      headline: row.headline,
      narrative: row.narrative,
      entriesUsed: row.entriesUsed,
      generatedAt: row.generatedAt,
    };
  }

  private emptyResponse(partial: {
    tier: "free" | "pro";
    period: PatronesPeriodDescriptor;
    entryCount: number;
    locked: boolean;
    moodMap?: PatronesMoodMapDay[];
    hourMood?: PatronesHourMoodBucket[];
    weeklySummary?: PatronesWeeklySummary | null;
  }): PatronesResponse {
    return {
      tier: partial.tier,
      period: partial.period,
      entryCount: partial.entryCount,
      locked: partial.locked,
      hourMood: partial.hourMood ?? [],
      moodMap: partial.moodMap ?? [],
      themes: [],
      correlations: [],
      ecoNotes: [],
      vocab: [],
      weeklySummary: partial.weeklySummary ?? null,
    };
  }
}

// ─── Helpers (module-level, side-effect-free) ─────────────────────────────

/**
 * Compute the aggregate stats we hand to the LLM. The shape is intentionally
 * narrow — categorical counts only. The model never receives the entry body
 * (it's encrypted and we don't have the key) nor anything that could leak
 * the diary's textual content. The same stats also drive the rule-based
 * fallback so both paths are auditable identically.
 */
export function computeWeeklyStats(
  entries: Array<{ mood: string; createdAt: Date; tags: string[] }>,
  weekStart: Date,
): {
  entryCount: number;
  dominantMood: string;
  moodCounts: Record<string, number>;
  topTags: string[];
  weekStartIso: string;
} {
  const moodCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  for (const e of entries) {
    moodCounts[e.mood] = (moodCounts[e.mood] ?? 0) + 1;
    for (const t of e.tags) {
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
  }
  const dominantMood =
    Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "calma";
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  return {
    entryCount: entries.length,
    dominantMood,
    moodCounts,
    topTags,
    weekStartIso: weekStart.toISOString().slice(0, 10),
  };
}
