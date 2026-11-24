import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * En el teléfono, el título de la pantalla va a la izquierda.
 *
 * La regla existía desde el principio —dentro del bloque de 1023 px— y no hacía
 * nada: la base `.screen-head` se declara DESPUÉS, con la misma especificidad,
 * así que le ganaba `align-items: flex-end` mientras la columna sí se aplicaba.
 * El resultado era un título pegado a la derecha sobre un texto a la izquierda,
 * en once pantallas. En CSS el orden ES la regla, así que se fija el orden.
 */
const CSS = readFileSync(join(__dirname, "..", "dashboard-design.css"), "utf8");

describe("la cabecera de pantalla en el teléfono", () => {
  it("se alinea a la izquierda en una regla que va DESPUÉS de la base", () => {
    const base = CSS.indexOf(".screen-head { display: flex;");
    expect(base).toBeGreaterThan(0);
    const despues = CSS.slice(base);
    expect(despues).toMatch(
      /@media \(max-width: 1023px\) \{\s*\.screen-head \{[^}]*align-items: flex-start/,
    );
    // Y nadie vuelve a pisarla más abajo.
    const ultima = [
      ...despues.matchAll(/\.screen-head \{[^}]*align-items: ([a-z-]+)/g),
    ].at(-1);
    expect(ultima?.[1]).toBe("flex-start");
  });

  it("ninguna pantalla se la salta con estilos en línea", () => {
    const raiz = join(__dirname, "..", "..");
    const fuentes = execFileSync("git", ["ls-files", "."], {
      cwd: raiz,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f));
    expect(fuentes.length).toBeGreaterThan(200);
    const culpables = fuentes.filter((f) =>
      /className="screen-head"[\s\S]{0,400}?style=\{\{[^}]*(alignItems|justifyContent|flexDirection)/.test(
        readFileSync(join(raiz, f), "utf8"),
      ),
    );
    expect(culpables).toEqual([]);
  });
});
