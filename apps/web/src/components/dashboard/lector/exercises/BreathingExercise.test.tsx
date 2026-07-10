import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BreatheExercise } from "@psico/types";
import { BreathingExercise } from "./BreathingExercise";

/**
 * Tests for the paced breathing overlay + its post-exercise nudge (backlog).
 *
 * The exercise runs a timed inhale → hold → exhale cycle. We use fake timers to
 * fast-forward to the "done" phase and assert the two nudge CTAs appear and fire
 * onReflect / onAskEco (each after closing the overlay).
 */
const EXERCISE: BreatheExercise = {
  id: "test-breathe",
  kind: "breathe",
  title: "Respira antes de seguir",
  description: "Un minuto de calma.",
  cycles: 1,
  inhaleSec: 1,
  holdSec: 1,
  exhaleSec: 1,
};

describe("BreathingExercise", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function runToDone() {
    // inhale → hold → exhale → done: 3 phases × 1s each.
    act(() => {
      vi.advanceTimersByTime(3100);
    });
  }

  it("shows the guided ritual before finishing", () => {
    render(<BreathingExercise exercise={EXERCISE} onClose={vi.fn()} />);
    expect(screen.getByText("Sigue el ritmo del círculo.")).toBeInTheDocument();
    expect(screen.getByText("Salir")).toBeInTheDocument();
  });

  it("renders the two nudge CTAs once finished", () => {
    render(
      <BreathingExercise
        exercise={EXERCISE}
        onClose={vi.fn()}
        onReflect={vi.fn()}
        onAskEco={vi.fn()}
      />,
    );
    runToDone();
    expect(screen.getByText("Terminar")).toBeInTheDocument();
    expect(screen.getByText("🪷 Escribir cómo me siento")).toBeInTheDocument();
    expect(screen.getByText("🌿 Conversar con Eco")).toBeInTheDocument();
  });

  it("closes then invites to reflect when tapping the reflect CTA", () => {
    const onClose = vi.fn();
    const onReflect = vi.fn();
    render(
      <BreathingExercise
        exercise={EXERCISE}
        onClose={onClose}
        onReflect={onReflect}
      />,
    );
    runToDone();
    fireEvent.click(screen.getByText("🪷 Escribir cómo me siento"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReflect).toHaveBeenCalledTimes(1);
  });

  it("closes then invites to Eco when tapping the Eco CTA", () => {
    const onClose = vi.fn();
    const onAskEco = vi.fn();
    render(
      <BreathingExercise
        exercise={EXERCISE}
        onClose={onClose}
        onAskEco={onAskEco}
      />,
    );
    runToDone();
    fireEvent.click(screen.getByText("🌿 Conversar con Eco"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAskEco).toHaveBeenCalledTimes(1);
  });

  it("omits the nudge row when no nudge callbacks are given", () => {
    render(<BreathingExercise exercise={EXERCISE} onClose={vi.fn()} />);
    runToDone();
    expect(screen.getByText("Terminar")).toBeInTheDocument();
    expect(screen.queryByText("🌿 Conversar con Eco")).not.toBeInTheDocument();
  });
});
