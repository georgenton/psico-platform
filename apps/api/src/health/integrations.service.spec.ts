import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { IntegrationsService } from "./integrations.service";

/**
 * Tests for IntegrationsService.
 *
 * The service is a pure projection from env vars to a typed report. We
 * stub ConfigService with a simple Map-backed get so each test can pin
 * exactly the keys it cares about.
 */

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe("IntegrationsService.report", () => {
  it("reports everything missing on an empty env", () => {
    const svc = new IntegrationsService(makeConfig({}));
    const r = svc.report();
    expect(r.stripe.secretKey.configured).toBe(false);
    expect(r.anthropic.configured).toBe(false);
    expect(r.resend.configured).toBe(false);
    expect(r.google.configured).toBe(false);
    expect(r.redis.configured).toBe(false);
    expect(r.webPush.configured).toBe(false);
    expect(r.r2.configured).toBe(false);
  });

  it("flags stub values without leaking the actual value", () => {
    const svc = new IntegrationsService(
      makeConfig({
        STRIPE_PRO_MONTHLY_PRICE_ID: "price_stub_monthly",
        ANTHROPIC_API_KEY: "stub",
      }),
    );
    const r = svc.report();
    expect(r.stripe.priceIds.proMonthly).toEqual({
      configured: true,
      stub: true,
    });
    expect(r.anthropic).toEqual({ configured: true, stub: true });
    // The report shape never contains the raw value (only booleans).
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain("price_stub_monthly");
    expect(serialized).not.toContain("sk-ant");
    // Field name "anthropic" is expected as a key — the value is just
    // `{configured, stub}`, no raw env data.
  });

  it("reports a real-looking value as configured + not stub", () => {
    const svc = new IntegrationsService(
      makeConfig({ STRIPE_SECRET_KEY: "sk-redacted-fake" }),
    );
    expect(svc.report().stripe.secretKey).toEqual({ configured: true });
  });

  it("routes the voice key based on VOICE_PROVIDER", () => {
    const whisper = new IntegrationsService(
      makeConfig({ VOICE_PROVIDER: "whisper", OPENAI_API_KEY: "sk-real" }),
    );
    expect(whisper.report().voice).toEqual({
      provider: "whisper",
      key: { configured: true },
    });

    const deepgram = new IntegrationsService(
      makeConfig({ VOICE_PROVIDER: "deepgram", DEEPGRAM_API_KEY: "dg-real" }),
    );
    expect(deepgram.report().voice).toEqual({
      provider: "deepgram",
      key: { configured: true },
    });
  });
});

describe("IntegrationsService.bootIssues", () => {
  it("returns an empty list when everything is configured with real values", () => {
    const svc = new IntegrationsService(
      makeConfig({
        STRIPE_SECRET_KEY: "sk-prod-redacted",
        STRIPE_WEBHOOK_SECRET: "secret-redacted",
        STRIPE_PRO_MONTHLY_PRICE_ID: "price_real_monthly",
        STRIPE_PRO_YEARLY_PRICE_ID: "price_real_yearly",
        STRIPE_B2B_PRICE_ID: "price_real_b2b",
        ANTHROPIC_API_KEY: "sk-ant-real",
        VOICE_PROVIDER: "whisper",
        OPENAI_API_KEY: "sk-real",
        RESEND_API_KEY: "re_real",
        GOOGLE_CLIENT_ID: "real.apps.googleusercontent.com",
        REDIS_URL: "redis://real",
        VAPID_PRIVATE_KEY: "real",
        R2_ACCOUNT_ID: "real",
      }),
    );
    expect(svc.bootIssues()).toEqual([]);
  });

  it("flags missing + stub items with the right reason", () => {
    const svc = new IntegrationsService(
      makeConfig({
        STRIPE_PRO_MONTHLY_PRICE_ID: "price_stub_monthly",
        // Everything else is missing.
      }),
    );
    const issues = svc.bootIssues();
    // The stub'd price ID appears as stub; the other Stripe keys as missing.
    const map = Object.fromEntries(issues.map((i) => [i.key, i.reason]));
    expect(map["STRIPE_PRO_MONTHLY_PRICE_ID"]).toBe("stub");
    expect(map["STRIPE_SECRET_KEY"]).toBe("missing");
    expect(map["RESEND_API_KEY"]).toBe("missing");
  });
});
