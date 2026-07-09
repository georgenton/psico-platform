import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EmotionalMapDimension } from "@psico/types";
import { MapDims } from "./MapDims";

function dim(
  key: EmotionalMapDimension["key"],
  value: number,
  confidence: number,
): EmotionalMapDimension {
  return { key, value, confidence, sources: `fuente de ${key}` };
}

const ALL_UNCOVERED: EmotionalMapDimension[] = [
  dim("calma", 0, 0),
  dim("claridad", 0, 0),
  dim("conexion", 0, 0),
  dim("proposito", 0, 0),
  dim("compasion", 0, 0),
  dim("consciencia", 0, 0),
];

describe("MapDims", () => {
  it("renders all 6 axis names in fixed order", () => {
    render(<MapDims dimensions={ALL_UNCOVERED} />);
    for (const label of [
      "Calma",
      "Claridad",
      "Conexión",
      "Propósito",
      "Compasión",
      "Consciencia",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows 'Reuniendo datos' for axes below the confidence floor", () => {
    render(<MapDims dimensions={ALL_UNCOVERED} />);
    expect(screen.getAllByText("Reuniendo datos")).toHaveLength(6);
    // No fabricated percentages when there's no signal.
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("renders the percentage for covered axes and 'Reuniendo datos' for the rest", () => {
    render(
      <MapDims
        dimensions={[
          dim("calma", 0.5, 0.6),
          dim("claridad", 0.74, 0.5),
          dim("conexion", 0.18, 0.1), // uncovered
          dim("proposito", 0.6, 0.5),
          dim("compasion", 0, 0.05), // uncovered
          dim("consciencia", 0.91, 0.8),
        ]}
      />,
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    // The two low-confidence axes are gathering, not shown as 18% / 0%.
    expect(screen.getAllByText("Reuniendo datos")).toHaveLength(2);
  });

  it("exposes each bar as a progressbar with aria values", () => {
    render(
      <MapDims
        dimensions={[
          dim("calma", 0.5, 0.6),
          dim("claridad", 0.5, 0.6),
          dim("conexion", 0.5, 0.6),
          dim("proposito", 0.5, 0.6),
          dim("compasion", 0.5, 0.6),
          dim("consciencia", 0.5, 0.6),
        ]}
      />,
    );
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBe(6);
    for (const bar of bars) {
      expect(bar.getAttribute("aria-valuenow")).toBe("50");
      expect(bar.getAttribute("aria-valuemin")).toBe("0");
      expect(bar.getAttribute("aria-valuemax")).toBe("100");
    }
  });

  it("shows the source hint for each axis", () => {
    render(<MapDims dimensions={ALL_UNCOVERED} />);
    expect(screen.getByText("fuente de calma")).toBeInTheDocument();
    expect(screen.getByText("fuente de consciencia")).toBeInTheDocument();
  });
});
