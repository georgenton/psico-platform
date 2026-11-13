/**
 * Por qué el panel guiado no puede pintar un recorrido — las cuatro razones,
 * separadas.
 *
 * Existe porque estaban colapsadas en una. El panel preguntaba
 * `status !== "loading" && definition === null` y, con eso, **un fallo de
 * consulta se anunciaba como una decisión editorial**: una caída de red, una
 * sesión caducada o un 500 producían «este capítulo todavía no tiene recorrido
 * guiado publicado», que afirma algo sobre el catálogo a partir de una pregunta
 * que no llegó a contestarse.
 *
 * Las cuatro no son matices de redacción: son causas distintas, con dueños
 * distintos y remedios distintos. «No está publicado» lo arregla quien publica;
 * «no pudimos consultar» lo arregla reintentar; «el pasaje no aparece» lo
 * arregla quien edita el manuscrito. Decir una por otra manda a la persona —y a
 * quien lea el informe— al sitio equivocado.
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
   * Hay definición y su pasaje no se localiza en el capítulo en pantalla. La
   * única de las cuatro que es una avería de contenido — es la que retiró el
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
 *   3. sin definición, la pregunta es si el capítulo publica algo;
 *   4. con definición, la única duda que queda es el pasaje.
 */
export function guidePanelAbsence(
  input: GuidePanelAbsenceInput,
): GuidePanelAbsence | null {
  if (input.status === "loading") return "loading";
  if (input.status === "error" || input.ownedLookupFailed)
    return "lookup-failed";
  if (!input.hasDefinition)
    return input.publishedCount > 0 ? "pin-unavailable" : "not-published";
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
  "anchor-unresolved": {
    testId: "rgp-anchor-unresolved",
    text:
      "No pudimos preparar el recorrido de este capítulo. Puedes seguir " +
      "leyendo con normalidad.",
  },
};
