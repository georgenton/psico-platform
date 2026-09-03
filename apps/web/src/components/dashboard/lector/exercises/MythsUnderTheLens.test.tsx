import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { chapterExercises, type MythsLensExercise } from "@psico/types";
import {
  MythsUnderTheLens,
  MythsUnderTheLensFallback,
} from "./MythsUnderTheLens";

/**
 * The book's integrative activity.
 *
 * The assertions worth having are the negative ones: no total, no verdict, no
 * text leaving the component. Those are the properties the design committed to
 * and the ones a later refactor could quietly break.
 */

const EXERCISE = chapterExercises("emociones-en-construccion", 1).find(
  (e): e is MythsLensExercise => e.kind === "myths_lens",
)!;

describe("mitos emocionales bajo la lupa", () => {
  it("is activated for EEC-C01 with seven beliefs and five lenses", () => {
    expect(EXERCISE).toBeDefined();
    expect(EXERCISE.beliefs).toHaveLength(7);
    expect(EXERCISE.lenses).toHaveLength(5);
    expect(EXERCISE.lenses.map((l) => l.id)).toEqual([
      "teoria",
      "rostro",
      "alarma",
      "decision",
      "construccion",
    ]);
  });

  it("rates a belief without ever showing a total", async () => {
    const user = userEvent.setup();
    render(<MythsUnderTheLens exercise={EXERCISE} onClose={() => {}} />);
    const first = EXERCISE.beliefs[0];
    const three = screen.getByRole("button", {
      name: `${first.text} — 3 de 5`,
    });
    await user.click(three);
    expect(three).toHaveAttribute("aria-pressed", "true");
    // Seven ratings could be summed; a sum would look like a score of how
    // wrong somebody's beliefs are. Nothing adds them.
    expect(screen.queryByText(/total/i)).toBeNull();
    expect(
      screen.queryByText(/puntaje|puntuación total|resultado/i),
    ).toBeNull();
  });

  it("shows the five lenses only once a belief is chosen", async () => {
    const user = userEvent.setup();
    render(<MythsUnderTheLens exercise={EXERCISE} onClose={() => {}} />);
    expect(screen.queryByTestId("myths-lens-review")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: EXERCISE.beliefs[1].text }),
    );
    expect(screen.getByTestId("myths-lens-review")).toBeInTheDocument();
    for (const lens of EXERCISE.lenses) {
      expect(screen.getByText(lens.label)).toBeInTheDocument();
    }
  });

  it("keeps the rewrite and the question on the device", async () => {
    const user = userEvent.setup();
    render(<MythsUnderTheLens exercise={EXERCISE} onClose={() => {}} />);
    await user.click(
      screen.getByRole("button", { name: EXERCISE.beliefs[0].text }),
    );
    const boxes = screen.getAllByRole("textbox");
    await user.type(boxes[0], "mi versión con matices");
    expect(boxes[0]).toHaveValue("mi versión con matices");
    expect(screen.getByText(/se queda en tu dispositivo/i)).toBeInTheDocument();
  });

  it("hands the reader to the encrypted diary only as an explicit act", async () => {
    const user = userEvent.setup();
    const onKeepInDiary = vi.fn();
    render(
      <MythsUnderTheLens
        exercise={EXERCISE}
        onClose={() => {}}
        onKeepInDiary={onKeepInDiary}
      />,
    );
    // Not offered before there is anything to keep.
    expect(screen.queryByText(/Guardarlo en mi diario/)).toBeNull();
    await user.click(
      screen.getByRole("button", { name: EXERCISE.beliefs[2].text }),
    );
    await user.click(screen.getByText(/Guardarlo en mi diario/));
    expect(onKeepInDiary).toHaveBeenCalledOnce();
    // What travels is the PROMPT, never what the reader wrote.
    const [prompt] = onKeepInDiary.mock.calls[0] as [string];
    expect(prompt).toContain(EXERCISE.beliefs[2].text);
  });

  it("can be closed at any step — nothing has to be finished", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MythsUnderTheLens exercise={EXERCISE} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("never scores an answer", async () => {
    const user = userEvent.setup();
    render(<MythsUnderTheLens exercise={EXERCISE} onClose={() => {}} />);
    await user.click(
      screen.getByRole("button", { name: EXERCISE.beliefs[3].text }),
    );
    for (const word of [
      /correcto/i,
      /incorrecto/i,
      /acertaste/i,
      /bien hecho/i,
    ]) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  it("has a text version that still describes the whole activity", () => {
    render(<MythsUnderTheLensFallback exercise={EXERCISE} />);
    const steps = screen.getByTestId("myths-lens-fallback");
    expect(steps.querySelectorAll("li")).toHaveLength(5);
    expect(steps).toHaveTextContent(/cinco lentes/i);
  });
});
