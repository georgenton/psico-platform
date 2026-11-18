import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpectedUnavailableException } from "../shared/filters/expected-unavailable.exception";
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

/**
 * El doble de configuración responde POR CLAVE, no con un único valor.
 *
 * Antes devolvía `defaultProvider` a cualquier pregunta. Eso bastaba mientras
 * el servicio sólo preguntaba una cosa, y dejó de bastar al añadir la puerta de
 * las compras: `BILLING_PURCHASES` habría leído `"stripe"`, que es un valor
 * ilegible, así que la puerta cerraría y los casos de delegación fallarían por
 * una razón que no tiene nada que ver con lo que miden. Un doble que contesta
 * lo mismo a todo esconde exactamente esta clase de acoplamiento.
 *
 * Por omisión las compras van ABIERTAS en estas pruebas: lo que se mide aquí es
 * la delegación, y la puerta tiene sus propios casos más abajo.
 */
/**
 * Centinela para poder pasar `undefined` A PROPÓSITO.
 *
 * Un parámetro con valor por omisión sustituye `undefined`, así que
 * `makeService("stripe", undefined)` habría leído `"on"` y el caso «sin
 * configurar» —el más importante de todos— se habría aprobado midiendo lo
 * contrario de lo que dice su nombre. Ya pasó una vez en este repositorio, con
 * el proveedor de voz en el Sprint S25.
 */
const SIN_CONFIGURAR = Symbol("sin configurar");

function makeService(
  defaultProvider: "stripe" | "payphone" = "stripe",
  purchases: string | typeof SIN_CONFIGURAR = "on",
) {
  const mockConfig = {
    get: vi.fn((key: string) =>
      key === "BILLING_PURCHASES"
        ? purchases === SIN_CONFIGURAR
          ? undefined
          : purchases
        : defaultProvider,
    ),
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

  // ─── La puerta de las compras ─────────────────────────────────────────────
  //
  // Lo que importa de estos casos no es el código de estado: es que el
  // proveedor NO se toca. Todo lo que había que evitar —crear un cliente,
  // guardar su identificador, crear la sesión— pasa dentro de
  // `provider.createCheckoutSession`, así que cero llamadas es la prueba de
  // que nada de eso ocurrió. Con un proveedor sustituido: ninguna petición a
  // Stripe, ninguna compra real.

  describe("createCheckoutSession · compras cerradas", () => {
    const CERRADOS: Array<[string, string | typeof SIN_CONFIGURAR]> = [
      ["sin configurar", SIN_CONFIGURAR],
      ["cadena vacía (como guarda Coolify una variable borrada)", ""],
      ["sólo espacios", "   "],
      ["apagada explícitamente", "off"],
      ["apagada con false", "false"],
      ["apagada con 0", "0"],
      ["valor ILEGIBLE", "sí, ábrelas"],
      ["valor ilegible que empieza por on", "once"],
    ];

    async function intentarComprar(service: PaymentService): Promise<unknown> {
      try {
        await service.createCheckoutSession(
          "user-1",
          BillingPlan.PRO_MONTHLY,
          "https://success.com",
          "https://cancel.com",
        );
        return null;
      } catch (e: unknown) {
        return e;
      }
    }

    it.each(CERRADOS)(
      "rechaza con 503 PURCHASES_CLOSED y no toca el proveedor: %s",
      async (_caso, raw) => {
        const service = makeService("stripe", raw);
        const err = await intentarComprar(service);

        expect(err).toBeInstanceOf(HttpException);
        const http = err as HttpException;
        expect(http.getStatus()).toBe(503);
        expect(http.getResponse()).toEqual({
          code: "PURCHASES_CLOSED",
          // El mensaje va en castellano: hay clientes que lo pintan tal cual,
          // y reenviar el código pondría `PURCHASES_CLOSED` en un diálogo.
          message: "Las compras todavía no están disponibles.",
        });

        expect(mockStripeProvider.createCheckoutSession).not.toHaveBeenCalled();
        expect(
          mockPayphoneProvider.createCheckoutSession,
        ).not.toHaveBeenCalled();
      },
    );

    it("el 503 es DECLARADO, para que el filtro no lo trate como fallo", async () => {
      const err = await intentarComprar(makeService("stripe", SIN_CONFIGURAR));
      // Si dejara de ser `ExpectedUnavailableException`, el filtro global
      // escribiría una traza y una alerta por cada intento — en una ruta que
      // cualquiera con sesión puede provocar a propósito.
      expect(err).toBeInstanceOf(ExpectedUnavailableException);
    });

    it.each([["on"], ["true"], ["1"], ["ON"], [" open "], ["abierto"]])(
      "abre con un valor afirmativo y legible: %s",
      async (raw) => {
        mockStripeProvider.createCheckoutSession.mockResolvedValue({
          url: "https://checkout.stripe.com/test",
        });
        const service = makeService("stripe", raw);

        await service.createCheckoutSession(
          "user-1",
          BillingPlan.PRO_MONTHLY,
          "https://success.com",
          "https://cancel.com",
        );

        expect(mockStripeProvider.createCheckoutSession).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it("cerrar la puerta NO toca las facturas, cancelaciones ni el portal", async () => {
      // Control contrario, y es el que importa para una persona que ya paga:
      // una suscripción existente se sigue gestionando. Si la guarda se colara
      // en estos caminos, cerrar compras dejaría a alguien dentro sin salida.
      const service = makeService("stripe", SIN_CONFIGURAR);
      mockStripeProvider.listInvoices.mockResolvedValue([]);
      mockStripeProvider.cancelAtPeriodEnd.mockResolvedValue({ ok: true });
      mockStripeProvider.reactivate.mockResolvedValue({ ok: true });
      mockStripeProvider.createPortalSession.mockResolvedValue({ url: "u" });

      await expect(service.listInvoices("user-1", 5)).resolves.toEqual([]);
      await expect(
        service.cancelAtPeriodEnd("user-1", "motivo"),
      ).resolves.toEqual({ ok: true });
      await expect(service.reactivate("user-1")).resolves.toEqual({ ok: true });
      await expect(
        service.createPortalSession("user-1", { returnUrl: "https://r.com" }),
      ).resolves.toEqual({ url: "u" });
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
