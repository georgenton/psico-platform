import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CoverToken, HomeResponse } from "@psico/types";

import { COVER_GRADIENTS } from "@/components/dashboard/cover-gradients";
import { InicioV2 } from "./InicioV2";

/**
 * La portada de «Continúa tu recorrido» sigue el tono del libro.
 *
 * Pintaba lavanda para cualquiera, así que el mismo libro salía verde en
 * Biblioteca y lavanda en Inicio. El tono va en una CLASE y no en un estilo en
 * línea: en línea taparía la regla de Renacimiento, donde una portada es papel
 * con su filete.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const APP = join(__dirname, "..", "..", "..", "app");
const PANEL = readFileSync(join(APP, "dashboard-design.css"), "utf8");
const GLOBALS = readFileSync(join(APP, "globals.css"), "utf8");
const limpio = (s: string) => s.replace(/\s+/g, " ").trim();

function portada(cover: unknown): HTMLElement {
  const home = {
    user: { firstName: "Ana", city: null, tier: "free", streakDays: 0 },
    greeting: { text: "Hola", subtitle: null },
    continueBook: {
      bookId: "b",
      bookSlug: "un-libro",
      readerRef: { kind: "unit", id: "u" },
      title: "Un libro",
      chapterN: 1,
      chapterTitle: "Uno",
      progressPct: 10,
      cover,
    },
    ecoMoment: null,
    recos: [],
    stats: {
      minutesThisWeek: 0,
      entriesThisWeek: 0,
      streakDays: 0,
      weeklyGoalPct: 0,
      insightsCount: 0,
      patternsCount: 0,
    },
    reflectionPrompt: null,
    shortcuts: [],
    ambient: "calma",
    insightToday: null,
    emotionalMap: null,
    activity: { items: [] },
  } as unknown as HomeResponse;
  const { container } = render(<InicioV2 home={home} />);
  return container.querySelector<HTMLElement>(".continue .cover")!;
}

describe("portada de «Continúa» en Inicio", () => {
  it.each(["cool", "warm", "mixed"] as const)(
    "el tono %s llega como clase, sin estilo en línea",
    (tono) => {
      const el = portada(tono);
      expect(el).toHaveClass("cover", `tono-${tono}`);
      expect(el.getAttribute("style")).toBeNull();
    },
  );

  it.each([undefined, null, "otro"])("un tono %s cae en cool", (tono) => {
    expect(portada(tono)).toHaveClass("tono-cool");
  });

  it.each(Object.keys(COVER_GRADIENTS) as CoverToken[])(
    "la hoja pinta %s con el mismo degradado que Biblioteca y la ficha",
    (tono) => {
      const regla = PANEL.match(
        new RegExp(
          `\\.continue \\.cover:where\\(\\.tono-${tono}\\) \\{ background: ([^;]+); \\}`,
        ),
      );
      expect(regla, `falta la regla de ${tono}`).not.toBeNull();
      expect(limpio(regla![1]!)).toBe(limpio(COVER_GRADIENTS[tono]));
    },
  );

  it("no le gana a la regla de Renacimiento", () => {
    // `[data-theme="renaissance"] .continue .cover` vale (0,3,0) y la hoja del
    // panel se carga después. Una clase normal empataría y ganaría por orden;
    // `:where()` la deja en (0,2,0).
    expect(GLOBALS).toContain('[data-theme="renaissance"] .continue .cover');
    expect(PANEL).not.toMatch(/\.continue \.cover\.tono-/);
  });
});
