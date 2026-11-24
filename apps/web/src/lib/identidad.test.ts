import { describe, expect, it } from "vitest";

import { identidadDeCuenta } from "./identidad";

describe("identidadDeCuenta", () => {
  it("usa el nombre y las iniciales que calculó la API", () => {
    expect(
      identidadDeCuenta({
        nombre: "Marcela Ibarra",
        iniciales: "MI",
        correo: "m@psico.test",
      }),
    ).toEqual({ nombre: "Marcela Ibarra", iniciales: "MI" });
  });

  it.each([
    // [nombre, lo que se espera sin ayuda de la API]
    ["Ana", "AN"],
    ["J", "J"],
    ["María José", "MJ"],
    ["María de los Ángeles", "MÁ"],
    ["Íñigo Ñáñez", "ÍÑ"],
    ["  Luz   Elena  ", "LE"],
    ["josé", "JO"],
    ["Ana-Lucía Peña", "AP"],
    ["🌿 Ana", "AN"],
    ["«Beto» Ríos", "BR"],
  ])("«%s» → %s cuando la API no trae iniciales", (nombre, esperado) => {
    expect(identidadDeCuenta({ nombre }).iniciales).toBe(esperado);
  });

  it("compone un acento descompuesto en vez de separarlo de su letra", () => {
    // «É» escrita como E + acento combinado: sin normalizar, la inicial sería
    // sólo la «E».
    expect(identidadDeCuenta({ nombre: "E\u0301lida" }).iniciales).toBe(
      "\u00c9L",
    );
  });

  it("descarta unas iniciales que no son letras y las calcula del nombre", () => {
    // La API devuelve "?" cuando el nombre está en blanco, y con un emoji
    // delante parte el carácter por la mitad.
    for (const iniciales of ["?", "", "\ud83c", "ABC"]) {
      expect(
        identidadDeCuenta({ nombre: "Ana Luna", iniciales }).iniciales,
      ).toBe("AL");
    }
  });

  it.each([null, undefined, "", "   "])(
    "sin nombre (%j) cae a la inicial del correo, y no hay nombre que mostrar",
    (nombre) => {
      expect(
        identidadDeCuenta({
          nombre,
          iniciales: "?",
          correo: "persona@psico.test",
        }),
      ).toEqual({ nombre: null, iniciales: "P" });
    },
  );

  it("un correo guardado como nombre no se enseña", () => {
    const r = identidadDeCuenta({
      nombre: "persona@psico.test",
      iniciales: "PE",
      correo: "persona@psico.test",
    });
    expect(r.nombre).toBeNull();
    expect(r.iniciales).toBe("P");
  });

  it("nunca queda vacío ni vuelve a «AV»", () => {
    for (const datos of [
      {},
      { nombre: null, correo: null },
      { nombre: "…", correo: "" },
      { nombre: "123", correo: "9z@psico.test" },
    ]) {
      const { iniciales } = identidadDeCuenta(datos);
      expect(iniciales).not.toBe("");
      expect(iniciales).not.toBe("AV");
    }
    expect(identidadDeCuenta({}).iniciales).toBe("?");
    // Un nombre sin letras se puede mostrar, pero no da iniciales.
    expect(
      identidadDeCuenta({ nombre: "123", correo: "9z@psico.test" }),
    ).toEqual({ nombre: "123", iniciales: "9" });
  });
});
