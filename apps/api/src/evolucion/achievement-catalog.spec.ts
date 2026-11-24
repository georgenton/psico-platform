import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_CATALOG,
  STREAKS_NOT_COUNTED_YET,
  describeMilestone,
} from "./achievement-catalog";

/**
 * Un hito que falta se lee como algo que falta.
 *
 * La tabla `Achievement` guarda UNA frase por hito, escrita para el día en que
 * se consigue, así que «Escribiste tu primera entrada en el diario.» aparecía
 * antes de escribirla. La frase del pendiente vive en código: no hay que volver
 * a sembrar ni tocar las filas alojadas para que se lea bien.
 */
describe("la frase de un hito depende de si ya se consiguió", () => {
  it("todos traen la suya, y no es la misma", () => {
    for (const a of ACHIEVEMENT_CATALOG) {
      expect(a.pendingDescription.trim(), a.id).not.toBe("");
      expect(a.pendingDescription, a.id).not.toBe(a.description);
    }
  });

  it("ninguna da por hecho lo que todavía no pasó", () => {
    // El pretérito de segunda persona es justo lo que se veía mal.
    const HECHO = /\b\p{L}+(aste|iste)\b|completad[oa]s?\b|acumulad[oa]s?\b/iu;
    for (const a of ACHIEVEMENT_CATALOG) {
      expect(a.pendingDescription, a.id).not.toMatch(HECHO);
    }
    // Guard the guard: la expresión sí reconoce las frases de los conseguidos.
    expect("Escribiste tu primera entrada en el diario.").toMatch(HECHO);
    expect("Terminaste tu primer capítulo.").toMatch(HECHO);
  });

  it("pendiente dice la del código; conseguido, la sembrada", () => {
    const sembrada = "Escribiste tu primera entrada en el diario.";
    expect(describeMilestone("first-reflection", sembrada, null)).toBe(
      "Escribe tu primera entrada en el diario.",
    );
    expect(describeMilestone("first-reflection", sembrada, new Date())).toBe(
      sembrada,
    );
    expect(
      describeMilestone("first-reflection", sembrada, "2026-11-23T10:00:00Z"),
    ).toBe(sembrada);
  });

  it("un hito que la base tenga y el catálogo no conserva su texto", () => {
    expect(describeMilestone("retirado", "Lo que diga la fila.", null)).toBe(
      "Lo que diga la fila.",
    );
  });

  it("pide lo que el contador mide", () => {
    const de = (id: string) =>
      ACHIEVEMENT_CATALOG.find((a) => a.id === id)!.pendingDescription;
    // `diasActivos30d` cuenta días con una entrada en el diario, no visitas.
    expect(de("week-of-presence")).toMatch(/escribe en tu diario/i);
    expect(de("month-of-presence")).toMatch(/escribe en tu diario/i);
  });
});

describe("los días seguidos", () => {
  const rachas = ACHIEVEMENT_CATALOG.filter(
    (a) => a.progressKey === "rachaMasLarga" || a.progressKey === "rachaActual",
  );

  it("no invitan a algo que hoy no se puede completar", () => {
    expect(rachas.length).toBeGreaterThan(0);
    for (const a of rachas) {
      expect(a.pendingDescription).toBe(STREAKS_NOT_COUNTED_YET);
    }
  });

  it("y sigue siendo verdad: nadie escribe la racha", () => {
    // `streakLastDay` es la columna sin la que no se puede llevar una racha.
    // El día que algo la use, esto falla: toca darles a los tres una frase que
    // invite y retirar `STREAKS_NOT_COUNTED_YET`.
    const usan: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) recorrer(ruta);
        else if (/\.ts$/.test(e.name) && !/spec\.ts$/.test(e.name)) {
          if (/streakLastDay/.test(readFileSync(ruta, "utf8"))) usan.push(ruta);
        }
      }
    };
    recorrer(join(__dirname, ".."));
    expect(usan).toEqual([]);
  });
});
