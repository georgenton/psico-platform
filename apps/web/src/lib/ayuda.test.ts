import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  hrefAyuda,
  origenAyuda,
  origenSegunRuta,
  volverDesdeAyuda,
  type OrigenAyuda,
} from "./ayuda";
import { paisAyuda } from "./ayuda-pais";

describe("el país de la ayuda", () => {
  it("es Ecuador si nadie lo dice", () => {
    expect(paisAyuda(undefined)).toBe("EC");
  });

  it.each([
    ["EC", "EC"],
    ["CO", "CO"],
    ["MX", "MX"],
    ["co", "CO"],
    [" mx ", "MX"],
  ])("%j es %s", (pedido, esperado) => {
    expect(paisAyuda(pedido)).toBe(esperado);
  });

  it.each([
    "",
    "ZZ",
    "PE",
    // La entrada internacional del catálogo no es un país que se pueda elegir.
    "INTL",
    "constructor",
    "__proto__",
    "toString",
    "<script>",
    "EC,CO",
  ])("%j no es un país del catálogo: Ecuador, sin romper", (pedido) => {
    expect(paisAyuda(pedido)).toBe("EC");
  });

  it("repetido en la URL, manda el primero", () => {
    expect(paisAyuda(["CO", "MX"])).toBe("CO");
    expect(paisAyuda([])).toBe("EC");
  });
});

describe("«volver» sale de una lista cerrada", () => {
  it.each([
    ["eco", "/dashboard/eco"],
    ["terapia", "/dashboard/terapia"],
  ] as const)("con sesión y desde=%s vuelve a %s", (desde, href) => {
    const destino = volverDesdeAyuda({
      desde: origenAyuda(desde),
      haySesion: true,
    });
    expect(destino.href).toBe(href);
  });

  it("con sesión y sin origen, al inicio del panel", () => {
    expect(volverDesdeAyuda({ desde: null, haySesion: true }).href).toBe(
      "/dashboard",
    );
  });

  it.each([null, "eco", "terapia"] as ReadonlyArray<OrigenAyuda | null>)(
    "sin sesión siempre a la portada (desde=%s): lo demás está tras la puerta",
    (desde) => {
      expect(volverDesdeAyuda({ desde, haySesion: false }).href).toBe("/");
    },
  );

  it.each([
    "https://malo.example",
    "//malo.example",
    "/\\malo.example",
    "javascript:alert(1)",
    "/dashboard/eco",
    "Eco",
    "eco ",
    "constructor",
    "__proto__",
    "hasOwnProperty",
    "",
  ])("%j no es un origen, y no mueve el destino", (valor) => {
    expect(origenAyuda(valor)).toBeNull();
    expect(
      volverDesdeAyuda({ desde: origenAyuda(valor), haySesion: true }).href,
    ).toBe("/dashboard");
  });

  it("ningún destino sale de la aplicación", () => {
    for (const haySesion of [true, false]) {
      for (const desde of [null, "eco", "terapia"] as const) {
        const { href } = volverDesdeAyuda({ desde, haySesion });
        expect(href).toMatch(/^\/(?!\/)/);
      }
    }
  });
});

describe("las direcciones hacia la ayuda", () => {
  it("se forman con lo que se sabe", () => {
    expect(hrefAyuda()).toBe("/ayuda");
    expect(hrefAyuda({ desde: "eco" })).toBe("/ayuda?desde=eco");
    expect(hrefAyuda({ pais: "CO" })).toBe("/ayuda?pais=CO");
    expect(hrefAyuda({ pais: "CO", desde: "terapia" })).toBe(
      "/ayuda?pais=CO&desde=terapia",
    );
    expect(hrefAyuda({ desde: null })).toBe("/ayuda");
  });

  it.each([
    ["/dashboard/eco", "eco"],
    ["/dashboard/eco/algo", "eco"],
    ["/dashboard/terapia", "terapia"],
    ["/dashboard/terapia/sesiones", "terapia"],
    ["/dashboard", null],
    ["/dashboard/mapa", null],
    // Frontera de segmento: empezar igual no es ser lo mismo.
    ["/dashboard/economia", null],
  ])("desde %s el origen es %s", (ruta, origen) => {
    expect(origenSegunRuta(ruta)).toBe(origen);
  });
});

describe("el enlace no arrastra el catálogo", () => {
  it("`lib/ayuda` no importa nada en ejecución", () => {
    // La usa el pie de la portada, que es código de cliente: un import de valor
    // desde `@psico/types` metería el paquete entero en su JavaScript.
    const fuente = readFileSync(join(__dirname, "ayuda.ts"), "utf8");
    const imports = fuente.match(/^import .*$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const linea of imports) expect(linea).toMatch(/^import type /);
  });
});
