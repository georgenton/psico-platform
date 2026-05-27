import { Plan, SubscriptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPlan } from "./dto/checkout-session.dto";
import { SubscriptionService } from "./subscription.service";

vi.mock("@prisma/client", () => ({
  // Stub PrismaClient class — PrismaService extends it but in unit tests we
  // never instantiate. SWC (vitest transformer post Sprint S1) eagerly
  // evaluates this import; without a class export the module fails to load.
  PrismaClient: class {},
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
  listInvoices: vi.fn(),
  cancelAtPeriodEnd: vi.fn(),
  reactivate: vi.fn(),
};

const mockUsageService = {
  getUsage: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
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
      mockUsageService as never,
    );
    mockUsageService.invalidate.mockResolvedValue(undefined);
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

  // ─── Sprint S7: usage + invoices + cancel + reactivate ───────────────────

  describe("getUsage", () => {
    it("delega a UsageService.getUsage", async () => {
      const expected = {
        plan: "PRO" as const,
        period: {
          start: new Date(),
          end: new Date(),
          source: "subscription" as const,
        },
        books: { completedThisPeriod: 0 },
        eco: { messagesThisPeriod: 0, quota: 200 },
        voice: { minutesThisPeriod: 0, quota: 120 },
        diary: { entriesThisPeriod: 7, quota: null },
      };
      mockUsageService.getUsage.mockResolvedValue(expected);

      const result = await service.getUsage(USER_ID);

      expect(mockUsageService.getUsage).toHaveBeenCalledWith(USER_ID);
      expect(result).toBe(expected);
    });
  });

  describe("listInvoices", () => {
    it("envuelve la respuesta del PaymentService en { invoices }", async () => {
      mockPaymentService.listInvoices.mockResolvedValue([
        { id: "in_1", amount: 7, currency: "usd", status: "paid" },
      ]);

      const result = await service.listInvoices(USER_ID, 5);

      expect(mockPaymentService.listInvoices).toHaveBeenCalledWith(USER_ID, 5);
      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0]?.id).toBe("in_1");
    });
  });

  describe("cancel", () => {
    it("delega a PaymentService.cancelAtPeriodEnd y devuelve el envelope ok=true", async () => {
      const effectiveAt = new Date("2026-06-01");
      mockPaymentService.cancelAtPeriodEnd.mockResolvedValue({
        cancelAtPeriodEnd: true,
        effectiveAt,
      });

      const result = await service.cancel(USER_ID, "razón opcional");

      expect(mockPaymentService.cancelAtPeriodEnd).toHaveBeenCalledWith(
        USER_ID,
        "razón opcional",
      );
      expect(result).toEqual({
        ok: true,
        cancelAtPeriodEnd: true,
        effectiveAt,
      });
    });

    it("invalida el cache de usage para que el banner aparezca de inmediato", async () => {
      mockPaymentService.cancelAtPeriodEnd.mockResolvedValue({
        cancelAtPeriodEnd: true,
        effectiveAt: new Date(),
      });

      await service.cancel(USER_ID, undefined);

      expect(mockUsageService.invalidate).toHaveBeenCalledWith(USER_ID);
    });

    it("propaga el BadRequestException si el usuario no tiene una sub activa", async () => {
      mockPaymentService.cancelAtPeriodEnd.mockRejectedValue(
        new Error("NO_ACTIVE_SUBSCRIPTION"),
      );

      await expect(service.cancel(USER_ID, undefined)).rejects.toThrow(
        "NO_ACTIVE_SUBSCRIPTION",
      );
      // No cache invalidation cuando falla — sería un side effect indeseado.
      expect(mockUsageService.invalidate).not.toHaveBeenCalled();
    });
  });

  describe("reactivate", () => {
    it("delega a PaymentService.reactivate y bustea el cache", async () => {
      mockPaymentService.reactivate.mockResolvedValue({
        cancelAtPeriodEnd: false,
      });

      const result = await service.reactivate(USER_ID);

      expect(mockPaymentService.reactivate).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual({ ok: true, cancelAtPeriodEnd: false });
      expect(mockUsageService.invalidate).toHaveBeenCalledWith(USER_ID);
    });
  });
});
