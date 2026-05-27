import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Plan, SubscriptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPlan } from "../../dto/checkout-session.dto";
import { StripeProvider } from "./stripe.provider";

vi.mock("@prisma/client", () => ({
  // Stub PrismaClient class — see subscription.service.spec.ts comment.
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

const mockStripeCheckoutCreate = vi.fn();
const mockStripePortalCreate = vi.fn();
const mockStripeCustomerCreate = vi.fn();
const mockStripeWebhooksConstructEvent = vi.fn();
const mockStripeInvoicesList = vi.fn();
const mockStripeSubscriptionsRetrieve = vi.fn();
const mockStripeSubscriptionsUpdate = vi.fn();

vi.mock("stripe", () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    customers: { create: mockStripeCustomerCreate },
    checkout: { sessions: { create: mockStripeCheckoutCreate } },
    billingPortal: { sessions: { create: mockStripePortalCreate } },
    webhooks: { constructEvent: mockStripeWebhooksConstructEvent },
    invoices: { list: mockStripeInvoicesList },
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
      update: mockStripeSubscriptionsUpdate,
    },
  }));
  MockStripe.Stripe = MockStripe;
  return { default: MockStripe };
});

const mockPrisma = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  subscription: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  stripeEvent: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
};

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

const USER_ID = "user-abc";
const mockUser = {
  id: USER_ID,
  email: "test@example.com",
  name: "Test User",
  stripeCustomerId: null,
};

function makeStripeSub(overrides = {}) {
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

describe("StripeProvider", () => {
  let provider: StripeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );
    provider = new StripeProvider(mockPrisma as never, mockConfig as never);
  });

  // ─── metadata ─────────────────────────────────────────────────────────────

  it('name es "stripe"', () => {
    expect(provider.name).toBe("stripe");
  });

  it("supportsRecurring() es true", () => {
    expect(provider.supportsRecurring()).toBe(true);
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

      const result = await provider.createCheckoutSession(
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
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: "cus_existing",
      });
      mockStripeCheckoutCreate.mockResolvedValue({
        url: "https://checkout.stripe.com/test",
      });

      await provider.createCheckoutSession(
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
        provider.createCheckoutSession(
          "no-such-user",
          BillingPlan.PRO_MONTHLY,
          "https://app.psico.com/success",
          "https://app.psico.com/cancel",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("lanza BadRequestException si Stripe no devuelve URL", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: "cus_existing",
      });
      mockStripeCheckoutCreate.mockResolvedValue({ url: null });

      await expect(
        provider.createCheckoutSession(
          USER_ID,
          BillingPlan.B2B,
          "https://app.psico.com/success",
          "https://app.psico.com/cancel",
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── createPortalSession ──────────────────────────────────────────────────

  describe("createPortalSession", () => {
    it("retorna URL del portal para usuario con suscripción activa", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: "cus_existing",
      });
      mockStripePortalCreate.mockResolvedValue({
        url: "https://billing.stripe.com/portal/test",
      });

      const result = await provider.createPortalSession(USER_ID, {
        returnUrl: "https://app.psico.com/billing",
      });

      expect(result.url).toBe("https://billing.stripe.com/portal/test");
    });

    it("lanza BadRequestException si el usuario no tiene stripeCustomerId", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        stripeCustomerId: null,
      });

      await expect(
        provider.createPortalSession(USER_ID, {
          returnUrl: "https://app.psico.com/billing",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── handleWebhook ────────────────────────────────────────────────────────

  describe("handleWebhook", () => {
    it("lanza BadRequestException con firma inválida", async () => {
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      await expect(
        provider.handleWebhook(Buffer.from("{}"), "bad-sig"),
      ).rejects.toThrow(BadRequestException);
    });

    it("es idempotente: ignora eventos ya procesados", async () => {
      const event = {
        id: "evt_duplicate",
        type: "customer.subscription.created",
        data: { object: makeStripeSub() },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue({ id: "existing" });

      await provider.handleWebhook(Buffer.from("{}"), "sig");

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("procesa customer.subscription.created y actualiza BD", async () => {
      const event = {
        id: "evt_created",
        type: "customer.subscription.created",
        data: { object: makeStripeSub() },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue(null);
      mockPrisma.stripeEvent.create.mockResolvedValue({});
      mockPrisma.subscription.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      await provider.handleWebhook(Buffer.from("{}"), "sig");

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.stripeEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stripeEventId: "evt_created" }),
        }),
      );
    });

    it("procesa customer.subscription.deleted y baja el plan a FREE", async () => {
      const event = {
        id: "evt_deleted",
        type: "customer.subscription.deleted",
        data: { object: makeStripeSub({ status: "canceled" }) },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue(null);
      mockPrisma.stripeEvent.create.mockResolvedValue({});
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue({});

      await provider.handleWebhook(Buffer.from("{}"), "sig");

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: Plan.FREE } }),
      );
    });

    it("loguea eventos no manejados sin lanzar error", async () => {
      const event = {
        id: "evt_unknown",
        type: "payment_intent.created",
        data: { object: {} },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue(null);
      mockPrisma.stripeEvent.create.mockResolvedValue({});

      await expect(
        provider.handleWebhook(Buffer.from("{}"), "sig"),
      ).resolves.toBeUndefined();
    });
  });

  // ─── getWebhookEventType ──────────────────────────────────────────────────

  describe("getWebhookEventType", () => {
    it("retorna el tipo del evento cuando la firma es válida", () => {
      mockStripeWebhooksConstructEvent.mockReturnValue({
        id: "evt_1",
        type: "customer.subscription.updated",
        data: {},
      });

      const type = provider.getWebhookEventType(Buffer.from("{}"), "sig");

      expect(type).toBe("customer.subscription.updated");
    });

    it('retorna "unknown" cuando la firma es inválida', () => {
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw new Error("bad sig");
      });

      const type = provider.getWebhookEventType(Buffer.from("{}"), "bad");

      expect(type).toBe("unknown");
    });
  });

  // ─── mapPriceIdToPlan (via webhook) ───────────────────────────────────────

  describe("mapeo de price IDs a planes", () => {
    async function triggerSync(priceId: string) {
      const event = {
        id: `evt_${priceId}`,
        type: "customer.subscription.created",
        data: {
          object: makeStripeSub({
            items: {
              data: [
                {
                  price: { id: priceId },
                  current_period_start: 1743465600,
                  current_period_end: 1746144000,
                },
              ],
            },
          }),
        },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue(null);
      mockPrisma.stripeEvent.create.mockResolvedValue({});
      mockPrisma.subscription.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      await provider.handleWebhook(Buffer.from("{}"), "sig");
    }

    it("price_pro_monthly → Plan.PRO", async () => {
      await triggerSync("price_pro_monthly");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: Plan.PRO } }),
      );
    });

    it("price_pro_yearly → Plan.ANNUAL", async () => {
      vi.clearAllMocks();
      mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
        Promise.all(ops),
      );
      await triggerSync("price_pro_yearly");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: Plan.ANNUAL } }),
      );
    });

    it("price_b2b → Plan.B2B", async () => {
      vi.clearAllMocks();
      mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
        Promise.all(ops),
      );
      await triggerSync("price_b2b");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: Plan.B2B } }),
      );
    });

    it("price desconocido → Plan.FREE", async () => {
      vi.clearAllMocks();
      mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
        Promise.all(ops),
      );
      await triggerSync("price_unknown_xyz");
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { plan: Plan.FREE } }),
      );
    });
  });

  // ─── mapStripeStatus (via webhook) ────────────────────────────────────────

  describe("mapeo de status de Stripe", () => {
    async function triggerSyncWithStatus(status: string) {
      const event = {
        id: `evt_status_${status}`,
        type: "customer.subscription.updated",
        data: { object: makeStripeSub({ status }) },
      };
      mockStripeWebhooksConstructEvent.mockReturnValue(event);
      mockPrisma.stripeEvent.findUnique.mockResolvedValue(null);
      mockPrisma.stripeEvent.create.mockResolvedValue({});
      mockPrisma.subscription.upsert.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});
      await provider.handleWebhook(Buffer.from("{}"), "sig");
      const call = mockPrisma.subscription.upsert.mock.calls[0][0];
      return call.create.status as string;
    }

    it.each([
      ["active", SubscriptionStatus.ACTIVE],
      ["trialing", SubscriptionStatus.TRIALING],
      ["past_due", SubscriptionStatus.PAST_DUE],
      ["canceled", SubscriptionStatus.CANCELED],
      ["incomplete", SubscriptionStatus.INCOMPLETE],
      ["unpaid", SubscriptionStatus.INCOMPLETE],
    ])('Stripe status "%s" → %s', async (stripeStatus, expected) => {
      vi.clearAllMocks();
      mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
        Promise.all(ops),
      );
      const result = await triggerSyncWithStatus(stripeStatus);
      expect(result).toBe(expected);
    });
  });

  // ─── Sprint S7: listInvoices ─────────────────────────────────────────────

  describe("listInvoices", () => {
    it("returns empty array when user has no Stripe customer yet", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ stripeCustomerId: null });

      const invoices = await provider.listInvoices(USER_ID, 12);

      expect(invoices).toEqual([]);
      expect(mockStripeInvoicesList).not.toHaveBeenCalled();
    });

    it("maps Stripe invoices to InvoiceSummary (amount in major units)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        stripeCustomerId: "cus_123",
      });
      mockStripeInvoicesList.mockResolvedValue({
        data: [
          {
            id: "in_1",
            created: 1746144000, // 2025-05-02 in epoch seconds
            amount_paid: 700, // $7.00
            amount_due: 700,
            currency: "usd",
            status: "paid",
            invoice_pdf: "https://stripe.com/pdf",
            hosted_invoice_url: "https://stripe.com/hosted",
          },
        ],
      });

      const invoices = await provider.listInvoices(USER_ID, 12);

      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toMatchObject({
        id: "in_1",
        amount: 7, // major units
        currency: "usd",
        status: "paid",
        pdfUrl: "https://stripe.com/pdf",
        hostedUrl: "https://stripe.com/hosted",
      });
      expect(invoices[0]?.date).toBeInstanceOf(Date);
    });

    it("forwards limit to Stripe", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        stripeCustomerId: "cus_123",
      });
      mockStripeInvoicesList.mockResolvedValue({ data: [] });

      await provider.listInvoices(USER_ID, 5);

      expect(mockStripeInvoicesList).toHaveBeenCalledWith({
        customer: "cus_123",
        limit: 5,
      });
    });
  });

  // ─── Sprint S7: cancel + reactivate ──────────────────────────────────────

  describe("cancelAtPeriodEnd", () => {
    it("throws 400 NO_ACTIVE_SUBSCRIPTION when no local sub exists", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue(null);

      await expect(provider.cancelAtPeriodEnd(USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws 400 SUBSCRIPTION_NOT_CANCELLABLE for a canceled sub", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        stripeSubscriptionId: "sub_1",
        status: SubscriptionStatus.CANCELED,
      });

      await expect(provider.cancelAtPeriodEnd(USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("flips cancel_at_period_end on Stripe and mirrors locally", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        stripeSubscriptionId: "sub_stripe_123",
        status: SubscriptionStatus.ACTIVE,
      });
      mockStripeSubscriptionsRetrieve.mockResolvedValue(makeStripeSub());
      mockStripeSubscriptionsUpdate.mockResolvedValue(
        makeStripeSub({ cancel_at_period_end: true }),
      );
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });

      const result = await provider.cancelAtPeriodEnd(USER_ID, "too pricey");

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        "sub_stripe_123",
        expect.objectContaining({
          cancel_at_period_end: true,
          metadata: expect.objectContaining({
            cancellation_reason: "too pricey",
          }),
        }),
      );
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data: { cancelAtPeriodEnd: true },
      });
      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(result.effectiveAt).toBeInstanceOf(Date);
    });
  });

  describe("reactivate", () => {
    it("no-ops idempotently when the sub is not pending cancellation", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        stripeSubscriptionId: "sub_stripe_123",
        status: SubscriptionStatus.ACTIVE,
      });
      mockStripeSubscriptionsRetrieve.mockResolvedValue(
        makeStripeSub({ cancel_at_period_end: false }),
      );

      const result = await provider.reactivate(USER_ID);

      expect(result.cancelAtPeriodEnd).toBe(false);
      // Should not call update — already in the desired state.
      expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("flips cancel_at_period_end back to false on Stripe + local", async () => {
      mockPrisma.subscription.findUnique.mockResolvedValue({
        stripeSubscriptionId: "sub_stripe_123",
        status: SubscriptionStatus.ACTIVE,
      });
      mockStripeSubscriptionsRetrieve.mockResolvedValue(
        makeStripeSub({ cancel_at_period_end: true }),
      );
      mockStripeSubscriptionsUpdate.mockResolvedValue(
        makeStripeSub({ cancel_at_period_end: false }),
      );
      mockPrisma.subscription.updateMany.mockResolvedValue({ count: 1 });

      const result = await provider.reactivate(USER_ID);

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        "sub_stripe_123",
        { cancel_at_period_end: false },
      );
      expect(mockPrisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        data: { cancelAtPeriodEnd: false },
      });
      expect(result.cancelAtPeriodEnd).toBe(false);
    });
  });
});
