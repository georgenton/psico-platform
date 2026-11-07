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
    // `EMAIL_FROM` va en el entorno CRUDO, no en el doble de ConfigService: el
    // servicio lee su PRESENCIA, porque el valor resuelto no distingue
    // «ausente» de «por defecto».
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
    svc.rawEnv = { EMAIL_FROM: "hola@feelverse.app" };
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

describe("IntegrationsService — el remitente, por presencia y no por valor", () => {
  /**
   * La clave y el remitente fallan por separado y sólo uno de los dos se ve:
   * una clave presente sin remitente elegido se lee como correo configurado, y
   * cada mensaje sale reclamando el dominio por defecto, que Resend rechaza si
   * nadie lo verificó.
   *
   * ── Y el defecto que esto corrige ───────────────────────────────────────
   *
   * La primera versión comparaba el valor resuelto con el predeterminado y
   * llamaba «nadie lo eligió» a una coincidencia. Eso es falso justo en el caso
   * más probable: quien verifica el dominio y pone a propósito
   * `no-reply@feelverse.app` —el remitente obvio, el que este repositorio
   * recomienda— recibiría un aviso diciéndole que no eligió nada. Un informe
   * que llama error a una configuración correcta se deja de leer, y entonces no
   * sirve para el caso en que sí acierta.
   *
   * La presencia lo contesta exacto, y por eso el servicio mira el entorno
   * crudo: `ConfigService` devuelve el valor DESPUÉS de que Zod aplique el
   * default, así que no puede distinguir «ausente» de «por defecto».
   */
  const withEnv = (
    values: Record<string, string | undefined>,
    raw: Record<string, string | undefined> = {},
  ) => {
    const svc = new IntegrationsService(makeConfig(values));
    svc.rawEnv = raw;
    return svc;
  };

  it("el remitente recomendado, puesto A PROPÓSITO, cuenta como elegido", () => {
    // El caso exacto que la versión anterior reportaba al revés.
    const svc = withEnv(
      { RESEND_API_KEY: "re_real" },
      { EMAIL_FROM: "no-reply@feelverse.app" },
    );
    expect(svc.report().resendFrom.configured).toBe(true);
    expect(svc.bootIssues().some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(
      false,
    );
  });

  it("cualquier otro remitente explícito también", () => {
    const svc = withEnv(
      { RESEND_API_KEY: "re_real" },
      { EMAIL_FROM: "hola@feelverse.app" },
    );
    expect(svc.report().resendFrom.configured).toBe(true);
  });

  it("AUSENTE del entorno es lo único que cuenta como no elegido", () => {
    const svc = withEnv({ RESEND_API_KEY: "re_real" }, {});
    expect(svc.report().resendFrom.configured).toBe(false);
    const map = Object.fromEntries(
      svc.bootIssues().map((i) => [i.key, i.reason]),
    );
    expect(map["EMAIL_FROM (defaulted, not chosen)"]).toBe("stub");
  });

  it("y una cadena vacía o en blanco no es una elección", () => {
    for (const value of ["", "   "]) {
      expect(
        withEnv({ RESEND_API_KEY: "re_real" }, { EMAIL_FROM: value }).report()
          .resendFrom.configured,
      ).toBe(false);
    }
  });

  it("SIN clave no se menciona el remitente", () => {
    // Sin clave no sale ningún correo, así que un remitente sin elegir todavía
    // no es un problema. El valor de una lista de arranque es que cada línea
    // importe; añadir una que no se puede accionar la degrada.
    expect(
      withEnv({}, {})
        .bootIssues()
        .some((i) => i.key.startsWith("EMAIL_FROM")),
    ).toBe(false);
  });

  it("el informe no afirma nada que esta caja no pueda saber", () => {
    // Tres preguntas distintas: si hay remitente configurado, si su dominio
    // está verificado en Resend, y si un mensaje llega. Contesta la primera y
    // no inventa las otras dos.
    const svc = withEnv(
      { RESEND_API_KEY: "re_real" },
      { EMAIL_FROM: "alguien-muy-concreto@feelverse.app" },
    );
    const r = svc.report();
    expect(Object.keys(r.resendFrom)).toEqual(["configured"]);
    expect(JSON.stringify(r)).not.toContain("alguien-muy-concreto");
    expect(JSON.stringify(r)).not.toMatch(/verified|delivered/i);
  });
});
