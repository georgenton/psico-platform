import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PatronesTheme } from "@psico/types";
import { PatTopTagsGrid } from "./PatTopTagsGrid";

function theme(id: string, label: string, count: number): PatronesTheme {
  return { id, label, count, entryIds: [] };
}

describe("PatTopTagsGrid", () => {
  it("renders the empty-state card when no themes exist", () => {
    render(<PatTopTagsGrid themes={[]} entryCount={0} period="30d" />);
    expect(screen.getByText(/Patrones por descubrir/i)).toBeInTheDocument();
  });

  it("renders up to 5 cards sorted by count desc", () => {
    const themes = [
      theme("a", "Trabajo", 3),
      theme("b", "Familia", 12),
      theme("c", "Sueño", 7),
      theme("d", "Ejercicio", 1),
      theme("e", "Pareja", 9),
      theme("f", "Amigos", 5),
      theme("g", "Salud", 2),
    ];
    const { container } = render(
      <PatTopTagsGrid themes={themes} entryCount={20} period="30d" />,
    );
    const cards = container.querySelectorAll(".card.pat");
    expect(cards.length).toBe(5);
    // First card should be the highest count.
    expect(cards[0]?.textContent).toMatch(/Familia/i);
    expect(cards[0]?.textContent).toMatch(/12 de 20/i);
  });

  it("computes pct as count/entryCount and renders the percent label", () => {
    render(
      <PatTopTagsGrid
        themes={[theme("a", "Trabajo", 5)]}
        entryCount={10}
        period="30d"
      />,
    );
    // 5/10 = 50% — appears twice (in the p-desc copy and in the meter chip).
    expect(screen.getAllByText(/50%/).length).toBeGreaterThanOrEqual(1);
  });

  it("labels the first card as Patrón predominante and the rest recurrente", () => {
    const themes = [theme("a", "Trabajo", 8), theme("b", "Familia", 4)];
    render(<PatTopTagsGrid themes={themes} entryCount={20} period="30d" />);
    expect(screen.getByText(/Patrón predominante/i)).toBeInTheDocument();
    expect(screen.getByText(/Patrón recurrente/i)).toBeInTheDocument();
  });
});
