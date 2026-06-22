import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EmotionalMapResult } from "@psico/types";
import { EvoChart } from "./EvoChart";

function map(overrides: Partial<EmotionalMapResult> = {}): EmotionalMapResult {
  return {
    values: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    pct: 74,
    computedAt: "2026-06-21T14:00:00Z",
    provider: "anthropic",
    ...overrides,
  };
}

describe("EvoChart", () => {
  it("renders the percent label as the headline number", () => {
    render(<EvoChart map={map()} />);
    expect(screen.getByText("74%")).toBeInTheDocument();
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

  it("computes a lower y coordinate for a higher pct (chart bounds 50..190)", () => {
    const { container: low } = render(<EvoChart map={map({ pct: 10 })} />);
    const lowY = Number(
      low.querySelector("circle.ec-dot.last")?.getAttribute("cy"),
    );

    const { container: high } = render(<EvoChart map={map({ pct: 90 })} />);
    const highY = Number(
      high.querySelector("circle.ec-dot.last")?.getAttribute("cy"),
    );

    // y axis is inverted (smaller y = higher on screen); higher pct → smaller y.
    expect(highY).toBeLessThan(lowY);
  });

  it("renders the placeholder copy explaining the chart fills in over time", () => {
    render(<EvoChart map={map()} />);
    expect(screen.getByText(/Cuando acumules más meses/i)).toBeInTheDocument();
  });
});
