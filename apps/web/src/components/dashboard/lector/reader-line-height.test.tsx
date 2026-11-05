import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ChapterBlockSummary } from "@psico/types";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BlockRenderer } from "./BlockRenderer";

/**
 * El interlineado del lector llega al cuerpo del libro.
 *
 * QUÉ PASABA, medido sobre la versión servida. Mover el control de
 * «Interlineado» cambiaba el contenedor del capítulo y las citas —de 21,6 px a
 * 39,6 px entre los extremos del control— mientras los 157 párrafos se
 * quedaban clavados en 30,6. Dentro de la misma página unos bloques obedecían
 * la preferencia y otros no, y en reposo el control decía 1,8 mientras
 * entregaba 1,7.
 *
 * LA CAUSA es la misma familia que la de la letra, que se arregló justo antes:
 * una declaración EN EL ELEMENTO gana siempre a la herencia. La preferencia
 * viaja como `line-height` en la columna del capítulo y se hereda; el párrafo
 * traía un `leading-[1.7]` propio que la tapaba.
 *
 * POR QUÉ UN TRINQUETE. Porque la regresión es de una palabra: cualquiera
 * puede volver a añadir un `leading-*` «para que se vea mejor» sin saber que
 * con eso desconecta el control. Se fija por los dos lados —la fuente y lo que
 * se renderiza— porque cada uno se puede deshacer solo.
 *
 * LO QUE SÍ PUEDE FIJAR INTERLINEADO: los encabezados (`leading-tight`), que
 * son titulares y no prosa de lectura. Esa excepción se nombra aquí para que
 * sea una decisión y no un descuido.
 */

const DIR = __dirname;
const SRC = join(DIR, "..", "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Cualquier utilidad de interlineado de Tailwind: `leading-[1.7]`, `leading-tight`… */
const LEADING = /\bleading-[[\w.-]+\]?/g;

function bloque(
  kind: ChapterBlockSummary["kind"],
  content: string,
): ChapterBlockSummary {
  return {
    id: `b-${kind}`,
    order: 1,
    kind,
    content,
    meta: null,
  } as ChapterBlockSummary;
}

function pintar(kind: ChapterBlockSummary["kind"], texto: string) {
  const { container } = render(
    <BlockRenderer
      block={bloque(kind, texto)}
      highlights={[]}
      annotationCount={0}
      registerRef={vi.fn()}
    />,
  );
  return container.firstElementChild as HTMLElement;
}

describe("la preferencia de interlineado alcanza el cuerpo del libro", () => {
  it("el párrafo no declara interlineado propio, así que lo hereda", () => {
    const p = pintar("PARAGRAPH", "Una madre sostiene a su hijo.");
    expect(p.tagName).toBe("P");
    // Ésta es la regresión exacta que hubo: `leading-[1.7]` en el párrafo.
    expect(p.className).not.toMatch(LEADING);
  });

  it("la cita tampoco, que es la que delataba la incoherencia", () => {
    // La cita YA obedecía antes del arreglo. Se fija para que el día que
    // alguien «uniforme» los bloques lo haga hacia la herencia, no hacia una
    // segunda declaración fija.
    const q = pintar("QUOTE", "Lo que sentimos también se aprende.");
    expect(q.className).not.toMatch(LEADING);
  });

  it("sólo el encabezado fija interlineado, y es deliberado", () => {
    const fuente = read("components/dashboard/lector/BlockRenderer.tsx");
    const conLeading = [...fuente.matchAll(/className="([^"]*leading-[^"]*)"/g)]
      .map((m) => m[1]!)
      .filter((c) => c.includes("reader-block"));
    expect(conLeading).toHaveLength(1);
    expect(conLeading[0]).toContain("reader-block-heading");
  });

  it("la columna del capítulo entrega el interlineado de la preferencia", () => {
    const shell = read("components/dashboard/lector/LectorShell.tsx");
    const prose = shell.match(
      /const proseStyle: React\.CSSProperties = \{[\s\S]*?\n {2}\};/,
    )?.[0];
    expect(prose, "no se encontró proseStyle").toBeTruthy();
    // Sin esto el párrafo heredaría el valor por defecto de la hoja y el
    // control no tendría de dónde salir: quitar el `leading-` no bastaría.
    expect(prose).toMatch(/lineHeight:\s*prefs\.lineHeight/);
  });
});
