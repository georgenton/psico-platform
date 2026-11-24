import type { PurchaseAvailability } from "@psico/types";
import type { ExplicitGate, ExplicitGateState } from "./explicit-gate";
import { resolveExplicitGate } from "./explicit-gate";

/**
 * ¿Están abiertas las compras de planes? — resolutor único, que falla cerrado.
 *
 * ── La regla, y por qué es asimétrica ─────────────────────────────────────
 *
 * Las compras se abren SÓLO con un valor explícito y legible que diga que sí.
 * Todo lo demás cierra: la variable ausente, la variable vacía, un «off», y
 * cualquier cosa que no se reconozca.
 *
 * La asimetría es deliberada y viene de una lección reciente. La guarda del
 * correo representaba «nadie la configuró» y «alguien la configuró mal» con el
 * mismo estado, y en producción eso caía en «abierto»: un error al escribir
 * una restricción terminaba permitiendo cualquier destinatario. Aquí el daño
 * de equivocarse por el lado abierto es mayor —se crea un cliente en el
 * proveedor y se guarda su identificador— así que ninguna forma de no haber
 * dicho «sí» cuenta como un sí.
 *
 * `flagEnabled` de `shared/flags.ts` no sirve para esto: colapsa el valor
 * ilegible en el valor por omisión, de modo que una errata se vuelve
 * indistinguible de una decisión. Cerraría igual, pero el operador no se
 * enteraría, y eso es justo lo que queremos que no vuelva a pasar.
 *
 * ── Qué NO decide este fichero ────────────────────────────────────────────
 *
 * No toca las consultas del plan ni del consumo, las facturas, las
 * cancelaciones, las reactivaciones, el portal del proveedor ni el webhook. Una
 * suscripción que ya existe se sigue gestionando: cerrar la puerta de entrada
 * no es dejar dentro a nadie sin salida. Tampoco alcanza al pago de una sesión
 * de terapia, que es un cobro de otra naturaleza con su propia puerta: la de
 * `therapy-offer.ts`, que resuelve con este mismo criterio.
 */

/** Las cuatro situaciones distinguibles; las describe `explicit-gate`. */
export type PurchaseGateState = ExplicitGateState;

export type PurchaseGate = ExplicitGate;

/** Resuelve el estado de la puerta desde el valor crudo de `BILLING_PURCHASES`. */
export function resolvePurchaseGate(raw: string | undefined): PurchaseGate {
  return resolveExplicitGate(raw);
}

/**
 * Lo que viaja al cliente: sólo si está abierta. El motivo se queda del lado
 * del servidor — ninguna pantalla lo usa y publicarlo describiría la forma de
 * la configuración a cualquiera con sesión.
 */
export function purchaseAvailabilityForWire(
  gate: PurchaseGate,
): PurchaseAvailability {
  return { open: gate.open };
}

/** Una línea para el arranque y para el informe de salud. */
export function describePurchaseGate(gate: PurchaseGate): string {
  switch (gate.state) {
    case "on":
      return "ABIERTAS · BILLING_PURCHASES autoriza nuevas compras de planes";
    case "off":
      return "CERRADAS · BILLING_PURCHASES las cierra explícitamente";
    case "absent":
      return "CERRADAS · BILLING_PURCHASES sin configurar (ausencia = cerrado, deliberado)";
    case "invalid":
      return `BLOQUEADAS · BILLING_PURCHASES tiene un valor ilegible ("${gate.rawWhenInvalid ?? ""}"), que NO abre nada`;
  }
}
