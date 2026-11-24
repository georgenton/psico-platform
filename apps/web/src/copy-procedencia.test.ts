import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RAIZ, bloquesDe, leerBloques } from "./copy-bloques.testing";

/**
 * A Eco sólo se le atribuye lo que hace Eco.
 *
 * Inicio firmaba «Generado por Eco» una frase que elige una regla; Patrones
 * decía que Eco «detecta» tendencias y «va a tejer» conexiones que nadie
 * calcula (`themes`, `correlations`, `ecoNotes` y `vocab` llegan SIEMPRE vacíos
 * de `PatronesService`); Biblioteca, que Eco «aprenderá qué recomendarte». Eco
 * es un chat: responde cuando alguien le escribe, y nada más corre por su
 * cuenta.
 *
 * Se lee el texto que se pinta, en web y en móvil, sin montar las pantallas:
 * Inicio de móvil y Patrones de web son pantallas con sesión y navegación que
 * hoy no tienen arnés.
 */

const AMBITOS = [
  "apps/web/src",
  "apps/mobile/app",
  "apps/mobile/src",
  "apps/api/src/onboarding",
  "apps/api/src/home",
  "apps/api/src/notifications",
  "packages/types/src",
];

const ATRIBUCION_FALSA =
  /generad[oa]s? por eco|eco te sugiere|eco lee contigo|un saludo de eco|eco (?:\S+ ){0,2}(?:detecta|teje|tejer|aprende(?:r[aá])?|categoriza|analiza)(?![a-záéíóúñ])|p[ií]dele a eco un p[aá]rrafo/i;

/** Código sin montar: no lo ve nadie, y no se toca por no arrastrarlo. */
const SIN_MONTAR = new Set([
  "apps/web/src/components/dashboard/patrones/WeeklySummaryCard.tsx",
]);

describe("a Eco sólo se le atribuye lo que hace Eco", () => {
  it("ninguna pantalla le firma lo que hace una regla", () => {
    const hallazgos = [...leerBloques(AMBITOS)]
      .filter(([f]) => !SIN_MONTAR.has(f))
      .flatMap(([f, bloques]) =>
        bloques
          .filter((b) => ATRIBUCION_FALSA.test(b))
          .map((b) => `${f} → ${b}`),
      );
    expect(hallazgos).toEqual([]);
  });

  it("lo que se da por no montado sigue sin montarse", () => {
    // Si alguien vuelve a usarlo, entra en la regla de arriba.
    const usos = [...leerBloques(["apps/web/src/app"]).keys()].filter((f) =>
      readFileSync(join(RAIZ, f), "utf8").includes("WeeklySummaryCard"),
    );
    expect(usos).toEqual([]);
  });

  it("el Inicio de móvil explica de dónde salen sus sugerencias, como el de web", () => {
    for (const f of [
      "apps/mobile/app/(tabs)/index.tsx",
      "apps/web/src/components/dashboard/home/InicioV2.tsx",
    ]) {
      const fuente = readFileSync(join(RAIZ, f), "utf8");
      expect(fuente, f).toMatch(/insightOrigen\(/);
      expect(fuente, f).toMatch(/ecoIdeasOrigen\(/);
      expect(fuente, f).toMatch(/ECO_IDEAS_TITULO/);
    }
  });

  it("y el detector ve las que se retiraron", () => {
    for (const vieja of [
      `const A = () => <span>Generado por Eco</span>;`,
      `const A = () => <Text>Generado por Eco · privado</Text>;`,
      `const A = () => <div>Eco te sugiere</div>;`,
      `const t = "Resumen semanal generado por Eco (opt-in).";`,
      `const A = () => <p>Tendencias, conexiones y fortalezas que Eco detecta en tu actividad.</p>;`,
      `const t = "Cuando tengas más reflexiones, Eco va a tejer las conexiones.";`,
      `const t = "Lee algunas páginas y Eco aprenderá qué recomendarte.";`,
    ])
      expect(
        bloquesDe(vieja).some((b) => ATRIBUCION_FALSA.test(b)),
        vieja,
      ).toBe(true);
  });
});
