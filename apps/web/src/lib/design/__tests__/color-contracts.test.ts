import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONTRATOS,
  ESTADOS_DEL_PANEL,
  ESTADOS_SIN_AMBIENTE,
} from "../color-contracts";
import {
  parseColor,
  peorContraste,
  resolver,
  stopsDeGradiente,
  tokensDe,
} from "../resolve-tokens";

/**
 * Cada par declarado cumple su promesa, en cada estado que la app produce.
 *
 * EL FALLO QUE ESTO IMPIDE (#728). El sistema no tenía forma de decir «este
 * primer plano es legible sobre este fondo», así que quien escribía un
 * componente elegía dos tokens que sonaban bien y acertaba o no. Los ambientes
 * redefinen unas rampas y otras no, de modo que un fondo se aclaraba en Noche
 * mientras su texto seguía siendo claro: `--fg-body` sobre `--bg-action-soft`
 * caía a 1,32, y `--fg-on-brand` sobre `--bg-brand-strong` a 2,25.
 *
 * Esto resuelve los valores como lo haría el navegador y mide. Lo que un
 * navegador ve y esto no —opacidad de un ancestro, una regla que pisa el token,
 * el render real— se mide aparte, en el navegador. Ninguna de las dos pruebas
 * sustituye a la otra.
 *
 * Por qué NO se prueba «todo primer plano contra todo fondo»: un token no tiene
 * por qué contrastar contra fondos que nunca va a tocar. Eso fabricaría
 * requisitos falsos. Se prueba el contrato que cada par declara, y nada más.
 */

const app = (nombre: string) =>
  readFileSync(join(__dirname, "..", "..", "..", "app", nombre), "utf8");

/**
 * El panel carga DOS hojas: `globals.css` desde el layout raíz y
 * `dashboard-design.css` desde el layout del panel. La segunda redeclara
 * `--bg-brand-strong` por ambiente, así que leer sólo la primera daba un valor
 * que el navegador nunca pinta ahí — un trinquete que miente es peor que no
 * tenerlo. Fuera del panel sólo hay la primera.
 */
const CSS_PANEL = app("globals.css") + "\n" + app("dashboard-design.css");
const CSS_FUERA = app("globals.css");

/** Lo que exige 1.4.3 según el tamaño que el par promete. */
const MINIMO = { normal: 4.5, grande: 3 } as const;

function medir(
  fg: string,
  bg: string,
  theme: "contemporary" | "renaissance",
  ambient: "calma" | "enfoque" | "energia" | "noche" | null,
): { ratio: number; fgResuelto: string } {
  const tokens = tokensDe(
    ambient === null ? CSS_FUERA : CSS_PANEL,
    theme,
    ambient,
  );
  const fgResuelto = resolver(tokens, fg);
  const color = parseColor(fgResuelto);
  const fondos = stopsDeGradiente(tokens, bg);
  if (!color)
    throw new Error(`primer plano sin resolver: ${fg} → ${fgResuelto}`);
  if (!fondos.length) throw new Error(`fondo sin resolver: ${bg}`);
  return { ratio: peorContraste(color, fondos), fgResuelto };
}

describe("los pares declarados cumplen en el panel", () => {
  for (const contrato of CONTRATOS.filter((c) => c.alcance !== "fuera")) {
    it(`${contrato.nombre} — ${contrato.tamano} — en las 8 combinaciones`, () => {
      const fallos: string[] = [];
      for (const { theme, ambient } of ESTADOS_DEL_PANEL) {
        const { ratio } = medir(contrato.fg, contrato.bg, theme, ambient);
        if (ratio < MINIMO[contrato.tamano] - 0.005) {
          fallos.push(`${theme}+${ambient}: ${ratio.toFixed(2)}`);
        }
      }
      expect(
        fallos,
        `${contrato.nombre} (${contrato.usadoEn}) exige ${MINIMO[contrato.tamano]}:1`,
      ).toEqual([]);
    });
  }
});

describe("y también fuera del panel, donde no hay ambiente", () => {
  // Auth, Autor y las pantallas de Círculos no montan `AmbientThemeApplier`.
  // Reciben el tema del layout raíz y ninguna clase `amb-*`.
  for (const contrato of CONTRATOS.filter((c) => c.alcance !== "panel")) {
    it(`${contrato.nombre} — sin clase de ambiente`, () => {
      const fallos: string[] = [];
      for (const { theme } of ESTADOS_SIN_AMBIENTE) {
        const { ratio } = medir(contrato.fg, contrato.bg, theme, null);
        if (ratio < MINIMO[contrato.tamano] - 0.005) {
          fallos.push(`${theme}: ${ratio.toFixed(2)}`);
        }
      }
      expect(fallos).toEqual([]);
    });
  }
});

describe("el alcance no es una excusa para no medir", () => {
  it("cada par se mide en algún estado, y casi todos en los diez", () => {
    // `alcance` existe para no inventar requisitos, no para escapar de ellos.
    // Un par que no se midiera en ninguna parte sería una promesa sin cobrar.
    for (const c of CONTRATOS) {
      expect(["panel", "fuera", "ambos"]).toContain(c.alcance);
    }
    // Sólo DS-01 se acota, y por una razón comprobable: su único consumidor es
    // `(auth)/login/_LoginForm.tsx`, y ese árbol no monta el aplicador de
    // ambientes. Si alguien lo usa dentro del panel, esta cuenta cambia y toca
    // volver a mirar el valor en Noche.
    expect(
      CONTRATOS.filter((c) => c.alcance !== "ambos").map((c) => c.nombre),
    ).toEqual(["ACENTO SOBRE PÁGINA"]);
  });
});

describe("las rampas no prometen nada, y por eso no se prueban", () => {
  it("ningún contrato apunta a un color de rampa", () => {
    // Un contrato contra `--color-lavender-500` sería mentira: esa rampa
    // también pinta bordes y gráficos, y atarla a un requisito de texto es
    // justo lo que #728 pide no hacer.
    for (const c of CONTRATOS) {
      expect(
        c.fg,
        `${c.nombre}: el primer plano no puede ser una rampa`,
      ).not.toMatch(/var\(--color-(lavender|sage|warm|rose)-\d/);
      expect(c.bg, `${c.nombre}: el fondo no puede ser una rampa`).not.toMatch(
        /var\(--color-(lavender|sage|warm|rose)-\d/,
      );
    }
  });
});

describe("regresión de #741 — el texto de error", () => {
  it("sigue por encima de 4,5 en las ocho combinaciones", () => {
    // El PR #744 lo dejó en 6,47 como mínimo. Si alguien toca
    // `--fv-error-text` o su alias, esto lo cuenta antes que una persona.
    const ratios = ESTADOS_DEL_PANEL.map(
      ({ theme, ambient }) =>
        medir("var(--color-error-text)", "var(--bg-surface)", theme, ambient)
          .ratio,
    );
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
  });
});
