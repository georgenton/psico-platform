import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapDims } from "./MapDims";

const ZERO = [0, 0, 0, 0, 0, 0] as const;

describe("MapDims", () => {
  it("renders all 6 axis names in fixed order", () => {
    render(<MapDims values={ZERO} />);
    const order = [
      "Calma",
      "Claridad",
      "Conexión",
      "Propósito",
      "Compasión",
      "Consciencia",
    ];
    for (const label of order) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders each axis as a percentage of the 0..1 input", () => {
    render(<MapDims values={[0.5, 0.74, 0.18, 0.6, 0.42, 0.91]} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
    expect(screen.getByText("18%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("exposes each bar as a progressbar with aria values", () => {
    render(<MapDims values={[0.5, 0.5, 0.5, 0.5, 0.5, 0.5]} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBe(6);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-valuenow")).toBe("50");
      expect(bar.getAttribute("aria-valuemin")).toBe("0");
      expect(bar.getAttribute("aria-valuemax")).toBe("100");
    }
  });
});
