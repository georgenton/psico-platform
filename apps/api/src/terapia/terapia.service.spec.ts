import { Test, type TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PrismaService } from "../prisma";
import { TerapiaService } from "./terapia.service";

type PrismaMock = {
  therapySession: { findFirst: ReturnType<typeof vi.fn> };
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
};

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
      therapySession: { findFirst: vi.fn() },
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
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TerapiaService,
        { provide: PrismaService, useValue: prisma },
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
});
