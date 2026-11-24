import type { EcoSuggestion, InsightKind } from "./index";

/**
 * De dónde sale lo que Inicio sugiere, dicho como es.
 *
 * ── Por qué existe este fichero ───────────────────────────────────────────
 *
 * La tarjeta principal de Inicio firmaba «Generado por Eco» y «a partir de tu
 * actividad reciente · solo tú puedes verlo» SIEMPRE, incluso cuando el
 * servidor no devolvía nada y la pantalla pintaba una frase fija. Las tres
 * cosas eran falsas:
 *
 *   - no lo genera Eco ni ningún modelo: son cuatro reglas en
 *     `HomeService.composeInsightToday`;
 *   - sin actividad que las dispare no sale de la actividad de nadie;
 *   - lo calcula el servidor, así que no es cierto que sólo lo vea la persona.
 *
 * Los temas de la tarjeta de Eco tampoco los redacta Eco: los escoge
 * `buildEcoSuggestions`, también por reglas.
 *
 * Vive en el paquete compartido porque web y móvil pintan la misma tarjeta con
 * los mismos datos, y hasta ahora las dos firmaban mal cada una a su manera.
 */

/** Qué disparó la frase, por tipo. Cada una es la condición real de su regla. */
export const INSIGHT_ORIGEN: Readonly<Record<InsightKind, string>> = {
  streak: "Aparece porque llevas varios días seguidos.",
  "mood-trend":
    "Aparece porque marcaste el mismo ánimo varias veces estos días.",
  "book-progress": "Aparece porque tienes un libro empezado.",
  neutral: "Aparece porque leíste o escribiste esta semana.",
};

/** Lo que se firma cuando la frase sí sale de la actividad. */
export const INSIGHT_FIRMA = "Según tu actividad";
/** Cola común: quién la elige. */
export const INSIGHT_REGLA = "La elige una regla, no una IA.";

/** Sin nada que contar: frase fija, y se dice que lo es. */
export const INSIGHT_GENERAL = "Hoy es un buen día para mirarte con calma.";
export const INSIGHT_GENERAL_FIRMA = "Mensaje general";
export const INSIGHT_GENERAL_ORIGEN =
  "Es una frase fija: no sale de tu actividad.";

/** La explicación completa para el pie de la tarjeta, en los dos estados. */
export function insightOrigen(kind: InsightKind | null | undefined): string {
  if (!kind) return INSIGHT_GENERAL_ORIGEN;
  // Un tipo que este cliente no conozca no se queda sin explicación.
  const causa = INSIGHT_ORIGEN[kind] ?? "Sale de tu actividad reciente.";
  return `${causa} ${INSIGHT_REGLA}`;
}

/** Título de la tarjeta de Eco: son temas PARA hablar con Eco. */
export const ECO_IDEAS_TITULO = "Ideas para conversar con Eco";

/**
 * La línea bajo ese título. `cold-start` es la idea de reserva: sale cuando
 * ninguna regla encontró actividad, así que no puede firmarse como «tu
 * actividad».
 */
export function ecoIdeasOrigen(
  suggestions: ReadonlyArray<Pick<EcoSuggestion, "id">>,
): string {
  return suggestions.some((s) => s.id !== "cold-start")
    ? "Según tu actividad reciente"
    : "Para empezar cuando quieras";
}
