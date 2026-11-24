import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nadie ofrece cambiar el correo mientras la operación esté retirada.
 *
 * Las pruebas de las dos tarjetas dicen qué pinta cada una. Lo que un render no
 * ve es la pantalla de mañana: un formulario nuevo en otro sitio volvería a
 * pedir algo que el servidor rechaza. Esto recorre web y móvil enteros.
 *
 * Cuando el recorrido se complete (`docs/product/tarea-cambio-de-correo.md`)
 * esta prueba se retira con él.
 */

const RAIZ = join(__dirname, "..", "..", "..");
const SUPERFICIES = ["apps/web/src", "apps/mobile/app", "apps/mobile/src"];

/** La ruta, el método del cliente y la página que nunca existió. */
const PIDE_EL_CAMBIO =
  /email-change-request|requestEmailChange|verify-email-change/;

function fuentes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return /\.tsx?$/.test(nombre) && !/\.(test|spec)\.tsx?$/.test(nombre)
      ? [ruta]
      : [];
  });
}

describe("el cambio de correo está retirado", () => {
  const todas = SUPERFICIES.flatMap((s) => fuentes(join(RAIZ, s)));

  it("ninguna pantalla de web ni de móvil lo pide", () => {
    const culpables = todas
      .filter((f) => PIDE_EL_CAMBIO.test(readFileSync(f, "utf8")))
      .map((f) => relative(RAIZ, f));

    expect(culpables).toEqual([]);
  });

  it("control: recorre de verdad las dos apps y sabe reconocerlo", () => {
    expect(todas.length).toBeGreaterThan(300);
    expect(todas.some((f) => f.includes("apps/mobile/"))).toBe(true);
    // El cliente conserva el método a propósito —la ruta sigue existiendo—, así
    // que sirve de caso positivo: si el patrón dejara de verlo, lo de arriba
    // estaría verde por no encontrar nada.
    expect(
      PIDE_EL_CAMBIO.test(
        readFileSync(join(RAIZ, "packages/api-client/src/users.ts"), "utf8"),
      ),
    ).toBe(true);
  });
});
