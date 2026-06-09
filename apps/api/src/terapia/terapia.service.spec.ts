import { Test, type TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PrismaService } from "../prisma";
import { PaymentService } from "../subscription";
import { TerapiaService } from "./terapia.service";
import { VIDEO_PROVIDER } from "./tokens";
import type { IVideoProvider } from "./providers/video-provider.interface";

type PrismaMock = {
  therapySession: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  therapyPrescription: { findMany: ReturnType<typeof vi.fn> };
  crisisLog: { create: ReturnType<typeof vi.fn> };
  therapist: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  therapistFavorite: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  therapistReview: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  therapyTechnicalReport: {
    create: ReturnType<typeof vi.fn>;
  };
};

function makeVideo(overrides: Partial<IVideoProvider> = {}): IVideoProvider {
  return {
    name: "stub",
    isConfigured: vi.fn().mockReturnValue(false),
    createRoom: vi
      .fn()
      .mockResolvedValue({
        roomUrl: "fake-room://x",
        expiresAt: new Date(Date.now() + 7200_000),
      }),
    createJoinToken: vi
      .fn()
      .mockResolvedValue({
        joinToken: "fake-token",
        expiresAt: new Date(Date.now() + 7200_000),
      }),
    destroyRoom: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as IVideoProvider;
}

function makeTherapist(overrides: Record<string, unknown> = {}) {
  return {
    id: "t_1",
    name: "Marina Quintana",
    initials: "MQ",
    title: "Psicóloga clínica",
    avatarUrl: null,
    coverToken: "warm",
    licenseNumber: "PSI-2031",
    licenseVerified: true,
    bioShort: "Acompaño procesos de ansiedad y duelo.",
    bioLong: null,
    approach: null,
    specialties: ["ansiedad", "duelo"],
    modalities: ["INDIVIDUAL" as const],
    languages: ["es-EC"],
    genderId: "femenino",
    priceUsd: 45,
    currency: "USD",
    acceptsInsurance: false,
    avgRating: 4.7,
    reviewsCount: 23,
    isActive: true,
    popularity: 10,
    firstSessionPolicy: null,
    cancellationPolicy: null,
    videoPresentationUrl: null,
    availability: [],
    ...overrides,
  };
}

describe("TerapiaService", () => {
  let service: TerapiaService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      therapySession: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      therapyPrescription: { findMany: vi.fn().mockResolvedValue([]) },
      crisisLog: { create: vi.fn() },
      therapist: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
      },
      therapistFavorite: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      therapistReview: { findMany: vi.fn(), count: vi.fn() },
      therapyTechnicalReport: { create: vi.fn() },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TerapiaService,
        { provide: PrismaService, useValue: prisma },
        { provide: VIDEO_PROVIDER, useValue: makeVideo() },
        {
          provide: PaymentService,
          useValue: {
            createTherapyCheckout: vi.fn().mockResolvedValue({
              url: "https://checkout.stripe.com/cs_test",
              stripeCheckoutSessionId: "cs_test_xxx",
            }),
          },
        },
      ],
    }).compile();
    service = mod.get(TerapiaService);
  });

  // ── Crisis ────────────────────────────────────────────────────────────

  describe("getCrisis", () => {
    it("returns Ecuador lines for EC country", () => {
      const res = service.getCrisis("EC");
      expect(res.country).toBe("EC");
      expect(res.lines.length).toBeGreaterThan(0);
    });

    it("returns Ecuador as default when country is undefined", () => {
      const res = service.getCrisis(undefined);
      expect(res.country).toBe("EC");
    });

    it("falls back to international for unknown country", () => {
      expect(service.getCrisis("ZZ").country).toBe("INTL");
    });

    it("normalizes lowercase country codes", () => {
      expect(service.getCrisis("ec").country).toBe("EC");
    });
  });

  describe("logCrisis", () => {
    it("creates a row with all fields", async () => {
      prisma.crisisLog.create.mockResolvedValue({ id: "log_1" });
      await service.logCrisis("user_a", "HOME_BUTTON", "ec-sas-911", "EC");
      expect(prisma.crisisLog.create).toHaveBeenCalledWith({
        data: {
          userId: "user_a",
          trigger: "HOME_BUTTON",
          contactedLineId: "ec-sas-911",
          country: "EC",
        },
      });
    });

    it("allows anonymous logs", async () => {
      prisma.crisisLog.create.mockResolvedValue({ id: "log_anon" });
      await service.logCrisis(null, "ECO_SAFETY_LAYER", undefined, undefined);
      expect(prisma.crisisLog.create).toHaveBeenCalledWith({
        data: {
          userId: null,
          trigger: "ECO_SAFETY_LAYER",
          contactedLineId: undefined,
          country: undefined,
        },
      });
    });
  });

  // ── Hub ───────────────────────────────────────────────────────────────

  describe("getHub", () => {
    it("returns empty state when user has no sessions or prescriptions", async () => {
      prisma.therapySession.findFirst.mockResolvedValue(null);
      const res = await service.getHub("user_a");
      expect(res.activeTherapist).toBeNull();
      expect(res.nextSession).toBeNull();
      expect(res.recentPrescriptions).toEqual([]);
    });
  });

  // ── Directory (S63) ───────────────────────────────────────────────────

  describe("listTherapists", () => {
    it("paginates and marks favorites", async () => {
      const t1 = makeTherapist({ id: "t_1" });
      const t2 = makeTherapist({ id: "t_2", name: "Andrea Ortiz" });
      prisma.therapist.findMany.mockResolvedValue([t1, t2]);
      prisma.therapist.count.mockResolvedValue(2);
      prisma.therapistFavorite.findMany.mockResolvedValue([
        { therapistId: "t_1" },
      ]);

      const res = await service.listTherapists("user_a", { page: 1, pageSize: 20 });

      expect(res.total).toBe(2);
      expect(res.totalPages).toBe(1);
      expect(res.items).toHaveLength(2);
      expect(res.items[0].isFavorite).toBe(true);
      expect(res.items[1].isFavorite).toBe(false);
      expect(res.items[0].nextSlotIso).toBeNull();
    });

    it("filters by motivo via specialties.has", async () => {
      prisma.therapist.findMany.mockResolvedValue([]);
      prisma.therapist.count.mockResolvedValue(0);

      await service.listTherapists("user_a", { motivo: "ansiedad" });

      expect(prisma.therapist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            specialties: { has: "ansiedad" },
          }),
        }),
      );
    });

    it("filters by price range", async () => {
      prisma.therapist.findMany.mockResolvedValue([]);
      prisma.therapist.count.mockResolvedValue(0);
      await service.listTherapists("user_a", { priceMin: 30, priceMax: 60 });
      expect(prisma.therapist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priceUsd: { gte: 30, lte: 60 },
          }),
        }),
      );
    });

    it("sorts by rating by default", async () => {
      prisma.therapist.findMany.mockResolvedValue([]);
      prisma.therapist.count.mockResolvedValue(0);
      await service.listTherapists("user_a", {});
      expect(prisma.therapist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ avgRating: "desc" }, { popularity: "desc" }],
        }),
      );
    });

    it("sorts by price-asc when requested", async () => {
      prisma.therapist.findMany.mockResolvedValue([]);
      prisma.therapist.count.mockResolvedValue(0);
      await service.listTherapists("user_a", { sort: "price-asc" });
      expect(prisma.therapist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ priceUsd: "asc" }, { popularity: "desc" }],
        }),
      );
    });
  });

  describe("getFilters", () => {
    it("aggregates counts across active therapists", async () => {
      prisma.therapist.findMany.mockResolvedValue([
        {
          specialties: ["ansiedad", "duelo"],
          modalities: ["INDIVIDUAL"],
          genderId: "femenino",
          languages: ["es-EC"],
          priceUsd: 30,
          currency: "USD",
        },
        {
          specialties: ["ansiedad", "pareja"],
          modalities: ["INDIVIDUAL", "COUPLE"],
          genderId: "masculino",
          languages: ["es-EC", "en"],
          priceUsd: 60,
          currency: "USD",
        },
      ]);

      const f = await service.getFilters();
      expect(f.motivo.find((m) => m.id === "ansiedad")?.count).toBe(2);
      expect(f.modalidad.find((m) => m.id === "INDIVIDUAL")?.count).toBe(2);
      expect(f.modalidad.find((m) => m.id === "COUPLE")?.count).toBe(1);
      expect(f.precio).toEqual({ min: 30, max: 60, currency: "USD" });
      expect(f.language).toHaveLength(2);
    });

    it("returns priceMin=0 when no therapists exist", async () => {
      prisma.therapist.findMany.mockResolvedValue([]);
      const f = await service.getFilters();
      expect(f.precio.min).toBe(0);
      expect(f.precio.max).toBe(0);
    });
  });

  describe("getTherapist", () => {
    it("throws 404 when not found", async () => {
      prisma.therapist.findUnique.mockResolvedValue(null);
      prisma.therapistFavorite.findUnique.mockResolvedValue(null);
      await expect(
        service.getTherapist("user_a", "t_missing"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws 404 when inactive", async () => {
      prisma.therapist.findUnique.mockResolvedValue(
        makeTherapist({ isActive: false }),
      );
      prisma.therapistFavorite.findUnique.mockResolvedValue(null);
      await expect(
        service.getTherapist("user_a", "t_1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns detail with availability + favorite", async () => {
      prisma.therapist.findUnique.mockResolvedValue(
        makeTherapist({
          availability: [
            { dayOfWeek: 1, startMin: 540, endMin: 720, timezone: "America/Guayaquil" },
          ],
        }),
      );
      prisma.therapistFavorite.findUnique.mockResolvedValue({ id: "fav_1" });

      const detail = await service.getTherapist("user_a", "t_1");
      expect(detail.id).toBe("t_1");
      expect(detail.availability).toHaveLength(1);
      expect(detail.isFavorite).toBe(true);
    });
  });

  describe("toggleFavorite", () => {
    it("creates when not exists", async () => {
      prisma.therapist.findUnique.mockResolvedValue({ id: "t_1" });
      prisma.therapistFavorite.findUnique.mockResolvedValue(null);
      const res = await service.toggleFavorite("user_a", "t_1");
      expect(res).toEqual({ isFavorite: true });
      expect(prisma.therapistFavorite.create).toHaveBeenCalled();
    });

    it("deletes when exists", async () => {
      prisma.therapist.findUnique.mockResolvedValue({ id: "t_1" });
      prisma.therapistFavorite.findUnique.mockResolvedValue({ id: "fav_1" });
      const res = await service.toggleFavorite("user_a", "t_1");
      expect(res).toEqual({ isFavorite: false });
      expect(prisma.therapistFavorite.delete).toHaveBeenCalled();
    });

    it("throws 404 when therapist does not exist", async () => {
      prisma.therapist.findUnique.mockResolvedValue(null);
      await expect(
        service.toggleFavorite("user_a", "t_missing"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("listReviews", () => {
    it("paginates and computes user initials", async () => {
      prisma.therapist.findUnique.mockResolvedValue({ id: "t_1" });
      prisma.therapistReview.findMany.mockResolvedValue([
        {
          id: "r_1",
          rating: 5,
          text: "Excelente",
          tags: ["puntual"],
          createdAt: new Date("2026-06-01"),
          user: { firstName: "Juan David", name: "Juan David Pérez" },
        },
      ]);
      prisma.therapistReview.count.mockResolvedValue(1);

      const res = await service.listReviews("t_1", 1, 10);
      expect(res.items[0].userInitials).toBe("JD");
      expect(res.items[0].rating).toBe(5);
      expect(res.total).toBe(1);
    });

    it("throws 404 when therapist not found", async () => {
      prisma.therapist.findUnique.mockResolvedValue(null);
      await expect(service.listReviews("missing", 1, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── Booking + Prep (S64) ──────────────────────────────────────────────

  describe("getAvailability", () => {
    it("throws 404 when therapist missing", async () => {
      prisma.therapist.findUnique.mockResolvedValue(null);
      await expect(
        service.getAvailability("t_missing", 14),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("projects weekly availability + filters out booked slots", async () => {
      prisma.therapist.findUnique.mockResolvedValue(
        makeTherapist({
          availability: [
            // Every UTC day — guarantees match regardless of "today"
            { dayOfWeek: 0, startMin: 540, endMin: 720, timezone: "America/Guayaquil" },
            { dayOfWeek: 1, startMin: 540, endMin: 720, timezone: "America/Guayaquil" },
            { dayOfWeek: 2, startMin: 540, endMin: 720, timezone: "America/Guayaquil" },
            { dayOfWeek: 3, startMin: 540, endMin: 720, timezone: "America/Guayaquil" },
            { dayOfWeek: 4, startMin: 540, endMin: 720, timezone: "America/Guayaquil" },
            { dayOfWeek: 5, startMin: 540, endMin: 720, timezone: "America/Guayaquil" },
            { dayOfWeek: 6, startMin: 540, endMin: 720, timezone: "America/Guayaquil" },
          ],
        }),
      );
      // No bookings yet
      prisma.therapySession.findMany.mockResolvedValue([]);

      const res = await service.getAvailability("t_1", 7);
      expect(res.therapistId).toBe("t_1");
      expect(res.timezone).toBe("America/Guayaquil");
      // 7 days × 3 hourly slots (540, 600, 660 — 720 excluded by < 60 cap)
      // Actual count varies because today may already be past 9 am UTC.
      expect(res.slots.length).toBeGreaterThan(0);
      expect(res.slots.every((s) => s.priceUsd === 45)).toBe(true);
      expect(res.slots.every((s) => s.available)).toBe(true);
    });

    it("marks slot as unavailable when overlap with booked session", async () => {
      const therapist = makeTherapist({
        availability: Array.from({ length: 7 }, (_, dow) => ({
          dayOfWeek: dow,
          startMin: 540,
          endMin: 720,
          timezone: "America/Guayaquil",
        })),
      });
      prisma.therapist.findUnique.mockResolvedValue(therapist);
      // Mock a single booking; we just want to assert filter is invoked
      // with the right SCHEDULED/IN_PROGRESS where clause.
      prisma.therapySession.findMany.mockResolvedValue([
        { scheduledAt: new Date("2099-01-01T09:00:00Z"), durationMin: 50 },
      ]);

      await service.getAvailability("t_1", 7);

      expect(prisma.therapySession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            therapistId: "t_1",
            status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          }),
        }),
      );
    });
  });

  describe("createBooking", () => {
    const futureSlot = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const baseReq = {
      therapistId: "t_1",
      slotIso: futureSlot,
      modality: "INDIVIDUAL" as const,
    };

    it("throws 404 when therapist missing", async () => {
      prisma.therapist.findUnique.mockResolvedValue(null);
      await expect(service.createBooking("user_a", baseReq)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws 400 when modality not offered", async () => {
      prisma.therapist.findUnique.mockResolvedValue(
        makeTherapist({ modalities: ["INDIVIDUAL"] }),
      );
      await expect(
        service.createBooking("user_a", { ...baseReq, modality: "COUPLE" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws 400 when slot is in the past", async () => {
      prisma.therapist.findUnique.mockResolvedValue(makeTherapist());
      const past = new Date(Date.now() - 1000).toISOString();
      await expect(
        service.createBooking("user_a", { ...baseReq, slotIso: past }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws 409 when slot already taken", async () => {
      prisma.therapist.findUnique.mockResolvedValue(makeTherapist());
      prisma.therapySession.findFirst.mockResolvedValue({ id: "s_existing" });

      await expect(
        service.createBooking("user_a", baseReq),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("creates SCHEDULED + PENDING session and returns checkoutUrl null in S64", async () => {
      prisma.therapist.findUnique.mockResolvedValue(makeTherapist());
      prisma.therapySession.findFirst.mockResolvedValue(null);
      prisma.therapySession.create.mockResolvedValue({
        id: "s_new",
        paymentStatus: "PENDING",
        scheduledAt: new Date(futureSlot),
      });

      const res = await service.createBooking("user_a", baseReq);
      expect(res.sessionId).toBe("s_new");
      expect(res.paymentStatus).toBe("PENDING");
      expect(res.checkoutUrl).toBeNull();
      expect(prisma.therapySession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_a",
            therapistId: "t_1",
            status: "SCHEDULED",
            paymentStatus: "PENDING",
            priceUsd: 45,
          }),
        }),
      );
    });
  });

  describe("getSessionPrep", () => {
    it("throws 404 when missing", async () => {
      prisma.therapySession.findUnique.mockResolvedValue(null);
      await expect(
        service.getSessionPrep("user_a", "s_missing"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws 403 when not owner", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_other",
        therapist: makeTherapist(),
        scheduledAt: new Date(),
        durationMin: 50,
        modality: "INDIVIDUAL",
        paymentStatus: "PENDING",
        intentionCiphertext: null,
        intentionNonce: null,
        checkInMood: null,
        sharedEntryIds: [],
      });

      await expect(
        service.getSessionPrep("user_a", "s_1"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("returns prep shape when owner", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
        therapist: makeTherapist(),
        scheduledAt: new Date("2099-01-01"),
        durationMin: 50,
        modality: "INDIVIDUAL",
        paymentStatus: "PAID",
        intentionCiphertext: "ctext",
        intentionNonce: "nonce",
        checkInMood: "ansioso",
        sharedEntryIds: ["entry_1"],
      });

      const res = await service.getSessionPrep("user_a", "s_1");
      expect(res.session.paymentStatus).toBe("PAID");
      expect(res.prep.intentionCiphertext).toBe("ctext");
      expect(res.prep.checkInMood).toBe("ansioso");
    });
  });

  describe("updateSessionPrep", () => {
    function mockOwnedSession() {
      prisma.therapySession.findUnique.mockResolvedValueOnce({
        id: "s_1",
        userId: "user_a",
        status: "SCHEDULED",
      });
      // Re-fetch for getSessionPrep response
      prisma.therapySession.findUnique.mockResolvedValueOnce({
        id: "s_1",
        userId: "user_a",
        therapist: makeTherapist(),
        scheduledAt: new Date("2099-01-01"),
        durationMin: 50,
        modality: "INDIVIDUAL",
        paymentStatus: "PENDING",
        intentionCiphertext: "ctext",
        intentionNonce: "nonce",
        checkInMood: "calmo",
        sharedEntryIds: [],
      });
    }

    it("throws 400 when cipher/nonce pairing broken", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
        status: "SCHEDULED",
      });
      await expect(
        service.updateSessionPrep("user_a", "s_1", {
          intentionCiphertext: "ctext",
          // nonce missing — pairing broken
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws 400 when session status is not SCHEDULED", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
        status: "COMPLETED",
      });
      await expect(
        service.updateSessionPrep("user_a", "s_1", { checkInMood: "ansioso" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("updates fields and returns refreshed prep", async () => {
      mockOwnedSession();
      prisma.therapySession.update.mockResolvedValue({});

      const res = await service.updateSessionPrep("user_a", "s_1", {
        intentionCiphertext: "ctext",
        intentionNonce: "nonce",
        checkInMood: "calmo",
      });
      expect(res.prep.checkInMood).toBe("calmo");
      expect(prisma.therapySession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "s_1" },
          data: expect.objectContaining({
            intentionCiphertext: "ctext",
            intentionNonce: "nonce",
            checkInMood: "calmo",
          }),
        }),
      );
    });
  });

  // ── Sala + Feedback + Technical (S65) ──────────────────────────────────

  describe("joinSession", () => {
    it("throws 404 when missing", async () => {
      prisma.therapySession.findUnique.mockResolvedValue(null);
      await expect(
        service.joinSession("user_a", "s_missing", "Test User"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws 403 when not owner", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_other",
        scheduledAt: new Date(),
        durationMin: 50,
        roomUrl: null,
      });
      await expect(
        service.joinSession("user_a", "s_1", "x"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("throws 400 when too early", async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000); // 1h ahead
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
        scheduledAt: future,
        durationMin: 50,
        roomUrl: null,
      });
      await expect(
        service.joinSession("user_a", "s_1", "x"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("issues token when in window + lazy creates room", async () => {
      const now = new Date(Date.now());
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
        scheduledAt: now,
        durationMin: 50,
        roomUrl: null,
      });
      prisma.therapySession.update.mockResolvedValue({});

      const res = await service.joinSession("user_a", "s_1", "JD");
      expect(res.roomUrl).toContain("fake-room");
      expect(res.joinToken).toContain("fake-token");
      expect(res.isProviderConfigured).toBe(false);
      expect(prisma.therapySession.update).toHaveBeenCalled();
    });
  });

  describe("submitFeedback", () => {
    it("throws 404 when missing", async () => {
      prisma.therapySession.findUnique.mockResolvedValue(null);
      await expect(
        service.submitFeedback("user_a", "s_missing", { rating: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws 403 when not owner", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_other",
        status: "COMPLETED",
      });
      await expect(
        service.submitFeedback("user_a", "s_1", { rating: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("throws 400 when status is CANCELLED", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
        status: "CANCELLED",
      });
      await expect(
        service.submitFeedback("user_a", "s_1", { rating: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws 400 on cipher/nonce pairing broken", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
        status: "IN_PROGRESS",
      });
      await expect(
        service.submitFeedback("user_a", "s_1", {
          rating: 5,
          noteCiphertext: "x",
          // noteNonce missing
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("updates session and marks COMPLETED", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
        status: "IN_PROGRESS",
      });
      prisma.therapySession.update.mockResolvedValue({});

      const res = await service.submitFeedback("user_a", "s_1", {
        rating: 5,
        tags: ["empático", "puntual"],
      });
      expect(res).toEqual({ ok: true, status: "COMPLETED" });
      expect(prisma.therapySession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "COMPLETED",
            feedbackRating: 5,
            feedbackTags: ["empático", "puntual"],
          }),
        }),
      );
    });
  });

  describe("reportTechnical", () => {
    it("throws 404 when missing", async () => {
      prisma.therapySession.findUnique.mockResolvedValue(null);
      await expect(
        service.reportTechnical("user_a", "s_missing", {
          issue: "AUDIO_FAILED",
          description: "no audio",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws 403 when not owner", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_other",
      });
      await expect(
        service.reportTechnical("user_a", "s_1", {
          issue: "OTHER",
          description: "x",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("creates report row and returns id", async () => {
      prisma.therapySession.findUnique.mockResolvedValue({
        id: "s_1",
        userId: "user_a",
      });
      prisma.therapyTechnicalReport.create.mockResolvedValue({ id: "rep_1" });

      const res = await service.reportTechnical("user_a", "s_1", {
        issue: "VIDEO_FAILED",
        description: "Cámara congelada todo el tiempo",
      });
      expect(res).toEqual({ id: "rep_1" });
      expect(prisma.therapyTechnicalReport.create).toHaveBeenCalledWith({
        data: {
          sessionId: "s_1",
          userId: "user_a",
          issue: "VIDEO_FAILED",
          description: "Cámara congelada todo el tiempo",
        },
      });
    });
  });
});
