import {
  CRISIS_DEFAULT_COUNTRY,
  isCrisisCountry,
  type CrisisCountry,
} from "@psico/types";

import { primero, type Parametro } from "./ayuda";

/**
 * El país a mostrar. Un valor que el catálogo no conoce cae en el de por
 * omisión: aquí una URL mal escrita no puede terminar en una página vacía.
 */
export function paisAyuda(valor: Parametro): CrisisCountry {
  const v = primero(valor)?.trim().toUpperCase();
  return isCrisisCountry(v) ? v : CRISIS_DEFAULT_COUNTRY;
}
