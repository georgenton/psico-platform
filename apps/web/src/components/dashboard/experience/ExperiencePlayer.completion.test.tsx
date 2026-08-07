import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuideSessionView } from "@psico/types";

/**
 * GR-7 — the closing scene is what ENDS the run.
 *
 * The scenes after the last checkpoint are the close: a summary, sometimes an
 * optional resonance. Nothing else is left to press, so their forward action is
 * the only thing that can send SESSION_COMPLETE.
 *
 * This file exists because it did not. With every checkpoint registered the
 * player derived `awaiting_guide_completion`, which no branch handled, so the
 * close rendered as an ordinary scene whose «Continuar» hit the `activeIndex + 1
 * > windowEndIndex` guard and returned. `finish` had no call site anywhere in
 * the app: the session stayed ACTIVE forever, the Completion Summary was
 * unreachable, and the chapter card never stopped saying «Continuar».
 *
 * The strong form of the claim is BOTH directions — the close finishes, and a
 * scene that is merely presentational does not.
 */

const { run } = vi.hoisted(() => ({ run: { current: null as unknown } }));

vi.mock("../guide/use-guide-run", () => ({
  useGuideRun: () => run.current,
}));

import { ExperiencePlayer } from "./ExperiencePlayer";
import {
  EEC_BUNDLE,
  EEC_EXPERIENCE,
  PQP_BUNDLE,
  PQP_EXPERIENCE,
} from "../guide/guide-test-fixtures";

const SCOPE = "S".repeat(43);

const finish = vi.fn();
const completeStep = vi.fn();
const confirmResonance = vi.fn(() => Promise.resolve());

/** A session the server reports, with the cursor wherever the test needs it. */
function sessionOf(
  currentStepKey: string | null,
  stepsCompleted: number,
): GuideSessionView {
  return {
    sessionId: "ses_1",
    guideKey: "eec-c1-cuerpo-antes-que-mente",
    guideVersion: 1,
    status: "ACTIVE",
    stepsCompleted,
    totalSteps: 3,
    currentStepKey,
  };
}

function runOf(session: GuideSessionView) {
  return {
    screen: session.currentStepKey === null ? "finish" : "step",
    session,
    step: null,
    error: null,
    retry: null,
    busy: false,
    booting: false,
    recallOutcome: null,
    recoverable: null,
    facts: { confirmedStepKeys: [], recalls: [] },
    serverSummary: null,
    choice: null,
    setChoice: vi.fn(),
    start: vi.fn(() => Promise.resolve()),
    adopt: vi.fn(),
    completeStep,
    submitRecall: vi.fn(),
    finish,
    cancel: vi.fn(),
    retryPending: vi.fn(),
    restart: vi.fn(),
  };
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  finish.mockClear();
  completeStep.mockClear();
  confirmResonance.mockClear();
});

describe("ExperiencePlayer — ending a run", () => {
  it("completes the session from the closing summary, which is the only control left", async () => {
    // Every checkpoint accepted: the server's cursor is null and the counts agree.
    run.current = runOf(sessionOf(null, 3));

    render(
      <ExperiencePlayer
        actorScope={SCOPE}
        definition={EEC_EXPERIENCE}
        bundle={EEC_BUNDLE}
      />,
    );

    // The close is on screen, and it is the LAST scene: there is nowhere
    // forward to go, so this press must mean "end the run".
    expect(screen.getByTestId("scene-summary")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("ends the run from the resonance close even when the reader declines to save one", async () => {
    // «Ahora no» shares the forward handler with «Continuar». Declining a
    // resonance must still end the journey — and must not write one.
    run.current = runOf(sessionOf(null, 3));

    render(
      <ExperiencePlayer
        actorScope={SCOPE}
        definition={PQP_EXPERIENCE}
        bundle={PQP_BUNDLE}
        onConfirmResonance={confirmResonance}
      />,
    );

    // The close of PQP is summary → resonance; step forward onto the last one.
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByTestId("scene-resonance")).toBeInTheDocument();
    expect(finish).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));

    expect(finish).toHaveBeenCalledTimes(1);
    // An absent yes is not a no worth recording.
    expect(confirmResonance).not.toHaveBeenCalled();
  });

  it("does not complete the run from a scene that is merely presentational", async () => {
    // A checkpoint is still open, so «Continuar» is navigation and nothing else.
    run.current = runOf(sessionOf("explorar-cuerpo-antes-que-mente", 0));

    render(
      <ExperiencePlayer
        actorScope={SCOPE}
        definition={EEC_EXPERIENCE}
        bundle={EEC_BUNDLE}
      />,
    );

    expect(screen.getByTestId("scene-intro")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(finish).not.toHaveBeenCalled();
    expect(completeStep).not.toHaveBeenCalled();
  });
});
