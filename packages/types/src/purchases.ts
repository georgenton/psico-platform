/**
 * Disponibilidad de compras de planes — la MISMA decisión para la pantalla y
 * para el servidor.
 *
 * ── Por qué existe este fichero ───────────────────────────────────────────
 *
 * La interfaz ofrecía contratar en dos sitios (el muro de Patrones y Mi plan,
 * este último con importes y botones) mientras los cobros estaban cerrados. El
 * riesgo no es estético: el recorrido llegaba a `createCheckoutSession`, que
 * crea un cliente en el proveedor y guarda su identificador antes de devolver
 * la sesión. Una persona podía empezar una compra que nadie quería abrir.
 *
 * La tentación es arreglarlo en la pantalla. No basta: dos lugares que deciden
 * por separado acaban contradiciéndose, y el que manda —el servidor— es el que
 * se queda sin arreglar. Así que la decisión se resuelve UNA vez en el servidor
 * y viaja en el contrato: la API publica `purchases` y la pantalla lo obedece.
 * Si algún día discrepan, discrepan de sí mismas, no entre capas.
 *
 * ── Lo que NO va en el contrato ───────────────────────────────────────────
 *
 * El servidor distingue tres situaciones de configuración (ausente, ilegible,
 * apagada) porque el operador necesita saber cuál es. El cliente no: le basta
 * `open`. Publicar el motivo sería contarle la forma de la configuración a
 * cualquiera con sesión, sin que ninguna pantalla lo use.
 */

/** Lo que el cliente necesita saber: ¿se puede empezar una compra hoy? */
export interface PurchaseAvailability {
  /**
   * `false` mientras las compras estén cerradas. El servidor rechaza la
   * creación de checkout en ese caso, así que una pantalla que lo ignore no
   * consigue abrir una compra — sólo un error evitable.
   */
  open: boolean;
}

/**
 * Código máquina del rechazo. El envelope de error lo lleva en `code`; el
 * `message` va en castellano, porque hay clientes que lo pintan tal cual
 * (la lección del mensaje de Eco: un código en una burbuja no es un mensaje).
 */
export const PURCHASES_CLOSED_CODE = "PURCHASES_CLOSED";

/**
 * Aviso de importes, palabra por palabra el de la landing aprobada (F2.1,
 * `SeccionPlanes`). Que las dos superficies digan lo mismo no es cosmética:
 * alguien que ve «propuesta» en la portada y un botón de compra dentro del
 * producto concluye, con razón, que una de las dos miente.
 */
export const PURCHASES_PROPOSAL_NOTICE =
  "Propuesta de precios · No disponible para compra";

/** Titular del estado cerrado, para la pantalla que lo explica. */
export const PURCHASES_CLOSED_HEADLINE =
  "Las compras todavía no están disponibles";

/**
 * Cuerpo del estado cerrado. Dice qué pasa y qué NO pasa, que es lo que una
 * persona necesita: su plan actual sigue funcionando.
 */
export const PURCHASES_CLOSED_BODY =
  "Todavía no abrimos los cobros, así que no se puede contratar un plan desde aquí. " +
  "Tu plan actual sigue igual y nada de lo que ya tienes cambia.";

/** Mensaje humano del rechazo del servidor (nunca el código). */
export const PURCHASES_CLOSED_MESSAGE =
  "Las compras todavía no están disponibles.";
