import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvolucionStats } from "@psico/types";
import { MapFeed } from "./MapFeed";

function stats(overrides: Partial<EvolucionStats> = {}): EvolucionStats {
  return {
    reflexiones: 0,
    capitulosCompletados: 0,
    minutosLectura: 0,
    rachaActual: 0,
    rachaMasLarga: 0,
    diasActivos30d: 0,
    ...overrides,
  };
}

describe("MapFeed", () => {
  it("returns null when stats is null", () => {
    const { container } = render(<MapFeed stats={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when all counts are 0", () => {
    const { container } = render(<MapFeed stats={stats()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders non-zero chips with their counts", () => {
    render(
      <MapFeed
        stats={stats({
          capitulosCompletados: 12,
          reflexiones: 128,
          diasActivos30d: 18,
        })}
      />,
    );
    expect(screen.getByText(/Lecturas/i)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText(/Reflexiones/i)).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText(/Días activos/i)).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("renders the dashed Eco placeholder chip when feed has data", () => {
    render(<MapFeed stats={stats({ reflexiones: 5 })} />);
    expect(screen.getByText(/Conversaciones con Eco/i)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("hides chips with count 0 even when other chips render", () => {
    render(<MapFeed stats={stats({ reflexiones: 5 /* others = 0 */ })} />);
    expect(screen.queryByText(/Lecturas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Minutos de lectura/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Racha actual/i)).not.toBeInTheDocument();
  });
});
