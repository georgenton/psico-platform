import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ReaderPreferencesModal,
  type ReaderPrefs,
} from "./ReaderPreferencesModal";

/**
 * La letra del libro.
 *
 * El recorrido de las ocho combinaciones (estilo × ambiente) sobre el texto
 * reparado destapó que **164 de 188 bloques** —todo el cuerpo: párrafos, citas,
 * pausas, ejercicios— computaban `font-family: serif` a secas, que es la serif
 * por defecto del navegador (Times), mientras los 24 encabezados sí usaban
 * Newsreader. El cuerpo del libro se pintaba con otra letra que sus propios
 * títulos, y el estilo elegido no llegaba al texto.
 *
 * La causa no era que faltara el token: `--fv-font-reader` existe en los dos
 * estilos y la hoja ya traía una regla `.reader-prose` para aplicarlo. Era que
 * el lector la pisaba con un estilo EN LÍNEA genérico —gana siempre— y que
 * nadie llevaba esa clase, así que la regla estaba muerta por los dos lados.
 *
 * Esto fija las tres mitades del arreglo, porque cada una se puede deshacer
 * sola: el token distingue los estilos, la decisión del lector lo nombra, y la
 * muestra del selector está escrita con la letra que vas a recibir.
 */

const WEB_SRC = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(WEB_SRC, p), "utf8");

/** Una familia genérica suelta: lo que el navegador pinta con Times. */
const GENERIC = /(?:^|["'\s:(])(?:serif|sans-serif|system-ui)(?:["'\s,)]|$)/;

describe("la letra del lector sale del sistema, no del navegador", () => {
  it("el token de lectura existe en los dos estilos y NO vale lo mismo", () => {
    const css = read("app/globals.css");
    const values = [...css.matchAll(/--fv-font-reader:\s*([^;]+);/g)].map((m) =>
      m[1]!.trim(),
    );
    // Dos declaraciones, una por estilo. Si sólo hubiera una, el estilo no
    // cambiaría la letra del libro y el token sería decorativo.
    expect(values).toHaveLength(2);
    expect(new Set(values).size).toBe(2);
    // Y cada una nombra una fuente real antes de caer a la genérica.
    for (const v of values) {
      expect(v).toMatch(/var\(--font-(newsreader|source-serif)\)/);
    }
  });

  it("la decisión de fuente del lector nombra los tokens, no familias genéricas", () => {
    const shell = read("components/dashboard/lector/LectorShell.tsx");
    const decision = shell.match(/fontFamily:\s*\n?\s*prefs\.font[^,]+,/s)?.[0];
    expect(decision, "no se encontró la decisión de fuente").toBeTruthy();
    // Sólo las RAMAS, no la comparación: `prefs.font === "serif"` nombra el
    // valor de la preferencia, que seguirá llamándose «serif» y no es una
    // familia. Lo que no puede ser genérico es lo que se entrega.
    const branches = decision!.slice(decision!.indexOf("?"));
    expect(branches).toContain("var(--fv-font-reader)");
    expect(branches).toContain("var(--fv-font-body)");
    // Ésta es la regresión exacta que hubo: `"serif" : "system-ui, sans-serif"`.
    expect(branches).not.toMatch(GENERIC);
  });

  it("el contenedor del texto lleva la clase que aplica esa letra", () => {
    const view = read("components/dashboard/lector/ReaderExperienceView.tsx");
    // La columna del capítulo, identificada por el gancho que ya tenía.
    const column = view.match(
      /data-testid="reader-chapter-column"[\s\S]{0,400}?style=\{proseStyle\}/,
    )?.[0];
    expect(column, "no se encontró la columna del capítulo").toBeTruthy();
    expect(column).toMatch(/className="[^"]*\breader-prose\b/);
  });

  it("la hoja aplica la letra de lectura a esa clase", () => {
    const css = read("app/globals.css");
    expect(css).toMatch(
      /\.reader-prose\s*\{[^}]*font-family:\s*var\(--fv-font-reader\)/,
    );
  });
});

describe("la muestra del selector está escrita con la letra que entrega", () => {
  const PREFS: ReaderPrefs = {
    theme: "system",
    font: "serif",
    fontSize: 18,
    lineHeight: 1.6,
  };

  function open() {
    render(
      <ReaderPreferencesModal
        isOpen
        initial={PREFS}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("Serif previsualiza con el token de lectura y Sans con el del cuerpo", () => {
    open();
    // `style` en línea conserva el `var(...)` literal, que es justo lo que se
    // quiere comprobar: la muestra delega en el estilo activo en vez de fijar
    // una letra que luego no recibes.
    expect(screen.getByRole("button", { name: "Serif" })).toHaveStyle({
      fontFamily: "var(--fv-font-reader)",
    });
    expect(screen.getByRole("button", { name: "Sans" })).toHaveStyle({
      fontFamily: "var(--fv-font-body)",
    });
  });

  it("ninguna de las dos muestras cae en una familia genérica", () => {
    open();
    for (const label of ["Serif", "Sans"]) {
      const el = screen.getByRole("button", { name: label });
      expect(el.style.fontFamily).not.toMatch(GENERIC);
    }
  });
});
