import { render, screen } from "@testing-library/react";
import type {
  EmotionalMapDimension,
  EmotionalMapDimensionKey,
} from "@psico/types";

import { MapRadar } from "./MapRadar";

/**
 * MapRadar — honest hexagonal radar.
 *
 * The invariants under test are the V2 ones: a fabricated value never appears.
 * An axis reaches its value only when confidence clears the floor; below it the
 * axis renders the "Reuniendo datos" state with a 0-width progress bar. There
 * is no global percentage anywhere.
 */

const ALL_KEYS: EmotionalMapDimensionKey[] = [
  "calma",
  "claridad",
  "conexion",
  "proposito",
  "compasion",
  "consciencia",
];

function dim(
  key: EmotionalMapDimensionKey,
  opts: Partial<EmotionalMapDimension> = {},
): EmotionalMapDimension {
  return {
    key,
    value: 0,
    confidence: 0,
    sources: "Se llenará con lo que registres",
    ...opts,
  };
}

/** A full set with every axis gathering (confidence 0). */
function gatheringSet(): EmotionalMapDimension[] {
  return ALL_KEYS.map((k) => dim(k));
}

describe("MapRadar — honest hexagon (V2)", () => {
  it("shows the empty state when no axis has cleared the floor", () => {
    render(<MapRadar dimensions={gatheringSet()} />);
    expect(
      screen.getByText(/Aún no hay señal para dibujar tu mapa/i),
    ).toBeInTheDocument();
    // No radar image yet, no per-axis rows.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("draws the radar and per-axis rows once at least one axis is ready", () => {
    const dims = gatheringSet().map((d) =>
      d.key === "claridad"
        ? dim("claridad", {
            value: 0.88,
            confidence: 0.7,
            evidence: { modelId: "CHK-S1", n: 5 },
          })
        : d,
    );
    render(<MapRadar dimensions={dims} />);

    // Radar SVG present.
    expect(
      screen.getByRole("img", { name: /radar de tu mapa emocional/i }),
    ).toBeInTheDocument();
    // The ready axis shows its value + provenance, never "medido".
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText(/Tu check-in/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Basado en 5 registros tuyos/i),
    ).toBeInTheDocument();
    // The other five stay honest — gathering.
    expect(
      screen.getAllByText(/Reuniendo datos/i).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("never fabricates a value: a gathering axis has a 0-width progress bar", () => {
    // One ready axis (Calma) so the rows render; the rest stay gathering.
    const dims = gatheringSet().map((d) =>
      d.key === "calma"
        ? dim("calma", {
            value: 0.66,
            confidence: 0.6,
            evidence: { modelId: "OU-GT", n: 30 },
          })
        : d,
    );
    render(<MapRadar dimensions={dims} />);

    const bars = screen.getAllByRole("progressbar");
    // Calma is ready (66), the other five are gathering (0).
    const values = bars.map((b) => b.getAttribute("aria-valuenow"));
    expect(values).toContain("66");
    expect(values.filter((v) => v === "0").length).toBe(5);
  });

  it("maps the evidence model id to an honest source label (not 'medido')", () => {
    const dims = gatheringSet().map((d) => {
      if (d.key === "conexion")
        return dim("conexion", {
          value: 0.5,
          confidence: 0.5,
          evidence: { modelId: "ARC-C1", n: 2 },
        });
      return d;
    });
    render(<MapRadar dimensions={dims} />);
    // Exact match targets the badge, not the lowercase "tus resonancias" in
    // the card subtitle.
    expect(screen.getByText("Tus resonancias")).toBeInTheDocument();
  });

  it("compact mode renders only the radar (no card tag, no rows)", () => {
    const dims = gatheringSet().map((d) =>
      d.key === "claridad"
        ? dim("claridad", { value: 0.8, confidence: 0.6 })
        : d,
    );
    render(<MapRadar dimensions={dims} compact />);
    expect(
      screen.getByRole("img", { name: /radar de tu mapa emocional/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tu mapa de hoy")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
