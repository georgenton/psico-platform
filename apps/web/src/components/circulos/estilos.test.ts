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
 * ── Por qué los pares se DERIVAN y no se escriben ──────────────────────────
 *
 * La primera versión de este archivo llevaba una lista `PARES` escrita a mano:
 * «`--fg-muted` sobre `--bg-surface`», y así. Medía esos pares correctamente y
 * no probaba nada, porque nada la ataba a `estilos`. Cambiar `nota.color` de
 * `--fg-muted` a `--fg-tertiary` —que da 2,09— dejaba la lista intacta y la
 * prueba en verde: medía lo que yo había escrito, no lo que el archivo usa.
 *
 * Así que los colores se LEEN de `estilos`. Lo único declarado aquí son los
 * NOMBRES de los contenedores, porque el fondo de un texto no está en su
 * propio objeto: `nota` sólo dice `color`, y el fondo se lo pone quien la
 * envuelva. Esa composición es un hecho de las pantallas, no algo deducible
 * de un objeto de estilos — pero el COLOR de cada contenedor también sale de
 * `estilos`, así que cambiar cualquier token cambia lo que se mide.
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

type Regla = Record<string, unknown>;
const reglas = estilos as unknown as Record<string, Regla>;

/**
 * El fondo sobre el que se posa la pantalla entera.
 *
 * `page` no declara ninguno: es el contenedor raíz y hereda el de la ruta. Un
 * texto que no esté dentro de ninguna tarjeta cae aquí — y eso pasa de verdad:
 * `OpinionOpcional` devuelve una `nota` suelta cuando la persona ya respondió.
 */
const FONDO_RAIZ = "var(--bg-page)";

/**
 * Los contenedores que pueden envolver texto suelto. **Sólo nombres.**
 *
 * El fondo de cada uno se lee de `estilos[clave].background`, así que esta
 * lista no puede quedar desincronizada de los colores: si alguien cambia el
 * token de `section`, lo que se mide cambia con él.
 */
const CONTENEDORES = [
  "section",
  "aviso",
  "ayudaPanel",
  "detalle",
  "cita",
] as const;

const fondoPropio = (r: Regla): string | null => {
  const b = r.background;
  // `transparent` no es un fondo: deja ver el de quien envuelve.
  return typeof b === "string" && b !== "transparent" ? b : null;
};

const tinta = (r: Regla): string | null =>
  typeof r.color === "string" ? r.color : null;

/** Un control que trae SU fondo y SU tinta se mide consigo mismo. */
const esAutoContenido = (r: Regla) =>
  fondoPropio(r) !== null && tinta(r) !== null;

/** Todo fondo sobre el que puede caer un texto sin fondo propio. */
function fondosPosibles(): string[] {
  const vistos = new Set<string>([FONDO_RAIZ]);
  for (const clave of CONTENEDORES) {
    const f = fondoPropio(reglas[clave] ?? {});
    if (f) vistos.add(f);
  }
  return [...vistos];
}

/** Cada tinta de `estilos`, contra cada fondo sobre el que puede acabar. */
function paresReales(): Array<{ clave: string; fg: string; bg: string }> {
  const out: Array<{ clave: string; fg: string; bg: string }> = [];
  for (const [clave, r] of Object.entries(reglas)) {
    const fg = tinta(r);
    if (!fg) continue;
    const propio = fondoPropio(r);
    for (const bg of propio ? [propio] : fondosPosibles()) {
      out.push({ clave, fg, bg });
    }
  }
  return out;
}

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

/** Los diez estados reales: 8 dentro del panel, 2 fuera (tema, sin ambiente). */
const ESTADOS: Array<{
  etiqueta: string;
  theme: "contemporary" | "renaissance";
  ambient: "calma" | "enfoque" | "energia" | "noche" | null;
}> = [
  ...ESTADOS_DEL_PANEL.map((e) => ({
    etiqueta: `${e.theme}/${e.ambient}`,
    theme: e.theme,
    ambient: e.ambient,
  })),
  // La sala de invitado (`/compartir/*`, `/actividades/*`) no monta el armazón,
  // así que nunca ve una clase `amb-*`. Exigirle Noche sería inventar un
  // requisito; exigirle los dos temas no.
  ...ESTADOS_SIN_AMBIENTE.map((e) => ({
    etiqueta: `${e.theme}/sin-ambiente`,
    theme: e.theme,
    ambient: null,
  })),
];

describe("las primitivas de Círculos no congelan un color", () => {
  it("ningún valor de estilo lleva un hexadecimal", () => {
    // Sobre los VALORES, no sobre el archivo: la prosa de arriba cita los
    // literales que se retiraron, y un trinquete que se rompe con su propia
    // explicación empuja a borrar la explicación para pasar.
    const ofensores: string[] = [];
    for (const [clave, r] of Object.entries(reglas)) {
      for (const [prop, valor] of Object.entries(r)) {
        if (typeof valor === "string" && /#[0-9a-fA-F]{3,8}\b/.test(valor)) {
          ofensores.push(`${clave}.${prop} = ${valor}`);
        }
      }
    }
    expect(ofensores).toEqual([]);
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
      expect(reglas[clave]?.minHeight, `${clave} perdió su altura mínima`).toBe(
        "44px",
      );
    }
  });
});

describe("el contraste se mide sobre lo que `estilos` usa de verdad", () => {
  const pares = paresReales();
  const claves = [...new Set(pares.map((p) => p.clave))];

  it("se derivan pares de `estilos`, y no son cuatro", () => {
    // Guard the guard: si el derivado dejara de encontrar tintas, cada prueba
    // de abajo pasaría sobre una lista vacía.
    expect(claves.length).toBeGreaterThan(12);
    expect(pares.length).toBeGreaterThan(claves.length);
  });

  it("todo fondo declarado está clasificado", () => {
    // Un primitivo nuevo con fondo propio tiene que ser o un control que trae
    // su tinta, o un contenedor declarado arriba. Si no es ninguno, el texto
    // que caiga dentro no se estaría midiendo contra él — y nadie se enteraría.
    const sinClasificar = Object.entries(reglas)
      .filter(([clave, r]) => {
        if (fondoPropio(r) === null) return false;
        if (esAutoContenido(r)) return false;
        return !(CONTENEDORES as readonly string[]).includes(clave);
      })
      .map(([clave]) => clave);
    expect(sinClasificar).toEqual([]);
  });

  it("cada contenedor declarado existe y aporta un fondo", () => {
    for (const clave of CONTENEDORES) {
      expect(reglas[clave], `falta el contenedor ${clave}`).toBeDefined();
      expect(
        fondoPropio(reglas[clave] ?? {}),
        `${clave} ya no aporta fondo: sácalo de CONTENEDORES`,
      ).not.toBeNull();
    }
  });

  for (const clave of claves) {
    it(`${clave} — legible en los 10 estados, sobre cada fondo posible`, () => {
      const fallos: string[] = [];
      for (const par of pares.filter((p) => p.clave === clave)) {
        for (const estado of ESTADOS) {
          const ratio = medir(par.fg, par.bg, estado.theme, estado.ambient);
          if (ratio < 4.5 - 0.005) {
            fallos.push(
              `${par.fg} sobre ${par.bg} en ${estado.etiqueta}: ${ratio.toFixed(2)}`,
            );
          }
        }
      }
      expect(fallos, `estilos.${clave}`).toEqual([]);
    });
  }
});

describe("los tokens que se midieron y se descartaron", () => {
  // Dejar constancia de por qué el texto verde no volvió como `--fg-link`: la
  // siguiente persona que lo intente tiene el número aquí, no en un PR. Con
  // los pares ya derivados, usar cualquiera de estos en `estilos` rompe además
  // la prueba de su propia clave.
  it.each([
    ["var(--fg-tertiary)"],
    ["var(--fg-link)"],
    ["var(--fg-link-strong)"],
  ])("%s no llega a 4,5 sobre ningún fondo de Círculos", (fg) => {
    for (const bg of fondosPosibles()) {
      const peor = Math.min(
        ...ESTADOS_DEL_PANEL.map(({ theme, ambient }) =>
          medir(fg, bg, theme, ambient),
        ),
      );
      expect(peor, `${fg} sobre ${bg}`).toBeLessThan(4.5);
    }
  });
});
