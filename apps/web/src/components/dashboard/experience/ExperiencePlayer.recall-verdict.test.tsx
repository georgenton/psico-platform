import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuideSessionView } from "@psico/types";

/**
 * GR-6 — the one graded panel has to answer back.
 *
 * This file exists because it did not. The server accepts the recall step and
 * clears `currentStepKey` in the SAME response, so the presentation opened the
 * window after the last checkpoint and clamped the cursor forward: the question
 * was replaced by the closing panel. `RecallScene`'s verdict branch — heading,
 * approved sentence, «Continuar» — was unreachable in the live flow.
 *
 * Measured on staging before the fix, at 120 ms resolution: `scene-recall` →
 * `scene-summary` in 365 ms, twice, on two different microguides, with no
 * verdict in between. A reader answered a question about the chapter and the
 * product said nothing.
 *
 * Both directions are pinned here. The verdict appears INSTEAD of the close,
 * and dismissing it lands on the close WITHOUT ending the run — because the
 * close is what sends SESSION_COMPLETE (see `ExperiencePlayer.completion`), and
 * a dismissal that finished the session would skip the editorial ending.
 */

const { run } = vi.hoisted(() => ({ run: { current: null as unknown } }));

vi.mock("../guide/use-guide-run", () => ({
  useGuideRun: () => run.current,
}));

import { ExperiencePlayer } from "./ExperiencePlayer";
import { EEC_BUNDLE, EEC_EXPERIENCE } from "../guide/guide-test-fixtures";

const SCOPE = "S".repeat(43);
const RECALL_STEP = "recordar-cuerpo-antes-que-mente";

const finish = vi.fn();
const submitRecall = vi.fn();

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

/**
 * The run as the hook reports it. `recallOutcome` and `recallMessage` are the
 * server's: the browser never grades, so a test that invented a verdict of its
 * own would be testing nothing the product does.
 */
function runOf(
  session: GuideSessionView,
  verdict: { outcome: "CORRECT" | "INCORRECT"; message: string } | null = null,
) {
  return {
    screen: session.currentStepKey === null ? "finish" : "step",
    session,
    step: null,
    error: null,
    retry: null,
    busy: false,
    booting: false,
    recallOutcome: verdict?.outcome ?? null,
    recallMessage: verdict?.message ?? null,
    recoverable: null,
    facts: { confirmedStepKeys: [], recalls: [] },
    serverSummary: null,
    choice: null,
    setChoice: vi.fn(),
    start: vi.fn(() => Promise.resolve()),
    adopt: vi.fn(),
    completeStep: vi.fn(),
    submitRecall,
    finish,
    cancel: vi.fn(),
    retryPending: vi.fn(),
    restart: vi.fn(),
  };
}

const APROBADA =
  "Exacto. El capítulo plantea que el cuerpo responde antes de la explicación.";

function player() {
  return (
    <ExperiencePlayer
      actorScope={SCOPE}
      definition={EEC_EXPERIENCE}
      bundle={EEC_BUNDLE}
    />
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  finish.mockClear();
  submitRecall.mockClear();
});

describe("ExperiencePlayer — the recall verdict", () => {
  it("shows the server's verdict in place of the question, and holds the close until it is read", async () => {
    // The server is waiting for the recall: that is the panel on screen.
    run.current = runOf(sessionOf(RECALL_STEP, 2));
    const { rerender } = render(player());
    expect(screen.getByTestId("scene-recall")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("radio", { name: /El cuerpo primero/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );
    expect(submitRecall).toHaveBeenCalledWith(
      RECALL_STEP,
      "opcion-cuerpo-primero",
    );

    // What the server sends back: the step accepted, the cursor cleared, and a
    // verdict. This is exactly the shape that used to skip the panel.
    run.current = runOf(sessionOf(null, 3), {
      outcome: "CORRECT",
      message: APROBADA,
    });
    rerender(player());

    expect(screen.getByTestId("scene-recall-feedback")).toBeInTheDocument();
    expect(screen.getByText(APROBADA)).toBeInTheDocument();
    expect(screen.getByText("Correcto")).toBeInTheDocument();
    // The close is NOT on screen yet — this is the regression.
    expect(screen.queryByTestId("scene-summary")).not.toBeInTheDocument();

    // Dismissing reveals the close. It does not end the run: the close does.
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByTestId("scene-summary")).toBeInTheDocument();
    expect(finish).not.toHaveBeenCalled();
  });

  it("says «Vale la pena repasarlo» without grading it itself", async () => {
    // The wrong answer is not a failure state, and the words are the server's.
    // The panel has no catalog, so it could not editorialise this even if it
    // wanted to — which is why the message is asserted verbatim.
    const REPASO =
      "El capítulo lo plantea distinto. Puedes releer el pasaje cuando quieras.";
    run.current = runOf(sessionOf(RECALL_STEP, 2));
    const { rerender } = render(player());

    await userEvent.click(
      screen.getByRole("radio", { name: /La mente primero/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );

    run.current = runOf(sessionOf(null, 3), {
      outcome: "INCORRECT",
      message: REPASO,
    });
    rerender(player());

    expect(screen.getByText("Vale la pena repasarlo")).toBeInTheDocument();
    expect(screen.getByText(REPASO)).toBeInTheDocument();
  });

  it("does not re-open the question when a verdict arrives without an answer", () => {
    // A replayed command returns the SAME verdict, read back from the ledger
    // rather than graded twice (`use-guide-run`), and a resync re-reads the
    // session. Both land a non-null verdict on a run that is already closed,
    // with the SAME session id — so the per-session reset cannot help here.
    //
    // Only the ref that records WHERE an answer was given tells those apart
    // from an answer. Without it, a reader sitting on the close would watch the
    // question reappear over it because something was re-read.
    run.current = runOf(sessionOf(null, 3));
    const { rerender } = render(player());
    expect(screen.getByTestId("scene-summary")).toBeInTheDocument();

    run.current = runOf(sessionOf(null, 3), {
      outcome: "CORRECT",
      message: APROBADA,
    });
    rerender(player());

    expect(screen.getByTestId("scene-summary")).toBeInTheDocument();
    expect(
      screen.queryByTestId("scene-recall-feedback"),
    ).not.toBeInTheDocument();
  });
});
