import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EmotionalMapResult } from "@psico/types";

import { EvolucionEmotionalSection } from "./EmotionalSection";

// EvoChart only reads `map.coverage`; the rest is cast away.
const map = {
  coverage: 0.6,
  pct: 60,
  computedAt: "2026-06-21T12:00:00Z",
  provider: "anthropic",
  values: [],
  confidence: [],
  dimensions: [],
} as unknown as EmotionalMapResult;

describe("EvolucionEmotionalSection (PR-0.2)", () => {
  it("emotionalMapAvailable=false → maintenance note, and does NOT render EvoChart", () => {
    render(
      <EvolucionEmotionalSection
        emotionalMapAvailable={false}
        map={null}
        series={null}
      />,
    );
    expect(screen.getByText(/en pausa por mantenimiento/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Tus registros siguen guardados/i),
    ).toBeInTheDocument();
    // EvoChart renders an aria-labelled <svg role="img">. It must be absent when
    // the kill switch is off — never a chart, never a fabricated value.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("available + map present → renders the EvoChart (svg)", () => {
    render(
      <EvolucionEmotionalSection
        emotionalMapAvailable={true}
        map={map}
        series={[]}
      />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(
      screen.queryByText(/en pausa por mantenimiento/i),
    ).not.toBeInTheDocument();
  });

  it("available + map null → snapshot-not-loaded, never says 'Comprensión emocional'", () => {
    render(
      <EvolucionEmotionalSection
        emotionalMapAvailable={true}
        map={null}
        series={null}
      />,
    );
    expect(
      screen.getByText(/No pudimos cargar tu snapshot actual/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Cobertura de tu mapa/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Comprensión emocional/i),
    ).not.toBeInTheDocument();
  });
});
