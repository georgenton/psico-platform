import { Colors } from "@/theme";

import { coverColor } from "./cover-colors";

/**
 * Un libro, un color.
 *
 * El onboarding pintaba la portada con su propia paleta —terracota para
 * `warm`, que en Biblioteca es salvia— y la tarjeta «Continúa tu recorrido» de
 * Inicio la pintaba siempre lavanda, fuera el libro que fuera. Las pantallas
 * son `expo-router` y no se montan sueltas, así que aquí se fija el cable: las
 * cuatro tienen que pedir el color a este fichero.
 *
 * `@types/node` no está en este workspace; se declara lo mínimo, como en
 * `evolucion-copy-contract.test.ts`.
 */
declare const __dirname: string;
declare function require(id: "fs"): {
  readFileSync(path: string, encoding: "utf8"): string;
};

const pantalla = (ruta: string) =>
  require("fs").readFileSync(`${__dirname}/../../../app/${ruta}`, "utf8");

describe("la portada de un libro", () => {
  it("traduce los tres tonos, y lo desconocido cae a `cool`", () => {
    expect(coverColor("cool")).toBe(Colors.lavender[500]);
    expect(coverColor("warm")).toBe(Colors.sage[500]);
    expect(coverColor("mixed")).toBe(Colors.lavender[400]);
    expect(coverColor("arcoiris")).toBe(Colors.lavender[500]);
    expect(coverColor(null)).toBe(Colors.lavender[500]);
  });

  it.each([
    ["la recomendación del onboarding", "onboarding.tsx", "primary.cover"],
    [
      "«Continúa tu recorrido» en Inicio",
      "(tabs)/index.tsx",
      "home.continueBook.cover",
    ],
    ["la rejilla de Biblioteca", "(tabs)/books/index.tsx", "book.cover"],
    ["la ficha del libro", "(tabs)/books/[slug].tsx", "book.cover"],
  ])("%s toma el color de aquí", (_, ruta, dato) => {
    expect(pantalla(ruta)).toContain(`coverColor(${dato})`);
  });

  it("el onboarding no guarda una paleta propia", () => {
    const codigo = pantalla("onboarding.tsx").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    expect(codigo).not.toMatch(/case "(cool|warm|mixed)"/);
    expect(codigo).not.toMatch(/C76A4D/i);
  });
});
