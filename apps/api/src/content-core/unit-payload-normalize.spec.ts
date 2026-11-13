import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  normalizeUnitPayloadBlocks,
  restoreEmphasisFromMarks,
  type PayloadBlock,
} from "./unit-payload-normalize";

/**
 * El paso que faltaba entre el build del manuscrito y la ingesta, probado
 * contra el capítulo REAL.
 *
 * El defecto que lo trajo aquí no se ve mirando ninguna de las dos mitades: el
 * build produce la forma de antes de la reparación del 2026-10-26 —asteriscos
 * dentro de `content`, sin `inlineMarks`— y la ingesta escribe lo que le den.
 * Las dos pasan sus pruebas. Juntas, **deshacen la reparación**: 49 de los 188
 * bloques del capítulo 1 volverían a pintar `**negrita**` en pantalla.
 *
 * Por eso el caso que de verdad pesa es el del final: el build del canónico,
 * normalizado, no deja ni un asterisco emparejado. Y por eso la prueba corre
 * el build REAL en vez de un fragmento escrito a mano — un fragmento no se
 * entera de que el troceador cambió.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const OUT = ".tmp-normalize-spec";

afterAll(() => {
  rmSync(join(ROOT, OUT), { recursive: true, force: true });
});

/**
 * La versión del directorio que el build escribe, DERIVADA del sello.
 *
 * El build la saca de `canonical_version` (`match(/_v([\d.]+)_/)`), así que
 * esto hace lo mismo. Estaba escrita a mano como `v1.0`, y entonces reabrir el
 * capítulo como v1.1 hacía que esta prueba fallara buscando un fichero en un
 * directorio que el build ya no usa — un ENOENT por una decisión editorial.
 */
function versionDeC01(): string {
  const unit = JSON.parse(
    readFileSync(join(ROOT, "content/books/eec/C01/unit.json"), "utf8"),
  ) as { canonical_version?: unknown };
  const v = unit.canonical_version;
  const m = typeof v === "string" ? /_v([\d.]+)_/.exec(v) : null;
  if (m === null) {
    throw new Error("C01/unit.json no declara una canonical_version legible");
  }
  return `v${m[1]}`;
}

async function buildC01(): Promise<PayloadBlock[]> {
  const mod = (await import(
    /* @vite-ignore */ join(ROOT, "scripts/eec/build-chapter.mjs")
  )) as { build: (a: { chapter: string; out: string }) => void };
  mod.build({ chapter: "C01", out: OUT });
  const payload = JSON.parse(
    readFileSync(
      join(ROOT, OUT, "eec/C01", versionDeC01(), "feelverse/unit-payload.json"),
      "utf8",
    ),
  ) as { blocks: PayloadBlock[] };
  return payload.blocks;
}

const marksOf = (b: PayloadBlock): unknown[] => {
  const meta = b.meta as Record<string, unknown> | null | undefined;
  const m = meta?.inlineMarks;
  return Array.isArray(m) ? m : [];
};

describe("normalizeUnitPayloadBlocks", () => {
  it("saca el énfasis del texto y lo pone al lado, con sus desplazamientos", () => {
    const { blocks, normalized, untouched, refusals } =
      normalizeUnitPayloadBlocks([
        { kind: "PARAGRAPH", content: "Una idea **importante** aquí." },
      ]);
    expect(refusals).toEqual([]);
    expect(normalized).toBe(1);
    expect(untouched).toBe(0);
    expect(blocks[0]!.content).toBe("Una idea importante aquí.");
    expect(marksOf(blocks[0]!)).toEqual([
      { type: "BOLD", startOffset: 9, endOffset: 19 },
    ]);
    // Y los desplazamientos señalan la palabra, no un sitio aproximado.
    expect(blocks[0]!.content.slice(9, 19)).toBe("importante");
  });

  it("conserva el resto del `meta` que trae el build", () => {
    // Es un paso sobre el formato en línea, no una reescritura del meta: un
    // `noteId` o un ejercicio que el build adjuntó tiene que sobrevivir.
    const { blocks } = normalizeUnitPayloadBlocks([
      {
        kind: "PARAGRAPH",
        content: "Con *nota*.",
        meta: { noteIds: ["n-7"] },
      },
    ]);
    expect(blocks[0]!.meta).toEqual({
      noteIds: ["n-7"],
      inlineMarks: [{ type: "ITALIC", startOffset: 4, endOffset: 8 }],
    });
  });

  it("deja intacto lo que ya está limpio, sin inventarle un meta", () => {
    const { blocks, normalized, untouched } = normalizeUnitPayloadBlocks([
      { kind: "PARAGRAPH", content: "Sin formato." },
    ]);
    expect(normalized).toBe(0);
    expect(untouched).toBe(1);
    expect(blocks[0]!.meta).toBeUndefined();
  });

  it("rehúsa en vez de traducir a medias, y devuelve el bloque intacto", () => {
    // Un acento invertido no tiene tipo de marca que lo lleve. Dejar el texto
    // limpio con una marca que no cuadra sería peor que no tocarlo.
    const original = "**Nota:** ajusta `TEXT_LOCKED` antes.";
    const { blocks, refusals, normalized } = normalizeUnitPayloadBlocks([
      { kind: "QUOTE", content: original },
    ]);
    expect(normalized).toBe(0);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.blocker).toBe("UNREPRESENTABLE_MARKUP");
    expect(refusals[0]!.index).toBe(0);
    expect(blocks[0]!.content).toBe(original);
    expect(marksOf(blocks[0]!)).toEqual([]);
  });

  it("rehúsa cuando el tipo de bloque no admite formato en línea", () => {
    // `INLINE_FORMATTABLE_KINDS` son cuatro: PARAGRAPH, HEADING, QUOTE y
    // PAUSE. Un EXERCISE no tiene dónde guardar el formato, así que el
    // énfasis dentro de uno es una negativa y no un arreglo silencioso — es
    // el segundo bloque que la reparación del 2026-10-26 dejó fuera.
    const { refusals, normalized } = normalizeUnitPayloadBlocks([
      { kind: "EXERCISE", content: "Escribe **lo que sientes**." },
    ]);
    expect(normalized).toBe(0);
    expect(refusals[0]!.blocker).toBe("KIND_NOT_FORMATTABLE");
  });

  it("la traducción es reversible: las marcas reconstruyen el original", () => {
    // El control que hace que esto sea una traducción y no una pérdida. Se
    // deriva de las MARCAS, no de los `removals` del análisis, así que
    // comprueba de verdad que las marcas describen los delimitadores quitados.
    const casos = [
      "Una idea **importante** aquí.",
      "*Todo en cursiva*",
      "Dos: **una** y *otra*, seguidas.",
      "**Al principio** y al final **también**",
    ];
    for (const original of casos) {
      const { blocks } = normalizeUnitPayloadBlocks([
        { kind: "PARAGRAPH", content: original },
      ]);
      expect(restoreEmphasisFromMarks(blocks[0]!)).toBe(original);
    }
  });

  it("no inventa un inverso cuando no hay marcas", () => {
    expect(
      restoreEmphasisFromMarks({ kind: "PARAGRAPH", content: "Sin nada." }),
    ).toBeNull();
  });

  describe("contra el capítulo 1 real, recién construido", () => {
    it("no deja Markdown suelto: los únicos asteriscos visibles son los rehusados", async () => {
      const built = await buildC01();
      // Que haya capítulo de verdad, sin fijar su tamaño: el recuento exacto
      // es una decisión editorial, y la primera versión de esta prueba lo
      // tomaba como su asunto. Al retirarse la nota interna del capítulo, su
      // `toHaveLength(188)` y su «exactamente una negativa» cayeron a la vez
      // — y lo que medían no se había roto. **Tercera vez** que un ejemplo
      // heredado de un artefacto que las decisiones editoriales mueven deja
      // de medir su invariante en silencio.
      expect(built.length).toBeGreaterThan(150);

      const { blocks, normalized, refusals } =
        normalizeUnitPayloadBlocks(built);

      // 49 bloques con énfasis, cifra del 2026-11-13 contrastada contra lo que
      // sirve staging. Se conserva porque es estable bajo la limpieza
      // editorial —antes y después— y porque un 0 aquí querría decir que el
      // analizador dejó de reconocer el énfasis del corpus real.
      expect(normalized).toBe(49);

      // **El invariante, y es éste.** Una vez normalizado, los únicos bloques
      // con un asterisco en el texto son los que se rehusaron. Sin esto, la
      // tubería volvería a publicar Markdown en crudo sin que nada se queje.
      // Vale con una negativa, con cinco y con ninguna: el mecanismo de la
      // negativa tiene su propio caso declarado más arriba, que ninguna
      // edición del manuscrito puede borrar.
      const conAsterisco = blocks
        .map((b, i) => [i, b] as const)
        .filter(([, b]) => b.content.includes("*"))
        .map(([i]) => i);
      expect(conAsterisco).toEqual(refusals.map((r) => r.index));

      // Reversible bloque a bloque sobre el corpus real, no sólo sobre casos
      // escritos a mano.
      for (const [i, b] of blocks.entries()) {
        const back = restoreEmphasisFromMarks(b);
        if (back !== null) expect(back).toBe(built[i]!.content);
      }
    }, 120_000);
  });
});
