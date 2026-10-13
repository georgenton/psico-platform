import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { estilos } from "./estilos";
import {
  parseColor,
  peorContraste,
  resolver,
  stopsDeGradiente,
  tokensDe,
} from "../../lib/design/resolve-tokens";
import {
  ESTADOS_DEL_PANEL,
  ESTADOS_SIN_AMBIENTE,
} from "../../lib/design/color-contracts";

/**
 * Las primitivas de Círculos siguen al tema, y lo que escriben es legible.
 *
 * ── El fallo que esto impide ────────────────────────────────────────────────
 *
 * Los valores eran hexadecimales literales. Las rutas de `dashboard/circulos/*`
 * heredan el armazón del panel, que monta `AmbientThemeApplier`, así que en
 * Noche la página pasa a `#141119` y la superficie a `#211d2e` — y estas
 * pantallas seguían pintando `#fbfaf8` sobre `#ffffff`: una tarjeta clara
 * dentro de un panel oscuro. Un literal tampoco sigue los cuatro tintes
 * distintos de `--bg-page` entre Calma, Enfoque, Energía y Renaissance.
 *
 * Dos trinquetes, porque son dos promesas distintas:
 *
 *   1. que no vuelva un literal — `inline` gana a cualquier hoja, así que un
 *      hexadecimal aquí no se puede corregir después desde CSS;
 *   2. que los pares que SÍ se usan midan lo que dicen, en los ocho estados
 *      del panel y en los dos de fuera, con la misma maquinaria que cobra
 *      `color-contracts`.
 *
 * Lo que esto NO mide: el render real, la opacidad de un ancestro, una regla
 * que pise el token. Eso se mira en el navegador, y ninguna de las dos
 * comprobaciones sustituye a la otra.
 */

const app = (nombre: string) =>
  readFileSync(join(__dirname, "..", "..", "app", nombre), "utf8");

/** El panel carga las dos hojas; fuera del panel sólo la primera. */
const CSS_PANEL = app("globals.css") + "\n" + app("dashboard-design.css");
const CSS_FUERA = app("globals.css");

function medir(
  fg: string,
  bg: string,
  theme: "contemporary" | "renaissance",
  ambient: "calma" | "enfoque" | "energia" | "noche" | null,
): number {
  const tokens = tokensDe(
    ambient === null ? CSS_FUERA : CSS_PANEL,
    theme,
    ambient,
  );
  const color = parseColor(resolver(tokens, fg));
  const fondos = stopsDeGradiente(tokens, bg);
  if (!color) throw new Error(`primer plano sin resolver: ${fg}`);
  if (!fondos.length) throw new Error(`fondo sin resolver: ${bg}`);
  return peorContraste(color, fondos);
}

describe("las primitivas de Círculos no congelan un color", () => {
  it("ningún valor de estilo lleva un hexadecimal", () => {
    // Sobre los VALORES, no sobre el archivo: la prosa de arriba cita los
    // literales que se retiraron, y un trinquete que se rompe con su propia
    // explicación empuja a borrar la explicación para pasar.
    const ofensores: string[] = [];
    for (const [clave, reglas] of Object.entries(estilos)) {
      for (const [prop, valor] of Object.entries(
        reglas as Record<string, unknown>,
      )) {
        if (typeof valor === "string" && /#[0-9a-fA-F]{3,8}\b/.test(valor)) {
          ofensores.push(`${clave}.${prop} = ${valor}`);
        }
      }
    }
    expect(ofensores).toEqual([]);
  });

  it("los colores salen de tokens del sistema", () => {
    // Guard the guard: si el objeto deja de traer colores, lo de arriba pasa
    // sobre nada.
    const conColor = Object.values(estilos).filter((r) =>
      Object.values(r as Record<string, unknown>).some(
        (v) => typeof v === "string" && v.includes("var(--"),
      ),
    );
    expect(conColor.length).toBeGreaterThan(10);
  });

  it("conserva los 44px de los controles y el área táctil", () => {
    // Era un requisito explícito del archivo antes de este cambio, y un
    // reemplazo de colores no tiene por qué haberlo tocado.
    for (const clave of [
      "radioRow",
      "primary",
      "secondary",
      "quiet",
      "ayuda",
      "detalleResumen",
    ]) {
      expect(
        (estilos[clave] as Record<string, unknown>).minHeight,
        `${clave} perdió su altura mínima`,
      ).toBe("44px");
    }
  });
});

/**
 * Los pares que las primitivas usan de verdad, con el mínimo que promete cada
 * uno. Están aquí, y no en `CONTRATOS`, porque `color-contracts` describe el
 * sistema entero y esto describe una pantalla: declararlos allí obligaría a
 * todo el producto a sostener un par que sólo Círculos pinta.
 */
const PARES: ReadonlyArray<{
  nombre: string;
  fg: string;
  bg: string;
  usadoEn: string;
}> = [
  {
    nombre: "PÁGINA",
    fg: "var(--fg-body)",
    bg: "var(--bg-page)",
    usadoEn: "estilos.page — el texto corriente de la sala",
  },
  {
    nombre: "PANEL",
    fg: "var(--fg-body)",
    bg: "var(--bg-surface)",
    usadoEn: "section, p, turno, textarea, detalle, cita, secondary, quiet",
  },
  {
    nombre: "PANEL · apoyo",
    fg: "var(--fg-muted)",
    bg: "var(--bg-surface)",
    usadoEn: "nota, counter, paso, firma",
  },
  {
    nombre: "AVISO",
    fg: "var(--fg-body)",
    bg: "var(--bg-subtle)",
    usadoEn: "aviso, ayudaPanel",
  },
  {
    nombre: "AVISO · apoyo",
    fg: "var(--fg-muted)",
    bg: "var(--bg-subtle)",
    usadoEn: "ayudaEtiqueta",
  },
  {
    nombre: "ACCIÓN",
    fg: "var(--fg-on-action)",
    bg: "var(--bg-action)",
    usadoEn: "primary",
  },
  {
    nombre: "ERROR",
    fg: "var(--color-error-text)",
    bg: "var(--bg-surface)",
    usadoEn: "error",
  },
];

describe("los pares que Círculos usa cumplen 4,5:1", () => {
  for (const par of PARES) {
    it(`${par.nombre} — en los 8 estados del panel`, () => {
      const fallos: string[] = [];
      for (const { theme, ambient } of ESTADOS_DEL_PANEL) {
        const ratio = medir(par.fg, par.bg, theme, ambient);
        if (ratio < 4.5 - 0.005) {
          fallos.push(`${theme}/${ambient}: ${ratio.toFixed(2)}`);
        }
      }
      expect(fallos, `${par.nombre} (${par.usadoEn})`).toEqual([]);
    });

    it(`${par.nombre} — fuera del panel, donde hay tema y no ambiente`, () => {
      // La sala de invitado (`/actividades/*`, `/compartir/*`) no monta el
      // armazón, así que nunca ve una clase `amb-*`. Exigirle Noche sería
      // inventar un requisito; exigirle los dos temas no.
      const fallos: string[] = [];
      for (const { theme } of ESTADOS_SIN_AMBIENTE) {
        const ratio = medir(par.fg, par.bg, theme, null);
        if (ratio < 4.5 - 0.005) {
          fallos.push(`${theme}: ${ratio.toFixed(2)}`);
        }
      }
      expect(fallos, `${par.nombre} (${par.usadoEn})`).toEqual([]);
    });
  }
});

describe("los tokens que se midieron y se descartaron", () => {
  // Dejar constancia de por qué el texto verde no volvió como `--fg-link`: la
  // siguiente persona que lo intente tiene el número aquí, no en un PR.
  it.each([
    ["var(--fg-tertiary)", "var(--bg-surface)"],
    ["var(--fg-link)", "var(--bg-surface)"],
    ["var(--fg-link-strong)", "var(--bg-surface)"],
  ])("%s sobre %s no llega a 4,5 en los 8 estados", (fg, bg) => {
    const peor = Math.min(
      ...ESTADOS_DEL_PANEL.map(({ theme, ambient }) =>
        medir(fg, bg, theme, ambient),
      ),
    );
    expect(peor).toBeLessThan(4.5);
  });
});
