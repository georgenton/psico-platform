import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AchievementProgress } from "@psico/types";
import { AchievementsGrid } from "./AchievementsGrid";

function build(
  overrides: Partial<AchievementProgress> = {},
): AchievementProgress {
  return {
    id: "ach-1",
    label: "Primer paso",
    description: "Escribe tu primera entrada en el diario.",
    icon: "pencil",
    progressCurrent: 0,
    progressTarget: 1,
    unlockedAt: null,
    ...overrides,
  };
}

describe("AchievementsGrid", () => {
  it("renders an empty state when the user has no achievements yet", () => {
    render(<AchievementsGrid achievements={[]} />);
    expect(screen.getByTestId("achievements-empty")).toBeInTheDocument();
    // El texto está en la variedad que usa el resto del producto (tú, no vos):
    // «Empieza…», «aquí aparecerán…». Antes decía «Empezá … acá», que es
    // voseo rioplatense y desentonaba con las pantallas de al lado.
    expect(screen.getByText(/aquí aparecerán tus logros/i)).toBeInTheDocument();
    expect(screen.queryByText(/acá tus logros/i)).toBeNull();
  });

  it("renders each achievement card with its label", () => {
    render(
      <AchievementsGrid
        achievements={[
          build({ id: "a1", label: "Libro 1" }),
          build({ id: "a2", label: "Diario 7 días" }),
        ]}
      />,
    );
    expect(screen.getByText("Libro 1")).toBeInTheDocument();
    expect(screen.getByText("Diario 7 días")).toBeInTheDocument();
  });

  it("shows progress bar with 0/N for locked achievements", () => {
    render(
      <AchievementsGrid
        achievements={[
          build({ progressCurrent: 3, progressTarget: 10, unlockedAt: null }),
        ]}
      />,
    );
    expect(screen.getByText("3/10")).toBeInTheDocument();
  });

  it("hides progress when unlocked", () => {
    render(
      <AchievementsGrid
        achievements={[
          build({
            progressCurrent: 1,
            progressTarget: 1,
            unlockedAt: new Date("2026-06-01"),
          }),
        ]}
      />,
    );
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
  });

  it("dibuja el estado, no el identificador del icono", () => {
    // `icon` es un token («pencil», «book», «flame»). La tarjeta lo pintaba tal
    // cual: se leía la palabra en inglés y el candado no salía nunca.
    render(
      <AchievementsGrid
        achievements={[
          build({ id: "falta", icon: "pencil", unlockedAt: null }),
          build({
            id: "hecho",
            icon: "book",
            unlockedAt: new Date("2026-06-01"),
          }),
        ]}
      />,
    );
    const falta = screen.getByTestId("achievement-falta");
    const hecho = screen.getByTestId("achievement-hecho");
    expect(falta).toHaveTextContent("🔒");
    expect(hecho).toHaveTextContent("🏆");
    for (const tarjeta of [falta, hecho]) {
      expect(tarjeta.textContent).not.toMatch(/pencil|book|flame/);
    }
  });

  it("dice con palabras si está conseguido o falta", () => {
    // El candado y el borde son sólo para quien ve la pantalla.
    render(
      <AchievementsGrid
        achievements={[
          build({ id: "falta", unlockedAt: null }),
          build({ id: "hecho", unlockedAt: new Date("2026-06-01") }),
        ]}
      />,
    );
    expect(screen.getByTestId("achievement-falta")).toHaveTextContent(
      "Pendiente",
    );
    expect(screen.getByTestId("achievement-hecho")).toHaveTextContent(
      "Conseguido",
    );
  });
});
