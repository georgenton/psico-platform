import { Injectable, NotFoundException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { EmotionalMapService } from "../emotional-map";
import { ActivityService } from "../activity";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EcoSuggestionService } from "../eco/eco-suggestions.service";
import type {
  AmbientId,
  CoverToken,
  DismissReflectionPromptResponse,
  HomeContinueBook,
  HomeEcoMoment,
  HomeGreeting,
  HomeReco,
  HomeReflectionPrompt,
  HomeResponse,
  HomeShortcut,
  HomeStats,
  HomeUser,
  InsightToday,
  UpdateUserMoodResponse,
} from "@psico/types";
import { AMBIENT_IDS } from "@psico/types";

// ─── Greeting rules ──────────────────────────────────────────────────────────
//
// The greeting text + subtitle changes by (hour-of-day, mood). The backend
// owns the rule because it ships translated copy. The frontend just renders.
// Time buckets are intentionally coarse — we don't need 5-minute precision.

type TimeBucket = "morning" | "afternoon" | "evening" | "night";

const GREETINGS: Record<TimeBucket, { text: string; subtitle: string | null }> =
  {
    morning: { text: "Buen día", subtitle: "Empecemos con calma." },
    afternoon: {
      text: "Hola de nuevo",
      subtitle: "Un buen momento para una pausa.",
    },
    evening: {
      text: "Buenas tardes",
      subtitle: "Cierra el día con una pequeña práctica.",
    },
    night: {
      text: "Te leo en la noche",
      subtitle: "Una lectura corta antes de dormir.",
    },
  };

// Mood-aware overrides keyed by mood token. The keys mirror what the seed
// emits via OnboardingMood; we tolerate unknown moods by falling back.
const MOOD_OVERRIDES: Record<string, { text: string; subtitle: string }> = {
  calma: {
    text: "Que tu calma se quede contigo",
    subtitle: "Un capítulo corto puede sumar a este momento.",
  },
  foco: {
    text: "Modo foco activado",
    subtitle: "Vamos al siguiente capítulo.",
  },
  energia: {
    text: "Aprovechemos esa energía",
    subtitle: "Hoy puedes avanzar un poco más.",
  },
  reflexion: {
    text: "Hoy hay espacio para pensar",
    subtitle: "Una página, un pensamiento.",
  },
};

const COVER_BUCKETS: CoverToken[] = ["cool", "warm", "mixed"];

const SHORTCUTS_DEFAULT: HomeShortcut[] = [
  { id: "reflexiones", label: "Reflexiones", badge: null },
  { id: "eco", label: "Eco", badge: null },
  { id: "biblioteca", label: "Biblioteca", badge: null },
  { id: "terapia", label: "Terapia", badge: null },
];

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emotionalMap: EmotionalMapService,
    private readonly activity: ActivityService,
    private readonly ecoSuggestions: EcoSuggestionService,
  ) {}

  /**
   * GET /home — aggregator. One DB round-trip per concern, in parallel.
   * Total query cost stays bounded even as we add concerns (target ≤ 1s).
   *
   * Sprint D added `emotionalMap` (cached 24h, mostly free) and `activity`
   * (top 5 interleaved). Both run in the same Promise.all so adding them
   * costs only what the slowest concern costs.
   */
  async getHome(userId: string): Promise<HomeResponse> {
    const [
      user,
      continueBook,
      ecoMoment,
      recos,
      stats,
      prompt,
      ambient,
      emotionalMap,
      activity,
    ] = await Promise.all([
      this.fetchUser(userId),
      this.fetchContinueBook(userId),
      this.fetchEcoMoment(userId),
      this.fetchRecos(userId),
      this.fetchStats(userId),
      this.fetchReflectionPrompt(userId),
      this.fetchAmbient(userId),
      // PR-0.2 — getForHome returns null (never throws) when the map kill switch
      // is off, so Home keeps working with emotionalMap: null.
      this.emotionalMap.getForHome(userId),
      this.activity.feed(userId),
    ]);

    if (!user) throw new NotFoundException("User not found");

    const greeting = this.buildGreeting(user.mood);
    const insightToday = await this.composeInsightToday(
      userId,
      user,
      continueBook,
      stats,
    );

    return {
      user,
      greeting,
      continueBook,
      ecoMoment,
      recos,
      stats,
      reflectionPrompt: prompt,
      shortcuts: SHORTCUTS_DEFAULT,
      ambient,
      insightToday,
      emotionalMap,
      activity,
    };
  }

  /**
   * Active ambient theme — Sprint B1.
   *
   * Falls back to `"calma"` when the user has never opened the AmbiencePicker
   * (no UserPreferences row yet, or row exists with default value).
   */
  private async fetchAmbient(userId: string): Promise<AmbientId> {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { ambient: true },
    });
    const raw = prefs?.ambient ?? "calma";
    return AMBIENT_IDS.includes(raw as AmbientId)
      ? (raw as AmbientId)
      : "calma";
  }

  /**
   * Insight del día — Sprint B1 rule-based v1.
   *
   * Picks the first rule that matches in priority order:
   *   1. `streak` — celebrate a current streak of 3+ days.
   *   2. `mood-trend` — same mood logged ≥3 times in the last 3 days.
   *   3. `book-progress` — user is mid-book (1% < progress < 99%).
   *   4. `neutral` — generic encouragement when nothing fires.
   *
   * v2 swaps this for an LLM call against the same input shape (analog to
   * PatronesService.composeNarrative). Keep the shape stable.
   */
  private async composeInsightToday(
    userId: string,
    user: HomeUser,
    continueBook: HomeContinueBook | null,
    stats: HomeStats,
  ): Promise<InsightToday | null> {
    // Rule 1: streak celebration.
    if (user.streakDays >= 3) {
      return {
        kind: "streak",
        headline: `Llevas ${user.streakDays} días seguidos`,
        body: "Tu constancia es la práctica. Hoy puedes hacer una entrada corta para mantener el ritmo.",
        ctaHref: "/dashboard/reflexiones",
        ctaLabel: "Escribir una reflexión",
      };
    }

    // Rule 2: mood trend over the last 3 days.
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const recentMoods = await this.prisma.moodLog.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { mood: true },
      take: 10,
    });
    if (recentMoods.length >= 3) {
      const counts = new Map<string, number>();
      for (const m of recentMoods)
        counts.set(m.mood, (counts.get(m.mood) ?? 0) + 1);
      const [dominant, n] = [...counts.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0]!;
      if (n >= 3) {
        return {
          kind: "mood-trend",
          headline: `Has registrado "${dominant}" varias veces esta semana`,
          body: "Cuando un mismo estado se repite, suele tener algo que decirte. ¿Lo exploramos en una reflexión?",
          ctaHref: "/dashboard/reflexiones",
          ctaLabel: "Escribir sobre esto",
        };
      }
    }

    // Rule 3: mid-book nudge.
    if (
      continueBook &&
      continueBook.progressPct > 1 &&
      continueBook.progressPct < 99
    ) {
      return {
        kind: "book-progress",
        headline: `Estás a la mitad de "${continueBook.title}"`,
        body: `Un capítulo de hoy te acerca al cierre del libro. Capítulo ${continueBook.chapterN}: ${continueBook.chapterTitle}.`,
        ctaHref: "/dashboard/biblioteca",
        ctaLabel: "Seguir leyendo",
      };
    }

    // Rule 4: neutral fallback — but only if the user has any activity.
    if (stats.minutesThisWeek > 0 || stats.entriesThisWeek > 0) {
      return {
        kind: "neutral",
        headline: "Hoy es un buen día para mirarte con calma",
        body: "Un par de minutos contigo mismo es suficiente. Eco está aquí si necesitas conversar.",
      };
    }

    // No insight when there's nothing to say — let the UI render its empty state.
    return null;
  }

  /**
   * PATCH /user/mood — single source for setting the current mood. The
   * mood id is validated upstream by the DTO against `DIARY_MOOD_IDS`
   * from `@psico/types`; we look up `OnboardingMood` to enrich with the
   * swatch but tolerate a missing row (Sprint B6b renamed the IDs from
   * calma/foco/… to great/good/ok/low/hard, and any DB that hasn't been
   * re-seeded would otherwise dead-end the picker). Mirrors the fallback
   * in `MoodService.log`.
   */
  async updateMood(
    userId: string,
    moodId: string,
  ): Promise<UpdateUserMoodResponse> {
    const mood = await this.prisma.onboardingMood.findUnique({
      where: { id: moodId },
      select: { id: true, swatch: true },
    });
    const fallbackSwatch: Record<string, string> = {
      great: "#7FAE76",
      good: "#A8C7E4",
      ok: "#B8B3AA",
      low: "#8B71F5",
      hard: "#5E42C0",
    };
    const swatch =
      mood?.swatch ?? fallbackSwatch[moodId] ?? "var(--color-warm-400)";

    await this.prisma.user.update({
      where: { id: userId },
      data: { mood: moodId, moodUpdatedAt: new Date() },
    });

    return { ok: true, mood: moodId, swatch };
  }

  /**
   * POST /reflection-prompts/:id/dismiss — soft dismissal. The prompt stays
   * active for other users; the dismissal is per-user and excludes the
   * prompt from this user's Home for 7 days (enforced when fetching).
   */
  async dismissPrompt(
    userId: string,
    promptId: string,
  ): Promise<DismissReflectionPromptResponse> {
    const prompt = await this.prisma.reflectionPrompt.findUnique({
      where: { id: promptId },
      select: { id: true },
    });
    if (!prompt) throw new NotFoundException(`Prompt '${promptId}' not found`);

    await this.prisma.dismissedReflectionPrompt.upsert({
      where: { userId_promptId: { userId, promptId: prompt.id } },
      create: { userId, promptId: prompt.id },
      update: { dismissedAt: new Date() },
    });
    return { ok: true };
  }

  // ─── Internal fetchers ─────────────────────────────────────────────────────

  private async fetchUser(userId: string): Promise<HomeUser | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        name: true,
        city: true,
        plan: true,
        currentStreakDays: true,
        mood: true,
      },
    });
    if (!row) return null;

    return {
      firstName: row.firstName ?? row.name.split(" ")[0] ?? "amig@",
      city: row.city,
      tier: row.plan === "FREE" ? "free" : "pro",
      streakDays: row.currentStreakDays,
      mood: row.mood,
    };
  }

  private async fetchContinueBook(
    userId: string,
  ): Promise<HomeContinueBook | null> {
    // "Continue" = most recent UserProgress row. The chapter the user touched
    // most recently is the chapter shown.
    const latest = await this.prisma.userProgress.findFirst({
      where: { userId },
      orderBy: { completedAt: "desc" },
      include: {
        chapter: {
          select: {
            id: true,
            order: true,
            title: true,
            book: {
              select: {
                id: true,
                title: true,
                cover: true,
                author: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!latest) return null;

    // Compute progress as completed-chapter share of the book.
    const [completedInBook, totalPublishedInBook] = await Promise.all([
      this.prisma.userProgress.count({
        where: {
          userId,
          chapter: { bookId: latest.chapter.book.id, isPublished: true },
        },
      }),
      this.prisma.chapter.count({
        where: { bookId: latest.chapter.book.id, isPublished: true },
      }),
    ]);

    const progressPct =
      totalPublishedInBook > 0
        ? Math.round((completedInBook / totalPublishedInBook) * 100)
        : 0;

    return {
      bookId: latest.chapter.book.id,
      title: latest.chapter.book.title,
      author: latest.chapter.book.author?.name ?? "—",
      cover: this.toCoverToken(latest.chapter.book.cover),
      chapterN: latest.chapter.order,
      chapterTitle: latest.chapter.title,
      progressPct,
      lastReadAt: latest.completedAt,
    };
  }

  private async fetchEcoMoment(userId: string): Promise<HomeEcoMoment | null> {
    // The generic prompt is the first-touch fallback; the adaptive openers
    // (from EcoSuggestionService) carry the personalization. Both run in
    // parallel — suggestions read a Redis-cached map, so cost stays low.
    const [lastConvo, suggestions] = await Promise.all([
      this.prisma.conversation.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      this.ecoSuggestions.topForHome(userId),
    ]);

    // No conversation history → still show the default prompt for first-touch.
    return {
      prompt: "¿Cómo te encontró este día?",
      lastActiveAt: lastConvo?.updatedAt ?? null,
      // Pending messages: design says Eco notif badge. Without a model for
      // unread we return 0; Sprint S10 wires this.
      pendingMessages: 0,
      suggestions,
    };
  }

  private async fetchRecos(userId: string): Promise<HomeReco[]> {
    // 3 latest published books the user hasn't started — same algorithm as
    // BooksService.getRecos, kept here to avoid cross-module DI churn for v1.
    // When PatternsModule lands (S11) this delegates.
    const startedBookIds = await this.prisma.userProgress
      .findMany({
        where: { userId },
        select: { chapter: { select: { bookId: true } } },
      })
      .then((rows) =>
        Array.from(new Set(rows.map((r) => r.chapter.bookId).filter(Boolean))),
      );

    const books = await this.prisma.book.findMany({
      where: {
        isPublished: true,
        id: { notIn: startedBookIds },
      },
      orderBy: { publishedAt: { sort: "desc", nulls: "last" } },
      take: 3,
      select: {
        id: true,
        title: true,
        cover: true,
        plan: true,
        author: { select: { name: true } },
      },
    });

    const userTier = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { plan: true } })
      .then((u) => (u?.plan === "FREE" ? "free" : "pro"));

    return books.map((b) => ({
      id: b.id,
      kind: "book" as const,
      title: b.title,
      byline: b.author?.name ?? "Psicología Educativa",
      cover: this.toCoverToken(b.cover),
      reason: "Nuevo en la biblioteca",
      lockedByTier: userTier === "free" && b.plan !== "FREE",
    }));
  }

  private async fetchStats(userId: string): Promise<HomeStats> {
    // Stats blend two sources:
    //   - Chapter completions (UserProgress) approximate minutes spent.
    //   - DiaryEntry counts feed the journaling progress arc.
    // We DO NOT touch ciphertext here — the count() query reads only the
    // server-visible columns (userId, createdAt).
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const [user, completedThisWeek, entriesThisWeek, insightsCount, tagRows] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            currentStreakDays: true,
            preferences: { select: { weeklyGoalMinutes: true } },
          },
        }),
        this.prisma.userProgress.count({
          where: { userId, completedAt: { gte: since } },
        }),
        this.prisma.diaryEntry.count({
          where: { userId, createdAt: { gte: since } },
        }),
        // Sprint G2b — total WeeklySummary rows.
        this.prisma.weeklySummary.count({ where: { userId } }),
        // Sprint G2b — fetch tags arrays for distinct counting (Prisma can't
        // distinct over array elements directly). Tags are plaintext metadata
        // on DiaryEntry — privacy invariant intact.
        this.prisma.diaryEntry.findMany({
          where: { userId },
          select: { tags: true },
        }),
      ]);

    // Approx 12 min/chapter when chapter.durationMinutes is missing. Diary
    // entries are not counted toward minutesThisWeek because we do not know
    // how long the user spent writing (the ciphertext doesn't carry timing).
    const minutesThisWeek = completedThisWeek * 12;
    const weeklyGoal = user?.preferences?.weeklyGoalMinutes ?? 60;
    const weeklyGoalPct =
      weeklyGoal > 0
        ? Math.min(100, Math.round((minutesThisWeek / weeklyGoal) * 100))
        : 0;

    // Sprint G2b — distinct tag count = pattern proxy. Lowercase before
    // dedupe so "Trabajo" and "trabajo" count as one. Empty tag arrays
    // contribute zero (filter doesn't drop them — flat does).
    const distinctTags = new Set<string>();
    for (const row of tagRows) {
      for (const tag of row.tags) {
        const normalized = tag.trim().toLowerCase();
        if (normalized) distinctTags.add(normalized);
      }
    }

    return {
      minutesThisWeek,
      entriesThisWeek,
      streakDays: user?.currentStreakDays ?? 0,
      weeklyGoalPct,
      insightsCount,
      patternsCount: distinctTags.size,
    };
  }

  private async fetchReflectionPrompt(
    userId: string,
  ): Promise<HomeReflectionPrompt | null> {
    // Exclude prompts the user dismissed in the last 7 days.
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const dismissedRows = await this.prisma.dismissedReflectionPrompt.findMany({
      where: { userId, dismissedAt: { gte: since } },
      select: { promptId: true },
    });
    const excludeIds = dismissedRows.map((d) => d.promptId);

    const prompt = await this.prisma.reflectionPrompt.findFirst({
      where: { isActive: true, id: { notIn: excludeIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true, text: true },
    });
    return prompt ? { id: prompt.id, text: prompt.text } : null;
  }

  private buildGreeting(mood: string | null): HomeGreeting {
    const bucket = this.timeBucket();
    if (mood && MOOD_OVERRIDES[mood]) {
      return {
        text: MOOD_OVERRIDES[mood].text,
        subtitle: MOOD_OVERRIDES[mood].subtitle,
      };
    }
    return GREETINGS[bucket];
  }

  private timeBucket(): TimeBucket {
    const hour = new Date().getHours();
    if (hour < 6) return "night";
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    if (hour < 22) return "evening";
    return "night";
  }

  private toCoverToken(value: string): CoverToken {
    return value === "warm" || value === "mixed" ? value : COVER_BUCKETS[0];
  }
}
