import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PrismaService } from "../prisma";
import { TerapiaService } from "./terapia.service";

type PrismaMock = {
  therapySession: {
    findFirst: ReturnType<typeof vi.fn>;
  };
  therapyPrescription: {
    findMany: ReturnType<typeof vi.fn>;
  };
  crisisLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

describe("TerapiaService", () => {
  let service: TerapiaService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      therapySession: { findFirst: vi.fn() },
      therapyPrescription: { findMany: vi.fn() },
      crisisLog: { create: vi.fn() },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TerapiaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = mod.get(TerapiaService);
  });

  describe("getCrisis", () => {
    it("returns Ecuador lines for EC country", () => {
      const res = service.getCrisis("EC");
      expect(res.country).toBe("EC");
      expect(res.lines.length).toBeGreaterThan(0);
      expect(res.lines[0].phone).toBeTruthy();
    });

    it("returns Ecuador as default when country is undefined", () => {
      const res = service.getCrisis(undefined);
      expect(res.country).toBe("EC");
    });

    it("falls back to international for unknown country", () => {
      const res = service.getCrisis("ZZ");
      expect(res.country).toBe("INTL");
      expect(res.lines.length).toBeGreaterThan(0);
    });

    it("normalizes lowercase country codes", () => {
      const res = service.getCrisis("ec");
      expect(res.country).toBe("EC");
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

    it("allows anonymous logs (userId = null)", async () => {
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

  describe("getHub", () => {
    it("returns empty state when user has no sessions or prescriptions", async () => {
      prisma.therapySession.findFirst.mockResolvedValue(null);
      prisma.therapyPrescription.findMany.mockResolvedValue([]);

      const res = await service.getHub("user_a");
      expect(res.activeTherapist).toBeNull();
      expect(res.nextSession).toBeNull();
      expect(res.recentPrescriptions).toEqual([]);
      expect(res.intro).toContain("acto valiente");
    });

    it("surfaces the last completed therapist as activeTherapist", async () => {
      const therapist = {
        id: "t_1",
        name: "Marina Quintana",
        initials: "MQ",
        title: "Psicóloga clínica",
        avatarUrl: null,
        coverToken: "warm",
        modalities: ["INDIVIDUAL" as const],
        specialties: ["ansiedad"],
        priceUsd: 45,
        currency: "USD",
        avgRating: 4.7,
        reviewsCount: 23,
      };
      prisma.therapySession.findFirst
        .mockResolvedValueOnce({
          id: "s_completed",
          therapist,
          status: "COMPLETED",
          scheduledAt: new Date("2026-06-01"),
        })
        .mockResolvedValueOnce(null); // no nextSession
      prisma.therapyPrescription.findMany.mockResolvedValue([]);

      const res = await service.getHub("user_a");
      expect(res.activeTherapist?.id).toBe("t_1");
      expect(res.activeTherapist?.avgRating).toBe(4.7);
      expect(res.nextSession).toBeNull();
    });

    it("returns nextSession when a SCHEDULED session exists", async () => {
      const therapist = {
        id: "t_2",
        name: "X",
        initials: "X",
        title: "X",
        avatarUrl: null,
        coverToken: "warm",
        modalities: ["INDIVIDUAL" as const],
        specialties: [],
        priceUsd: 30,
        currency: "USD",
        avgRating: 0,
        reviewsCount: 0,
      };
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      prisma.therapySession.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "s_next",
          therapist,
          scheduledAt: future,
          durationMin: 50,
          modality: "INDIVIDUAL",
        });
      prisma.therapyPrescription.findMany.mockResolvedValue([]);

      const res = await service.getHub("user_a");
      expect(res.nextSession?.id).toBe("s_next");
      expect(res.nextSession?.scheduledAt).toBe(future.toISOString());
    });

    it("caps recent prescriptions at 3 by query take", async () => {
      prisma.therapySession.findFirst.mockResolvedValue(null);
      prisma.therapyPrescription.findMany.mockResolvedValue([
        {
          id: "p_1",
          kind: "BOOK",
          targetId: "book_a",
          dosage: "1 capítulo / día",
          note: null,
          dueBy: null,
          completedAt: null,
        },
      ]);

      await service.getHub("user_a");
      expect(prisma.therapyPrescription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });
  });
});
