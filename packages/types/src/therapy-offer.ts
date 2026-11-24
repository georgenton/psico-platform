/**
 * Disponibilidad de la oferta de terapia — la MISMA decisión para la pantalla y
 * para el servidor, con el mismo patrón que `purchases.ts`.
 *
 * ── Por qué existe este fichero ───────────────────────────────────────────
 *
 * El directorio de terapeutas, la reserva y el pago estaban construidos y
 * abiertos, y lo único que había detrás eran fichas de demostración: personas
 * inventadas con «licencia verificada» y con puntuaciones sembradas sin una
 * sola reseña. Quitar el menú no bastaba: la API seguía dejando reservar.
 *
 * Así que la decisión se toma UNA vez en el servidor y viaja en el contrato; la
 * pantalla la obedece con `?? false`, porque la ausencia de un permiso no es un
 * permiso.
 *
 * ── Son dos decisiones, no una ────────────────────────────────────────────
 *
 * - La PUERTA (`offer.open`) dice si hoy se ofrece terapia. Cerrada, nadie
 *   descubre, reserva ni paga.
 * - La IDENTIDAD de demostración (`isDemo`) no depende de la puerta: aunque se
 *   abra, una ficha de demostración no se lista, no se reserva y no se cobra.
 *   La lista vive en la API (`terapia/demo-therapists.ts`); los clientes sólo
 *   ven la marca.
 *
 * Lo que NO va en el contrato: el motivo del cierre (ausente, apagada o
 * ilegible). Lo necesita quien opera, no quien usa.
 */

/** Lo que el cliente necesita saber: ¿se ofrece terapia hoy? */
export interface TherapyOfferAvailability {
  /**
   * `false` mientras la oferta esté cerrada. El servidor rechaza directorio,
   * reserva y pago en ese caso, así que una pantalla que lo ignore no consigue
   * reservar — sólo un error evitable.
   */
  open: boolean;
}

/**
 * Qué historial tiene la persona, para enlazarlo sólo si existe.
 *
 * Booleanos y no recuentos: ninguna pantalla enseña el número y publicarlo
 * sería contar de más.
 */
export interface TherapyHistoryPresence {
  sessions: boolean;
  prescriptions: boolean;
  notifications: boolean;
}

/** Código máquina del rechazo por oferta cerrada (503). */
export const THERAPY_OFFER_CLOSED_CODE = "THERAPY_OFFER_CLOSED";

/** Mensaje humano del rechazo y titular del estado cerrado (nunca el código). */
export const THERAPY_OFFER_CLOSED_MESSAGE =
  "Todavía no ofrecemos sesiones de terapia.";

/** Qué puede hacer la persona mientras tanto. */
export const THERAPY_OFFER_CLOSED_BODY =
  "Si necesitas apoyo ahora, en Ayuda inmediata hay recursos de ayuda.";

/**
 * Código máquina del rechazo sobre una sesión ya reservada con una ficha de
 * demostración (409): la sesión existe y es de quien pregunta, así que un 404
 * sería falso; lo que no existe es un profesional que la atienda.
 */
export const THERAPY_DEMO_SESSION_CODE = "THERAPY_DEMO_SESSION";

/** Lo mismo, dicho a la persona. La pantalla de la sesión lo usa también. */
export const THERAPY_DEMO_SESSION_MESSAGE =
  "Esta sesión se reservó con un perfil de demostración: no hay un profesional detrás y no se va a realizar.";

/** Lo que aparece donde iría la credencial de una ficha de demostración. */
export const THERAPY_DEMO_TITLE = "Perfil de demostración";
