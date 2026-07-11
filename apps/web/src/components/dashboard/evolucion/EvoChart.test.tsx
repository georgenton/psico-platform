import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EmotionalMapResult } from "@psico/types";
import { EvoChart } from "./EvoChart";

function map(overrides: Partial<EmotionalMapResult> = {}): EmotionalMapResult {
  return {
    values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    confidence: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
    dimensions: [],
    pct: 74,
    coverage: 0.6,
    computedAt: "2026-06-21T14:00:00Z",
    provider: "anthropic",
    ...overrides,
  };
}

describe("EvoChart", () => {
  it("renders the coverage percent as the headline number (Fase G)", () => {
    render(<EvoChart map={map()} />);
    // coverage 0.6 → 60% — the chart plots signal availability, never pct.
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Cobertura de tu mapa")).toBeInTheDocument();
    expect(screen.queryByText("74%")).not.toBeInTheDocument();
  });

  it("renders the snapshot SVG with the dot at the right edge", () => {
    const { container } = render(<EvoChart map={map()} />);
    const svg = container.querySelector("svg[role='img']");
    expect(svg).not.toBeNull();
    // single point at x=600 (right edge of 640 viewBox).
    const dot = svg?.querySelector("circle.ec-dot.last");
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("cx")).toBe("600");
  });

  it("computes a lower y coordinate for a higher coverage (chart bounds 50..190)", () => {
    const { container: low } = render(
      <EvoChart map={map({ coverage: 0.1 })} />,
    );
    const lowY = Number(
      low.querySelector("circle.ec-dot.last")?.getAttribute("cy"),
    );

    const { container: high } = render(
      <EvoChart map={map({ coverage: 0.9 })} />,
    );
    const highY = Number(
      high.querySelector("circle.ec-dot.last")?.getAttribute("cy"),
    );

    // y axis is inverted (smaller y = higher on screen); more coverage → smaller y.
    expect(highY).toBeLessThan(lowY);
  });

  it("charts only the points that carry coverage and skips pre-Fase-G rows", () => {
    render(
      <EvoChart
        map={map()}
        series={[
          { monthIso: "2026-04-01", pct: 40, coverage: null },
          { monthIso: "2026-05-01", pct: 55, coverage: 35 },
          { monthIso: "2026-06-01", pct: 70, coverage: 52 },
        ]}
      />,
    );
    // Headline = last coverage point; the legacy pct values never render.
    expect(screen.getByText("52%")).toBeInTheDocument();
    expect(screen.getByText(/\+17 pts en 2 meses/)).toBeInTheDocument();
    expect(screen.queryByText("70%")).not.toBeInTheDocument();
    expect(
      screen.getByText(/cuánta información tienes, no cómo estás/i),
    ).toBeInTheDocument();
  });

  it("renders the placeholder copy explaining the chart fills in over time", () => {
    render(<EvoChart map={map()} />);
    expect(screen.getByText(/Cuando acumules más meses/i)).toBeInTheDocument();
  });
});
