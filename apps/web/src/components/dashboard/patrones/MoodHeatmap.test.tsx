import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PatronesMoodMapDay } from "@psico/types";
import { MoodHeatmap } from "./MoodHeatmap";

function day(
  date: string,
  swatch: string,
  moodId = "calma",
): PatronesMoodMapDay {
  return { date, moodId, swatch } as PatronesMoodMapDay;
}

describe("MoodHeatmap", () => {
  it("renders the empty-state copy when there are no days", () => {
    render(<MoodHeatmap days={[]} />);
    expect(
      screen.getByText(/Necesitas escribir un poco más/i),
    ).toBeInTheDocument();
  });

  it("renders one cell per ISO day between the first and last entry", () => {
    // 5 days, no gaps.
    const days: PatronesMoodMapDay[] = [
      day("2026-06-01", "#A4C6FF"),
      day("2026-06-02", "#FFB4B4"),
      day("2026-06-03", "#A4C6FF"),
      day("2026-06-04", "#A4C6FF"),
      day("2026-06-05", "#FFB4B4"),
    ];
    const { container } = render(<MoodHeatmap days={days} />);
    // Cells live inside the role="img" container (aspect-square divs).
    const grid = container.querySelector('[role="img"]');
    expect(grid).not.toBeNull();
    expect(grid?.children).toHaveLength(5);
  });

  it("fills the gap days with the warm-100 background between known entries", () => {
    // 2 entries with a 3-day gap → grid should render 5 cells total
    // (2026-06-01, 06-02, 06-03, 06-04, 06-05).
    const days: PatronesMoodMapDay[] = [
      day("2026-06-01", "#A4C6FF"),
      day("2026-06-05", "#FFB4B4"),
    ];
    const { container } = render(<MoodHeatmap days={days} />);
    const grid = container.querySelector('[role="img"]');
    expect(grid).not.toBeNull();
    expect(grid?.children).toHaveLength(5);

    // The 3 gap cells use the warm-100 fallback. We assert at least one
    // cell has the fallback opacity (0.6) — the only state where that is
    // the case is a gap.
    const gapCells = Array.from(grid!.children).filter(
      (c) => (c as HTMLElement).style.opacity === "0.6",
    );
    expect(gapCells.length).toBe(3);
  });

  it("exposes the section heading", () => {
    render(<MoodHeatmap days={[day("2026-06-01", "#A4C6FF")]} />);
    expect(screen.getByText(/Mapa emocional/i)).toBeInTheDocument();
  });
});
