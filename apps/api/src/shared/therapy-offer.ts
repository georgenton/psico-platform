import type { TherapyOfferAvailability } from "@psico/types";
import type { ExplicitGate, ExplicitGateState } from "./explicit-gate";
import { resolveExplicitGate } from "./explicit-gate";

/**
 * ¿Se ofrece terapia hoy? — resolutor único, que falla cerrado.
 *
 * Mismo criterio que las compras (`purchase-availability.ts`): abre SÓLO un sí
 * explícito y legible en `THERAPY_OFFER`; la ausencia, la cadena vacía, un
 * «off» y cualquier valor que no se entienda cierran.
 *
 * ── Qué decide ────────────────────────────────────────────────────────────
 *
 * Descubrir (directorio, ficha, reseñas, favoritos, disponibilidad), reservar,
 * pagar una reserva y mover una sesión a un hueco nuevo. Nada de eso debe
 * ofrecerse mientras no haya profesionales y una operación acreditados.
 *
 * ── Qué NO decide ─────────────────────────────────────────────────────────
 *
 * Lo que una persona ya tuviera: ver sus sesiones, cancelarlas, entrar a la
 * sala de una sesión real, dejar su valoración, reportar un problema, sus
 * recetas y sus avisos. Cerrar la entrada no es dejar a nadie dentro sin
 * salida. Tampoco toca las líneas de ayuda en crisis, que son públicas.
 *
 * Y NO decide qué ficha es de demostración: eso es una identidad declarada en
 * código (`terapia/demo-therapists.ts`) y se aplica también con la puerta
 * abierta.
 */
export type TherapyOfferGateState = ExplicitGateState;

export type TherapyOfferGate = ExplicitGate;

/** Resuelve el estado de la puerta desde el valor crudo de `THERAPY_OFFER`. */
export function resolveTherapyOfferGate(
  raw: string | undefined,
): TherapyOfferGate {
  return resolveExplicitGate(raw);
}

/** Lo que viaja al cliente: sólo si está abierta, nunca el motivo. */
export function therapyOfferForWire(
  gate: TherapyOfferGate,
): TherapyOfferAvailability {
  return { open: gate.open };
}

/** Una línea para el arranque. */
export function describeTherapyOfferGate(gate: TherapyOfferGate): string {
  switch (gate.state) {
    case "on":
      return "ABIERTA · THERAPY_OFFER autoriza directorio, reservas y pagos (las fichas de demostración siguen fuera)";
    case "off":
      return "CERRADA · THERAPY_OFFER la cierra explícitamente";
    case "absent":
      return "CERRADA · THERAPY_OFFER sin configurar (ausencia = cerrada, deliberado)";
    case "invalid":
      return `BLOQUEADA · THERAPY_OFFER tiene un valor ilegible ("${gate.rawWhenInvalid ?? ""}"), que NO abre nada`;
  }
}
