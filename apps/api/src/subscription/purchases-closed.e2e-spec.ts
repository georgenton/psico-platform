import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";

/**
 * Las DOS entradas de compra, sobre el stack real.
 *
 * ── Por qué esto no se puede comprobar con una prueba de unidad ───────────
 *
 * `payment.service.spec.ts` demuestra que la guarda detiene la solicitud y que
 * el proveedor no se toca. Lo que no puede demostrar es que las dos rutas
 * HTTP lleguen a esa guarda: un test de servicio llama al método directamente,
 * así que aprobaría igual si un controlador se saltara el orquestador.
 *
 * Aquí se arranca la aplicación como la arranca `main.ts` y se piden las dos
 * rutas por HTTP:
 *
 *   POST /api/subscriptions/checkout        (legada, con cabeceras de retirada)
 *   POST /api/billing/checkout-session      (canónica)
 *
 * ── Qué prueba el 503 ────────────────────────────────────────────────────
 *
 * El `StripeProvider` real está instanciado en este árbol, con las claves de
 * prueba del arnés. Si la guarda no estuviera, la petición intentaría crear un
 * cliente en Stripe y fallaría por red o por credencial — un 5xx cualquiera,
 * no el nuestro. Que la respuesta sea exactamente `503 PURCHASES_CLOSED`
 * significa que se detuvo ANTES de salir de la caja.
 *
 * Y el identificador: `getOrCreateStripeCustomer` lee el usuario y le escribe
 * `stripeCustomerId`. Cero escrituras en Prisma es la prueba de que no se
 * guardó ninguno.
 */

const USER_ID = "user-compras-cerradas";
const EMAIL = "compras@psico.test";

/**
 * Todos los métodos de Prisma que se llamaron, como `modelo.método`.
 *
 * Se enumera el doble en vez de la lista de modelos que se nos ocurran: una
 * escritura nueva en una tabla que hoy no existe rompería la prueba sin que
 * nadie haya tenido que preverla.
 */
function llamadasPrisma(h: E2EHarness): string[] {
  const out: string[] = [];
  for (const [modelo, api] of Object.entries(
    h.prisma as unknown as Record<string, unknown>,
  )) {
    if (typeof api !== "object" || api === null) continue;
    for (const [metodo, fn] of Object.entries(
      api as Record<string, unknown>,
    )) {
      const mock = (fn as { mock?: { calls: unknown[] } }).mock;
      if (mock && mock.calls.length > 0) out.push(`${modelo}.${metodo}`);
    }
  }
  return out.sort();
}

describe("las dos entradas de compra con los cobros cerrados", () => {
  let h: E2EHarness;
  let token: string;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // `setup-env` no define `BILLING_PURCHASES`, así que la puerta arranca
    // cerrada por AUSENCIA — el mismo estado que sirve staging hoy. Se deja a
    // propósito sin tocar: fijarla a "off" probaría un estado que nadie tiene.
    delete process.env.BILLING_PURCHASES;
    h = await createE2EApp();
    const jwt = h.app.get(JwtService);
    token = jwt.sign({ sub: USER_ID, email: EMAIL, ar: 0 });
  }, 30_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  beforeEach(async () => {
    await h.resetMocks();
    // JwtStrategy re-lee el usuario en cada petición (ADR 0015).
    h.prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: EMAIL,
      role: "USER",
      plan: "FREE",
      authRevision: 0,
      isActive: true,
    });
  });

  const CUERPO = {
    billingPlan: "PRO_MONTHLY",
    successUrl: "https://staging.feelverse.app/dashboard/plan?upgraded=true",
    cancelUrl: "https://staging.feelverse.app/dashboard/plan",
  };

  const RUTAS: Array<[string, string]> = [
    ["canónica", "/api/billing/checkout-session"],
    ["legada", "/api/subscriptions/checkout"],
  ];

  it.each(RUTAS)(
    "la ruta %s responde 503 PURCHASES_CLOSED",
    async (_nombre, ruta) => {
      const res = await request(h.app.getHttpServer())
        .post(ruta)
        .set("Authorization", `Bearer ${token}`)
        .send(CUERPO);

      expect(res.status).toBe(503);
      expect(res.body.code).toBe("PURCHASES_CLOSED");
      // El mensaje que vería una persona: castellano, no el código.
      expect(res.body.message).toBe(
        "Las compras todavía no están disponibles.",
      );
    },
  );

  it.each(RUTAS)(
    "la ruta %s no escribe NADA en la base",
    async (_nombre, ruta) => {
      await request(h.app.getHttpServer())
        .post(ruta)
        .set("Authorization", `Bearer ${token}`)
        .send(CUERPO);

      // `getOrCreateStripeCustomer` escribiría aquí el identificador del
      // cliente del proveedor. Cero llamadas es la prueba de la ausencia.
      expect(h.prisma.user.update).not.toHaveBeenCalled();

      // Y la versión fuerte, que no depende de acordarse de enumerar modelos:
      // NINGÚN método de Prisma se llamó salvo la relectura del usuario que
      // hace la autenticación en cada petición (ADR 0015). Una escritura nueva
      // en cualquier tabla rompería esto sin que nadie tenga que preverla.
      expect(llamadasPrisma(h)).toEqual(["user.findUnique"]);
    },
  );

  it("sigue exigiendo sesión: la puerta no abre una ruta pública", async () => {
    // Control contrario. Si la guarda se hubiera puesto antes del `JwtAuthGuard`
    // —en un interceptor global, por ejemplo— cualquiera recibiría el 503 y la
    // ruta habría pasado a contestar sin autenticación.
    for (const [, ruta] of RUTAS) {
      const res = await request(h.app.getHttpServer()).post(ruta).send(CUERPO);
      expect(res.status).toBe(401);
    }
  });

  it("las consultas de plan y las facturas siguen contestando", async () => {
    // Cerrar la entrada no deja a nadie dentro sin salida: lo que una persona
    // con suscripción necesita —ver su plan y su consumo— no pasa por la puerta.
    const res = await request(h.app.getHttpServer())
      .get("/api/billing/plans")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
