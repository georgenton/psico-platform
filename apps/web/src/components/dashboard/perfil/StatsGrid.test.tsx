import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UserStats } from "@psico/types";
import { StatsGrid } from "./StatsGrid";

function buildStats(overrides: Partial<UserStats> = {}): UserStats {
  return {
    daysActive: 0,
    booksCompleted: 0,
    chaptersRead: 0,
    diaryEntries: 0,
    minutesTotal: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
<<<<<<< HEAD
=======
    entriesThisWeek: 0,
>>>>>>> origin/main
    ...overrides,
  };
}

describe("StatsGrid", () => {
  it("renders 4 stat cards with zero values for a new user", () => {
    render(<StatsGrid stats={buildStats()} />);
    expect(screen.getByTestId("stat-Racha actual")).toBeInTheDocument();
    expect(screen.getByTestId("stat-Libros completados")).toBeInTheDocument();
    expect(screen.getByTestId("stat-Entradas del diario")).toBeInTheDocument();
    expect(screen.getByTestId("stat-Minutos en la app")).toBeInTheDocument();
  });

  it("formats the streak with the correct day/days unit", () => {
    const { rerender } = render(
      <StatsGrid stats={buildStats({ currentStreakDays: 1 })} />,
    );
    expect(screen.getByTestId("stat-Racha actual")).toHaveTextContent("día");

    rerender(<StatsGrid stats={buildStats({ currentStreakDays: 5 })} />);
    expect(screen.getByTestId("stat-Racha actual")).toHaveTextContent("días");
  });

  it("shows the longest streak footnote when > 0", () => {
    render(<StatsGrid stats={buildStats({ longestStreakDays: 12 })} />);
    expect(screen.getByText(/Mejor racha histórica/i)).toHaveTextContent("12");
  });

  it("hides the longest streak footnote when 0", () => {
    render(<StatsGrid stats={buildStats({ longestStreakDays: 0 })} />);
    expect(
      screen.queryByText(/Mejor racha histórica/i),
    ).not.toBeInTheDocument();
  });
});
