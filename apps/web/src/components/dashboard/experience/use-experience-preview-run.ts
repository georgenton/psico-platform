"use client";

/**
 * CMS V1 (#637) — a `GuideRun` that never leaves the browser.
 *
 * `useGuideRun` stays exactly what it is: the reader's server-owned runtime. It
 * gains no preview mode, no `enabled` flag and no fake transport, because a
 * runtime that can be told not to be real is a runtime whose realness has to be
 * checked at every call site.
 *
 * This is the other option: satisfy the same closed interface from memory. The
 * surface cannot tell the difference, which is the point — an editor previews
 * the twelve real renderers, not a drawing of them.
 *
 * Two things it deliberately refuses to do:
 *
 *   - it never issues a request, of any method, to anything;
 *   - it never grades a recall. `CORRECT` / `REVIEW` is a verdict the server
 *     owns, computed from a `correctOptionKey` that never reaches a browser.
 *     Inventing one here would put a confident wrong answer in front of the
 *     person whose job is to trust this screen, so the preview advances and
 *     shows no feedback at all.
 */

import { useCallback, useMemo, useState } from "react";
import type { GuideSessionView } from "@psico/types";
import type { GuideRun } from "../guide/use-guide-run";
import type { GuidePresentation } from "../guide/guide-presentation";

const PREVIEW_SESSION_ID = "preview";

interface PreviewState {
  started: boolean;
  completed: boolean;
  confirmedStepKeys: string[];
}

const INITIAL: PreviewState = {
  started: false,
  completed: false,
  confirmedStepKeys: [],
};

export function useExperiencePreviewRun(
  presentation: GuidePresentation,
): GuideRun {
  const [state, setState] = useState<PreviewState>(INITIAL);

  const stepKeys = useMemo(
    () => presentation.steps.map((step) => step.stepKey),
    [presentation],
  );

  const session: GuideSessionView | null = useMemo(() => {
    if (!state.started) return null;
    const completed = state.confirmedStepKeys.length;
    return {
      sessionId: PREVIEW_SESSION_ID,
      guideKey: presentation.guideKey,
      guideVersion: presentation.guideVersion,
      status: state.completed ? "COMPLETED" : "ACTIVE",
      stepsCompleted: completed,
      totalSteps: stepKeys.length,
      currentStepKey: state.completed ? null : (stepKeys[completed] ?? null),
    };
  }, [presentation, state, stepKeys]);

  const start = useCallback(async () => {
    setState({ ...INITIAL, started: true });
  }, []);

  /**
   * Accept a checkpoint only when it is the one actually open, so the preview
   * cannot be walked into a state the real lifecycle would refuse.
   */
  const completeStep = useCallback(
    (stepKey: string) => {
      setState((prev) => {
        if (!prev.started || prev.completed) return prev;
        if (prev.confirmedStepKeys.includes(stepKey)) return prev;
        if (stepKeys[prev.confirmedStepKeys.length] !== stepKey) return prev;
        return {
          ...prev,
          confirmedStepKeys: [...prev.confirmedStepKeys, stepKey],
        };
      });
    },
    [stepKeys],
  );

  /** Advances the checkpoint. Records no answer and returns no verdict. */
  const submitRecall = useCallback(
    (stepKey: string) => completeStep(stepKey),
    [completeStep],
  );

  const finish = useCallback(() => {
    setState((prev) => (prev.started ? { ...prev, completed: true } : prev));
  }, []);

  const restart = useCallback(
    () => setState({ ...INITIAL, started: true }),
    [],
  );
  const cancel = useCallback(() => setState(INITIAL), []);
  const noop = useCallback(() => {}, []);

  return useMemo<GuideRun>(
    () => ({
      // `screen` mirrors what the live hook would report for this state; the
      // surface derives what it shows from `session` and the definition.
      screen: !state.started
        ? "cover"
        : state.completed
          ? "completed"
          : session?.currentStepKey === null
            ? "finish"
            : "step",
      session,
      step: null,
      error: null,
      retry: null,
      busy: false,
      booting: false,
      recallOutcome: null,
      // A preview has no history to recover and nothing to adopt.
      recoverable: null,
      facts: { confirmedStepKeys: state.confirmedStepKeys, recalls: [] },
      serverSummary: null,
      choice: null,
      setChoice: noop,
      start,
      adopt: noop,
      completeStep,
      submitRecall,
      finish,
      cancel,
      retryPending: noop,
      restart,
    }),
    [
      cancel,
      completeStep,
      finish,
      noop,
      restart,
      session,
      start,
      state,
      submitRecall,
    ],
  );
}
