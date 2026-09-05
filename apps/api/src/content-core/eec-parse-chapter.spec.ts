import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El troceador del manuscrito, y por qué tocarlo es delicado.
 *
 * `parse-chapter.mjs` decide qué es un bloque. El emparejador de Content Core
 * lleva la identidad de un bloque hacia adelante comparando hash y similitud:
 * si el build partiera el texto de otra forma, cada bloque parecería nuevo y
 * los subrayados de los lectores quedarían huérfanos. Por eso el lote C03–C10
 * añadió DOS reglas y estas pruebas fijan las dos mitades del trato:
 *
 *  · las reglas nuevas hacen lo que dicen sobre el material nuevo, y
 *  · no mueven ni un bloque de C01 y C02, que ya están publicados.
 *
 * La segunda mitad es la que importa: se comprueba contra el payload REAL que
 * se ingirió en producción, no contra una expectativa escrita a mano.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");

type Block = { kind: string; content: string };
type Parsed = { title: string; blocks: Block[] };

async function parse(raw: string, fallback: string): Promise<Parsed> {
  const mod = await import(
    /* @vite-ignore */ join(ROOT, "scripts/eec/parse-chapter.mjs")
  );
  return mod.parseChapter(raw, fallback) as Parsed;
}

describe("EEC · el troceador no mueve lo ya publicado", () => {
  // El contrato real: los bloques que produce el parser HOY son exactamente
  // los que están servidos en producción para C01 y C02.
  for (const [chapter, version] of [
    ["C01", "v1.0"],
    ["C02", "v1.0"],
  ] as const) {
    it(`${chapter} trocea exactamente igual que el payload ingerido`, async () => {
      const unit = JSON.parse(
        readFileSync(
          join(ROOT, `content/books/eec/${chapter}/unit.json`),
          "utf8",
        ),
      ) as { title: string };
      const raw = readFileSync(
        join(ROOT, `content/books/eec/${chapter}/chapter.md`),
        "utf8",
      );
      const published = JSON.parse(
        readFileSync(
          join(
            ROOT,
            `artifacts/eec/${chapter}/${version}/feelverse/unit-payload.json`,
          ),
          "utf8",
        ),
      ) as { blocks: Block[] };

      const { blocks } = await parse(raw, unit.title);
      expect(blocks.map((b) => [b.kind, b.content])).toEqual(
        published.blocks.map((b) => [b.kind, b.content]),
      );
    });
  }
});

describe("EEC · front matter y separadores", () => {
  it("descarta el front matter YAML que abre el fichero", async () => {
    // C09 se cerró con una cabecera YAML que describe al propio fichero
    // (proyecto, versión, fecha de bloqueo). Es metadato de almacenamiento,
    // nunca prosa que el lector viera.
    const raw = [
      "---",
      'titulo_publico: "Repensar lo que sientes"',
      'estado: "TEXT_LOCKED"',
      "---",
      "",
      "# Capítulo 9",
      "",
      "Es domingo y todavía queda arroz en la mesa.",
    ].join("\n");
    const { title, blocks } = await parse(raw, "fallback");
    expect(title).toBe("Capítulo 9");
    expect(JSON.stringify(blocks)).not.toContain("titulo_publico");
    expect(JSON.stringify(blocks)).not.toContain("TEXT_LOCKED");
  });

  it("un `---` que no abre el fichero es un separador, no front matter", async () => {
    const raw = [
      "# Título",
      "",
      "Primer párrafo del capítulo.",
      "",
      "---",
      "",
      "Segundo párrafo del capítulo.",
    ].join("\n");
    const { blocks } = await parse(raw, "fallback");
    const prose = blocks
      .filter((b) => b.kind === "PARAGRAPH")
      .map((b) => b.content);
    // Ni se traga el resto del texto ni deja el guion suelto como bloque.
    expect(prose).toContain("Primer párrafo del capítulo.");
    expect(prose).toContain("Segundo párrafo del capítulo.");
  });

  it("ningún separador sobrevive como bloque", async () => {
    // Sin la regla, `---` pasa por `isImplicitHeading` (corto, sin puntuación
    // final) y se publica como un encabezado que dice «---».
    const raw = [
      "# Título",
      "",
      "Uno.",
      "",
      "---",
      "",
      "***",
      "",
      "___",
      "",
      "Dos.",
    ].join("\n");
    const { blocks } = await parse(raw, "fallback");
    for (const b of blocks) {
      expect(b.content).not.toMatch(/^(-{3,}|\*{3,}|_{3,})$/);
    }
  });

  it("los ocho capítulos del lote trocean sin separadores ni metadato", async () => {
    for (const chapter of [
      "C03",
      "C04",
      "C05",
      "C06",
      "C07",
      "C08",
      "C09",
      "C10",
    ]) {
      const unit = JSON.parse(
        readFileSync(
          join(ROOT, `content/books/eec/${chapter}/unit.json`),
          "utf8",
        ),
      ) as { title: string };
      const raw = readFileSync(
        join(ROOT, `content/books/eec/${chapter}/chapter.md`),
        "utf8",
      );
      const { blocks } = await parse(raw, unit.title);
      expect(blocks.length, chapter).toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b.content, chapter).not.toMatch(/^(-{3,}|\*{3,}|_{3,})$/);
      }
      // El front matter de C09 no puede haberse colado como prosa.
      expect(JSON.stringify(blocks), chapter).not.toContain(
        "titulo_academico:",
      );
    }
  });
});
