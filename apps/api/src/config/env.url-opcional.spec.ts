import { describe, expect, it } from "vitest";

import { envSchema } from "./env.schema";

/**
 * Una variable opcional APAGADA por la vía natural —escribiéndola vacía— debe
 * dejar arrancar la app.
 *
 * ── Lo que se midió ────────────────────────────────────────────────────────
 *
 * Al arrancar la API real en el entorno aislado del ensayo de recuperación, con
 * `SENTRY_DSN=` para decir «sin Sentry», el proceso murió antes de escuchar:
 *
 *     Error: Environment validation failed:
 *       • SENTRY_DSN: Invalid URL
 *
 * La causa es que `z.string().url().optional()` acepta `undefined` y rechaza
 * `""`. Y la cadena vacía no es un caso de laboratorio: es **cómo se escribe
 * una variable borrada** —Coolify la guarda vacía en vez de eliminarla, y un
 * `.env` a mano dice `CLAVE=` para decir «ninguna»—.
 *
 * Afectaba a los cinco campos de esa forma, que son precisamente los que uno
 * apaga: Redis, el DSN de Sentry, la base pública de R2 y las dos costuras de
 * destino del ensayo.
 */

/** Lo mínimo que el schema exige para llegar a evaluar lo opcional. */
const REQUERIDO = {
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  JWT_SECRET: "x".repeat(32),
  R2_ACCOUNT_ID: "cuenta",
  R2_ACCESS_KEY_ID: "ak",
  R2_SECRET_ACCESS_KEY: "sk",
  R2_BUCKET_NAME: "bucket",
  ANTHROPIC_API_KEY: "centinela",
  VOYAGE_API_KEY: "centinela",
  // Requerida por `superRefine` porque `VOICE_PROVIDER` vale "whisper" por
  // omisión. No está en el bloque `.min(1)`, y por eso es fácil olvidarla:
  // lo fue en el primer fichero de entorno del ensayo, y la API no arrancó.
  OPENAI_API_KEY: "centinela",
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_m",
  STRIPE_PRO_YEARLY_PRICE_ID: "price_y",
  STRIPE_B2B_PRICE_ID: "price_b",
};

const parsear = (extra: Record<string, string>) =>
  envSchema.safeParse({ ...REQUERIDO, ...extra });

const OPCIONALES_URL = [
  "REDIS_URL",
  "OPENAI_BASE_URL",
  "R2_PUBLIC_URL",
  "R2_ENDPOINT",
  "VOYAGE_BASE_URL",
  "SENTRY_DSN",
] as const;

describe("variables de URL opcionales", () => {
  it("el conjunto requerido, sin ninguna opcional, valida", () => {
    expect(parsear({}).success).toBe(true);
  });

  it.each(OPCIONALES_URL)("%s vacía vale como ausente", (clave) => {
    const r = parsear({ [clave]: "" });
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(
      true,
    );
    // Y llega como ausente, no como cadena vacía: un `if (valor)` en el código
    // que la consume tiene que ver lo mismo que si nunca se hubiera escrito.
    if (r.success) {
      expect(r.data[clave as keyof typeof r.data]).toBeUndefined();
    }
  });

  it.each(OPCIONALES_URL)("%s con espacios en blanco también", (clave) => {
    expect(parsear({ [clave]: "   " }).success).toBe(true);
  });

  it.each(OPCIONALES_URL)(
    "%s con un valor presente pero inválido SIGUE siendo rechazada",
    (clave) => {
      // La mitad que importa: esto no es aflojar la validación. Un destipeo
      // real tiene que seguir muriendo en el arranque.
      const r = parsear({ [clave]: "no-es-una-url" });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.map((i) => i.path.join("."))).toContain(clave);
      }
    },
  );

  it.each(OPCIONALES_URL)("%s con una URL válida se conserva", (clave) => {
    const r = parsear({ [clave]: "http://127.0.0.1:4555/x" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data[clave as keyof typeof r.data]).toBe(
        "http://127.0.0.1:4555/x",
      );
    }
  });

  it("y ningún campo requerido se vuelve opcional por esto", () => {
    for (const clave of Object.keys(REQUERIDO)) {
      const sin = { ...REQUERIDO } as Record<string, string>;
      delete sin[clave];
      expect(
        envSchema.safeParse(sin).success,
        `${clave} dejó de ser requerida`,
      ).toBe(false);
    }
  });

  it("REDIS_URL vacía sigue siendo un fallo en producción, donde se exige", () => {
    // El `superRefine` la pide en producción. Que la vacía cuente como ausente
    // NO debe convertirla en aceptable allí: tiene que fallar por la razón
    // correcta, con su propio mensaje, en vez de pasar inadvertida.
    const r = parsear({ NODE_ENV: "production", REDIS_URL: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join("."))).toContain(
        "REDIS_URL",
      );
    }
  });
});
