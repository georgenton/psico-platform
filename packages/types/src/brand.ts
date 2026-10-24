/**
 * El nombre del producto, una sola vez.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El producto se llama FeelVerse. Pero el nombre anterior, «Psico Platform»,
 * seguía escrito a mano en diecisiete archivos, y dos de ellos hablan en voz
 * alta: el prompt de Eco —que se lo dijo literalmente a una cuenta de prueba
 * el 2026-10-24: «tu companion conversacional en Psico Platform»— y la
 * cabecera de todos los correos transaccionales, incluido el de
 * restablecimiento de contraseña, que es el único camino de recuperación de
 * la cuenta.
 *
 * Corregir cuatro copias habría dejado cuatro copias. Ésta es la misma
 * decisión que `password-policy`: el dato vive en un sitio y los consumidores
 * lo leen.
 *
 * ── Lo que NO alcanza ──────────────────────────────────────────────────────
 *
 * Quedan menciones a propósito:
 *
 *   - `apps/web/src/app/page.tsx` y `landing.css` nombran el proyecto de
 *     Claude Design, que se llama así de verdad. Renombrarlo sería mentir
 *     sobre la procedencia del diseño.
 *   - `apps/api/src/main.ts` lo usa como título de Swagger: superficie
 *     interna, no la ve nadie de fuera.
 *   - `apps/api/src/lector/lector.service.ts` lo usa como autor de respaldo
 *     del audio. Ése no es un cambio de marca sino una afirmación sin
 *     fuente —atribuir un libro a la plataforma—, de la misma clase que la
 *     reparación de autoría retira. Tiene su propia ventana.
 *
 * Esta constante no las toca. Están inventariadas, no olvidadas.
 */
export const BRAND_NAME = "FeelVerse";
