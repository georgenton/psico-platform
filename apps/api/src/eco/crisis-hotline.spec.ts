import { describe, expect, it } from "vitest";

import { dialableHotline } from "@psico/types";

import { crisisNotice } from "./crisis";

/*
 * La línea con mnemotecnia de este fichero es la que Eco sirvió hasta el
 * 2026-11-24. Se retiró porque ninguna fuente la sostiene; como CASO sigue
 * valiendo, que es por lo que nació el helper, y aquí no la lee nadie.
 */
describe("dialableHotline", () => {
  it("marca la forma numérica de una línea con mnemotecnia", () => {
    // El caso que motivó todo esto. El saneador anterior devolvía
    // «1800-4-SALUD»: letras en un `tel:`, en el único botón donde una
    // pulsación tiene que funcionar a la primera.
    expect(dialableHotline("1800-4-SALUD (1800-472583)")).toBe("1800-472583");
  });

  it("no confunde una aclaración entre paréntesis con un número", () => {
    expect(dialableHotline("171 (opción 6)")).toBe("171");
  });

  it("conserva el prefijo internacional", () => {
    expect(dialableHotline("+593 2 123 4567")).toBe("+59321234567");
  });

  it("devuelve null cuando no hay nada marcable", () => {
    // Sin número no hay enlace: un `tel:` muerto en esta pantalla parece
    // ayuda y no hace nada.
    expect(dialableHotline("Busca tu línea local")).toBeNull();
    expect(dialableHotline("")).toBeNull();
    expect(dialableHotline(null)).toBeNull();
    expect(dialableHotline(undefined)).toBeNull();
  });

  it("no acepta un resto demasiado corto para ser un teléfono", () => {
    expect(dialableHotline("(1)")).toBeNull();
  });

  it("no confunde el país entre paréntesis con un número", () => {
    expect(dialableHotline("911 (Ecuador)")).toBe("911");
  });

  it("el número que Eco sirve ES marcable", () => {
    // La garantía que de verdad importa, y la que faltaba: las pruebas del
    // modal fijaban una línea de fixture, así que servir algo no marcable no
    // rompía nada.
    expect(crisisNotice("EC").hotline).toBe("911 (Ecuador)");
    expect(dialableHotline(crisisNotice("EC").hotline)).toBe("911");
  });

  it("y cuando no hay número acreditado, no se finge uno", () => {
    expect(dialableHotline(crisisNotice("CO").hotline)).toBeNull();
  });

  it("nunca devuelve letras", () => {
    for (const linea of [
      "1800-4-SALUD (1800-472583)",
      "171 (opción 6)",
      "+593 2 123 4567",
      "LLAMA-AYUDA",
      "0800 AYUDA (0800 29832)",
    ]) {
      const marcable = dialableHotline(linea);
      if (marcable !== null) expect(marcable).not.toMatch(/[a-zA-Z]/);
    }
  });
});
