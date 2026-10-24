import fs from "node:fs";
import path from "node:path";

import { BRAND_NAME } from "@psico/types";
import { describe, expect, it } from "vitest";

import { passwordResetEmail } from "./password-reset.template";
import { verifyEmail } from "./verify-email.template";

/**
 * El nombre del producto en los correos que una persona recibe.
 *
 * ── Qué se rompió, y cómo se encontró ──────────────────────────────────────
 *
 * El 2026-10-24, probando el camino normal de Eco con una cuenta sintética,
 * Eco se presentó así: «Soy Eco, tu companion conversacional en Psico
 * Platform». Ése es el nombre anterior del producto. Buscarlo destapó que
 * también encabezaba TODOS los correos transaccionales —el `<title>`, el
 * `<h1>` y el pie del armazón compartido—, incluido el de restablecimiento
 * de contraseña, que es el único camino para recuperar el acceso a una
 * cuenta.
 *
 * ── Por qué se renderiza de verdad en lugar de leer el archivo ─────────────
 *
 * Un `grep` sobre el fuente habría pasado igual si la interpolación quedara
 * mal escrita —`${BRAND_NAME}` dentro de una plantilla que no es literal de
 * plantilla sale tal cual, con las llaves—. Esto rinde el HTML y comprueba
 * el resultado, que es lo que llega a la bandeja.
 *
 * ── Lo que esta prueba NO vigila ───────────────────────────────────────────
 *
 * `author-publication-approved.template.ts` y su gemelo de rechazo siguen
 * nombrando «Psico Platform». Son del recorrido B2B de publicación, que no
 * se recorrió, y la publicación editorial está fuera de alcance. Quedan
 * inventariados en `packages/types/src/brand.ts`, no corregidos a ciegas.
 */
describe("marca en los correos", () => {
  const casos = [
    {
      nombre: "restablecer contraseña",
      render: () =>
        passwordResetEmail({
          firstName: "Ana",
          resetUrl: "https://example.test/reset?token=x",
          expiresHours: 2,
          requestIp: null,
        }),
    },
    {
      nombre: "verificar correo",
      render: () =>
        verifyEmail({
          firstName: "Ana",
          verifyUrl: "https://example.test/verify?token=x",
          expiresHours: 24,
        }),
    },
  ];

  for (const caso of casos) {
    it(`«${caso.nombre}» dice ${BRAND_NAME} y no el nombre anterior`, () => {
      const correo = caso.render();
      const todo = `${correo.subject}\n${correo.html}\n${correo.text}`;

      expect(todo).toContain(BRAND_NAME);
      expect(todo).not.toContain("Psico Platform");
      // Una interpolación mal escrita deja las llaves literales en el HTML.
      expect(todo).not.toContain("${");
    });
  }

  it("el armazón compartido no deja el nombre anterior en cabecera ni pie", () => {
    // El `<title>`, el `<h1>` y el pie viven en `base.ts`, así que cualquier
    // plantilla los hereda: basta comprobarlo en una.
    const html = casos[0].render().html;
    expect(html).toContain(`<title>${BRAND_NAME}</title>`);
    expect(html).toContain(`>${BRAND_NAME}</h1>`);
    expect(html).toContain(`© ${BRAND_NAME}`);
  });

  it("ninguna plantilla de correo escribe el nombre a mano", () => {
    // Trinquete sobre la fuente, complementario al render: impide que una
    // plantilla nueva vuelva a hardcodear el nombre correcto, que es cómo se
    // llega a diecisiete copias de un dato.
    const dir = __dirname;
    const sinRevisar = [
      "author-publication-approved",
      "author-publication-rejected",
    ];
    const culpables: string[] = [];

    for (const archivo of fs.readdirSync(dir)) {
      if (!archivo.endsWith(".ts") || archivo.endsWith(".spec.ts")) continue;
      if (sinRevisar.some((s) => archivo.startsWith(s))) continue;
      const src = fs.readFileSync(path.join(dir, archivo), "utf8");
      // Fuera los comentarios: ahí el nombre se cita para explicar el fallo.
      const codigo = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      if (
        codigo.includes(`"${BRAND_NAME}"`) ||
        codigo.includes("Psico Platform")
      ) {
        culpables.push(archivo);
      }
    }

    expect(culpables).toEqual([]);
  });
});
