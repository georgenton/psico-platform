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
        // A key is only half of a working mail configuration. Added here when
        // the report learned to tell a chosen sender from a defaulted one:
        // "everything configured" has to include somebody having picked the
        // domain the messages will claim.
        EMAIL_FROM: "hola@feelverse.app",
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

describe("IntegrationsService — el remitente, aparte de la clave", () => {
  /**
   * Fallan por separado y sólo uno de los dos se ve. Una clave presente con un
   * remitente sin elegir se lee como correo configurado, y cada mensaje sale
   * reclamando el dominio por defecto, que Resend rechaza si nadie lo verificó.
   * El síntoma llega como «el correo no funciona», muy después de la causa.
   */
  const DEFAULT = "no-reply@feelverse.app";

  it("una clave SIN remitente elegido aparece en la lista de arranque", () => {
    const svc = new IntegrationsService(
      makeConfig({ RESEND_API_KEY: "re_real", EMAIL_FROM: DEFAULT }),
    );
    const map = Object.fromEntries(
      svc.bootIssues().map((i) => [i.key, i.reason]),
    );
    expect(map["EMAIL_FROM (defaulted, not chosen)"]).toBe("stub");
    expect(svc.report().resendFrom.configured).toBe(false);
  });

  it("y también cuando la variable está directamente ausente", () => {
    // En un proceso real Zod aplica el default antes de que nadie lea, así que
    // «ausente» y «por defecto» son el mismo estado. El doble devuelve
    // `undefined`, y agruparlos es lo que impide que esta prueba describa lo
    // contrario de producción.
    const svc = new IntegrationsService(makeConfig({ RESEND_API_KEY: "re_x" }));
    expect(svc.report().resendFrom.configured).toBe(false);
    expect(svc.bootIssues().some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(
      true,
    );
  });

  it("un remitente elegido no aparece", () => {
    const svc = new IntegrationsService(
      makeConfig({
        RESEND_API_KEY: "re_real",
        EMAIL_FROM: "hola@feelverse.app",
      }),
    );
    expect(svc.report().resendFrom.configured).toBe(true);
    expect(svc.bootIssues().some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(
      false,
    );
  });

  it("SIN clave no se menciona el remitente", () => {
    // Sin clave no sale ningún correo, así que un remitente sin elegir todavía
    // no es un problema. El valor de una lista de arranque es que cada línea
    // importe; añadir una que no se puede accionar la degrada.
    const svc = new IntegrationsService(makeConfig({}));
    expect(svc.bootIssues().some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(
      false,
    );
  });

  it("el informe sigue sin llevar el valor del remitente", () => {
    const svc = new IntegrationsService(
      makeConfig({
        RESEND_API_KEY: "re_real",
        EMAIL_FROM: "alguien-muy-concreto@feelverse.app",
      }),
    );
    expect(JSON.stringify(svc.report())).not.toContain("alguien-muy-concreto");
  });
});
