import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { OnboardingService } from "./onboarding.service";

const userId = "user-1";

const mockPrisma = {
  onboardingState: {
    findUnique: vi.fn(),
    upsert: vi.fn().mockResolvedValue(undefined),
  },
  onboardingMotivo: {
    findMany: vi.fn(),
  },
  onboardingMood: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  user: {
    update: vi.fn().mockResolvedValue(undefined),
  },
  userPreferences: {
    upsert: vi.fn().mockResolvedValue(undefined),
  },
  book: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return undefined;
  }),
};

describe("OnboardingService", () => {
  let service: OnboardingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.onboardingState.upsert.mockResolvedValue(undefined);
    mockPrisma.user.update.mockResolvedValue(undefined);
    mockPrisma.userPreferences.upsert.mockResolvedValue(undefined);
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return undefined;
    });
    service = new OnboardingService(mockPrisma as never);
  });

  // ── intro / motivos / moods / tour — pure reads + constants ───────────────

  describe("read endpoints", () => {
    it("getIntro returns the editorial constant with a brand-neutral signature", () => {
      const intro = service.getIntro();
      // Title and body are warm prose; signature is the platform itself so
      // the welcome stays neutral as more authors get onboarded via the
      // Author B2B module (S22+).
      expect(intro.title.length).toBeGreaterThan(0);
      expect(intro.body.length).toBeGreaterThan(50);
      expect(intro.signature).toBe("— Psico Platform");
      // Guard against accidental re-introduction of personal-name copy.
      expect(intro.title).not.toMatch(/Marina|Jorge|Tomás/);
      expect(intro.signature).not.toMatch(/Marina|Jorge|Tomás/);
    });

    it("getMotivos returns only active rows in `order` asc", async () => {
      mockPrisma.onboardingMotivo.findMany.mockResolvedValue([
        { id: "ansiedad", label: "Ansiedad", icon: "wind", order: 1 },
        { id: "duelo", label: "Duelo", icon: "heart-crack", order: 2 },
      ]);

      const res = await service.getMotivos();

      expect(res.motivos).toHaveLength(2);
      expect(res.motivos[0]!.id).toBe("ansiedad");
      expect(mockPrisma.onboardingMotivo.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { order: "asc" },
      });
    });

    it("getMoods returns only active rows in `order` asc", async () => {
      mockPrisma.onboardingMood.findMany.mockResolvedValue([
        { id: "calma", label: "Calma", swatch: "#A8C7E4", order: 1 },
      ]);

      const res = await service.getMoods();
      expect(res.moods).toEqual([
        { id: "calma", label: "Calma", swatch: "#A8C7E4" },
      ]);
    });

    it("getTour returns the constant list sorted by order", () => {
      const res = service.getTour();
      expect(res.steps.length).toBeGreaterThan(0);
      for (let i = 1; i < res.steps.length; i++) {
        expect(res.steps[i]!.order).toBeGreaterThanOrEqual(
          res.steps[i - 1]!.order,
        );
      }
    });
  });

  // ── skip ───────────────────────────────────────────────────────────────────

  describe("skip", () => {
    it("upserts onboardingSkippedAt when state is open", async () => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue(null);

      const res = await service.skip(userId);

      expect(res).toEqual({ ok: true });
      expect(mockPrisma.onboardingState.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, onboardingSkippedAt: expect.any(Date) },
        update: { onboardingSkippedAt: expect.any(Date) },
      });
    });

    it("throws 400 if onboarding already completed", async () => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue({
        onboardingCompletedAt: new Date(),
        onboardingSkippedAt: null,
      });

      await expect(service.skip(userId)).rejects.toThrow(BadRequestException);
    });

    it("throws 400 if already skipped (idempotency-but-explicit)", async () => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue({
        onboardingCompletedAt: null,
        onboardingSkippedAt: new Date(),
      });

      await expect(service.skip(userId)).rejects.toThrow(BadRequestException);
    });
  });

  // ── saveStep1 (motivos) ────────────────────────────────────────────────────

  describe("saveStep1", () => {
    beforeEach(() => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue(null);
    });

    it("validates every motivoId exists in the catalog", async () => {
      mockPrisma.onboardingMotivo.findMany.mockResolvedValue([
        { id: "ansiedad" },
      ]);

      await expect(
        service.saveStep1(userId, { motivosIds: ["ansiedad", "burnout"] }),
      ).rejects.toMatchObject({
        response: { code: "UNKNOWN_MOTIVO_IDS" },
      });
    });

    it("upserts state and returns next=step2", async () => {
      mockPrisma.onboardingMotivo.findMany.mockResolvedValue([
        { id: "ansiedad" },
        { id: "trabajo" },
      ]);

      const res = await service.saveStep1(userId, {
        motivosIds: ["ansiedad", "trabajo"],
      });

      expect(res).toEqual({ ok: true, next: "step2" });
      const upsertCall = mockPrisma.onboardingState.upsert.mock.calls[0][0];
      expect(upsertCall.create.motivosIds).toEqual(["ansiedad", "trabajo"]);
      expect(upsertCall.update.step1CompletedAt).toBeInstanceOf(Date);
    });
  });

  // ── saveStep2 (mood) ───────────────────────────────────────────────────────

  describe("saveStep2", () => {
    beforeEach(() => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue(null);
    });

    it("rejects unknown moodId with 400 UNKNOWN_MOOD_ID", async () => {
      mockPrisma.onboardingMood.findUnique.mockResolvedValue(null);

      await expect(
        service.saveStep2(userId, { moodId: "euphoria" }),
      ).rejects.toMatchObject({
        response: { code: "UNKNOWN_MOOD_ID" },
      });
    });

    it("rejects inactive mood with 400 UNKNOWN_MOOD_ID", async () => {
      mockPrisma.onboardingMood.findUnique.mockResolvedValue({
        id: "calma",
        isActive: false,
      });

      await expect(
        service.saveStep2(userId, { moodId: "calma" }),
      ).rejects.toMatchObject({
        response: { code: "UNKNOWN_MOOD_ID" },
      });
    });

    it("sets initialMoodId on OnboardingState AND User.mood (transactional)", async () => {
      mockPrisma.onboardingMood.findUnique.mockResolvedValue({
        id: "calma",
        isActive: true,
      });

      const res = await service.saveStep2(userId, { moodId: "calma" });

      expect(res).toEqual({ ok: true, next: "step3" });
      // One $transaction call with two writes inside
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.onboardingState.upsert).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { mood: "calma", moodUpdatedAt: expect.any(Date) },
      });
    });
  });

  // ── saveStep3 (name + voice) ───────────────────────────────────────────────

  describe("saveStep3", () => {
    beforeEach(() => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue(null);
    });

    it("trims firstName + writes to User and UserPreferences atomically", async () => {
      const res = await service.saveStep3(userId, {
        firstName: "  Jorge  ",
        voicePreference: "marina",
      });

      expect(res).toEqual({ ok: true, next: "step4" });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { firstName: "Jorge" },
      });
      expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, voicePreference: "marina" },
        update: { voicePreference: "marina" },
      });
    });
  });

  // ── getRecommendation ─────────────────────────────────────────────────────

  describe("getRecommendation", () => {
    it("picks the book mapped by the first matching motivo", async () => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue({
        motivosIds: ["relaciones", "trabajo"],
      });
      mockPrisma.book.findFirst.mockResolvedValue({
        id: "book-fe",
        slug: "familias-ensambladas",
        title: "Familias Ensambladas",
        description: "Vínculos en familias contemporáneas",
      });
      mockPrisma.book.findMany.mockResolvedValue([
        {
          id: "book-ec",
          slug: "emociones-en-construccion",
          title: "Emociones en Construcción",
          description: "…",
        },
      ]);

      const res = await service.getRecommendation(userId);

      expect(res.recommendation.bookId).toBe("book-fe");
      expect(res.recommendation.why).toContain("vínculos");
      expect(res.alternatives.length).toBeGreaterThan(0);
      // Recommendation logged on the state row
      expect(mockPrisma.onboardingState.upsert).toHaveBeenCalledWith({
        where: { userId },
        create: { userId, recommendedBookId: "book-fe" },
        update: { recommendedBookId: "book-fe" },
      });
    });

    it("falls back to the anchor book when no motivo matches", async () => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue({
        motivosIds: ["unknown-motivo"],
      });
      mockPrisma.book.findFirst.mockResolvedValue({
        id: "book-ec",
        slug: "emociones-en-construccion",
        title: "Emociones en Construcción",
        description: "",
      });
      mockPrisma.book.findMany.mockResolvedValue([]);

      const res = await service.getRecommendation(userId);

      expect(res.recommendation.bookId).toBe("book-ec");
      // Generic fallback `why` copy
      expect(res.recommendation.why).toMatch(/comienzo amable/i);
    });

    it("throws if the seeded fallback book is missing (catalog drift)", async () => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue(null);
      mockPrisma.book.findFirst.mockResolvedValue(null);
      mockPrisma.book.findMany.mockResolvedValue([]);

      await expect(service.getRecommendation(userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── complete ──────────────────────────────────────────────────────────────

  describe("complete", () => {
    beforeEach(() => {
      mockPrisma.onboardingState.findUnique.mockResolvedValue(null);
    });

    it("with chosenBookId → returns the slug-based reader path that the web actually serves", async () => {
      // The redirect target must match the web route tree
      // `/dashboard/biblioteca/[slug]/lector/[chapterOrder]`. Legacy targets
      // (`/lector/<id>`, `/inicio`) returned a 404 in production — this test
      // guards the fix.
      mockPrisma.book.findFirst.mockResolvedValue({
        id: "book-1",
        slug: "emociones-en-construccion",
      });

      const res = await service.complete(userId, { chosenBookId: "book-1" });

      expect(res).toEqual({
        ok: true,
        redirectTo: "/dashboard/biblioteca/emociones-en-construccion/lector/1",
      });
    });

    it("with null chosenBookId → redirects to /dashboard (home of the web app)", async () => {
      const res = await service.complete(userId, { chosenBookId: null });

      expect(res).toEqual({ ok: true, redirectTo: "/dashboard" });
      expect(mockPrisma.book.findFirst).not.toHaveBeenCalled();
    });

    it("rejects an unknown bookId with 400", async () => {
      mockPrisma.book.findFirst.mockResolvedValue(null);

      await expect(
        service.complete(userId, { chosenBookId: "ghost" }),
      ).rejects.toMatchObject({
        response: { code: "UNKNOWN_BOOK_ID" },
      });
    });
  });

  // ── completeTour ──────────────────────────────────────────────────────────

  describe("completeTour", () => {
    it("upserts tourCompletedAt + stepsCompleted", async () => {
      const res = await service.completeTour(userId, { stepsCompleted: 3 });

      expect(res).toEqual({ ok: true });
      const call = mockPrisma.onboardingState.upsert.mock.calls[0][0];
      expect(call.update.tourStepsCompleted).toBe(3);
      expect(call.update.tourCompletedAt).toBeInstanceOf(Date);
    });
  });

  // ── resetTour ────────────────────────────────────────────────────────────
  //
  // Sprint G-polish — opt-in re-trigger of the dashboard tour.

  describe("resetTour", () => {
    it("upserts tourCompletedAt to null + stepsCompleted to 0", async () => {
      const res = await service.resetTour(userId);

      expect(res).toEqual({ ok: true });
      const call = mockPrisma.onboardingState.upsert.mock.calls[0][0];
      expect(call.update.tourCompletedAt).toBeNull();
      expect(call.update.tourStepsCompleted).toBe(0);
    });

    it("creates an empty OnboardingState when the user has none yet", async () => {
      const res = await service.resetTour(userId);

      expect(res).toEqual({ ok: true });
      const call = mockPrisma.onboardingState.upsert.mock.calls[0][0];
      // We don't ask the user to "complete onboarding" by calling reset —
      // the `create` branch is intentionally empty (only userId).
      expect(call.create).toEqual({ userId });
    });
  });
});
