"use client";

/**
 * GR-6 — the four panels a person can confirm.
 *
 * `CONCEPT`, `PRACTICE`, `REFLECTION` and `QUESTION` all end the same way: a
 * button the reader presses because they decided to, which sends exactly one
 * command. They share `ConfirmFooter` for that, and nothing else.
 *
 * The rule they enforce together is the one that matters most here: **nothing
 * completes a step on its own.** Not a timer running out, not a textarea
 * losing focus, not scrolling to the bottom. Progress is something a person
 * asserts, and the only affordance that asserts it is a button.
 *
 * Two of them accept writing, and neither one sends it. The text stays in
 * component state: it is not in the command, not in local storage, and not in
 * any request this file can make — `ExperienceSceneContext` has no callback
 * that would carry it.
 */

import { useState } from "react";
import type { ExperienceSceneContext } from "../scene-contract";
import { PracticeInteractionView } from "../practices/PracticeInteractionView";
import {
  SceneAction,
  SceneActions,
  SceneBody,
  SceneHeading,
  SceneNote,
} from "./scene-ui";

/**
 * The confirmation row.
 *
 * When `pendingStepKey` is null the step is either already accepted or not the
 * one the server is waiting for, so the panel offers plain forward movement.
 * Showing a confirmation that would be refused is worse than showing none.
 */
function ConfirmFooter({
  pendingStepKey,
  busy,
  label,
  onConfirm,
  onForward,
}: {
  pendingStepKey: string | null;
  busy: boolean;
  label: string;
  onConfirm: (stepKey: string) => void;
  onForward: () => void;
}) {
  if (pendingStepKey === null) {
    return (
      <SceneActions>
        <SceneAction label="Continuar" onClick={onForward} />
      </SceneActions>
    );
  }
  return (
    <SceneActions>
      <SceneAction
        label={busy ? "Guardando…" : label}
        onClick={() => onConfirm(pendingStepKey)}
        disabled={busy}
      />
    </SceneActions>
  );
}

function Prose({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line) => (
        <SceneBody key={line}>{line}</SceneBody>
      ))}
    </>
  );
}

export function ConceptScene({
  scene,
  pendingStepKey,
  busy,
  confirmStep,
  goForward,
}: ExperienceSceneContext) {
  const { payload } = scene;
  return (
    <div data-testid="scene-concept">
      <SceneHeading>{payload.title}</SceneHeading>
      <Prose lines={payload.body} />
      {/* Exploring is not understanding. The note says what was done; the
          button says the reader did it. Neither claims comprehension. */}
      {payload.note ? <SceneNote>{payload.note}</SceneNote> : null}
      <ConfirmFooter
        pendingStepKey={pendingStepKey}
        busy={busy}
        label={payload.actionLabel ?? "Lo exploré"}
        onConfirm={confirmStep}
        onForward={goForward}
      />
    </div>
  );
}

/**
 * A practice, with an optional timer.
 *
 * The timer is a companion, not a judge: when it reaches zero nothing is
 * registered, and a reader who never starts it can still confirm. Time spent
 * is not evidence that a practice happened, and treating it as evidence is how
 * a product starts lying about somebody's effort.
 */
export function PracticeScene({
  scene,
  pendingStepKey,
  busy,
  confirmStep,
  goForward,
  media,
}: ExperienceSceneContext) {
  const { payload } = scene;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const startTimer = () => {
    setSecondsLeft(60);
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          window.clearInterval(id);
          return prev === null ? null : 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div data-testid="scene-practice">
      <SceneHeading>{payload.title}</SceneHeading>
      <Prose lines={payload.body} />

      {/* The interaction the catalog declares, when there is one. A practice
          without an `exerciseKey` is the older shape and renders as it always
          did: copy, a timer nobody has to use, and a button. */}
      <PracticeInteractionView
        exerciseKey={payload.exerciseKey}
        fetchContext={
          media ? { apiBase: media.apiBase, token: media.token } : null
        }
      />

      {secondsLeft === null ? (
        <SceneActions>
          <SceneAction
            label="Poner un minuto"
            onClick={startTimer}
            variant="ghost"
          />
        </SceneActions>
      ) : (
        <p
          aria-live="polite"
          style={{ fontSize: 14, color: "var(--color-warm-600)" }}
        >
          {secondsLeft > 0
            ? `Quedan ${secondsLeft} s`
            : "Se acabó el minuto. Marca solo si lo hiciste."}
        </p>
      )}

      <SceneNote>
        {payload.note ??
          "El tiempo es solo una ayuda. Nada se registra hasta que lo marques."}
      </SceneNote>

      <ConfirmFooter
        pendingStepKey={pendingStepKey}
        busy={busy}
        label={payload.actionLabel ?? "Lo hice"}
        onConfirm={confirmStep}
        onForward={goForward}
      />
    </div>
  );
}

/**
 * An invitation to write. The text never leaves this component.
 *
 * There is no «guardar»: saving would mean sending, and a reflection written
 * inside a guided reading is not something this surface may transmit. What the
 * reader confirms is that they reflected — the words stay with them.
 */
export function ReflectionScene({
  scene,
  pendingStepKey,
  busy,
  confirmStep,
  goForward,
}: ExperienceSceneContext) {
  const { payload } = scene;
  const [draft, setDraft] = useState("");

  return (
    <div data-testid="scene-reflection">
      <SceneHeading>{payload.title}</SceneHeading>
      <Prose lines={payload.body} />
      <label>
        <span className="sr-only">Tu reflexión</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder={payload.placeholder ?? "Escribe si te ayuda…"}
          style={textareaStyle}
        />
      </label>
      {payload.note ? <SceneNote>{payload.note}</SceneNote> : null}
      <ConfirmFooter
        pendingStepKey={pendingStepKey}
        busy={busy}
        label={payload.actionLabel ?? "Lo reflexioné"}
        onConfirm={confirmStep}
        onForward={goForward}
      />
    </div>
  );
}

/**
 * An ungraded question. Not a recall: nothing is scored and nothing is stored.
 *
 * It exists because some things are worth asking without being worth marking.
 * Any binding it carries is an `EXPLICIT_CONFIRMATION` — the reader saying "I
 * thought about it" — never `ACTIVE_RECALL`, which the catalog would reject.
 */
export function QuestionScene({
  scene,
  pendingStepKey,
  busy,
  confirmStep,
  goForward,
}: ExperienceSceneContext) {
  const { payload } = scene;
  const [draft, setDraft] = useState("");

  return (
    <div data-testid="scene-question">
      <SceneHeading>{payload.title}</SceneHeading>
      <Prose lines={payload.body} />
      <label>
        <span className="sr-only">Tu respuesta</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={payload.placeholder ?? "Si quieres, anótalo aquí…"}
          style={textareaStyle}
        />
      </label>
      {payload.note ? <SceneNote>{payload.note}</SceneNote> : null}
      <ConfirmFooter
        pendingStepKey={pendingStepKey}
        busy={busy}
        label={payload.actionLabel ?? "Seguir"}
        onConfirm={confirmStep}
        onForward={goForward}
      />
    </div>
  );
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 88,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--color-warm-200)",
  font: "400 14px/1.6 var(--font-sans)",
  color: "var(--color-warm-800)",
  resize: "vertical",
};
