import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvolucionStats } from "@psico/types";
import { EvoQuarter } from "./EvoQuarter";

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
    ...overrides,
  };
}

describe("EvoQuarter", () => {
  it("renders the trimester card-tag", () => {
    render(<EvoQuarter stats={stats()} />);
    expect(screen.getByText(/Este trimestre/i)).toBeInTheDocument();
  });

  it("renders the plural form for reflexiones and capitulos", () => {
    render(<EvoQuarter stats={stats()} />);
    expect(screen.getByText(/24 reflexiones/i)).toBeInTheDocument();
    expect(screen.getByText(/5 capítulos/i)).toBeInTheDocument();
  });

  it("renders the singular form for 1 reflexión / 1 capítulo", () => {
    render(
      <EvoQuarter stats={stats({ reflexiones: 1, capitulosCompletados: 1 })} />,
    );
    expect(screen.getByText(/1 reflexión/i)).toBeInTheDocument();
    expect(screen.getByText(/1 capítulo$/i)).toBeInTheDocument();
  });

  it("surfaces the racha actual when there is one", () => {
    render(<EvoQuarter stats={stats({ rachaActual: 7, rachaMasLarga: 14 })} />);
    expect(screen.getByText(/7 días seguidos/i)).toBeInTheDocument();
    expect(screen.getByText(/tu mejor racha fue 14 días/i)).toBeInTheDocument();
  });

  it("renders the no-racha empty state when rachaActual is 0", () => {
    render(<EvoQuarter stats={stats({ rachaActual: 0 })} />);
    expect(screen.getByText(/Aún sin racha activa/i)).toBeInTheDocument();
  });

  it("Fase C: surfaces the Eco and reading-marks counters moved from the map", () => {
    render(<EvoQuarter stats={stats()} />);
    expect(screen.getByText(/31 mensajes con Eco/i)).toBeInTheDocument();
    expect(screen.getByText(/9 subrayados y notas/i)).toBeInTheDocument();
  });

  it("Fase C: singular forms for 1 mensaje / 1 marca", () => {
    render(
      <EvoQuarter stats={stats({ conversacionesEco: 1, marcasLectura: 1 })} />,
    );
    expect(screen.getByText(/1 mensaje con Eco/i)).toBeInTheDocument();
    expect(screen.getByText(/1 subrayado o nota/i)).toBeInTheDocument();
  });
});
