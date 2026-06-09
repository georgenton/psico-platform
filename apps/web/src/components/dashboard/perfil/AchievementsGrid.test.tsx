import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AchievementProgress } from "@psico/types";
import { AchievementsGrid } from "./AchievementsGrid";

function build(
  overrides: Partial<AchievementProgress> = {},
): AchievementProgress {
  return {
    id: "ach-1",
    label: "Primer paso",
    description: "Escribí tu primera entrada del diario",
    icon: "📝",
    progressCurrent: 0,
    progressTarget: 1,
    unlockedAt: null,
    ...overrides,
  };
}

describe("AchievementsGrid", () => {
  it("renders an empty state when the user has no achievements yet", () => {
    render(<AchievementsGrid achievements={[]} />);
    expect(screen.getByTestId("achievements-empty")).toBeInTheDocument();
    expect(screen.getByText(/mostraremos acá tus logros/i)).toBeInTheDocument();
  });

  it("renders each achievement card with its label", () => {
    render(
      <AchievementsGrid
        achievements={[
          build({ id: "a1", label: "Libro 1" }),
          build({ id: "a2", label: "Diario 7 días" }),
        ]}
      />,
    );
    expect(screen.getByText("Libro 1")).toBeInTheDocument();
    expect(screen.getByText("Diario 7 días")).toBeInTheDocument();
  });

  it("shows progress bar with 0/N for locked achievements", () => {
    render(
      <AchievementsGrid
        achievements={[
          build({ progressCurrent: 3, progressTarget: 10, unlockedAt: null }),
        ]}
      />,
    );
    expect(screen.getByText("3/10")).toBeInTheDocument();
  });

  it("hides progress when unlocked", () => {
    render(
      <AchievementsGrid
        achievements={[
          build({
            progressCurrent: 1,
            progressTarget: 1,
            unlockedAt: new Date("2026-06-01"),
          }),
        ]}
      />,
    );
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
  });
});
