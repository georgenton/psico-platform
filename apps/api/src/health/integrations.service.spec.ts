import { afterEach, describe, expect, it } from "vitest";
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
        EMAIL_FROM_EXPLICIT: true,
        // Desde el 2026-11-17, «todo configurado» incluye decir A QUIÉN se
        // puede escribir: fuera de producción una clave sin lista retiene todo
        // el correo, y eso es una línea de la lista de arranque, no un detalle.
        EMAIL_ALLOWLIST: "qa@dominio.com",
      } as never),
    );
    // La procedencia entra por el doble, como cualquier otra clave validada:
    // «todo configurado» incluye que alguien eligiera el remitente.
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

describe("IntegrationsService — el remitente, en la capa rápida", () => {
  /**
   * Aquí sólo se comprueba que el informe LEE la procedencia y la refleja.
   *
   * Que esa procedencia se capture bien es otra cosa, y no se puede comprobar
   * con un doble: depende de que Nest copie los defaults validados a
   * `process.env` después de `validate`. Eso vive en
   * `integrations.provenance.spec.ts`, que monta el ConfigModule real — y es
   * donde se descubrió que las dos versiones anteriores de este indicador
   * describían lo contrario de producción mientras sus pruebas pasaban.
   */
  const withFlag = (
    values: Record<string, string | undefined>,
    explicit: boolean,
  ) =>
    new IntegrationsService(
      makeConfig({ ...values, EMAIL_FROM_EXPLICIT: explicit } as never),
    );

  it("refleja «elegido» cuando la procedencia lo dice", () => {
    const svc = withFlag({ RESEND_API_KEY: "re_real" }, true);
    expect(svc.report().resendFrom.configured).toBe(true);
    expect(svc.bootIssues().some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(
      false,
    );
  });

  it("y «no elegido» cuando dice lo contrario", () => {
    const svc = withFlag({ RESEND_API_KEY: "re_real" }, false);
    expect(svc.report().resendFrom.configured).toBe(false);
    const map = Object.fromEntries(
      svc.bootIssues().map((i) => [i.key, i.reason]),
    );
    expect(map["EMAIL_FROM (defaulted, not chosen)"]).toBe("stub");
  });

  it("SIN clave no se menciona el remitente", () => {
    // Sin clave no sale ningún correo, así que un remitente sin elegir todavía
    // no es un problema. El valor de una lista de arranque es que cada línea
    // importe; añadir una que no se puede accionar la degrada.
    expect(
      withFlag({}, false)
        .bootIssues()
        .some((i) => i.key.startsWith("EMAIL_FROM")),
    ).toBe(false);
  });

  it("el informe contesta UNA pregunta, no tres", () => {
    const r = withFlag({ RESEND_API_KEY: "re_real" }, true).report();
    expect(Object.keys(r.resendFrom)).toEqual(["configured"]);
    expect(JSON.stringify(r)).not.toMatch(/verified|delivered/i);
  });

  it("hay clave y no sale nada: eso se dice, porque explica el «no me llegó» de después", () => {
    const issues = withFlag({ RESEND_API_KEY: "re_real" }, true).bootIssues();
    expect(issues.some((i) => i.key.startsWith("EMAIL_ALLOWLIST"))).toBe(true);
  });

  it("una lista ilegible se nombra aparte: no autoriza a nadie y no se ve", () => {
    const issues = withFlag(
      { RESEND_API_KEY: "re_real", EMAIL_ALLOWLIST: "qa@dominio.com, basura" },
      true,
    ).bootIssues();
    const linea = issues.find((i) => i.key.startsWith("EMAIL_ALLOWLIST"));
    expect(linea?.reason).toBe("stub");
    expect(linea?.key).toContain("1 entrada(s) ilegible(s)");
  });
});

describe("IntegrationsService — a quién puede llegar un correo", () => {
  const anterior = process.env.PSICO_ENV;
  afterEach(() => {
    if (anterior === undefined) delete process.env.PSICO_ENV;
    else process.env.PSICO_ENV = anterior;
  });

  it("sin clave: nada sale, y no se finge que haya una restricción", () => {
    const r = new IntegrationsService(makeConfig({})).report();
    expect(r.mailRecipients.mode).toBe("no-key");
    expect(r.mailRecipients.recipients).toBe(0);
  });

  it("clave sin lista fuera de producción: RETENIDO", () => {
    process.env.PSICO_ENV = "staging";
    const r = new IntegrationsService(
      makeConfig({ RESEND_API_KEY: "re_real" }),
    ).report();
    expect(r.mailRecipients).toMatchObject({
      mode: "withheld",
      recipients: 0,
      environment: "staging",
    });
  });

  it("clave con lista: restringido, y se cuenta sin enumerar", () => {
    process.env.PSICO_ENV = "staging";
    const r = new IntegrationsService(
      makeConfig({
        RESEND_API_KEY: "re_real",
        EMAIL_ALLOWLIST: "qa@dominio.com, @autorizado.com",
      }),
    ).report();
    expect(r.mailRecipients).toMatchObject({
      mode: "allowlisted",
      recipients: 2,
    });
    // Una dirección es un dato personal y este informe lo lee cualquier ADMIN.
    expect(JSON.stringify(r)).not.toContain("qa@dominio.com");
    expect(JSON.stringify(r)).not.toContain("autorizado.com");
  });

  it("producción sin lista: abierto, que allí es lo correcto", () => {
    process.env.PSICO_ENV = "production";
    const r = new IntegrationsService(
      makeConfig({ RESEND_API_KEY: "re_real" }),
    ).report();
    expect(r.mailRecipients.mode).toBe("open");
  });
});

describe("IntegrationsService · la puerta de las compras", () => {
  it("sin configurar: cerradas, y el informe lo dice con su causa", () => {
    const r = new IntegrationsService(makeConfig({})).report();
    expect(r.purchases).toEqual({ open: false, state: "absent" });
  });

  it("un valor ilegible cierra, y se distingue de la ausencia", () => {
    const r = new IntegrationsService(
      makeConfig({ BILLING_PURCHASES: "ábrelas" }),
    ).report();
    expect(r.purchases).toEqual({ open: false, state: "invalid" });
  });

  it("abiertas sólo con un sí explícito", () => {
    const r = new IntegrationsService(
      makeConfig({ BILLING_PURCHASES: "on" }),
    ).report();
    expect(r.purchases).toEqual({ open: true, state: "on" });
  });

  it("tener las cinco variables de Stripe NO abre compras", () => {
    // La confusión que conviene no dejar pasar: credenciales presentes y
    // compras abiertas son dos cosas, y el informe tiene que separarlas.
    const r = new IntegrationsService(
      makeConfig({
        STRIPE_SECRET_KEY: "sk_live_real",
        STRIPE_WEBHOOK_SECRET: "whsec_real",
        STRIPE_PRO_MONTHLY_PRICE_ID: "price_real_m",
        STRIPE_PRO_YEARLY_PRICE_ID: "price_real_y",
        STRIPE_B2B_PRICE_ID: "price_real_b",
      }),
    ).report();
    expect(r.stripe.secretKey.configured).toBe(true);
    expect(r.purchases.open).toBe(false);
  });

  it("el arranque sólo nombra la puerta cuando hay una ERRATA", () => {
    const issue = (billing?: string) =>
      new IntegrationsService(
        makeConfig(billing ? { BILLING_PURCHASES: billing } : {}),
      )
        .bootIssues()
        .filter((i) => i.key.startsWith("BILLING_PURCHASES"));

    // Cerradas por ausencia o por un «off» explícito es la postura deliberada
    // de hoy: ponerla cada arranque sería ruido en una lista cuyo valor es que
    // toda línea importe.
    expect(issue(undefined)).toEqual([]);
    expect(issue("off")).toEqual([]);
    expect(issue("on")).toEqual([]);

    // Una errata cierra igual, pero quien la escribió creía estar decidiendo
    // algo. Eso sí se dice, y con la razón que distingue «no sirve» de «falta».
    const erratas = issue("ábrelas");
    expect(erratas).toHaveLength(1);
    expect(erratas[0]?.reason).toBe("invalid");
  });

  it("el informe no publica el valor de la variable", () => {
    const r = new IntegrationsService(
      makeConfig({ BILLING_PURCHASES: "ábrelas-por-favor" }),
    ).report();
    expect(JSON.stringify(r)).not.toContain("ábrelas-por-favor");
  });
});

describe("IntegrationsService · la puerta de la oferta de terapia", () => {
  it.each([
    ["sin configurar", undefined, { open: false, state: "absent" }],
    ["apagada", "off", { open: false, state: "off" }],
    ["ilegible", "ábrela", { open: false, state: "invalid" }],
    ["abierta", "on", { open: true, state: "on" }],
  ] as const)("%s", (_caso, valor, esperado) => {
    const r = new IntegrationsService(
      makeConfig(valor === undefined ? {} : { THERAPY_OFFER: valor }),
    ).report();
    expect(r.therapyOffer).toEqual(esperado);
  });

  it("las dos puertas no se confunden", () => {
    const r = new IntegrationsService(
      makeConfig({ BILLING_PURCHASES: "on" }),
    ).report();
    expect(r.purchases.open).toBe(true);
    expect(r.therapyOffer.open).toBe(false);
  });

  it("el arranque sólo la nombra cuando hay una errata, y sin el valor", () => {
    const issues = (valor?: string) =>
      new IntegrationsService(makeConfig(valor ? { THERAPY_OFFER: valor } : {}))
        .bootIssues()
        .filter((i) => i.key.startsWith("THERAPY_OFFER"));

    expect(issues(undefined)).toEqual([]);
    expect(issues("off")).toEqual([]);
    expect(issues("on")).toEqual([]);
    const erratas = issues("ábrela-ya");
    expect(erratas).toHaveLength(1);
    expect(erratas[0]?.reason).toBe("invalid");
    expect(JSON.stringify(erratas)).not.toContain("ábrela-ya");
  });
});
