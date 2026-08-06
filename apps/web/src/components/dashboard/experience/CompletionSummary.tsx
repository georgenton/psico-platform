"use client";

/**
 * GR-7 — what a finished experience says back.
 *
 * The temptation at the end of a journey is to score it: a percentage, a
 * streak, a sentence about how the reader has changed. This screen does none
 * of that, and the reason is not modesty. The app cannot know whether somebody
 * understood a chapter, and a number that looks like it does is a claim
 * dressed as a measurement.
 *
 * So the summary reports facts the ledger actually holds:
 *
 *   - which concepts the reader marked as explored
 *   - which practices they confirmed doing
 *   - what the SERVER answered about each recall, as CORRECT or REVIEW
 *   - whether they chose to save a resonance
 *
 * `REVIEW` is deliberately not "wrong". The reader is told there is something
 * to look at again, never which option was right — the public view has never
 * carried `correctOptionKey`, and giving the answer away at the end would undo
 * the point of asking.
 *
 * Presentational scenes are not counted. Reading an intro is not an
 * achievement, and inflating the list with them would make the honest entries
 * mean less.
 */

import { useEffect, useRef } from "react";
import type {
  ChapterExperiencePublicView,
  GuideRecallOutcome,
  GuideSessionView,
} from "@psico/types";
import type { GuideRunFacts } from "../guide/use-guide-run";

export interface CompletionSummaryProps {
  experience: ChapterExperiencePublicView;
  session: GuideSessionView | null;
  facts: GuideRunFacts;
  /** True only when the reader confirmed one in this run. */
  resonanceConfirmed: boolean;
  onBackToChapter?: () => void;
  onContinueReading?: () => void;
  /** Present only when the chapter publishes another experience. */
  onPickAnother?: () => void;
  /** A fresh run of the same experience, via the existing START. */
  onRepeat?: () => void;
}

const OUTCOME_LABEL: Record<GuideRecallOutcome, string> = {
  CORRECT: "Correcta",
  REVIEW: "Para repasar",
};

/** The title of the scene bound to a step, so the list reads editorially. */
function sceneTitleForStep(
  experience: ChapterExperiencePublicView,
  stepKey: string,
): string | null {
  const scene = experience.scenes.find(
    (s) => s.completesGuideStepKey === stepKey,
  );
  return scene ? scene.payload.title : null;
}

function sceneKindForStep(
  experience: ChapterExperiencePublicView,
  stepKey: string,
): string | null {
  const scene = experience.scenes.find(
    (s) => s.completesGuideStepKey === stepKey,
  );
  return scene ? scene.kind : null;
}

function Row({ label, detail }: { label: string; detail?: string }) {
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-2 border-b py-2 last:border-b-0"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <span
        className="text-[13.5px]"
        style={{ color: "var(--color-warm-900)" }}
      >
        {label}
      </span>
      {detail ? (
        <span
          className="text-[12px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          {detail}
        </span>
      ) : null}
    </li>
  );
}

export function CompletionSummary({
  experience,
  session,
  facts,
  resonanceConfirmed,
  onBackToChapter,
  onContinueReading,
  onPickAnother,
  onRepeat,
}: CompletionSummaryProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The run just ended and the screen changed under the reader; without this
  // a keyboard or screen-reader user would be left where the last scene was.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const concepts = facts.confirmedStepKeys.filter(
    (k) => sceneKindForStep(experience, k) === "CONCEPT",
  );
  const practices = facts.confirmedStepKeys.filter(
    (k) => sceneKindForStep(experience, k) === "PRACTICE",
  );

  return (
    <section
      data-testid="experience-completion-summary"
      className="mx-auto max-w-2xl px-4 pb-12 pt-6"
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-[22px] font-bold leading-tight"
        style={{ color: "var(--color-warm-900)", outlineOffset: 4 }}
      >
        {experience.title}
      </h2>
      <p
        role="status"
        aria-live="polite"
        className="mt-2 text-[13.5px]"
        style={{ color: "var(--color-warm-600)" }}
      >
        Recorrido terminado.
        {session && session.totalSteps > 0
          ? ` Registraste ${session.stepsCompleted} de ${session.totalSteps} pasos.`
          : ""}
      </p>

      {concepts.length + practices.length + facts.recalls.length > 0 ? (
        <ul className="mt-6">
          {concepts.map((stepKey) => (
            <Row
              key={stepKey}
              label={sceneTitleForStep(experience, stepKey) ?? "Idea explorada"}
              detail="Marcaste que la exploraste"
            />
          ))}
          {practices.map((stepKey) => (
            <Row
              key={stepKey}
              label={sceneTitleForStep(experience, stepKey) ?? "Práctica"}
              detail="Confirmaste haberla hecho"
            />
          ))}
          {facts.recalls.map((recall) => (
            <Row
              key={recall.stepKey}
              label={
                sceneTitleForStep(experience, recall.stepKey) ??
                "Recordar lo leído"
              }
              // The verdict, never the answer.
              detail={OUTCOME_LABEL[recall.outcome]}
            />
          ))}
        </ul>
      ) : null}

      {resonanceConfirmed ? (
        <p
          className="mt-5 text-[12.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Guardaste una resonancia. Aparecerá en tus resonancias.
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap gap-2">
        {onContinueReading ? (
          <button
            type="button"
            className="btn"
            style={{ minHeight: 44 }}
            onClick={onContinueReading}
          >
            Continuar leyendo
          </button>
        ) : null}
        {onPickAnother ? (
          <button
            type="button"
            className="btn ghost"
            style={{ minHeight: 44 }}
            onClick={onPickAnother}
          >
            Ver otra experiencia
          </button>
        ) : null}
        {onBackToChapter ? (
          <button
            type="button"
            className="btn ghost"
            style={{ minHeight: 44 }}
            onClick={onBackToChapter}
          >
            Volver al capítulo
          </button>
        ) : null}
        {onRepeat ? (
          <button
            type="button"
            className="btn ghost"
            style={{ minHeight: 44 }}
            // A new run is the reader's decision. Reopening a finished
            // experience shows this screen and starts nothing.
            onClick={onRepeat}
          >
            Repetir experiencia
          </button>
        ) : null}
      </div>
    </section>
  );
}
