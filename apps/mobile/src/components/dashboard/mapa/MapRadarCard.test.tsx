import { render, screen } from "@testing-library/react-native";
import type {
  EmotionalMapDimension,
  EmotionalMapDimensionKey,
} from "@psico/types";

import { MapRadarCard } from "./MapRadarCard";

/**
 * MapRadarCard — honest hexagonal radar (mobile).
 *
 * Same V2 invariants as the web twin: a fabricated value never appears. An axis
 * reaches its value only when confidence clears the floor; below it the axis
 * shows "Reuniendo datos". No global percentage.
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

function gatheringSet(): EmotionalMapDimension[] {
  return ALL_KEYS.map((k) => dim(k));
}

describe("MapRadarCard — honest hexagon (mobile, V2)", () => {
  it("shows the empty state when no axis has cleared the floor", () => {
    render(<MapRadarCard dimensions={gatheringSet()} />);
    expect(
      screen.getByText(/Aún no hay señal para dibujar tu mapa/i),
    ).toBeTruthy();
    expect(screen.queryByText("Tu mapa de hoy")).toBeTruthy();
    // No per-axis rows yet.
    expect(screen.queryByText(/Reuniendo datos —/)).toBeNull();
  });

  it("renders per-axis rows once at least one axis is ready", () => {
    const dims = gatheringSet().map((d) =>
      d.key === "claridad"
        ? dim("claridad", {
            value: 0.88,
            confidence: 0.7,
            evidence: { modelId: "CHK-S1", n: 5 },
          })
        : d,
    );
    render(<MapRadarCard dimensions={dims} />);

    // The ready axis shows its value + provenance, never "medido".
    expect(screen.getByText("88%")).toBeTruthy();
    expect(screen.getByText("Tu check-in")).toBeTruthy();
    expect(screen.getByText(/Basado en 5 registros tuyos/i)).toBeTruthy();
    // The other five stay honest — gathering (chips).
    expect(
      screen.getAllByText("Reuniendo datos").length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("maps the evidence model id to an honest source label (not 'medido')", () => {
    const dims = gatheringSet().map((d) =>
      d.key === "conexion"
        ? dim("conexion", {
            value: 0.5,
            confidence: 0.5,
            evidence: { modelId: "ARC-C1", n: 2 },
          })
        : d,
    );
    render(<MapRadarCard dimensions={dims} />);
    // Exact match targets the badge, not the subtitle's "tus resonancias".
    expect(screen.getByText("Tus resonancias")).toBeTruthy();
  });

  it("maps the mood model id (OU) to 'Tu ánimo'", () => {
    const dims = gatheringSet().map((d) =>
      d.key === "calma"
        ? dim("calma", {
            value: 0.72,
            confidence: 0.6,
            evidence: { modelId: "OU-GT", n: 71 },
          })
        : d,
    );
    render(<MapRadarCard dimensions={dims} />);
    expect(screen.getByText("Tu ánimo")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
  });
});
