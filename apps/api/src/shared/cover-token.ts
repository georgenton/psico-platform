import type { CoverToken } from "@psico/types";

/**
 * El tono de portada de un libro, leído de SU fila y de ningún otro sitio.
 *
 * Había cuatro formas de decidirlo. Tres leían `Book.cover`; la cuarta, la
 * recomendación del onboarding, lo calculaba con un hash del id porque cuando
 * se escribió (Sprint S4) la columna no existía. Resultado: la primera vez que
 * alguien veía un libro podía salir de un color y, al abrir la biblioteca, de
 * otro.
 *
 * Un valor desconocido cae a `cool`, que es también el valor por defecto de la
 * columna.
 */
export function toCoverToken(value: string | null | undefined): CoverToken {
  return value === "warm" || value === "mixed" ? value : "cool";
}
