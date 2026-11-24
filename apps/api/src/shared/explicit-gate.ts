/**
 * Una puerta que sólo abre con un sí explícito y legible.
 *
 * Nació en `purchase-availability` y vive aquí desde que hay dos: la de las
 * compras y la de la oferta de terapia. Dos copias del mismo criterio acaban
 * separándose, y estas dos tienen que fallar cerradas exactamente igual.
 *
 * La regla completa y por qué es asimétrica están en `purchase-availability`.
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
export type ExplicitGateState = "absent" | "off" | "invalid" | "on";

export interface ExplicitGate {
  state: ExplicitGateState;
  /** Verdadero sólo con `state === "on"`. */
  open: boolean;
  /** El valor crudo recortado, cuando es ilegible, para el mensaje del operador. */
  rawWhenInvalid: string | null;
}

const AFFIRMATIVE = new Set(["on", "true", "1", "open", "abierto"]);
const NEGATIVE = new Set(["off", "false", "0", "closed", "cerrado"]);

/** Resuelve el estado de la puerta desde el valor crudo de su variable. */
export function resolveExplicitGate(raw: string | undefined): ExplicitGate {
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
