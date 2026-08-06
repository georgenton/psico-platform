import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ChapterExperiencePublicView,
  ExperienceScenePublicView,
  GuideSessionView,
} from "@psico/types";
import { CompletionSummary } from "./CompletionSummary";
import type { GuideRunFacts } from "../guide/use-guide-run";

/**
 * GR-7 — what a finished experience is allowed to say.
 *
 * The banned list is the point of this file. A percentage, a streak, a
 * sentence about how the reader changed — each would be a claim the app cannot
 * support, and the end of a journey is exactly where such a claim would feel
 * earned. So the assertions are mostly negative, and the positive ones are
 * facts the ledger holds.
 */

const scene = (
  sceneKey: string,
  kind: ExperienceScenePublicView["kind"],
  title: string,
  completesGuideStepKey?: string,
): ExperienceScenePublicView => ({
  sceneKey,
  order: 1,
  kind,
  ...(completesGuideStepKey ? { completesGuideStepKey } : {}),
  payload: { title, body: [] },
});

const EXPERIENCE: ChapterExperiencePublicView = {
  experienceKey: "exp-1",
  experienceVersion: 1,
  title: "El cuerpo, antes que la mente",
  guidePin: { guideKey: "guide-1", guideVersion: 1 },
  scenes: [
    scene("intro", "INTRO", "Antes de empezar"),
    scene("concepto", "CONCEPT", "El cuerpo sabe antes", "explorar"),
    scene("practica", "PRACTICE", "Escucharte por dentro", "practicar"),
    scene("recuerdo", "RECALL", "Recordar lo leído", "recordar"),
    scene("cierre", "SUMMARY", "Hasta aquí"),
  ],
};

const SESSION: GuideSessionView = {
  sessionId: "ses_1",
  guideKey: "guide-1",
  guideVersion: 1,
  status: "COMPLETED",
  stepsCompleted: 3,
  totalSteps: 3,
  currentStepKey: null,
};

const FULL_RUN: GuideRunFacts = {
  confirmedStepKeys: ["explorar", "practicar"],
  recalls: [{ stepKey: "recordar", outcome: "CORRECT" }],
};

const NO_FACTS: GuideRunFacts = { confirmedStepKeys: [], recalls: [] };

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("Completion Summary V2", () => {
  it("shows the experience title and the accepted-step count", () => {
    render(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={FULL_RUN}
        resonanceConfirmed={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: EXPERIENCE.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Registraste 3 de 3 pasos",
    );
  });

  it("lists the checkpoints the reader confirmed, and nothing presentational", () => {
    render(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={FULL_RUN}
        resonanceConfirmed={false}
      />,
    );

    expect(screen.getByText("El cuerpo sabe antes")).toBeInTheDocument();
    expect(screen.getByText("Escucharte por dentro")).toBeInTheDocument();
    // Reading an intro is not an achievement, and counting it would make the
    // honest entries mean less.
    expect(screen.queryByText("Antes de empezar")).toBeNull();
    expect(screen.queryByText("Hasta aquí")).toBeNull();
  });

  it("reports the recall verdict and never the answer", () => {
    render(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={{
          confirmedStepKeys: [],
          recalls: [{ stepKey: "recordar", outcome: "REVIEW" }],
        }}
        resonanceConfirmed={false}
      />,
    );

    expect(screen.getByText("Para repasar")).toBeInTheDocument();
    // «REVIEW» is not «wrong», and the right option is never named.
    expect(screen.queryByText(/incorrecta/i)).toBeNull();
    expect(
      screen.getByTestId("experience-completion-summary").outerHTML,
    ).not.toContain("correctOptionKey");
  });

  it("says nothing it cannot support — no score, no streak, no verdict on the reader", () => {
    const { container } = render(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={FULL_RUN}
        resonanceConfirmed
      />,
    );

    const text = container.textContent ?? "";
    for (const forbidden of [
      "%",
      "puntaje",
      "puntuación",
      "ranking",
      "racha",
      "comprensión",
      "mejoraste",
      "nivel",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("reports a resonance only when the reader confirmed one", () => {
    const { rerender } = render(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={NO_FACTS}
        resonanceConfirmed={false}
      />,
    );
    // «Ahora no» wrote nothing, so there is nothing to report — and the
    // experience still finished.
    expect(screen.queryByText(/resonancia/i)).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={NO_FACTS}
        resonanceConfirmed
      />,
    );
    expect(screen.getByText(/Guardaste una resonancia/)).toBeInTheDocument();
  });

  it("offers another experience ONLY when one was passed", () => {
    const pickAnother = vi.fn();
    const { rerender } = render(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={NO_FACTS}
        resonanceConfirmed={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /otra experiencia/i }),
    ).toBeNull();

    rerender(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={NO_FACTS}
        resonanceConfirmed={false}
        onPickAnother={pickAnother}
      />,
    );
    expect(
      screen.getByRole("button", { name: /otra experiencia/i }),
    ).toBeInTheDocument();
  });

  it("moves focus to the heading and announces the status politely", () => {
    render(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={FULL_RUN}
        resonanceConfirmed={false}
      />,
    );

    const heading = screen.getByRole("heading", { name: EXPERIENCE.title });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("every action is reachable and big enough to hit", async () => {
    const back = vi.fn();
    const read = vi.fn();
    const repeat = vi.fn();
    render(
      <CompletionSummary
        experience={EXPERIENCE}
        session={SESSION}
        facts={NO_FACTS}
        resonanceConfirmed={false}
        onBackToChapter={back}
        onContinueReading={read}
        onRepeat={repeat}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button.style.minHeight).toBe("44px");
    }
    await userEvent.click(
      screen.getByRole("button", { name: "Volver al capítulo" }),
    );
    expect(back).toHaveBeenCalledTimes(1);
    // Repeating is an explicit choice. Reopening a finished experience shows
    // this screen and starts nothing on its own.
    expect(repeat).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Repetir experiencia" }),
    );
    expect(repeat).toHaveBeenCalledTimes(1);
  });
});
