import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvolucionStats } from "@psico/types";
import { ReflSidePanel } from "./ReflSidePanel";

function buildStats(overrides: Partial<EvolucionStats> = {}): EvolucionStats {
  return {
    reflexiones: 24,
    capitulosCompletados: 3,
    minutosLectura: 45,
    rachaActual: 7,
    rachaMasLarga: 14,
    diasActivos30d: 18,
    conversacionesEco: 0,
    marcasLectura: 0,
    audiolibrosCompletados: 2,
    podcastsCompletados: 0,
    videoexplicacionesCompletadas: 1,
    lecturasGuiadasCompletadas: 3,
    practicasCompletadas: 4,
    recallsRealizados: 5,
    ...overrides,
  };
}

describe("ReflSidePanel", () => {
  it("renders the neutral empty card when stats is null", () => {
    render(<ReflSidePanel stats={null} />);
    expect(
      screen.getByText(/No pudimos calcular tus estadísticas/i),
    ).toBeInTheDocument();
  });

  it("surfaces dias activos + reflexiones totales when stats arrive", () => {
    render(<ReflSidePanel stats={buildStats()} />);
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(
      screen.getByText(/días activos · 24 reflexiones totales/i),
    ).toBeInTheDocument();
  });

  it("renders the racha hint when rachaMasLarga > 0", () => {
    render(<ReflSidePanel stats={buildStats()} />);
    expect(screen.getByText(/14 días/i)).toBeInTheDocument();
    expect(screen.getByText(/7 días/i)).toBeInTheDocument();
  });

  it("hides the racha hint when rachaMasLarga is 0", () => {
    render(<ReflSidePanel stats={buildStats({ rachaMasLarga: 0 })} />);
    expect(screen.queryByText(/Tu mejor racha/i)).not.toBeInTheDocument();
  });

  it("las etiquetas no prometen un resumen de temas ni alimentar el mapa", () => {
    // Decía que aquí aparecerían los temas más repetidos —nadie los calcula— y
    // que Eco los usaba «para refinar tu mapa» —el mapa no lee etiquetas—.
    render(<ReflSidePanel stats={buildStats()} />);
    expect(
      screen.getByText(/No cuentan en tu Mapa Emocional/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /refinar tu mapa|aquí van a aparecer/i,
    );
  });
});
