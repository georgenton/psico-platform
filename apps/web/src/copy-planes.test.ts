import { describe, expect, it } from "vitest";

import { bloquesDe, leerBloques } from "./copy-bloques.testing";

/**
 * Los muros de Pro no prometen lo que Mi plan ya no promete.
 *
 * Las líneas de cada plan las fija `subscription.plans.spec` en la API. Pero la
 * ficha de un libro, el lector bloqueado y la Biblioteca móvil vendían Pro por
 * su cuenta: «audios guiados» que no existen, «cancelas cuando quieras» con los
 * cobros cerrados, «7 disponibles con Pro» sin ningún recuento detrás.
 */

const SIN_NADA_DETRAS =
  /audios? guiad|audio ?meditaci|cancelas? cuando quieras|m[aá]s popular(?!es)|meses gratis|soporte (?:prioritario|dedicado)|\d+ disponibles con Pro/i;

describe("los muros de Pro no prometen lo que no existe", () => {
  it("en ninguna pantalla de web ni de móvil", () => {
    const hallazgos = [
      ...leerBloques(["apps/web/src", "apps/mobile/app", "apps/mobile/src"]),
    ].flatMap(([f, bloques]) =>
      bloques.filter((b) => SIN_NADA_DETRAS.test(b)).map((b) => `${f} → ${b}`),
    );
    expect(hallazgos).toEqual([]);
  });

  it("y el detector ve las que se retiraron", () => {
    for (const vieja of [
      `const t = "Por $7/mes accedes a todos los libros, audios guiados y Eco dentro del capítulo. Cancelas cuando quieras.";`,
      `const A = () => <span>Más popular</span>;`,
      `const t = "2 meses gratis";`,
      `const t = "1 libro gratuito · 7 disponibles con Pro. Cada lectura alimenta tu mapa.";`,
    ])
      expect(
        bloquesDe(vieja).some((b) => SIN_NADA_DETRAS.test(b)),
        vieja,
      ).toBe(true);
  });
});
