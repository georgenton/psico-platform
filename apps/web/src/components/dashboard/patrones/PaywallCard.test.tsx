import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ESTADOS_DEL_PANEL } from "@/lib/design/color-contracts";
import {
  parseColor,
  peorContraste,
  resolver,
  stopsDeGradiente,
  tokensDe,
} from "@/lib/design/resolve-tokens";

import { PaywallCard } from "./PaywallCard";

/**
 * El muro de Patrones, montado en sus dos estados.
 *
 * Misma lección que `UpgradeCard.test.tsx`: comprobar que «Hazte Pro» aparece
 * después de la guarda no distingue qué rama le toca a qué valor. Aquí se
 * monta y se pregunta.
 */

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("PaywallCard · con las compras CERRADAS", () => {
  it("no ofrece «Hazte Pro»", () => {
    render(<PaywallCard entryCount={12} purchasesOpen={false} />);
    // Mata la inversión de ramas: con `purchasesOpen=false` ese enlace no
    // puede existir, esté donde esté escrito en el fichero.
    expect(screen.queryByText(/Hazte Pro/)).toBeNull();
  });

  it("explica por qué no se puede activar, y enlaza a Mi plan sin parecer una compra", () => {
    render(<PaywallCard entryCount={12} purchasesOpen={false} />);
    expect(
      screen.getByText(/Las compras todavía no están disponibles/),
    ).toBeInTheDocument();
    const enlace = screen.getByRole("link", { name: "Ver mi plan" });
    expect(enlace).toHaveAttribute("href", "/dashboard/plan");
  });

  it("no le atribuye el resumen a Eco ni dice que sea opcional", () => {
    // `PatronesService.buildNarrative` llama a un modelo con conteos y, si
    // falla, arma el texto con una plantilla. Y `weeklyReport` nace activado:
    // «opt-in» era al revés.
    render(<PaywallCard entryCount={12} purchasesOpen={false} />);
    expect(
      screen.getByText(/Resumen de tu semana con conteos/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/generado por Eco|opt-in/i);
  });

  it("sigue contando lo que esta persona ya lleva escrito", () => {
    render(<PaywallCard entryCount={12} purchasesOpen={false} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("con cero entradas no dice que sean suficientes", () => {
    render(<PaywallCard entryCount={0} purchasesOpen={false} />);
    expect(
      screen.getByText("Aún no tienes entradas en este período."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Suficiente|Llevas 0/);
  });

  it("habla de patrones: no es el Mapa ni promete terapia", () => {
    render(<PaywallCard entryCount={1} purchasesOpen={false} />);
    expect(
      screen.getByRole("heading", {
        name: "Tus patrones · sin descifrar nada",
      }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /mapa emocional|terapeuta|heatmap|moods/i,
    );
    expect(document.body.textContent).toContain("1 entrada en este período");
  });
});

describe("PaywallCard · con las compras ABIERTAS", () => {
  it("ofrece «Hazte Pro →» hacia Mi plan", () => {
    render(<PaywallCard entryCount={12} purchasesOpen />);
    const cta = screen.getByRole("link", { name: /Hazte Pro/ });
    expect(cta).toHaveAttribute("href", "/dashboard/plan");
  });

  it("y entonces NO dice que las compras no están disponibles", () => {
    render(<PaywallCard entryCount={12} purchasesOpen />);
    expect(
      screen.queryByText(/Las compras todavía no están disponibles/),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver mi plan" })).toBeNull();
  });
});

/**
 * Que se pueda leer.
 *
 * El título salía a 1,30:1 — tinta oscura sobre morado— y la causa no estaba en
 * esta tarjeta: la regla global de encabezados pisa el color heredado, así que
 * «la tarjeta es blanca por dentro» no bastaba. El resto de los textos iba con
 * blancos al 70–90 % escritos a mano sobre un gradiente de la rampa, que en
 * Noche se invierte (1,40:1 en el pie).
 *
 * Lo que se fija es el PAR declarado en `color-contracts.ts`, que ya se mide en
 * las ocho combinaciones de estilo y ambiente: si alguien vuelve a un color
 * suelto, aquí se ve.
 */
describe("PaywallCard · legibilidad", () => {
  const TINTAS = [
    "var(--fg-on-brand-surface)",
    "var(--fg-on-brand-surface-muted)",
  ];

  it("se apoya en la superficie de marca, no en un gradiente de la rampa", () => {
    const { container } = render(
      <PaywallCard entryCount={12} purchasesOpen={false} />,
    );
    const tarjeta = container.querySelector("section");
    expect(tarjeta?.style.background).toBe("var(--bg-brand-surface)");
    expect(tarjeta?.style.color).toBe("var(--fg-on-brand-surface)");
  });

  it("el título declara SU color: heredarlo de la tarjeta no basta", () => {
    render(<PaywallCard entryCount={12} purchasesOpen={false} />);
    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.style.color).toBe("var(--fg-on-brand-surface)");
  });

  it.each([
    ["cerradas", false],
    ["abiertas", true],
  ] as const)(
    "con las compras %s, ningún texto usa un color fuera del par",
    (_, purchasesOpen) => {
      const { container } = render(
        <PaywallCard entryCount={12} purchasesOpen={purchasesOpen} />,
      );
      const conColor = [
        ...container.querySelectorAll<HTMLElement>("section *"),
      ].filter((e) => e.style.color !== "");
      expect(conColor.length).toBeGreaterThan(4);
      for (const e of conColor) {
        // El botón de contratar es otra pareja: tinta de marca sobre superficie
        // clara, con su propio fondo.
        if (e.style.background === "var(--bg-surface)") {
          expect(e.style.color).toBe("var(--color-lavender-700)");
          continue;
        }
        expect(TINTAS).toContain(e.style.color);
      }
    },
  );

  it("cada tinta del par llega a 4,5:1 en los dos estilos y los cuatro ambientes", () => {
    const css = ["globals.css", "dashboard-design.css"]
      .map((n) =>
        readFileSync(join(__dirname, "..", "..", "..", "app", n), "utf8"),
      )
      .join("\n");
    for (const { theme, ambient } of ESTADOS_DEL_PANEL) {
      const tokens = tokensDe(css, theme, ambient);
      for (const tinta of TINTAS) {
        const color = parseColor(resolver(tokens, tinta));
        if (!color) throw new Error(`tinta sin resolver: ${tinta}`);
        const ratio = peorContraste(
          color,
          stopsDeGradiente(tokens, "var(--bg-brand-surface)"),
        );
        expect(
          ratio,
          `${tinta} · ${theme} · ${ambient}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
