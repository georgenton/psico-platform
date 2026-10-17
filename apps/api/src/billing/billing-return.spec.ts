/**
 * El retorno del navegador, que no prueba nada por sí mismo.
 *
 * `GET /api/billing/return` recibe un `session_id` que Stripe adjunta a la URL
 * de éxito. Eso llega desde el navegador: es un dato de entrada, no una
 * demostración de que alguien pagó. El contrato ya lo trataba así —consulta al
 * proveedor y NO muta el plan, porque el webhook es la autoridad— y estas
 * pruebas lo fijan en vez de confiar en el comentario que lo decía.
 *
 * Fijan además las dos correcciones de esta tanda:
 *
 * 1. La sesión tiene dueño. Antes se devolvía el estado de cualquiera.
 * 2. Esa negativa no puede salir disfrazada de «el proveedor no sabe mirar
 *    sesiones»: el `catch` convertía CUALQUIER error en 501, lo que afirmaba
 *    algo falso sobre la integración y escondía un intento de leer algo ajeno.
 */

import {
  HttpException,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BillingService } from "./billing.service";
import { ProviderCapabilityUnsupportedError } from "../subscription/provider-errors";

const USER = "user-1";

function hacerServicio(
  estado: { status: "success" | "processing" | "failed" } | Error,
  plan = "PRO",
) {
  const prisma = {
    user: { findUniqueOrThrow: vi.fn().mockResolvedValue({ plan }) },
  };
  const subscriptionService = {
    getMySubscription: vi.fn().mockResolvedValue(null),
  };
  const paymentService = {
    getCheckoutSessionStatus: vi.fn(() =>
      estado instanceof Error
        ? Promise.reject(estado)
        : Promise.resolve({ ...estado, subscriptionId: "sub_1" }),
    ),
  };
  const service = new BillingService(
    prisma as never,
    subscriptionService as never,
    paymentService as never,
  );
  return { service, prisma, subscriptionService, paymentService };
}

describe("GET /billing/return", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consulta al proveedor con la sesión Y con quién pregunta", async () => {
    const { service, paymentService } = hacerServicio({ status: "success" });
    await service.getReturn(USER, "cs_test_123");
    // Sin el segundo argumento, el proveedor no puede comprobar pertenencia.
    expect(paymentService.getCheckoutSessionStatus).toHaveBeenCalledWith(
      "cs_test_123",
      USER,
    );
  });

  it("NO concede permisos: el plan sale de la base, no del retorno", async () => {
    // El estado dice «éxito» pero el usuario sigue en FREE porque el webhook
    // todavía no llegó. El endpoint debe reflejar la realidad, no el deseo.
    const { service, prisma } = hacerServicio({ status: "success" }, "FREE");
    const r = await service.getReturn(USER, "cs_test_123");
    expect(r.status).toBe("success");
    expect(r.tier).toBe("FREE");
    // Ninguna escritura: el retorno es de sólo lectura.
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalled();
    expect((prisma.user as Record<string, unknown>).update).toBeUndefined();
  });

  it("propaga la negativa por pertenencia tal cual, sin disfrazarla de 501", async () => {
    const negativa = new NotFoundException({
      code: "CHECKOUT_SESSION_NOT_FOUND",
      message: "No encontramos esa sesión de pago.",
    });
    const { service } = hacerServicio(negativa);
    await expect(service.getReturn(USER, "cs_ajena")).rejects.toBe(negativa);
  });

  it("501 sólo ante la señal específica de capacidad ausente", async () => {
    const { service } = hacerServicio(
      new ProviderCapabilityUnsupportedError(
        "payphone",
        "checkout_session_lookup",
      ),
    );
    const cuerpo = await service
      .getReturn(USER, "cs_test_123")
      .catch(
        (e: NotImplementedException) =>
          e.getResponse() as Record<string, string>,
      );
    expect(cuerpo.code).toBe("PROVIDER_NO_SESSION_LOOKUP");
    // Y con un mensaje nuestro, no el del error.
    expect(cuerpo.message).not.toContain("does not support");
  });

  it("un fallo de red NO se disfraza de capacidad ausente", async () => {
    // Antes la condición se reconocía por descarte —«no es HttpException»—,
    // así que cualquier caída salía afirmando que la integración no soporta la
    // consulta, con el texto crudo del error dentro.
    const red = Object.assign(new Error("ECONNRESET texto crudo"), {
      type: "StripeAPIConnectionError",
    });
    const { service } = hacerServicio(red);
    const err = await service.getReturn(USER, "cs_test_123").catch((e) => e);
    expect(err).not.toBeInstanceOf(NotImplementedException);
    expect(JSON.stringify((err as HttpException).getResponse())).not.toContain(
      "ECONNRESET",
    );
  });

  it("cualquier excepción HTTP del proveedor conserva su estado", async () => {
    // Generaliza el caso 3: la regla no es «deja pasar los 404», es «una
    // excepción HTTP ya trae su código y no se reescribe».
    const limite = new HttpException(
      { code: "STRIPE_RATE_LIMITED", message: "…" },
      429,
    );
    const { service } = hacerServicio(limite);
    await expect(service.getReturn(USER, "cs_test_123")).rejects.toBe(limite);
  });
});
