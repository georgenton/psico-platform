import { Plan, SubscriptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPlan } from "./dto/checkout-session.dto";
import { SubscriptionService } from "./subscription.service";

vi.mock("@prisma/client", () => ({
  Plan: { FREE: "FREE", PRO: "PRO", ANNUAL: "ANNUAL", B2B: "B2B" },
  SubscriptionStatus: {
    ACTIVE: "ACTIVE",
    TRIALING: "TRIALING",
    PAST_DUE: "PAST_DUE",
    CANCELED: "CANCELED",
    INCOMPLETE: "INCOMPLETE",
  },
}));

const mockPrisma = {
  subscription: { findUnique: vi.fn() },
};

const mockPaymentService = {
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  handleWebhook: vi.fn(),
};

const USER_ID = "user-abc";

const mockSubscription = {
  id: "sub-1",
  plan: Plan.PRO,
  status: SubscriptionStatus.ACTIVE,
  currentPeriodStart: new Date("2026-04-01"),
  currentPeriodEnd: new Date("2026-05-01"),
  cancelAtPeriodEnd: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("SubscriptionService (orchestrator)", () => {
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SubscriptionService(
      mockPrisma as never,
      mockPaymentService as never,
    );
  });

  // ─── getPlans ─────────────────────────────────────────────────────────────

  describe("getPlans", () => {
    it("retorna los 4 planes correctamente estructurados", () => {
      const plans = service.getPlans();

      expect(plans).toHaveLength(4);
      expect(plans.map((p) => p.plan)).toEqual([
        "FREE",
        "PRO",
        "ANNUAL",
        "B2B",
      ]);
    });

    it("plan PRO tiene precio mensual $7 y anual $59", () => {
      const pro = service.getPlans().find((p) => p.plan === "PRO")!;

      expect(pro.prices.monthly).toBe(7);
      expect(pro.prices.yearly).toBe(59);
      expect(pro.prices.currency).toBe("USD");
    });

    it("plan B2B tiene precio mensual $120", () => {
      const b2b = service.getPlans().find((p) => p.plan === "B2B")!;

      expect(b2b.prices.monthly).toBe(120);
    });

    it("todos los planes tienen features como array no vacío", () => {
      service.getPlans().forEach((plan) => {
        expect(Array.isArray(plan.features)).toBe(true);
        expect(plan.features.length).toBeGreaterThan(0);
      });
    });
  });

  // ─── getMySubscription ────────────────────────────────────────────────────

  describe("getMySubscription", () => {
    it("retorna null si el usuario no tiene suscripción", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      expect(await service.getMySubscription(USER_ID)).toBeNull();
    });

    it("retorna la suscripción activa del usuario", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);

      const result = await service.getMySubscription(USER_ID);

      expect(result?.plan).toBe(Plan.PRO);
      expect(result?.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  // ─── delegación a PaymentService ─────────────────────────────────────────

  describe("createCheckoutSession", () => {
    it("delega a PaymentService con los argumentos correctos", async () => {
      mockPaymentService.createCheckoutSession.mockResolvedValue({
        url: "https://checkout.stripe.com/test",
      });

      const result = await service.createCheckoutSession(
        USER_ID,
        BillingPlan.PRO_MONTHLY,
        "https://success.com",
        "https://cancel.com",
      );

      expect(mockPaymentService.createCheckoutSession).toHaveBeenCalledWith(
        USER_ID,
        BillingPlan.PRO_MONTHLY,
        "https://success.com",
        "https://cancel.com",
      );
      expect(result.url).toBe("https://checkout.stripe.com/test");
    });
  });

  describe("createPortalSession", () => {
    it("delega a PaymentService con los argumentos correctos", async () => {
      mockPaymentService.createPortalSession.mockResolvedValue({
        url: "https://billing.stripe.com/portal",
      });

      const result = await service.createPortalSession(USER_ID, {
        returnUrl: "https://app.psico.com/billing",
      });

      expect(mockPaymentService.createPortalSession).toHaveBeenCalledWith(
        USER_ID,
        { returnUrl: "https://app.psico.com/billing" },
      );
      expect(result.url).toBe("https://billing.stripe.com/portal");
    });
  });

  describe("handleWebhook", () => {
    it("delega a PaymentService con rawBody y signature", async () => {
      mockPaymentService.handleWebhook.mockResolvedValue(undefined);
      const rawBody = Buffer.from("{}");

      await service.handleWebhook(rawBody, "stripe-sig");

      expect(mockPaymentService.handleWebhook).toHaveBeenCalledWith(
        rawBody,
        "stripe-sig",
      );
    });

    it("propaga errores del PaymentService sin modificarlos", async () => {
      mockPaymentService.handleWebhook.mockRejectedValue(
        new Error("Invalid signature"),
      );

      await expect(
        service.handleWebhook(Buffer.from("{}"), "bad-sig"),
      ).rejects.toThrow("Invalid signature");
    });
  });
});
