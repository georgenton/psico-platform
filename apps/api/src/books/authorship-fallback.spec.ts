import fs from "node:fs";
import path from "node:path";

import { AUTHORSHIP_UNCONFIRMED } from "@psico/types";
import { describe, expect, it } from "vitest";

/**
 * Ningún respaldo de autoría puede inventarse a quién atribuir un libro.
 *
 * ── Qué se rompió ──────────────────────────────────────────────────────────
 *
 * El 2026-10-25, buscando UN respaldo, aparecieron dos:
 *
 *   - `lector.service.ts` daba el audio del capítulo como obra de la
 *     **plataforma** cuando el libro no tenía autoría;
 *   - `home.service.ts` firmaba el *byline* de las recomendaciones como
 *     «Psicología Educativa», que se lee como el nombre de una persona o un
 *     sello. Ése es el peor de los dos: nadie puede distinguirlo de una
 *     atribución real.
 *
 * Los dos son de la misma clase que la reparación de autoría retira — una
 * afirmación sobre quién hizo algo que ninguna fuente sostiene — y los dos
 * disparan precisamente porque esa reparación dejó libros sin autor a
 * propósito.
 *
 * ── Por qué una lista de excepciones y no una regla a secas ────────────────
 *
 * Porque «es un nombre inventado» no se detecta mirando una cadena: cualquier
 * literal podría serlo. Lo que sí se puede exigir es que cada respaldo sea
 * una de las dos formas honestas —ausencia o marcador declarado— o esté aquí
 * con su motivo. Olvidarse de uno falla; añadir uno obliga a escribir por
 * qué. Es la misma forma que el trinquete de la marca, que ya pagó.
 */

const RAIZ_API = path.resolve(__dirname, "..");

/** Lo que un respaldo de autoría puede ser sin tener que justificarse. */
const FORMAS_HONESTAS = [
  "null", // el campo se compone con otro: el cliente omite el fragmento
  '""', // idem, cuando el consumidor exige string
  "AUTHORSHIP_UNCONFIRMED", // va solo en su línea: marcador declarado
];

/**
 * Respaldos que dicen otra cosa, con el motivo por el que se aceptan.
 * Un valor que no esté aquí ni en FORMAS_HONESTAS rompe el build.
 */
const EXCEPCIONES: Array<{ valor: string; motivo: string }> = [
  {
    valor: '"—"',
    motivo:
      "guion largo en las tarjetas de «sigue leyendo» de Inicio: es un hueco " +
      "tipográfico, no una atribución — no nombra a nadie. Queda como " +
      "inconsistencia de copy (tres formas de decir «sin autor» en el " +
      "producto), no como afirmación sin fuente",
  },
];

/** Todo `…author?.name ?? X` del árbol de la API, con su X. */
function respaldosDeAutoria(): Array<{ archivo: string; valor: string }> {
  const encontrados: Array<{ archivo: string; valor: string }> = [];

  function recorrer(dir: string): void {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completa = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(completa);
        continue;
      }
      if (!entrada.name.endsWith(".ts")) continue;
      if (entrada.name.endsWith(".spec.ts")) continue;

      const src = fs.readFileSync(completa, "utf8");
      // `author?.name ?? X` y `author?.name || X`, con X hasta la coma o el
      // salto de línea. Cubre `b.author?.name`, `chapter.book.author?.name`…
      for (const m of src.matchAll(
        /author\?\.name\s*(?:\?\?|\|\|)\s*([^,\n;)}]+)/g,
      )) {
        encontrados.push({
          archivo: path.relative(RAIZ_API, completa),
          valor: m[1].trim(),
        });
      }
    }
  }

  recorrer(RAIZ_API);
  return encontrados;
}

describe("respaldos de autoría", () => {
  it("encuentra respaldos (si no, la expresión dejó de coincidir)", () => {
    // Guard the guard: una prueba que no mira nada pasa siempre, y este
    // trinquete entero depende de que la expresión siga encontrando algo.
    expect(respaldosDeAutoria().length).toBeGreaterThan(5);
  });

  it("ninguno inventa una atribución", () => {
    const permitidos = new Set([
      ...FORMAS_HONESTAS,
      ...EXCEPCIONES.map((e) => e.valor),
    ]);

    const inventados = respaldosDeAutoria()
      .filter((r) => !permitidos.has(r.valor))
      .map((r) => `${r.archivo} → ${r.valor}`);

    expect(
      inventados,
      "Estos respaldos ponen un nombre donde no hay autoría registrada. Un " +
        "libro sin autor es un estado legítimo: usa `null` si el campo se " +
        "compone con otro, o `AUTHORSHIP_UNCONFIRMED` si va solo en su " +
        "línea. Si de verdad no es una atribución, añádelo a EXCEPCIONES " +
        "con su motivo.",
    ).toEqual([]);
  });

  it("no sobran excepciones que ya no correspondan a nada", () => {
    // Una excepción obsoleta es permiso para un defecto futuro.
    const valores = new Set(respaldosDeAutoria().map((r) => r.valor));
    const obsoletas = EXCEPCIONES.filter((e) => !valores.has(e.valor)).map(
      (e) => e.valor,
    );
    expect(obsoletas).toEqual([]);
  });

  it("el marcador declarado no se escribe a mano en ningún sitio", () => {
    // Dos copias de la misma frase es cómo el producto acaba diciendo dos
    // cosas distintas sobre el mismo hecho.
    const culpables: string[] = [];

    function recorrer(dir: string): void {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const completa = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
          recorrer(completa);
          continue;
        }
        if (!entrada.name.endsWith(".ts")) continue;
        if (entrada.name.endsWith(".spec.ts")) continue;
        const src = fs.readFileSync(completa, "utf8");
        // Fuera comentarios: ahí la frase se cita para explicar la decisión.
        const codigo = src
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "");
        if (codigo.includes(`"${AUTHORSHIP_UNCONFIRMED}"`)) {
          culpables.push(path.relative(RAIZ_API, completa));
        }
      }
    }

    recorrer(RAIZ_API);
    expect(culpables).toEqual([]);
  });
});
