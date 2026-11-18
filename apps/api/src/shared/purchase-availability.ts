import type { PurchaseAvailability } from "@psico/types";

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
 * de terapia, que es un cobro de otra naturaleza con su propia puerta.
 */

/**
 * Las cuatro situaciones distinguibles. Tres cierran; sólo una abre.
 *
 * - `absent`  — nadie la configuró (incluida la cadena vacía, que es cómo
 *               Coolify guarda una variable borrada).
 * - `off`     — alguien dijo explícitamente que no.
 * - `invalid` — hay un valor y no se entiende. Cierra, y se dice en voz alta:
 *               una errata no puede pasar por una decisión.
 * - `on`      — alguien dijo explícitamente que sí.
 */
export type PurchaseGateState = "absent" | "off" | "invalid" | "on";

export interface PurchaseGate {
  state: PurchaseGateState;
  /** Verdadero sólo con `state === "on"`. */
  open: boolean;
  /** El valor crudo recortado, cuando es ilegible, para el mensaje del operador. */
  rawWhenInvalid: string | null;
}

const AFFIRMATIVE = new Set(["on", "true", "1", "open", "abierto"]);
const NEGATIVE = new Set(["off", "false", "0", "closed", "cerrado"]);

/** Resuelve el estado de la puerta desde el valor crudo de `BILLING_PURCHASES`. */
export function resolvePurchaseGate(raw: string | undefined): PurchaseGate {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) {
    return { state: "absent", open: false, rawWhenInvalid: null };
  }

  const normalized = trimmed.toLowerCase();
  if (AFFIRMATIVE.has(normalized)) {
    return { state: "on", open: true, rawWhenInvalid: null };
  }
  if (NEGATIVE.has(normalized)) {
    return { state: "off", open: false, rawWhenInvalid: null };
  }
  return { state: "invalid", open: false, rawWhenInvalid: trimmed };
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
