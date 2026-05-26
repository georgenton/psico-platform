import { Injectable, NotFoundException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type {
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
  UpdateUserMoodResponse,
} from "@psico/types";

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
  { id: "diario", label: "Diario", badge: null },
  { id: "eco", label: "Eco", badge: null },
  { id: "biblioteca", label: "Biblioteca", badge: null },
  { id: "terapia", label: "Terapia", badge: null },
];

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /home — aggregator. One DB round-trip per concern, in parallel.
   * Total query cost stays bounded even as we add concerns (target ≤ 1s).
   */
  async getHome(userId: string): Promise<HomeResponse> {
    const [user, continueBook, ecoMoment, recos, stats, prompt] =
      await Promise.all([
        this.fetchUser(userId),
        this.fetchContinueBook(userId),
        this.fetchEcoMoment(userId),
        this.fetchRecos(userId),
        this.fetchStats(userId),
        this.fetchReflectionPrompt(userId),
      ]);

    if (!user) throw new NotFoundException("User not found");

    const greeting = this.buildGreeting(user.mood);

    return {
      user,
      greeting,
      continueBook,
      ecoMoment,
      recos,
      stats,
      reflectionPrompt: prompt,
      shortcuts: SHORTCUTS_DEFAULT,
    };
  }

  /**
   * PATCH /user/mood — single source for setting the current mood. Validates
   * against active OnboardingMood rows so we never persist an unknown token.
   * Reads back the swatch so the front can render the color immediately.
   */
  async updateMood(
    userId: string,
    moodId: string,
  ): Promise<UpdateUserMoodResponse> {
    const mood = await this.prisma.onboardingMood.findUnique({
      where: { id: moodId },
      select: { id: true, swatch: true },
    });
    if (!mood) throw new NotFoundException(`Mood '${moodId}' not found`);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mood: mood.id, moodUpdatedAt: new Date() },
    });

    return { ok: true, mood: mood.id, swatch: mood.swatch };
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
    // The "Eco" prompt rotates daily. We pick a stable prompt of the day —
    // good enough for v1 until the AI-driven personalization arrives in S10.
    // We surface the last conversation activity + a pending message badge.
    const lastConvo = await this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    // No conversation history → still show the default prompt for first-touch.
    return {
      prompt: "¿Cómo te encontró este día?",
      lastActiveAt: lastConvo?.updatedAt ?? null,
      // Pending messages: design says Eco notif badge. Without a model for
      // unread we return 0; Sprint S10 wires this.
      pendingMessages: 0,
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
    // Coarse stats. Diary minutes / entries arrive with DiarioModule (S6).
    // For S5 we return the streak we already track + chapters-read derived
    // counters so the UI can render the weekly arc immediately.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        currentStreakDays: true,
        preferences: { select: { weeklyGoalMinutes: true } },
      },
    });

    // Last 7 days of chapter completions as a stand-in for minutesThisWeek.
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const completedThisWeek = await this.prisma.userProgress.count({
      where: { userId, completedAt: { gte: since } },
    });

    // Approx 12 min/chapter when we don't have chapter.durationMinutes filled.
    const minutesThisWeek = completedThisWeek * 12;
    const weeklyGoal = user?.preferences?.weeklyGoalMinutes ?? 60;
    const weeklyGoalPct =
      weeklyGoal > 0
        ? Math.min(100, Math.round((minutesThisWeek / weeklyGoal) * 100))
        : 0;

    return {
      minutesThisWeek,
      entriesThisWeek: 0,
      streakDays: user?.currentStreakDays ?? 0,
      weeklyGoalPct,
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
