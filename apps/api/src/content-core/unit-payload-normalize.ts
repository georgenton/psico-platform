import { INLINE_MARKS_META_KEY } from "@psico/types";

import { parseEmphasis, restoreSpans } from "./markdown-emphasis";

/**
 * El paso que le faltaba a la tubería del manuscrito: del Markdown del autor a
 * la forma que el lector sirve.
 *
 * ── Por qué existe, medido ──────────────────────────────────────────────────
 *
 * `inline-marks.ts` fija la regla de la que depende todo el lector:
 * `block.content` es EXACTAMENTE el texto que se lee, y el formato vive al lado
 * como desplazamientos. El 2026-10-26 esa regla se restauró sobre 732 bloques
 * de *Emociones en Construcción* — se sacaron los asteriscos del texto y se
 * guardaron como `inlineMarks`.
 *
 * Lo que nadie había comprobado es que **el build del capítulo sigue
 * produciendo la forma de antes**. Contrastado el 2026-11-13 contra lo que
 * sirve staging: de los 188 bloques del capítulo 1, **49 difieren** — el build
 * los entrega con `**negrita**` dentro de `content` y sin `inlineMarks`. Es
 * decir: **reingerir un build del canónico deshacía la reparación**, y el
 * lector volvería a pintar los asteriscos. Un trampolín silencioso, porque el
 * build y la ingesta son los dos verdes por separado.
 *
 * Esta función es ese paso, y con él la tubería vuelve a ser reproducible:
 * `normalizeUnitPayloadBlocks(build(canónico))` reprodujo los 188 bloques
 * publicados, **content y meta idénticos** (los `meta` sólo diferían en el
 * orden de las claves que serializa JSONB).
 *
 * ── Qué NO hace ─────────────────────────────────────────────────────────────
 *
 * No adivina. Reusa `parseEmphasis`, que es el mismo analizador de la
 * reparación —no una segunda implementación que pueda divergir— y que **rehúsa**
 * ante lo que no puede representar: un acento invertido, un `_subrayado_`, un
 * enlace, o un tipo de bloque sin formato en línea. Una negativa se informa con
 * su índice y su motivo; quien llame decide. Media traducción —texto limpio con
 * marcas que no cuadran— sería peor que no tocar el bloque.
 *
 * Y no toca las viñetas: 288 bloques empiezan por `- `, que es estructura de
 * bloque y no énfasis. Ese resto es visible y honesto.
 */

/** Un bloque tal como lo entrega el build, y tal como lo toma la ingesta. */
export interface PayloadBlock {
  kind: string;
  content: string;
  meta?: unknown;
}

export interface NormalizeRefusal {
  /** Posición en el payload, para que un informe pueda señalarla. */
  index: number;
  kind: string;
  blocker: string;
  detail: string;
}

export interface NormalizeResult {
  blocks: PayloadBlock[];
  /** Bloques cuyo `content` cambió (y que por tanto ganaron `inlineMarks`). */
  normalized: number;
  /** Bloques que ya estaban limpios: ni un asterisco emparejado. */
  untouched: number;
  /**
   * Bloques que NO se pudieron traducir. Se devuelven **intactos** en
   * `blocks`, no a medias: quien llame los ve y decide si publica así, los
   * corrige en el manuscrito o se detiene.
   */
  refusals: NormalizeRefusal[];
}

/**
 * Mueve el énfasis de `content` a `meta.inlineMarks`, bloque a bloque.
 *
 * Conserva cualquier otra clave de `meta` que el build haya puesto —notas,
 * figuras, ejercicios— porque esto es un paso sobre el formato en línea y no
 * una reescritura del `meta`.
 */
export function normalizeUnitPayloadBlocks(
  blocks: readonly PayloadBlock[],
): NormalizeResult {
  const out: PayloadBlock[] = [];
  const refusals: NormalizeRefusal[] = [];
  let normalized = 0;
  let untouched = 0;

  blocks.forEach((b, index) => {
    const parsed = parseEmphasis(b.content, b.kind);
    if (!parsed.ok) {
      refusals.push({
        index,
        kind: b.kind,
        blocker: parsed.blocker,
        detail: parsed.detail,
      });
      out.push({ ...b });
      return;
    }
    const { text, marks } = parsed.parse;
    if (marks.length === 0) {
      untouched += 1;
      out.push({ ...b });
      return;
    }
    normalized += 1;
    const base =
      b.meta && typeof b.meta === "object" && !Array.isArray(b.meta)
        ? (b.meta as Record<string, unknown>)
        : {};
    out.push({
      kind: b.kind,
      content: text,
      meta: { ...base, [INLINE_MARKS_META_KEY]: marks },
    });
  });

  return { blocks: out, normalized, untouched, refusals };
}

/**
 * El inverso, para probar que la traducción es reversible.
 *
 * Reconstruye el texto original a partir del normalizado y de sus marcas. No es
 * un atajo de `restoreSpans`: los `removals` viven sólo dentro del análisis, así
 * que esto los deriva de las marcas canónicas — y por eso vale como
 * comprobación independiente de que las marcas describen de verdad los
 * delimitadores que se quitaron.
 *
 * Devuelve `null` cuando el bloque no lleva marcas: no hay nada que invertir.
 */
export function restoreEmphasisFromMarks(block: PayloadBlock): string | null {
  const meta =
    block.meta && typeof block.meta === "object" && !Array.isArray(block.meta)
      ? (block.meta as Record<string, unknown>)
      : null;
  const marks = meta?.[INLINE_MARKS_META_KEY];
  if (!Array.isArray(marks) || marks.length === 0) return null;

  // Cada marca se abrió y se cerró con su propia corrida de asteriscos, así que
  // los huecos a reinsertar son dos por marca, en coordenadas del texto VIEJO:
  // el de apertura corre el resto, y el de cierre corre lo que venga después.
  const spans: { at: number; length: number }[] = [];
  let shift = 0;
  for (const m of [...marks].sort(
    (a, b) =>
      (a as { startOffset: number }).startOffset -
      (b as { startOffset: number }).startOffset,
  )) {
    const mark = m as { type: string; startOffset: number; endOffset: number };
    const len = mark.type === "BOLD" ? 2 : 1;
    spans.push({ at: mark.startOffset + shift, length: len });
    shift += len;
    spans.push({ at: mark.endOffset + shift, length: len });
    shift += len;
  }
  return restoreSpans(block.content, spans);
}
