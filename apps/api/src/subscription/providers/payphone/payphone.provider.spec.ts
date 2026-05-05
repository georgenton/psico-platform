import { NotImplementedException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import { BillingPlan } from "../../dto/checkout-session.dto";
import { PayphoneProvider } from "./payphone.provider";

describe("PayphoneProvider", () => {
  let provider: PayphoneProvider;

  beforeEach(() => {
    provider = new PayphoneProvider();
  });

  it('name es "payphone"', () => {
    expect(provider.name).toBe("payphone");
  });

  it("supportsRecurring() es false — Payphone es pago único", () => {
    expect(provider.supportsRecurring()).toBe(false);
  });

  it("createCheckoutSession() lanza NotImplementedException", async () => {
    await expect(
      provider.createCheckoutSession(
        "user-1",
        BillingPlan.PRO_MONTHLY,
        "https://success.com",
        "https://cancel.com",
      ),
    ).rejects.toThrow(NotImplementedException);
  });

  it("createPortalSession() lanza NotImplementedException", async () => {
    await expect(
      provider.createPortalSession("user-1", {
        returnUrl: "https://return.com",
      }),
    ).rejects.toThrow(NotImplementedException);
  });

  it("handleWebhook() lanza NotImplementedException", async () => {
    await expect(
      provider.handleWebhook(Buffer.from("{}"), "token"),
    ).rejects.toThrow(NotImplementedException);
  });

  it('getWebhookEventType() retorna "payphone.unknown" sin lanzar error', () => {
    const result = provider.getWebhookEventType(Buffer.from("{}"), "token");
    expect(result).toBe("payphone.unknown");
  });
});
