import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvolucionStats } from "@psico/types";
import { LearningActivityCard } from "./LearningActivityCard";

function stats(overrides: Partial<EvolucionStats> = {}): EvolucionStats {
  return {
    reflexiones: 24,
    capitulosCompletados: 5,
    minutosLectura: 90,
    rachaActual: 7,
    rachaMasLarga: 14,
    diasActivos30d: 18,
    conversacionesEco: 31,
    marcasLectura: 9,
    audiolibrosCompletados: 2,
    podcastsCompletados: 0,
    videoexplicacionesCompletadas: 1,
    lecturasGuiadasCompletadas: 3,
    practicasCompletadas: 4,
    recallsRealizados: 5,
    ...overrides,
  };
}

describe("LearningActivityCard — GR-2", () => {
  it("shows the six counters under the activity heading", () => {
    render(<LearningActivityCard stats={stats()} />);

    expect(screen.getByText("Actividad de aprendizaje")).toBeInTheDocument();
    expect(screen.getByText("2 audiolibros")).toBeInTheDocument();
    expect(screen.getByText("0 podcasts")).toBeInTheDocument();
    expect(screen.getByText("1 videoexplicación")).toBeInTheDocument();
    expect(screen.getByText("3 lecturas guiadas")).toBeInTheDocument();
    expect(screen.getByText("4 prácticas")).toBeInTheDocument();
    expect(screen.getByText("5 preguntas")).toBeInTheDocument();
  });

  it("keeps a zero visible instead of hiding the row", () => {
    render(
      <LearningActivityCard
        stats={stats({
          audiolibrosCompletados: 0,
          podcastsCompletados: 0,
          videoexplicacionesCompletadas: 0,
          lecturasGuiadasCompletadas: 0,
          practicasCompletadas: 0,
          recallsRealizados: 0,
        })}
      />,
    );

    expect(screen.getByText("0 audiolibros")).toBeInTheDocument();
    expect(screen.getByText("0 lecturas guiadas")).toBeInTheDocument();
    expect(screen.getByText("0 preguntas")).toBeInTheDocument();
  });

  it("uses the singular when the count is exactly one", () => {
    render(
      <LearningActivityCard
        stats={stats({
          audiolibrosCompletados: 1,
          podcastsCompletados: 1,
          videoexplicacionesCompletadas: 1,
          lecturasGuiadasCompletadas: 1,
          practicasCompletadas: 1,
          recallsRealizados: 1,
        })}
      />,
    );

    expect(screen.getByText("1 audiolibro")).toBeInTheDocument();
    expect(screen.getByText("1 podcast")).toBeInTheDocument();
    expect(screen.getByText("1 lectura guiada")).toBeInTheDocument();
    expect(screen.getByText("1 práctica")).toBeInTheDocument();
    expect(screen.getByText("1 pregunta")).toBeInTheDocument();
  });

  it("reports attempts, never scores or emotional claims", () => {
    const { container } = render(<LearningActivityCard stats={stats()} />);
    const text = container.textContent ?? "";

    // Recall is an attempt count — no correctness, no percentage, no grade.
    expect(text).toContain("intentaste");
    expect(text).not.toMatch(/correct/i);
    expect(text).not.toContain("%");
    // And no interpretation of what the activity means about the person.
    expect(text).not.toMatch(/transformaci|progres|dominas|vas muy bien/i);
  });
});
