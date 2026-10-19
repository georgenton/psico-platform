import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * El bloque de error acompaña a la pantalla, y sigue siendo un par.
 *
 * EL FALLO QUE ESTO IMPIDE. La tinta del error ya seguía al ambiente desde
 * #741, pero la LOSA sobre la que se apoya iba escrita a mano: `#FEE2E2` con
 * borde `#FCA5A5` en el modal de crisis, en la burbuja de crisis de Eco y en
 * los avisos de notificaciones. Medido: esa losa tiene luminancia 0,810 y la
 * página de Noche 0,006 — un bloque claro sobre pantalla oscura, el mismo
 * defecto que ya se corrigió en Círculos. El sistema aprobado trae el par
 * hecho y `moods.css` lo explica en su propio comentario.
 *
 * DOS COSAS, Y LAS DOS IMPORTAN. Que ninguna superficie vuelva a escribir la
 * paleta a mano, y que los alias vivan en `body`: un `--a: var(--b)` se
 * resuelve DONDE SE DECLARA, así que puestos en `:root` capturarían el valor
 * del tema y no verían el que `body.amb-noche` pone en `body`. Eso es #728, y
 * es la razón por la que la primera versión de #741 se quedó en 2,54:1.
 *
 * El contraste del par se mide aparte, en `color-contracts` («ERROR · losa»),
 * que resuelve los ocho estados como lo haría el navegador. Aquí sólo se
 * vigila que nadie se salga del par.
 */

const RAIZ = join(__dirname, "..", "..", "..");
const GLOBALS = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");

/** La paleta clara que el sistema sustituye. Sin ella no hay defecto. */
const PALETA_A_MANO = ["#FEE2E2", "#FCA5A5", "#7F1D1D"];

/** Todos los .tsx de las superficies del panel, menos sus pruebas. */
function superficies(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) superficies(p, acc);
    else if (p.endsWith(".tsx") && !p.includes(".test.")) acc.push(p);
  }
  return acc;
}

describe("la losa de error sale del sistema, no de la mano", () => {
  it("los tres alias existen y se declaran en `body`, no en `:root`", () => {
    // El bloque `body { … }` que #741 dejó: ahí es donde recogen el ambiente.
    const bloque = GLOBALS.match(/\nbody\s*\{([^}]*)\}/);
    expect(bloque).not.toBeNull();
    const cuerpo = bloque![1];

    for (const alias of [
      "--color-error-text",
      "--color-error-bg",
      "--color-error-border",
    ]) {
      expect(cuerpo).toContain(alias);
    }

    // Y apuntan al token del sistema aprobado, no a un valor propio.
    expect(cuerpo).toMatch(/--color-error-bg\s*:\s*var\(--fv-error-bg\)/);
    expect(cuerpo).toMatch(
      /--color-error-border\s*:\s*var\(--fv-error-border\)/,
    );
    expect(cuerpo).toMatch(/--color-error-text\s*:\s*var\(--fv-error-text\)/);
  });

  it("ninguna superficie del panel escribe la paleta clara a mano", () => {
    const dirs = [
      join(RAIZ, "components", "dashboard"),
      join(RAIZ, "app", "dashboard"),
    ];
    const culpables: string[] = [];
    for (const d of dirs) {
      for (const f of superficies(d)) {
        const t = readFileSync(f, "utf8");
        for (const hexa of PALETA_A_MANO) {
          if (new RegExp(hexa, "i").test(t)) {
            culpables.push(`${f.slice(RAIZ.length + 1)} → ${hexa}`);
          }
        }
      }
    }
    expect(culpables).toEqual([]);
  });

  it("y el modal de crisis no se queda blanco cuando la pantalla es oscura", () => {
    // La tarjeta y el círculo del emoji llevaban `bg-white`, que es un literal
    // y no sigue al ambiente: en Noche era una tarjeta blanca sobre #141119.
    const modal = readFileSync(
      join(RAIZ, "components", "dashboard", "eco", "CrisisModal.tsx"),
      "utf8",
    );
    expect(modal).not.toMatch(/className="[^"]*\bbg-white\b/);
    expect(modal).toContain("var(--fv-surface)");
    expect(modal).toContain("var(--color-error-bg)");
    expect(modal).toContain("var(--color-error-border)");
  });
});
