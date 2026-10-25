import { describe, expect, it } from "vitest";

import { DATA_EXPORT_SCOPE } from "@psico/types";

import { EXPORT_INVENTORY } from "./data-export-inventory";

/**
 * Ata la copia de la pantalla al inventario real.
 *
 * El inventario es la verdad —clasifica todos los modelos con `userId`— pero
 * habla en nombres de tabla. `DATA_EXPORT_SCOPE` es su traducción, y sin esta
 * prueba las dos se separarían en silencio: alguien añade un modelo, lo
 * clasifica bien, y la pantalla sigue prometiendo lo de antes.
 */
describe("el alcance que la pantalla promete y el que el archivo cumple", () => {
  it("nombra como ausente cada categoría que el inventario nombra como ausente", () => {
    const frases = Object.values(EXPORT_INVENTORY)
      .filter((e) => e.clase === "nombrado-como-ausente")
      .map((e) => e.frase)
      .filter((f): f is string => Boolean(f));

    const dichas = DATA_EXPORT_SCOPE.noIncluye.map((s) => s.toLowerCase());
    for (const frase of new Set(frases)) {
      expect(
        dichas.some((d) => d.includes(frase.toLowerCase())),
        `el inventario nombra "${frase}" como ausente y la pantalla no lo dice`,
      ).toBe(true);
    }
  });

  it("dice cuántas cosas exporta, sin quedarse corta ni larga", () => {
    const exportados = Object.values(EXPORT_INVENTORY).filter(
      (e) => e.clase === "exportado",
    ).length;
    expect(DATA_EXPORT_SCOPE.incluye).toHaveLength(exportados);
  });

  it("avisa de que lo que falta no se agota en la lista", () => {
    // Hay material clasificado `pendiente-de-alcance` (D-EXP) que ni viaja ni
    // se nombra una por una. Prometer una lista cerrada sería mentir por
    // omisión, así que la última entrada es ese aviso.
    const pendientes = Object.values(EXPORT_INVENTORY).filter(
      (e) => e.clase === "pendiente-de-alcance",
    ).length;
    expect(pendientes).toBeGreaterThan(0);
    expect(DATA_EXPORT_SCOPE.noIncluye.at(-1)).toMatch(/todav[íi]a|m[áa]s/i);
  });
});
