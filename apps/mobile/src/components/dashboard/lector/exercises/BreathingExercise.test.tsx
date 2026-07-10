import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { BreatheExercise } from "@psico/types";
import { BreathingExercise } from "./BreathingExercise";

/**
 * Tests for the mobile breathing overlay + its post-exercise nudge (backlog).
 *
 * Uses fake timers to fast-forward through the inhale → hold → exhale cycle to
 * the "done" phase, then asserts the two nudge CTAs appear and fire
 * onReflect / onAskEco after closing the overlay.
 *
 * RN's Modal renders its children inline in RNTL, so no Modal stub is needed.
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

function runToDone() {
  // inhale → hold → exhale → done: 3 phases × 1s.
  act(() => {
    jest.advanceTimersByTime(3100);
  });
}

describe("BreathingExercise (mobile)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    // clearAllTimers (not runOnlyPendingTimers) so the Animated loop doesn't
    // fire a native-driver update after unmount and spam the console.
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("shows the guided ritual before finishing", () => {
    render(<BreathingExercise exercise={EXERCISE} onClose={() => undefined} />);
    expect(screen.getByText("Sigue el ritmo del círculo.")).toBeOnTheScreen();
    expect(screen.getByText("Salir")).toBeOnTheScreen();
  });

  it("renders the two nudge CTAs once finished", () => {
    render(
      <BreathingExercise
        exercise={EXERCISE}
        onClose={() => undefined}
        onReflect={() => undefined}
        onAskEco={() => undefined}
      />,
    );
    runToDone();
    expect(screen.getByText("Terminar")).toBeOnTheScreen();
    expect(screen.getByText("🪷 Escribir cómo me siento")).toBeOnTheScreen();
    expect(screen.getByText("🌿 Conversar con Eco")).toBeOnTheScreen();
  });

  it("closes then invites to reflect when tapping the reflect CTA", () => {
    const onClose = jest.fn();
    const onReflect = jest.fn();
    render(
      <BreathingExercise
        exercise={EXERCISE}
        onClose={onClose}
        onReflect={onReflect}
      />,
    );
    runToDone();
    fireEvent.press(screen.getByText("🪷 Escribir cómo me siento"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReflect).toHaveBeenCalledTimes(1);
  });

  it("closes then invites to Eco when tapping the Eco CTA", () => {
    const onClose = jest.fn();
    const onAskEco = jest.fn();
    render(
      <BreathingExercise
        exercise={EXERCISE}
        onClose={onClose}
        onAskEco={onAskEco}
      />,
    );
    runToDone();
    fireEvent.press(screen.getByText("🌿 Conversar con Eco"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAskEco).toHaveBeenCalledTimes(1);
  });

  it("omits the nudge row when no nudge callbacks are given", () => {
    render(<BreathingExercise exercise={EXERCISE} onClose={() => undefined} />);
    runToDone();
    expect(screen.getByText("Terminar")).toBeOnTheScreen();
    expect(screen.queryByText("🌿 Conversar con Eco")).toBeNull();
  });
});
