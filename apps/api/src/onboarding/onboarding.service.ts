import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  OnboardingBookRecommendation,
  OnboardingIntro,
  OnboardingMood,
  OnboardingMotivo,
  OnboardingRecommendationResponse,
  OnboardingTourStep,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type { OnboardingStep1Dto } from "./dto/step1.dto";
import type { OnboardingStep2Dto } from "./dto/step2.dto";
import type { OnboardingStep3Dto } from "./dto/step3.dto";
import type { OnboardingCompleteDto } from "./dto/complete.dto";
import type { OnboardingTourCompleteDto } from "./dto/tour-complete.dto";
import {
  FALLBACK_BOOK_SLUG,
  FALLBACK_REASON,
  MARINA_INTRO,
  RECOMMENDATION_BY_MOTIVO,
  RECOMMENDATION_REASON,
  TOUR_STEPS,
} from "./constants";

/**
 * Service for the 11-endpoint onboarding flow defined in
 * `docs/design/handoff/01-onboarding.md`.
 *
 * Invariants:
 *  - All endpoints require auth. The user is identified by `userId` (from JWT).
 *  - Idempotent by design: re-posting a step overwrites the prior pick.
 *  - The `OnboardingState` row is created lazily on first write — GET endpoints
 *    return defaults if the row doesn't exist yet.
 *  - Skip vs Complete are mutually exclusive: once one is set, the other is
 *    rejected. The frontend gates the flow but we double-check server-side.
 *
 * Long-term state lands in canonical places — NOT inside OnboardingState:
 *  - `firstName` → `User.firstName`
 *  - `voicePreference` → `UserPreferences.voicePreference`
 *  - `mood` (current) → `User.mood` + moodUpdatedAt
 *
 * `OnboardingState` only audits onboarding-specific picks (motivosIds,
 * initial mood, what we recommended vs chose).
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── GET /api/onboarding/intro ─────────────────────────────────────────────

  getIntro(): OnboardingIntro {
    return MARINA_INTRO;
  }

  // ── POST /api/onboarding/skip ─────────────────────────────────────────────

  async skip(userId: string): Promise<{ ok: true }> {
    await this.assertNotAlreadyClosed(userId);
    await this.prisma.onboardingState.upsert({
      where: { userId },
      create: { userId, onboardingSkippedAt: new Date() },
      update: { onboardingSkippedAt: new Date() },
    });
    return { ok: true };
  }

  // ── GET /api/onboarding/motivos ───────────────────────────────────────────

  async getMotivos(): Promise<{ motivos: OnboardingMotivo[] }> {
    const rows = await this.prisma.onboardingMotivo.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
    return {
      motivos: rows.map((m) => ({ id: m.id, label: m.label, icon: m.icon })),
    };
  }

  // ── POST /api/onboarding/step1 ────────────────────────────────────────────

  async saveStep1(userId: string, dto: OnboardingStep1Dto) {
    await this.assertNotAlreadyClosed(userId);

    // Validate each motivosId exists. Doing it explicitly here (instead of
    // a FK constraint) lets us return a friendly 400 with the specific bad
    // ids — instead of letting Postgres raise an opaque integrity error.
    const valid = await this.prisma.onboardingMotivo.findMany({
      where: { id: { in: dto.motivosIds }, isActive: true },
      select: { id: true },
    });
    const validIds = new Set(valid.map((m) => m.id));
    const unknown = dto.motivosIds.filter((id) => !validIds.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: "UNKNOWN_MOTIVO_IDS",
        message: `Unknown motivosIds: ${unknown.join(", ")}`,
      });
    }

    await this.prisma.onboardingState.upsert({
      where: { userId },
      create: {
        userId,
        motivosIds: dto.motivosIds,
        step1CompletedAt: new Date(),
      },
      update: { motivosIds: dto.motivosIds, step1CompletedAt: new Date() },
    });

    return { ok: true as const, next: "step2" };
  }

  // ── GET /api/onboarding/moods ─────────────────────────────────────────────

  async getMoods(): Promise<{ moods: OnboardingMood[] }> {
    const rows = await this.prisma.onboardingMood.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
    return {
      moods: rows.map((m) => ({ id: m.id, label: m.label, swatch: m.swatch })),
    };
  }

  // ── POST /api/onboarding/step2 ────────────────────────────────────────────

  async saveStep2(userId: string, dto: OnboardingStep2Dto) {
    await this.assertNotAlreadyClosed(userId);

    const exists = await this.prisma.onboardingMood.findUnique({
      where: { id: dto.moodId },
      select: { id: true, isActive: true },
    });
    if (!exists || !exists.isActive) {
      throw new BadRequestException({
        code: "UNKNOWN_MOOD_ID",
        message: `Unknown moodId: ${dto.moodId}`,
      });
    }

    // Two writes: the audit on OnboardingState + the live mood on User.
    // Same transaction so they don't drift.
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.onboardingState.upsert({
        where: { userId },
        create: {
          userId,
          initialMoodId: dto.moodId,
          step2CompletedAt: now,
        },
        update: { initialMoodId: dto.moodId, step2CompletedAt: now },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { mood: dto.moodId, moodUpdatedAt: now },
      }),
    ]);

    return { ok: true as const, next: "step3" };
  }

  // ── POST /api/onboarding/step3 ────────────────────────────────────────────

  async saveStep3(userId: string, dto: OnboardingStep3Dto) {
    await this.assertNotAlreadyClosed(userId);

    const firstName = dto.firstName.trim();
    const now = new Date();

    await this.prisma.$transaction([
      // Audit
      this.prisma.onboardingState.upsert({
        where: { userId },
        create: {
          userId,
          initialVoicePreference: dto.voicePreference,
          step3CompletedAt: now,
        },
        update: {
          initialVoicePreference: dto.voicePreference,
          step3CompletedAt: now,
        },
      }),
      // Long-term state on User
      this.prisma.user.update({
        where: { id: userId },
        data: { firstName },
      }),
      // Long-term voice pref on UserPreferences
      this.prisma.userPreferences.upsert({
        where: { userId },
        create: { userId, voicePreference: dto.voicePreference },
        update: { voicePreference: dto.voicePreference },
      }),
    ]);

    return { ok: true as const, next: "step4" };
  }

  // ── GET /api/onboarding/recommendation ────────────────────────────────────

  async getRecommendation(
    userId: string,
  ): Promise<OnboardingRecommendationResponse> {
    const state = await this.prisma.onboardingState.findUnique({
      where: { userId },
      select: { motivosIds: true },
    });

    const motivos = state?.motivosIds ?? [];

    // Resolve primary book by first matching motivo, fall back to anchor.
    let primarySlug = FALLBACK_BOOK_SLUG;
    let matchedMotivo: string | null = null;
    for (const m of motivos) {
      const slug = RECOMMENDATION_BY_MOTIVO[m];
      if (slug) {
        primarySlug = slug;
        matchedMotivo = m;
        break;
      }
    }

    // Pull primary book + 2 alternatives (different from primary)
    const [primary, alts] = await Promise.all([
      this.findRecommendableBook(primarySlug),
      this.prisma.book.findMany({
        where: { isPublished: true, slug: { not: primarySlug } },
        orderBy: { createdAt: "asc" },
        take: 2,
      }),
    ]);

    if (!primary) {
      throw new NotFoundException({
        code: "RECOMMENDATION_BOOK_NOT_FOUND",
        message: `Catalog issue: book "${primarySlug}" is not seeded.`,
      });
    }

    // Remember what we recommended for analytics + audit.
    await this.prisma.onboardingState.upsert({
      where: { userId },
      create: { userId, recommendedBookId: primary.id },
      update: { recommendedBookId: primary.id },
    });

    return {
      recommendation: this.toRecommendation(
        primary,
        matchedMotivo,
        primarySlug,
      ),
      alternatives: alts.map((b) =>
        this.toRecommendation(b, matchedMotivo, b.slug),
      ),
    };
  }

  // ── POST /api/onboarding/complete ─────────────────────────────────────────

  async complete(userId: string, dto: OnboardingCompleteDto) {
    await this.assertNotAlreadyClosed(userId);

    const chosenBookId = dto.chosenBookId ?? null;

    // If they picked a book, verify it exists + is published.
    if (chosenBookId) {
      const exists = await this.prisma.book.findFirst({
        where: { id: chosenBookId, isPublished: true },
        select: { id: true },
      });
      if (!exists) {
        throw new BadRequestException({
          code: "UNKNOWN_BOOK_ID",
          message: `Unknown or unpublished book: ${chosenBookId}`,
        });
      }
    }

    await this.prisma.onboardingState.upsert({
      where: { userId },
      create: {
        userId,
        chosenBookId,
        onboardingCompletedAt: new Date(),
      },
      update: { chosenBookId, onboardingCompletedAt: new Date() },
    });

    // Redirect target: if they picked a book, send them to /lector/<id>; else
    // to the home screen.
    const redirectTo = chosenBookId ? `/lector/${chosenBookId}` : "/inicio";

    return { ok: true as const, redirectTo };
  }

  // ── GET /api/onboarding/tour ──────────────────────────────────────────────

  getTour(): { steps: OnboardingTourStep[] } {
    return { steps: [...TOUR_STEPS].sort((a, b) => a.order - b.order) };
  }

  // ── POST /api/onboarding/tour/complete ────────────────────────────────────

  async completeTour(userId: string, dto: OnboardingTourCompleteDto) {
    await this.prisma.onboardingState.upsert({
      where: { userId },
      create: {
        userId,
        tourCompletedAt: new Date(),
        tourStepsCompleted: dto.stepsCompleted,
      },
      update: {
        tourCompletedAt: new Date(),
        tourStepsCompleted: dto.stepsCompleted,
      },
    });
    return { ok: true as const };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Reject writes to a flow that's already been skipped or completed. Without
   * this, a curious client could keep POSTing step1 after onboarding ended
   * and we'd silently accept it — confusing analytics later.
   *
   * Returns when state doesn't exist yet (user is mid-flow) or when state
   * exists but neither closed.
   */
  private async assertNotAlreadyClosed(userId: string): Promise<void> {
    const state = await this.prisma.onboardingState.findUnique({
      where: { userId },
      select: { onboardingCompletedAt: true, onboardingSkippedAt: true },
    });
    if (state?.onboardingCompletedAt) {
      throw new BadRequestException({
        code: "ONBOARDING_ALREADY_COMPLETED",
        message: "Onboarding ya completado.",
      });
    }
    if (state?.onboardingSkippedAt) {
      throw new BadRequestException({
        code: "ONBOARDING_ALREADY_SKIPPED",
        message: "Onboarding ya marcado como saltado.",
      });
    }
  }

  private async findRecommendableBook(slug: string) {
    return this.prisma.book.findFirst({
      where: { slug, isPublished: true },
    });
  }

  private toRecommendation(
    book: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
    },
    matchedMotivo: string | null,
    bookSlug: string,
  ): OnboardingBookRecommendation {
    const reasonKey = matchedMotivo ? `${matchedMotivo}:${bookSlug}` : null;
    const why = reasonKey
      ? (RECOMMENDATION_REASON[reasonKey] ?? FALLBACK_REASON)
      : FALLBACK_REASON;

    return {
      bookId: book.id,
      title: book.title,
      // Book model doesn't have an `author` column yet (BookAuthor is Sprint S5).
      // Show a sensible fallback until then.
      author: "Marina Quintana",
      cover: this.pickCoverToken(book.id),
      // Until ContentModule exposes chapter 1 preview, use the description as
      // a stand-in. Sprint S5 plugs the real chapter 1 first paragraph.
      chapter1Preview: book.description ?? "",
      why,
    };
  }

  /**
   * Deterministic cover token derived from the book id. The design supports
   * "cool" / "warm" / "mixed"; we pick by hash so the same book always gets
   * the same tone. When BookCover lands in S22 (Author module), this falls
   * back to a real DB column.
   */
  private pickCoverToken(bookId: string): "cool" | "warm" | "mixed" {
    const tokens: ("cool" | "warm" | "mixed")[] = ["cool", "warm", "mixed"];
    let hash = 0;
    for (let i = 0; i < bookId.length; i++) {
      hash = (hash * 31 + bookId.charCodeAt(i)) >>> 0;
    }
    return tokens[hash % tokens.length]!;
  }
}
