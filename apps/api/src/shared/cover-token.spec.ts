import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { toCoverToken } from "./cover-token";

describe("toCoverToken", () => {
  it("devuelve el tono que dice la fila", () => {
    expect(toCoverToken("cool")).toBe("cool");
    expect(toCoverToken("warm")).toBe("warm");
    expect(toCoverToken("mixed")).toBe("mixed");
  });

  it("lo que no conoce cae a `cool`, que es el valor por defecto de la columna", () => {
    for (const v of ["arcoiris", "", null, undefined]) {
      expect(toCoverToken(v)).toBe("cool");
    }
  });

  it("nadie vuelve a decidir el color de un libro por su cuenta", () => {
    // Un método propio es como empezó: la recomendación del onboarding lo
    // calculaba con un hash del id y contradecía a la biblioteca.
    const src = join(__dirname, "..");
    const culpables: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) recorrer(ruta);
        else if (/\.ts$/.test(e.name) && !/spec\.ts$/.test(e.name)) {
          if (ruta.endsWith(join("shared", "cover-token.ts"))) continue;
          if (
            /(to|pick|derive)CoverToken\s*\([^)]*:\s*string/.test(
              readFileSync(ruta, "utf8"),
            )
          )
            culpables.push(ruta);
        }
      }
    };
    recorrer(src);
    expect(culpables).toEqual([]);
  });
});
