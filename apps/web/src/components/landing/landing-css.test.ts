import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * La hoja de la landing es la que sale del generador, y la cabecera cabe.
 *
 * `landing.css` se genera desde la referencia aprobada y dice de sí mismo «no
 * editar a mano», pero nada lo comprobaba: un retoque directo sobrevivía hasta
 * la siguiente regeneración y desaparecía sin avisar.
 *
 * La segunda parte fija las reglas que devolvieron la cabecera a una línea. Los
 * píxeles los mide `scripts/landing/verificar.mjs` en un navegador; aquí se
 * protege que las reglas sigan existiendo y que ninguna esconda lo que no puede
 * faltar.
 */

const WEB = join(__dirname, "..", "..", "..");
const HOJA = readFileSync(join(WEB, "src", "app", "landing.css"), "utf8");
const SIN_COMENTARIOS = HOJA.replace(/\/\*[\s\S]*?\*\//g, "");

describe("landing.css sale del generador", () => {
  it("es idéntica a lo que produce `scripts/landing/generar-css.mjs`", () => {
    const dir = mkdtempSync(join(tmpdir(), "landing-css-"));
    try {
      const destino = join(dir, "landing.css");
      execFileSync(process.execPath, [
        join(WEB, "scripts", "landing", "generar-css.mjs"),
        join(WEB, "..", "..", "docs", "design"),
        destino,
      ]);
      expect(readFileSync(destino, "utf8")).toBe(HOJA);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("la cabecera en una línea", () => {
  it("los rótulos no se parten, y lo que no quepa baja entero en vez de desbordar", () => {
    expect(SIN_COMENTARIOS).toMatch(
      /\.fh \.fh-head-in a,\s*\.fh \.fh-head-in button\{white-space:nowrap\}/,
    );
    // Sin esto, «nowrap» cambiaría dos líneas por una página que se desplaza a
    // lo ancho en cuanto alguien amplíe el espaciado del texto.
    expect(SIN_COMENTARIOS).toMatch(/\.fh \.fh-head-in\{flex-wrap:wrap;/);
  });

  it("ninguna regla esconde «Crear cuenta», a ningún ancho", () => {
    // Las reglas que ocultan algo de la cabecera, con su selector.
    const ocultas = [
      ...SIN_COMENTARIOS.matchAll(/([^{}]+)\{[^{}]*display:none[^{}]*\}/g),
    ].map((m) => m[1]!.trim());
    expect(ocultas.length).toBeGreaterThan(3);
    for (const selector of ocultas) {
      expect(selector).not.toMatch(/\.fh-enter(?![-\w])/);
      expect(selector).not.toMatch(/\.fh-head[^,]*\.fh-btn-1/);
    }
  });

  it("en el teléfono se quita el icono de «Menú», no la palabra", () => {
    expect(SIN_COMENTARIOS).toMatch(
      /\.fh \.fh-menu-btn \.fh-ico\{display:none\}/,
    );
    expect(SIN_COMENTARIOS).not.toMatch(
      /\.fh-menu-btn[^{}]*\{[^{}]*font-size:0/,
    );
  });
});
