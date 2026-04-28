import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Plan, SubscriptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPlan } from "./dto/checkout-session.dto";
import { SubscriptionService } from "./subscription.service";

// ─── Stripe mock ──────────────────────────────────────────────────────────────
// We mock the stripe module to avoid real HTTP calls and API key requirements.

const mockStripeCheckoutCreate = vi.fn();
const mockStripePortalCreate = vi.fn();
const mockStripeCustomerCreate = vi.fn();
const mockStripeWebhooksConstructEvent = vi.fn();

vi.mock("stripe", () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    customers: { create: mockStripeCustomerCreate },
    checkout: { sessions: { create: mockStripeCheckoutCreate } },
    billingPortal: { sessions: { create: mockStripePortalCreate } },
    webhooks: { constructEvent: mockStripeWebhooksConstructEvent },
  }));
  MockStripe.Stripe = MockStripe;
  return { default: MockStripe };
});

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  stripeEvent: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

// ─── ConfigService mock ───────────────────────────────────────────────────────

const ENV = {
  STRIPE_SECRET_KEY: "sk_test_mock",
  STRIPE_WEBHOOK_SECRET: "whsec_mock",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro_monthly",
  STRIPE_PRO_YEARLY_PRICE_ID: "price_pro_yearly",
  STRIPE_B2B_PRICE_ID: "price_b2b",
};

const mockConfig = {
  get: vi.fn((key: string) => ENV[key as keyof typeof ENV] ?? ""),
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = "user-abc";

const mockUser = {
  id: USER_ID,
  email: "test@example.com",
  name: "Test User",
  stripeCustomerId: null,
};

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

function makeStripeSubscription(overrides = {}) {
  return {
    id: "sub_stripe_123",
    customer: "cus_stripe_123",
    status: "active",
    cancel_at_period_end: false,
    start_date: 1743465600,
    billing_cycle_anchor: 1746144000,
    metadata: { userId: USER_ID },
    items: {
      data: [
        {
          price: { id: "price_pro_monthly" },
          current_period_start: 1743465600,
          current_period_end: 1746144000,
        },
      ],
    },
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("SubscriptionService", () => {
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );
    service = new SubscriptionService(mockPrisma as never, mockConfig as never);
  });

  // ─── getPlans ─────────────────────────────────────────────────────────────

  describe("getPlans", () => {
    it("retorna los 4 planes correctamente estructurados", () => {
      const plans = service.getPlans();

      expect(plans).toHaveLength(4);
      const planTypes = plans.map((p) => p.plan);
      expect(planTypes).toEqual(["FREE", "PRO", "ANNUAL", "B2B"]);
    });

    it("plan PRO tiene precio mensual $7 y anual $59", () => {
      const plans = service.getPlans();
      const pro = plans.find((p) => p.plan === "PRO")!;

      expect(pro.prices.monthly).toBe(7);
      expect(pro.prices.yearly).toBe(59);
      expect(pro.prices.currency).toBe("USD");
    });

    it("plan B2B tiene precio mensual $120", () => {
      const plans = service.getPlans();
      const b2b = plans.find((p) => p.plan === "B2B")!;

      expect(b2b.prices.monthly).toBe(120);
      expect(b2b.prices.currency).toBe("USD");
    });

    it("todos los planes tienen features como array no vacío", () => {
      const plans = service.getPlans();
      plans.forEach((plan) => {
        expect(Array.isArray(plan.features)).toBe(true);
        expect(plan.features.length).toBeGreaterThan(0);
      });
    });
  });

  // ─── createCheckoutSession ────────────────────────────────────────────────

  describe("createCheckoutSession", () => {
    it("crea Stripe customer si el usuario no tiene stripeCustomerId", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockStripeCustomerCreate.mockResolvedValue({ id: "cus_new" });
      mockPrisma.user.update.mockResolvedValue({});
      mockStripeCheckoutCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/test",
      });

      const result = await service.createCheckoutSession(
        USER_ID,
        BillingPlan.PRO_MONTHLY,
        "https://app.psico.com/success",
        "https://app.psico.com/cancel",
      );

      expect(mockStripeCustomerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: mockUser.email,
          metadata: { userId: USER_ID },
        }),
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { stripeCustomerId: "cus_new" } }),
      );
      expect(result.url).toBe("https://checkout.stripe.com/test");
    });

    it("reutiliza stripeCustomerId existente sin crear customer nuevo", async () => {
      const userWithCustomer = {
        ...mockUser,
        stripeCustomerId: "cus_existing",
      };
      mockPrisma.user.findUnique.mockResolvedValue(userWithCustomer);
      mockStripeCheckoutCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/test",
      });

      await service.createCheckoutSession(
        USER_ID,
        BillingPlan.PRO_YEARLY,
        "https://app.psico.com/success",
        "https://app.psico.com/cancel",
      );

      expect(mockStripeCustomerCreate).not.toHaveBeenCalled();
      expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: "cus_existing" }),
      );
    });

    it("lanza NotFoundException si el usuario no existe", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createCheckoutSession(
          "usuario-inexistente",
          BillingPlan.PRO_MONTHLY,
          "https://app.psico.com/success",
          "https://app.psico.com/cancel",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createPortalSession ──────────────────────────────────────────────────

  describe("createPortalSession", () => {
    it("lanza BadRequestException si el usuario no tiene suscripción activa", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: null,
      });

      await expect(
        service.createPortalSession(USER_ID, {
          returnUrl: "https://app.psico.com/billing",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("retorna URL del portal si el usuario tiene suscripción", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: "cus_existing",
      });
      mockStripePortalCreate.mockResolvedValue({
        url: "https://billing.stripe.com/portal/test",
      });

      const result = await service.createPortalSession(USER_ID, {
        returnUrl: "https://app.psico.com/billing",
      });

      expect(result.url).toBe("https://billing.stripe.com/portal/test");
    });
  });

  // ─── getMySubscription ────────────────────────────────────────────────────

  describe("getMySubscription", () => {
    it("retorna null si el usuario no tiene suscripción", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      const result = await service.getMySubscription(USER_ID);

      expect(result).toBeNull();
    });

    it("retorna la suscripción activa del usuario", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(mockSubscription);

      const result = await service.getMySubscription(USER_ID);

      expect(result?.plan).toBe(Plan.PRO);
      expect(result?.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  // ─── handleWebhook ────────────────────────────────────────────────────────

  describe("handleWebhook", () => {
    it("lanza BadRequestException si la firma de Stripe es inválida", async () => {
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      await expect(
        service.handleWebhook(Buffer.from("{}"), "invalid-sig"),
      ).rejects.toThrow(BadRequestException);
    });

    it("es idempotente: ignora evento ya procesado", async () => {
      const event = {
        id: "evt_already_processed",
        type: "customer.subscription.created",
        data: { object: makeStripeSubscription() },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue({
        id: "record-1",
        stripeEventId: "evt_already_processed",
      });

      await service.handleWebhook(Buffer.from("{}"), "sig");

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("procesa customer.subscription.created y actualiza BD", async () => {
      const stripeSub = makeStripeSubscription();
      const event = {
        id: "evt_new",
        type: "customer.subscription.created",
        data: { object: stripeSub },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue(null);
      mockPrisma.stripeEvent.create.mockResolvedValue({});
      mockPrisma.subscription.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      await service.handleWebhook(Buffer.from("{}"), "sig");

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.stripeEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stripeEventId: "evt_new" }),
        }),
      );
    });

    it("procesa customer.subscription.deleted y baja el plan a FREE", async () => {
      const stripeSub = makeStripeSubscription({ status: "canceled" });
      const event = {
        id: "evt_canceled",
        type: "customer.subscription.deleted",
        data: { object: stripeSub },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue(null);
      mockPrisma.stripeEvent.create.mockResolvedValue({});
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue({});

      await service.handleWebhook(Buffer.from("{}"), "sig");

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: Plan.FREE } }),
      );
    });
  });
});
