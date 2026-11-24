/**
 * Los nombres de cabecera cuyo VALOR es una credencial.
 *
 * Esto ya no protege lo que se manda a Sentry. Lo hacía —borraba estas
 * cabeceras de cada evento— y era una lista de lo prohibido: las transacciones
 * no pasaban por ella y las cabeceras de IP no estaban. Lo que sale hoy hacia
 * un colector se reconstruye desde una lista blanca, donde las cabeceras no
 * existen (`observability-allowlist.ts`).
 *
 * Se conserva por su otro uso: los diagnósticos de texto libre del recorrido de
 * Círculos, que sí necesitan saber qué nombres no pueden imprimirse. Que la
 * lista sea UNA es el invariante: un nombre que se añade aquí tiene que
 * aparecer allí, y hay prueba.
 *
 *   · `authorization`, `cookie`, `set-cookie` — sesiones, en las dos
 *     direcciones.
 *   · `x-circle-guest-session` — la credencial entera de una invitada. No tiene
 *     cuenta: esta cabecera ES su identidad.
 *   · `x-client-attestation` — el secreto compartido entre el BFF y la API.
 *   · `x-api-key`, `stripe-signature` — de los proveedores.
 */
export const SENSITIVE_HEADERS: readonly string[] = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-circle-guest-session",
  "x-client-attestation",
  "x-api-key",
  "stripe-signature",
];
