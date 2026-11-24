import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nadie promete un ZIP.
 *
 * La exportación de datos es un archivo JSON (`data-export.processor.ts` lo sube
 * como `application/json`). Perfil decía «un ZIP con tu perfil y tu actividad»
 * en web y en móvil, que no es el formato ni el contenido. Esto recorre las
 * pantallas, los correos y las colas para que no vuelva a decirlo nadie.
 *
 * Que el resumen que dicen ahora corresponda al archivo se comprueba donde vive
 * la verdad: `data-export-scope.ratchet.spec.ts`, en la API.
 */

const RAIZ = join(__dirname, "..", "..", "..");
const AMBITO = [
  "apps/web/src",
  "apps/mobile/app",
  "apps/mobile/src",
  "apps/api/src",
  "packages/types/src",
  "packages/api-client/src",
];

function fuentes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(nombre) && !/[.-](test|spec)\.tsx?$/.test(nombre)
      ? [ruta]
      : [];
  });
}

/**
 * En el código, la palabra en cualquier caja. En los comentarios sólo en
 * mayúsculas, que es como se nombra el formato: `zip` a secas es también un
 * verbo en inglés, y en un comentario es correcto.
 */
function prometeZip(texto: string): boolean {
  const codigo = texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return /\bzip\b/i.test(codigo) || /\bZIP\b/.test(texto);
}

describe("el formato de la exportación de datos", () => {
  const todas = AMBITO.flatMap((d) => fuentes(join(RAIZ, d)));

  it("ninguna superficie promete un ZIP", () => {
    expect(
      todas
        .filter((f) => prometeZip(readFileSync(f, "utf8")))
        .map((f) => relative(RAIZ, f)),
    ).toEqual([]);
  });

  it("control: recorre el árbol y reconoce las tres formas que había", () => {
    expect(todas.length).toBeGreaterThan(800);
    expect(prometeZip("<p>Recibes un ZIP con tu perfil</p>")).toBe(true);
    expect(prometeZip('const t = "un zip con tus datos";')).toBe(true);
    expect(prometeZip("/** Trigger ZIP export */")).toBe(true);
    // Y no marca el verbo: «so a caller can zip the answer to its request».
    expect(prometeZip("/** so a caller can zip the answer */")).toBe(false);
  });
});
