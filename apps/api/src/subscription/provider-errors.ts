/**
 * Los fallos de un proveedor de pagos, dichos de forma segura.
 *
 * ── Por qué una señal y no un texto ────────────────────────────────────────
 *
 * `PaymentService` decía «este proveedor no sabe mirar sesiones» lanzando un
 * `Error` con ese texto, y `BillingService` lo distinguía… por no ser un
 * `HttpException`. Es decir: cualquier fallo de red, cualquier caída del SDK y
 * cualquier error nuestro acababan en el mismo `501 PROVIDER_NO_SESSION_LOOKUP`,
 * **con su mensaje crudo dentro**. Tres problemas en uno: una afirmación falsa
 * sobre la integración, un canal por el que sale texto del proveedor, y una
 * condición identificada por su prosa.
 *
 * `ProviderCapabilityUnsupportedError` es esa condición y sólo esa. No lleva
 * mensaje del proveedor porque no viene de él: la lanza nuestro código al ver
 * que el método no existe.
 *
 * ── Y por qué el resto se normaliza ────────────────────────────────────────
 *
 * Lo que sale hacia la persona tiene que ser legible y no revelar nada. Lo que
 * va al registro tiene que permitir arreglar el problema. Son dos cosas
 * distintas y aquí se separan: el `message` es nuestro, y la causa técnica se
 * resume en un token cerrado (`reason`), nunca en el texto del SDK.
 */

import {
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

/** El proveedor activo no implementa la consulta. No es un fallo suyo. */
export class ProviderCapabilityUnsupportedError extends Error {
  constructor(
    readonly provider: string,
    readonly capability: string,
  ) {
    super(`provider_capability_unsupported:${provider}:${capability}`);
    this.name = "ProviderCapabilityUnsupportedError";
  }
}

/**
 * Por qué no se pudo responder, en un token cerrado.
 *
 * `not_found` cubre A LA VEZ la sesión inexistente y la ajena, a propósito:
 * distinguirlas confirmaría que un identificador es válido, que es justo lo
 * que la comprobación de pertenencia evita.
 */
export type ProviderFailureReason =
  | "not_found"
  | "unauthenticated"
  | "rate_limited"
  | "network"
  | "provider_error"
  | "unexpected";

/** Clasifica un error del SDK sin mirar nunca su texto libre. */
export function clasificarErrorDeProveedor(
  err: unknown,
): ProviderFailureReason {
  const e = err as {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
    code?: unknown;
  };
  const estado = [e?.status, e?.statusCode].find(
    (v) => typeof v === "number" && Number.isInteger(v),
  ) as number | undefined;

  // El tipo que el propio SDK declara es más fiable que su prosa.
  const tipo = typeof e?.type === "string" ? e.type : "";
  if (tipo.includes("connection") || tipo.includes("APIConnection"))
    return "network";

  if (estado === undefined) {
    // Sin estado no hubo respuesta: para nosotros, un problema de red.
    return "network";
  }
  if (estado === 404) return "not_found";
  if (estado === 401 || estado === 403) return "unauthenticated";
  if (estado === 429) return "rate_limited";
  if (estado >= 500) return "provider_error";
  if (estado >= 400) return "unexpected";
  return "unexpected";
}

/**
 * La excepción HTTP que corresponde, con un mensaje escrito por nosotros.
 *
 * Ninguna rama interpola texto del proveedor. El `reason` viaja en el cuerpo
 * para que el registro y el soporte sepan qué pasó sin que la persona lea un
 * volcado de un SDK.
 */
export function aExcepcionSegura(reason: ProviderFailureReason): HttpException {
  switch (reason) {
    case "not_found":
      return new NotFoundException({
        code: "CHECKOUT_SESSION_NOT_FOUND",
        message: "No encontramos esa sesión de pago.",
      });
    case "rate_limited":
    case "network":
    case "provider_error":
      return new ServiceUnavailableException({
        code: "PAYMENT_PROVIDER_UNAVAILABLE",
        reason,
        message:
          "No pudimos confirmar tu pago en este momento. Vuelve a intentarlo en unos minutos.",
      });
    case "unauthenticated":
    case "unexpected":
    default:
      // Credencial nuestra mal configurada o respuesta que no esperábamos: no
      // es culpa de quien mira la pantalla, y tampoco algo que deba leer.
      return new HttpException(
        {
          code: "PAYMENT_PROVIDER_ERROR",
          reason,
          message:
            "No pudimos confirmar tu pago. Si el cobro aparece en tu banco, escríbenos.",
        },
        HttpStatus.BAD_GATEWAY,
      );
  }
}
