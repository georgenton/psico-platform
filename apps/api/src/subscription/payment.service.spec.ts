import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingPlan } from "./dto/checkout-session.dto";
import { PaymentService } from "./payment.service";

const mockStripeProvider = {
  name: "stripe",
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  handleWebhook: vi.fn(),
  listInvoices: vi.fn(),
  cancelAtPeriodEnd: vi.fn(),
  reactivate: vi.fn(),
  supportsRecurring: vi.fn().mockReturnValue(true),
};

const mockPayphoneProvider = {
  name: "payphone",
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  handleWebhook: vi.fn(),
  listInvoices: vi.fn(),
  cancelAtPeriodEnd: vi.fn(),
  reactivate: vi.fn(),
  supportsRecurring: vi.fn().mockReturnValue(false),
};

function makeService(defaultProvider: "stripe" | "payphone" = "stripe") {
  const mockConfig = {
    get: vi.fn().mockReturnValue(defaultProvider),
  };
  return new PaymentService(
    mockStripeProvider as never,
    mockPayphoneProvider as never,
    mockConfig as never,
  );
}

describe("PaymentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── selectProvider ───────────────────────────────────────────────────────

  describe("selectProvider", () => {
    it("devuelve StripeProvider cuando DEFAULT_PAYMENT_PROVIDER=stripe", () => {
      const service = makeService("stripe");
      expect(service.selectProvider().name).toBe("stripe");
    });

    it("devuelve PayphoneProvider cuando DEFAULT_PAYMENT_PROVIDER=payphone", () => {
      const service = makeService("payphone");
      expect(service.selectProvider().name).toBe("payphone");
    });
  });

  // ─── createCheckoutSession ────────────────────────────────────────────────

  describe("createCheckoutSession", () => {
    it("delega al StripeProvider cuando es el provider activo", async () => {
      mockStripeProvider.createCheckoutSession.mockResolvedValue({
        url: "https://checkout.stripe.com/test",
      });
      const service = makeService("stripe");

      const result = await service.createCheckoutSession(
        "user-1",
        BillingPlan.PRO_MONTHLY,
        "https://success.com",
        "https://cancel.com",
      );

      expect(mockStripeProvider.createCheckoutSession).toHaveBeenCalledWith(
        "user-1",
        BillingPlan.PRO_MONTHLY,
        "https://success.com",
        "https://cancel.com",
      );
      expect(result.url).toBe("https://checkout.stripe.com/test");
    });

    it("delega al PayphoneProvider cuando es el provider activo", async () => {
      mockPayphoneProvider.createCheckoutSession.mockRejectedValue(
        new Error("Not implemented"),
      );
      const service = makeService("payphone");

      await expect(
        service.createCheckoutSession(
          "user-1",
          BillingPlan.PRO_MONTHLY,
          "https://success.com",
          "https://cancel.com",
        ),
      ).rejects.toThrow("Not implemented");

      expect(mockPayphoneProvider.createCheckoutSession).toHaveBeenCalled();
      expect(mockStripeProvider.createCheckoutSession).not.toHaveBeenCalled();
    });
  });

  // ─── createPortalSession ──────────────────────────────────────────────────

  describe("createPortalSession", () => {
    it("delega al provider correcto con los argumentos exactos", async () => {
      mockStripeProvider.createPortalSession.mockResolvedValue({
        url: "https://billing.stripe.com/portal",
      });
      const service = makeService("stripe");

      const result = await service.createPortalSession("user-1", {
        returnUrl: "https://app.psico.com/billing",
      });

      expect(mockStripeProvider.createPortalSession).toHaveBeenCalledWith(
        "user-1",
        { returnUrl: "https://app.psico.com/billing" },
      );
      expect(result.url).toBe("https://billing.stripe.com/portal");
    });
  });

  // ─── handleWebhook ────────────────────────────────────────────────────────

  describe("handleWebhook", () => {
    it("delega al provider correcto", async () => {
      mockStripeProvider.handleWebhook.mockResolvedValue(undefined);
      const service = makeService("stripe");
      const rawBody = Buffer.from("{}");

      await service.handleWebhook(rawBody, "sig_123");

      expect(mockStripeProvider.handleWebhook).toHaveBeenCalledWith(
        rawBody,
        "sig_123",
      );
    });

    it("propaga errores del provider sin modificarlos", async () => {
      mockStripeProvider.handleWebhook.mockRejectedValue(
        new Error("Webhook processing failed"),
      );
      const service = makeService("stripe");

      await expect(
        service.handleWebhook(Buffer.from("{}"), "sig"),
      ).rejects.toThrow("Webhook processing failed");
    });
  });
});
