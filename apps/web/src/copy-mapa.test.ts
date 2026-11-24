import { LECTURA_Y_MAPA_NOTA, REFLEXION_Y_MAPA_NOTA } from "@psico/types";
import { describe, expect, it } from "vitest";

import { bloquesDe, leerBloques } from "./copy-bloques.testing";

/**
 * Leer o escribir no alimenta el Mapa Emocional, y ninguna pantalla dice lo
 * contrario.
 *
 * POR QUÉ. Biblioteca decía «cada lectura alimenta tu Mapa Emocional»;
 * Reflexiones, «cada cosa que escribes aquí le da forma»; Inicio, «tu mapa se
 * construye con cada práctica» y «+ mapa» en cada reflexión; el tour, «se va
 * llenando a medida que reflexionas». El Mapa decía, dos pantallas más allá,
 * «nada entra a este mapa sin ti». Manda el código
 * (`emotional-map.scoring.ts`, V2): sólo el ánimo que se marca, los check-ins y
 * los temas confirmados mueven una dimensión.
 *
 * CÓMO. Toda frase que diga que algo alimenta, llena, construye o da forma al
 * mapa tiene que estar en la lista de ACREDITADAS, por texto exacto y con la
 * razón por la que es cierta. Así una frase nueva no entra sin que alguien mire
 * el código; y si se edita una acreditada, deja de coincidir y hay que volver a
 * mirarlo. El contrato del propio Mapa (`emotional-map/copy-contract.spec.ts`)
 * vigila otra cosa —qué términos usa— y sigue igual.
 */

const AMBITOS = [
  "apps/web/src",
  "apps/mobile/app",
  "apps/mobile/src",
  "apps/api/src/onboarding",
  "apps/api/src/home",
  "apps/api/src/notifications",
  "apps/api/src/jobs/processors",
  "packages/types/src",
];

const ALIMENTAR =
  "alimenta\\w*|nutre\\w*|da(?:n)? forma|construye\\w*|se (?:va )?llena\\w*|llenará|llenando|refina\\w*|se forma";

const ALIMENTA_EL_MAPA = new RegExp(
  `(?:${ALIMENTAR})[^.]{0,70}\\bmapa\\b|\\bmapa\\b[^.]{0,70}(?:${ALIMENTAR})`,
  "i",
);

/** Los chips de Inicio: «+ mapa», «+ calma» (una dimensión), «+ patrón». */
const CHIP_DE_MAPA = /^\+ (?:mapa|calma|claridad|patr[oó]n|comprensi[oó]n)$/i;

const ACREDITADAS: Readonly<Record<string, string>> = {
  "¡Gracias! Esto alimenta tu Mapa Emocional.":
    "sale tras responder el CHECK-IN (no tras marcar el ánimo): CHK-S1 enciende Claridad, Compasión o Consciencia desde la primera respuesta (1/5 = 0,2 ≥ 0,15)",
  "Aquí puedes ver lo que has leído, practicado y completado. El Mapa Emocional se alimenta solo de señales que tú decides registrar.":
    "Evolución · niega la actividad como fuente",
  "📊 Un mini Mapa Emocional que se llena con lo que tú registras y confirmas.":
    "tour · las fuentes reales de V2",
  "Tu mapa se forma solo con lo que registras y confirmas. Tiene seis dimensiones: Calma, Claridad, Conexión, Propósito, Compasión y Consciencia.":
    "landing · las fuentes reales de V2",
  "¿Cómo se forma mi mapa?": "landing · la pregunta, no una afirmación",
  "Cómo se llena tu Mapa Emocional":
    "móvil · etiqueta del botón que abre la explicación",
};

describe("leer o escribir no alimenta el Mapa Emocional", () => {
  const porFichero = leerBloques(AMBITOS);

  it("toda frase que lo diga está acreditada contra el código", () => {
    const hallazgos = [...porFichero].flatMap(([fichero, bloques]) =>
      bloques
        .filter((b) => ALIMENTA_EL_MAPA.test(b) || CHIP_DE_MAPA.test(b))
        .filter((b) => !(b in ACREDITADAS))
        .map((b) => `${fichero} → ${b}`),
    );
    expect(hallazgos).toEqual([]);
  });

  it("las pantallas de lectura y escritura dicen adónde va cada cosa", () => {
    const pinta = (fichero: string, frase: string) =>
      expect(
        porFichero.get(fichero)?.some((b) => b.includes(frase)),
        `${fichero} ya no lo explica`,
      ).toBe(true);
    pinta(
      "apps/web/src/app/dashboard/biblioteca/page.tsx",
      LECTURA_Y_MAPA_NOTA,
    );
    pinta("apps/mobile/app/(tabs)/books/index.tsx", LECTURA_Y_MAPA_NOTA);
    pinta(
      "apps/web/src/app/dashboard/reflexiones/page.tsx",
      REFLEXION_Y_MAPA_NOTA,
    );
  });

  it("la lista de acreditadas no acumula frases que ya no existen", () => {
    const todos = new Set([...porFichero.values()].flat());
    expect(Object.keys(ACREDITADAS).filter((a) => !todos.has(a))).toEqual([]);
  });

  it("y el detector ve las que se retiraron", () => {
    for (const vieja of [
      `const A = () => <div>Aquí los libros son una herramienta. Cada lectura
        alimenta tu Mapa Emocional — no se trata de cuántos terminas.</div>;`,
      `const A = () => <p>Cada cosa que escribes aquí le da forma a tu Mapa Emocional.</p>;`,
      `const t = "Tu mapa se construye con cada práctica. Hoy es un buen día.";`,
      `const t = "1 libro gratuito · 7 disponibles con Pro. Cada lectura alimenta tu mapa.";`,
      `const t = "📊 Un mini Mapa Emocional que se va llenando a medida que reflexionas.";`,
      `const A = () => <p>Cuando tagees tus reflexiones… Eco usa esa señal para refinar tu mapa.</p>;`,
      `const F = { diary: "+ mapa" };`,
      `const F = { voice: "+ calma" };`,
    ]) {
      const bloques = bloquesDe(vieja);
      expect(
        bloques.some((b) => ALIMENTA_EL_MAPA.test(b) || CHIP_DE_MAPA.test(b)),
        vieja,
      ).toBe(true);
    }
  });
});
