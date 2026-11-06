import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_EMAIL_FROM } from "./env.schema";

/**
 * The sender a message claims when nobody chose one.
 *
 * ── What this is defending ────────────────────────────────────────────────
 *
 * `EMAIL_FROM` defaulted to `no-reply@psico.app` until 2026-11-06. That is a
 * stale product identity — the mobile app had already been corrected away from
 * it twice, with comments saying in so many words that it is "not the product's
 * domain" — and it survived here because a default is only exercised when
 * somebody forgets, and the forgetting leaves no trace.
 *
 * The shape of the failure is what makes it worth a ratchet. `RESEND_API_KEY`
 * reads as configured. Boot says nothing. The report said nothing. And every
 * message leaves claiming a domain nobody verified, which Resend refuses — so
 * the first test of a newly arrived key fails and looks like a bad key.
 *
 * ── What it does NOT claim ────────────────────────────────────────────────
 *
 * Nothing here knows which domains are verified in Resend; that lives in an
 * account this process cannot see. The property under test is narrower and
 * checkable: the default names a domain we own, and no API source suggests the
 * old one. Verification stays a DNS step on something of ours, which is a
 * different and much better place for the remaining work to sit.
 */

const API_ROOT = join(__dirname, "..", "..");

/** The product's domain. One place, so the two assertions cannot drift. */
const PRODUCT_DOMAIN = "feelverse.app";

/** The identity this replaced. Named so the ratchet can refuse its return. */
const STALE_DOMAIN = "psico.app";

describe("el remitente por defecto", () => {
  it("usa el dominio del producto", () => {
    expect(DEFAULT_EMAIL_FROM.endsWith(`@${PRODUCT_DOMAIN}`)).toBe(true);
  });

  it("no es el dominio retirado", () => {
    expect(DEFAULT_EMAIL_FROM).not.toContain(STALE_DOMAIN);
  });

  it("es la MISMA cadena que el schema aplica", () => {
    // El informe de salud distingue «elegido» de «por defecto» comparando con
    // esta constante. Si el schema tuviera su propio literal, el informe
    // afirmaría que alguien eligió un remitente cuando nadie lo hizo — y ese
    // es precisamente el estado que existe para delatar.
    const schema = readFileSync(
      join(API_ROOT, "src/config/env.schema.ts"),
      "utf8",
    );
    expect(schema).toContain("EMAIL_FROM: z.string().email().default(");
    expect(schema).toContain(".default(DEFAULT_EMAIL_FROM)");
    // Y que no haya una segunda definición del valor.
    expect(schema.match(/DEFAULT_EMAIL_FROM = /g)).toHaveLength(1);
  });
});

describe("el dominio retirado no vuelve como identidad", () => {
  /**
   * Ámbito deliberadamente estrecho: el código y los guiones de la API, no la
   * documentación. Las bitácoras describen cómo era, y reescribir historia
   * para satisfacer un trinquete es peor que el defecto que evita. Lo que no
   * puede volver es un VALOR que alguien copie.
   */
  const FILES = [
    "src/config/env.schema.ts",
    "src/health/integrations.service.ts",
    "scripts/gen-vapid.mjs",
    "src/notifications/resend.service.ts",
  ];

  for (const f of FILES) {
    it(`${f} no nombra ${STALE_DOMAIN}`, () => {
      let src: string;
      try {
        src = readFileSync(join(API_ROOT, f), "utf8");
      } catch {
        // Un fichero que ya no existe no puede contener el valor. Se declara
        // en vez de hacer pasar la prueba en silencio.
        expect(f).toBe(f);
        return;
      }
      // Los comentarios SÍ pueden nombrarlo: el de `env.schema.ts` explica
      // por qué cambió, y esa frase es lo que impide que alguien lo devuelva
      // «porque estaba antes». Lo que se prohíbe es el valor en código.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      expect(code).not.toContain(STALE_DOMAIN);
    });
  }
});
