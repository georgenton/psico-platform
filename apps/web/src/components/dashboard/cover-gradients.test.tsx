import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CoverToken } from "@psico/types";

import { RecommendationCard } from "@/components/onboarding/RecommendationCard";
import type { IncomingRecommendation } from "@/lib/onboarding/book-access";

import { COVER_GRADIENTS, coverGradient } from "./cover-gradients";

vi.mock("@/actions/onboarding", () => ({ completeOnboarding: vi.fn() }));

/**
 * Un libro, una portada.
 *
 * La recomendación del onboarding tenía su propia paleta —naranja para `warm`,
 * que en Biblioteca es salvia— y encima la API le daba otro tono. El mismo
 * libro salía naranja al terminar el registro y verde al abrir la biblioteca.
 */

const LIBRO: IncomingRecommendation = {
  bookId: "b1",
  title: "Emociones en Construcción",
  author: "Autoría por confirmar",
  cover: "warm",
  chapter1Preview: "",
  why: "Porque sí.",
  tierRequired: "free",
};

describe("la portada de un libro sale de un solo sitio", () => {
  it.each(Object.keys(COVER_GRADIENTS) as CoverToken[])(
    "la recomendación pinta «%s» con la misma portada que Biblioteca",
    (cover) => {
      const { container } = render(
        <RecommendationCard primary={{ ...LIBRO, cover }} alternatives={[]} />,
      );
      const portada = container.querySelector<HTMLElement>("article > div");
      expect(portada?.getAttribute("style")).toContain(
        `background: ${coverGradient(cover)}`,
      );
    },
  );

  it("las tres portadas se distinguen entre sí", () => {
    expect(new Set(Object.values(COVER_GRADIENTS)).size).toBe(3);
  });

  it.each([
    ["la tarjeta de Biblioteca", "dashboard/biblioteca/BookCard.tsx"],
    ["la ficha del libro", "dashboard/detalle/BookHero.tsx"],
    ["la barra de audio del lector", "dashboard/lector/AudioBar.tsx"],
    ["la recomendación del onboarding", "onboarding/RecommendationCard.tsx"],
  ])("%s no escribe degradados propios para la portada", (_, ruta) => {
    const codigo = readFileSync(join(__dirname, "..", ruta), "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    expect(codigo).toMatch(/coverGradient\(/);
    expect(codigo).not.toMatch(/linear-gradient\(/);
  });
});
