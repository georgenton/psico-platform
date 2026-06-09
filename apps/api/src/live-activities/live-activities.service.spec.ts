import { Test, type TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PrismaService } from "../prisma";
import { LiveActivitiesService } from "./live-activities.service";
import { APNS_PROVIDER } from "./tokens";
import type { IApnsProvider } from "./providers/apns-provider.interface";

type PrismaMock = {
  liveActivityToken: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function makeApns(overrides: Partial<IApnsProvider> = {}): IApnsProvider {
  return {
    sendUpdate: vi.fn().mockResolvedValue({ ok: true }),
    isConfigured: vi.fn().mockReturnValue(true),
    ...overrides,
  } as IApnsProvider;
}

describe("LiveActivitiesService", () => {
  let service: LiveActivitiesService;
  let prisma: PrismaMock;
  let apns: IApnsProvider;

  beforeEach(async () => {
    prisma = {
      liveActivityToken: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };
    apns = makeApns();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        LiveActivitiesService,
        { provide: PrismaService, useValue: prisma },
        { provide: APNS_PROVIDER, useValue: apns },
      ],
    }).compile();
    service = mod.get(LiveActivitiesService);
  });

  describe("register", () => {
    it("upserts on (userId, activityId) and returns provider state", async () => {
      prisma.liveActivityToken.upsert.mockResolvedValue({ id: "row_1" });
      vi.mocked(apns.isConfigured).mockReturnValue(false);

      const res = await service.register("user_a", {
        activityId: "act_42",
        kind: "ECO_ACTIVE",
        pushToken: "deadbeef".repeat(8),
        bundleId: "com.psico.platform",
      });

      expect(prisma.liveActivityToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_activityId: { userId: "user_a", activityId: "act_42" } },
          update: expect.objectContaining({
            pushToken: "deadbeef".repeat(8),
            dismissedAt: null,
          }),
          create: expect.objectContaining({
            userId: "user_a",
            activityId: "act_42",
            kind: "ECO_ACTIVE",
          }),
        }),
      );
      expect(res).toEqual({ id: "row_1", isProviderConfigured: false });
    });
  });

  describe("dismiss", () => {
    it("throws 404 when activity not found", async () => {
      prisma.liveActivityToken.findUnique.mockResolvedValue(null);
      await expect(service.dismiss("user_a", "act_x")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("is idempotent when already dismissed", async () => {
      prisma.liveActivityToken.findUnique.mockResolvedValue({
        id: "row_1",
        userId: "user_a",
        activityId: "act_42",
        pushToken: "tok",
        bundleId: "com.psico.platform",
        dismissedAt: new Date(),
      });
      await service.dismiss("user_a", "act_42");
      expect(prisma.liveActivityToken.update).not.toHaveBeenCalled();
      expect(apns.sendUpdate).not.toHaveBeenCalled();
    });

    it("sends APNs end event + marks dismissedAt when provider is configured", async () => {
      prisma.liveActivityToken.findUnique.mockResolvedValue({
        id: "row_1",
        userId: "user_a",
        activityId: "act_42",
        pushToken: "tok",
        bundleId: "com.psico.platform",
        dismissedAt: null,
      });
      vi.mocked(apns.isConfigured).mockReturnValue(true);

      await service.dismiss("user_a", "act_42");

      expect(apns.sendUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ event: "end", contentState: {} }),
      );
      expect(prisma.liveActivityToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dismissedAt: expect.any(Date) }),
        }),
      );
    });

    it("still marks dismissed when APNs end event fails", async () => {
      prisma.liveActivityToken.findUnique.mockResolvedValue({
        id: "row_1",
        userId: "user_a",
        activityId: "act_42",
        pushToken: "tok",
        bundleId: "com.psico.platform",
        dismissedAt: null,
      });
      vi.mocked(apns.isConfigured).mockReturnValue(true);
      vi.mocked(apns.sendUpdate).mockRejectedValue(new Error("apns 500"));

      await service.dismiss("user_a", "act_42");

      expect(prisma.liveActivityToken.update).toHaveBeenCalled();
    });
  });

  describe("pushUpdate", () => {
    it("returns not_configured when provider is a stub", async () => {
      prisma.liveActivityToken.findUnique.mockResolvedValue({
        id: "row_1",
        userId: "user_a",
        activityId: "act_42",
        pushToken: "tok",
        bundleId: "com.psico.platform",
        dismissedAt: null,
      });
      vi.mocked(apns.isConfigured).mockReturnValue(false);

      const res = await service.pushUpdate("user_a", "act_42", { progressPct: 33 });
      expect(res).toEqual({ ok: false, reason: "not_configured" });
      expect(apns.sendUpdate).not.toHaveBeenCalled();
    });

    it("prunes the row when APNs returns invalidToken (410 Gone)", async () => {
      prisma.liveActivityToken.findUnique.mockResolvedValue({
        id: "row_1",
        userId: "user_a",
        activityId: "act_42",
        pushToken: "tok",
        bundleId: "com.psico.platform",
        dismissedAt: null,
      });
      vi.mocked(apns.isConfigured).mockReturnValue(true);
      vi.mocked(apns.sendUpdate).mockResolvedValue({ ok: false, invalidToken: true });

      const res = await service.pushUpdate("user_a", "act_42", { etaMinutes: 12 });
      expect(res).toEqual({ ok: false, reason: "invalid_token" });
      expect(prisma.liveActivityToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dismissedAt: expect.any(Date) }),
        }),
      );
    });

    it("happy path delivers update", async () => {
      prisma.liveActivityToken.findUnique.mockResolvedValue({
        id: "row_1",
        userId: "user_a",
        activityId: "act_42",
        pushToken: "tok",
        bundleId: "com.psico.platform",
        dismissedAt: null,
      });
      vi.mocked(apns.isConfigured).mockReturnValue(true);
      const res = await service.pushUpdate(
        "user_a",
        "act_42",
        { etaMinutes: 12 },
        { event: "update" },
      );
      expect(res).toEqual({ ok: true });
      expect(apns.sendUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          pushToken: "tok",
          bundleId: "com.psico.platform",
          contentState: { etaMinutes: 12 },
          event: "update",
        }),
      );
    });

    it("throws 404 when activity does not exist or already dismissed", async () => {
      prisma.liveActivityToken.findUnique.mockResolvedValue(null);
      await expect(
        service.pushUpdate("user_a", "act_x", {}),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.liveActivityToken.findUnique.mockResolvedValue({
        id: "row_1",
        userId: "user_a",
        activityId: "act_42",
        pushToken: "tok",
        bundleId: "com.psico.platform",
        dismissedAt: new Date(),
      });
      await expect(
        service.pushUpdate("user_a", "act_42", {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("listActive", () => {
    it("returns only non-dismissed rows", async () => {
      prisma.liveActivityToken.findMany.mockResolvedValue([
        { id: "row_1", activityId: "act_42", kind: "ECO_ACTIVE", bundleId: "x", createdAt: new Date() },
      ]);
      const res = await service.listActive("user_a");
      expect(prisma.liveActivityToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user_a", dismissedAt: null },
        }),
      );
      expect(res).toHaveLength(1);
    });
  });
});
