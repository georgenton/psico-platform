"use client";

/**
 * GR-6 — the three panels that do something no other panel does.
 *
 *   - `PASSAGE` points at the book itself, without copying it.
 *   - `RECALL` is the only scene the SERVER grades.
 *   - `RESONANCE` is the only scene whose refusal is a first-class outcome.
 */

import { useState } from "react";
import type { ExperienceSceneContext } from "../scene-contract";
import {
  SceneAction,
  SceneActions,
  SceneBody,
  SceneHeading,
  SceneNote,
} from "./scene-ui";

/**
 * Locate the approved passage in this chapter.
 *
 * «Ir al pasaje» scrolls and focuses; it does NOT close the player and it does
 * NOT complete anything. Reading is not evidence of having read — the reader
 * still has to say so, on the panel that asks.
 */
export function PassageScene({
  scene,
  anchor,
  pendingStepKey,
  busy,
  confirmStep,
  goForward,
  goToPassage,
}: ExperienceSceneContext) {
  const { payload } = scene;
  const resolved = anchor?.status === "RESOLVED";
  return (
    <div data-testid="scene-passage">
      <SceneHeading>{payload.title}</SceneHeading>
      {payload.body.map((line) => (
        <SceneBody key={line}>{line}</SceneBody>
      ))}

      {!resolved ? (
        <SceneNote>
          No pudimos ubicar el pasaje en esta edición del capítulo. Puedes
          seguir de todos modos.
        </SceneNote>
      ) : null}

      <SceneActions>
        {resolved && goToPassage ? (
          <SceneAction
            label="Ir al pasaje"
            onClick={goToPassage}
            variant="ghost"
          />
        ) : null}
        {pendingStepKey !== null ? (
          <SceneAction
            label={busy ? "Guardando…" : (payload.actionLabel ?? "Lo leí")}
            onClick={() => confirmStep(pendingStepKey)}
            disabled={busy}
          />
        ) : (
          <SceneAction label="Continuar" onClick={goForward} />
        )}
      </SceneActions>
    </div>
  );
}

/**
 * The one graded panel.
 *
 * The catalog's correct option is not in this payload, so this component could
 * not decide the outcome even if it wanted to. It sends the chosen key and
 * renders whatever verdict the server returns — and on a replay the server
 * returns the SAME verdict, read back from its ledger rather than graded twice.
 *
 * A payload with no question is a contract error, not an empty quiz.
 */
export function RecallScene({
  scene,
  pendingStepKey,
  busy,
  recallOutcome,
  submitRecall,
  goForward,
}: ExperienceSceneContext) {
  const { payload } = scene;
  const [choice, setChoice] = useState<string | null>(null);
  const options = payload.options ?? [];
  const question = payload.question ?? "";

  if (recallOutcome !== null) {
    return (
      <div data-testid="scene-recall-feedback">
        <SceneHeading>
          {recallOutcome === "CORRECT" ? "Correcto" : "Vale la pena repasarlo"}
        </SceneHeading>
        <SceneBody>
          {recallOutcome === "CORRECT"
            ? "Eso era. Puedes seguir."
            : "No era esa. Volver al capítulo cuando quieras es parte del recorrido."}
        </SceneBody>
        <SceneActions>
          <SceneAction label="Continuar" onClick={goForward} />
        </SceneActions>
      </div>
    );
  }

  if (question === "" || options.length === 0) {
    return (
      <div data-testid="scene-recall-unavailable">
        <SceneHeading>No pudimos mostrar esta pregunta</SceneHeading>
        <SceneBody>
          Tu avance está guardado. Puedes volver al capítulo y seguir leyendo.
        </SceneBody>
      </div>
    );
  }

  return (
    <div data-testid="scene-recall">
      <SceneHeading>{payload.title}</SceneHeading>
      <fieldset style={{ border: 0, margin: "12px 0 0", padding: 0 }}>
        <legend style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>
          {question}
        </legend>
        <div role="radiogroup" aria-label={question}>
          {options.map((option) => (
            <label
              key={option.optionKey}
              style={optionStyle(choice === option.optionKey)}
            >
              <input
                type="radio"
                name="experience-recall"
                value={option.optionKey}
                checked={choice === option.optionKey}
                onChange={() => setChoice(option.optionKey)}
                disabled={busy}
              />
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <SceneActions>
        <SceneAction
          label={busy ? "Enviando…" : (payload.actionLabel ?? "Responder")}
          onClick={() => {
            if (pendingStepKey !== null && choice !== null) {
              submitRecall(pendingStepKey, choice);
            }
          }}
          disabled={busy || choice === null || pendingStepKey === null}
        />
      </SceneActions>
    </div>
  );
}

/**
 * The optional offer at the end.
 *
 * «Ahora no» writes NOTHING — no resonance, no mood, no note that the offer was
 * declined — and the experience finishes just as completely. That is the ARC
 * rule made concrete: a resonance exists because somebody confirmed it, and the
 * absence of a confirmation is not data.
 */
export function ResonanceScene({
  scene,
  concept,
  confirmResonance,
  goForward,
}: ExperienceSceneContext) {
  const { payload } = scene;
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  return (
    <div data-testid="scene-resonance">
      <SceneHeading>{payload.title}</SceneHeading>
      <SceneBody>
        {concept
          ? `Si «${concept.label}» te tocó algo, puedes guardarlo como una resonancia tuya.`
          : (payload.body[0] ??
            "Si algo de esto te tocó, puedes guardarlo como una resonancia tuya.")}
      </SceneBody>
      {payload.note ? <SceneNote>{payload.note}</SceneNote> : null}

      <div aria-live="polite">
        {state === "saved" ? (
          <SceneNote>Guardado. Aparecerá en tus resonancias.</SceneNote>
        ) : null}
        {state === "error" ? (
          <SceneNote>
            No pudimos guardarla. Puedes intentarlo otra vez.
          </SceneNote>
        ) : null}
      </div>

      <SceneActions>
        {state !== "saved" && confirmResonance ? (
          <SceneAction
            label={
              state === "saving"
                ? "Guardando…"
                : (payload.actionLabel ?? "Sí, me resonó")
            }
            disabled={state === "saving"}
            onClick={() => {
              setState("saving");
              void confirmResonance().then(
                () => setState("saved"),
                () => setState("error"),
              );
            }}
          />
        ) : null}
        <SceneAction
          label={state === "saved" ? "Terminar" : "Ahora no"}
          onClick={goForward}
          variant={state === "saved" ? "primary" : "ghost"}
        />
      </SceneActions>
    </div>
  );
}

const optionStyle = (selected: boolean): React.CSSProperties => ({
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: "12px 14px",
  minHeight: 44,
  borderRadius: 12,
  border: `1px solid ${selected ? "var(--color-sage-600)" : "var(--color-warm-200)"}`,
  marginBottom: 10,
  cursor: "pointer",
});
