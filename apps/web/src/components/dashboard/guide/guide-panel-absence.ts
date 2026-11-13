/**
 * Por qué el panel guiado no puede pintar un recorrido — las cinco razones,
 * separadas.
 *
 * Existe porque estaban colapsadas en una. El panel preguntaba
 * `status !== "loading" && definition === null` y, con eso, **un fallo de
 * consulta se anunciaba como una decisión editorial**: una caída de red, una
 * sesión caducada o un 500 producían «este capítulo todavía no tiene recorrido
 * guiado publicado», que afirma algo sobre el catálogo a partir de una pregunta
 * que no llegó a contestarse.
 *
 * Las cinco no son matices de redacción: son causas distintas, con dueños
 * distintos y remedios distintos. «No está publicado» lo arregla quien publica;
 * «no pudimos consultar» lo arregla reintentar; «el pasaje no aparece» lo
 * arregla quien edita el manuscrito; «tu recorrido está en otra tarjeta» lo
 * arregla la propia persona en dos clics. Decir una por otra manda a la persona
 * —y a quien lea el informe— al sitio equivocado.
 *
 * Función pura y sin React a propósito: es la regla, y se prueba como regla.
 */

import type { ChapterExperienceStatus } from "../experience/use-chapter-experience";

export type GuidePanelAbsence =
  /** Todavía preguntando. No se afirma nada. */
  | "loading"
  /** La consulta no contestó. No se sabe si hay recorrido. */
  | "lookup-failed"
  /** Contestó, y el capítulo no publica ningún recorrido. */
  | "not-published"
  /**
   * Contestó, el capítulo publica otros, y **este** pin no está entre ellos ni
   * es un recorrido propio. Separado de `not-published` porque la salida de la
   * persona es distinta: ahí sí hay algo que abrir, en otra tarjeta.
   */
  | "pin-unavailable"
  /**
   * B5 — el capítulo no publica nada **y esta persona sí tiene un recorrido
   * propio aquí**, en otro pin del mismo capítulo.
   *
   * Es la quinta, y se añadió con la oferta: desde que la pestaña reconoce ese
   * recorrido propio, la persona puede llegar a este panel sin haber elegido
   * tarjeta — y entonces el pin que se pide es el predeterminado del capítulo,
   * que no publica nada. Decirle «todavía no tiene recorrido guiado publicado»
   * sería cierto sobre el catálogo y **falso sobre ella**, que tiene uno
   * empezado a un clic de distancia. Esta rama dice dónde está la puerta.
   */
  | "own-elsewhere"
  /**
   * Hay definición y su pasaje no se localiza en el capítulo en pantalla. La
   * única de las cinco que es una avería de contenido — es la que retiró el
   * piloto legado — y por eso conserva la frase de fallo que antes se repartía
   * entre todas.
   */
  | "anchor-unresolved";

export interface GuidePanelAbsenceInput {
  status: ChapterExperienceStatus;
  /** `true` sólo si la definición está resuelta y lista para pintarse. */
  hasDefinition: boolean;
  /** Cuántos recorridos publica el capítulo, según la misma consulta. */
  publishedCount: number;
  /** Si la lectura del recorrido propio falló por algo que no es un 404. */
  ownedLookupFailed: boolean;
  /**
   * Si el servidor dice que esta persona tiene un recorrido propio abrible en
   * ESTE capítulo, aunque sea en otro pin. Ver `hasOwnOpenableJourney`.
   *
   * Opcional: quien no lo pase se comporta exactamente como antes.
   */
  ownElsewhere?: boolean;
  anchorResolved: boolean;
}

/**
 * `null` cuando no hay nada que explicar: hay definición y su pasaje resuelve,
 * así que el panel pinta el recorrido.
 *
 * El orden de las ramas ES la regla, y conviene leerlo como tal:
 *
 *   1. mientras la consulta está en vuelo no se afirma nada;
 *   2. un fallo —de la lista o de la lectura propia— gana sobre cualquier
 *      conclusión sobre el catálogo, porque no hay conclusión que sacar;
 *   3. sin definición, la pregunta es qué hay en el capítulo: otros publicados,
 *      un recorrido propio en otro pin, o nada;
 *   4. con definición, la única duda que queda es el pasaje.
 *
 * El orden del punto 3 también es la regla. «Otros publicados» va primero
 * porque es la salida más directa —hay una tarjeta que empezar—, y el recorrido
 * propio después: cuando el capítulo publica algo, su mensaje ya manda a la
 * lista donde ese recorrido propio también está.
 */
export function guidePanelAbsence(
  input: GuidePanelAbsenceInput,
): GuidePanelAbsence | null {
  if (input.status === "loading") return "loading";
  if (input.status === "error" || input.ownedLookupFailed)
    return "lookup-failed";
  if (!input.hasDefinition) {
    if (input.publishedCount > 0) return "pin-unavailable";
    return input.ownElsewhere === true ? "own-elsewhere" : "not-published";
  }
  if (!input.anchorResolved) return "anchor-unresolved";
  return null;
}

/** Lo que lee la persona, y el identificador con el que se comprueba. */
export const GUIDE_PANEL_ABSENCE_COPY: Record<
  GuidePanelAbsence,
  { testId: string; text: string }
> = {
  loading: {
    testId: "rgp-preparando",
    text: "Preparando el recorrido…",
  },
  "lookup-failed": {
    testId: "rgp-consulta-fallida",
    text:
      "No pudimos consultar los recorridos de este capítulo. Puede ser la " +
      "conexión o tu sesión. Cierra y vuelve a abrir este panel para " +
      "intentarlo otra vez; puedes seguir leyendo con normalidad.",
  },
  "not-published": {
    testId: "rgp-sin-recorrido-publicado",
    text:
      "Este capítulo todavía no tiene recorrido guiado publicado. Puedes " +
      "seguir leyendo con normalidad.",
  },
  "pin-unavailable": {
    testId: "rgp-recorrido-no-disponible",
    text:
      "Este recorrido no está disponible ahora. El capítulo tiene otros " +
      "recorridos publicados, y puedes seguir leyendo con normalidad.",
  },
  "own-elsewhere": {
    testId: "rgp-recorrido-propio-en-otro",
    text:
      "Tienes un recorrido empezado en este capítulo, pero no es el que abre " +
      "esta pestaña. Vuelve a la portada del capítulo y ábrelo desde su " +
      "tarjeta, en «Recorrido guiado».",
  },
  "anchor-unresolved": {
    testId: "rgp-anchor-unresolved",
    text:
      "No pudimos preparar el recorrido de este capítulo. Puedes seguir " +
      "leyendo con normalidad.",
  },
};
