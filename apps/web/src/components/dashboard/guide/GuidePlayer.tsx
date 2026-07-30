"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { GuideSessionView } from "@psico/types";
import { GUIDE_PRESENTATION, GUIDE_SCOPE_NOTE } from "./guide-presentation";
import { useGuideRun } from "./use-guide-run";

/**
 * CC-7.5 — the Guide V1 player, standalone route.
 *
 * All of the run — network, idempotency, recovery, resync, retry — lives in
 * `useGuideRun`, shared with the reader panel (GR-3). This file is the
 * standalone PRESENTATION of that run and nothing else.
 *
 * Two consequences worth naming:
 *
 *   - a `currentStepKey` this build does not know FAILS CLOSED. Falling back
 *     to "probably the first step" would be inventing progress.
 *   - the recall verdict is the server's (`CORRECT` / `REVIEW`), read back
 *     from its ledger. This screen never decides how the reader did, and the
 *     catalog answer is not in this bundle to decide it with.
 */

const { labels } = GUIDE_PRESENTATION;

export interface GuidePlayerProps {
  /**
   * Opaque partition derived server-side from the authenticated user. The
   * AUTHORITY on who this browser is right now — never read back from storage,
   * because a record written by another account would then vouch for itself.
   */
  actorScope: string;
}

export function GuidePlayer({ actorScope }: GuidePlayerProps) {
  const run = useGuideRun(actorScope);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { screen, session, step, busy, choice, setChoice } = run;

  // Move focus to the heading after a transition so a screen reader announces
  // the new step instead of leaving the user on a button that is now gone.
  useEffect(() => {
    if (run.booting || busy) return;
    headingRef.current?.focus();
  }, [screen, session?.currentStepKey, run.booting, busy]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="screen-head">
        <div className="screen-title">
          <span className="eb">{GUIDE_PRESENTATION.tag}</span>
          {GUIDE_PRESENTATION.title}
        </div>
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ minHeight: 0 }}
        data-testid="guide-live-region"
      >
        {run.error ? (
          <p
            className="card"
            role="alert"
            style={{
              padding: "14px 18px",
              marginBottom: 18,
              color: "var(--color-warm-800)",
              fontSize: 14,
            }}
          >
            {run.error.message}
            {run.retry ? (
              <>
                {" "}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={run.retryPending}
                  disabled={busy}
                  style={{ minHeight: 44, marginLeft: 8 }}
                >
                  {labels.retry}
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {screen === "booting" ? (
        <div className="card" style={{ padding: 26 }} aria-busy="true">
          <p style={{ color: "var(--color-warm-500)", fontSize: 14 }}>
            Recuperando tu avance…
          </p>
        </div>
      ) : null}

      {screen === "storage-unavailable" ? (
        <div className="card" style={{ padding: 26 }}>
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            No podemos guardar tu avance en este navegador
          </h2>
          <p style={bodyStyle}>
            Sin poder guardar la clave de recuperación no podemos garantizar que
            un paso se registre una sola vez, así que no iniciamos la guía.
          </p>
          <div style={actionsStyle}>
            <Link
              href="/dashboard/exploraciones"
              className="btn primary"
              style={linkBtnStyle}
            >
              {labels.back}
            </Link>
          </div>
        </div>
      ) : null}

      {screen === "start-retry" ? (
        <div className="card" style={{ padding: 26 }}>
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            No pudimos abrir tu guía
          </h2>
          <p style={bodyStyle}>
            Tu avance sigue guardado. Reintenta cuando quieras — usaremos el
            mismo intento, así que no se duplicará nada.
          </p>
          <div style={actionsStyle}>
            <Link
              href="/dashboard/exploraciones"
              className="btn ghost"
              style={linkBtnStyle}
            >
              {labels.back}
            </Link>
          </div>
        </div>
      ) : null}

      {screen === "cover" ? (
        <div className="card" style={{ padding: 26 }}>
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            {GUIDE_PRESENTATION.title}
          </h2>
          <p style={bodyStyle}>{GUIDE_PRESENTATION.summary}</p>
          <ol style={{ ...bodyStyle, paddingLeft: 20 }}>
            {GUIDE_PRESENTATION.steps.map((s) => (
              <li key={s.stepKey}>{s.shortLabel}</li>
            ))}
          </ol>
          <div style={actionsStyle}>
            <button
              type="button"
              className="btn primary"
              onClick={() => void run.start()}
              disabled={busy}
              style={{ minHeight: 44 }}
            >
              {busy ? "Abriendo…" : labels.start}
            </button>
            <Link
              href="/dashboard/exploraciones"
              className="btn ghost"
              style={linkBtnStyle}
            >
              {labels.back}
            </Link>
          </div>
        </div>
      ) : null}

      {screen === "step" && session && step ? (
        <div className="card" style={{ padding: 26 }}>
          <GuideProgress session={session} />
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            {step.title}
          </h2>
          {step.body.map((paragraph) => (
            <p key={paragraph} style={bodyStyle}>
              {paragraph}
            </p>
          ))}

          {step.surface === "recall" ? (
            <fieldset style={{ border: 0, margin: "18px 0 0", padding: 0 }}>
              <legend style={{ ...bodyStyle, fontWeight: 600 }}>
                {step.question}
              </legend>
              <div role="radiogroup" aria-label={step.question}>
                {step.options.map((option) => (
                  <label
                    key={option.optionKey}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      padding: "12px 14px",
                      minHeight: 44,
                      borderRadius: 12,
                      border: `1px solid ${
                        choice === option.optionKey
                          ? "var(--color-sage-600)"
                          : "var(--color-warm-200)"
                      }`,
                      marginBottom: 10,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="guide-recall"
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
          ) : null}

          {step.surface === "confirm" && step.note ? (
            <p style={{ ...bodyStyle, color: "var(--color-warm-500)" }}>
              {step.note}
            </p>
          ) : null}

          <div style={actionsStyle}>
            <button
              type="button"
              className="btn primary"
              disabled={busy || (step.surface === "recall" && choice === null)}
              onClick={() =>
                step.surface === "recall"
                  ? choice && run.submitRecall(step.stepKey, choice)
                  : run.completeStep(step.stepKey)
              }
              style={{ minHeight: 44 }}
            >
              {busy ? "Guardando…" : step.actionLabel}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (
                  window.confirm(
                    "¿Quieres salir de la guía? Puedes empezarla de nuevo cuando quieras.",
                  )
                ) {
                  run.cancel();
                }
              }}
              disabled={busy}
              style={{ minHeight: 44 }}
            >
              {labels.exit}
            </button>
          </div>
        </div>
      ) : null}

      {screen === "finish" && session ? (
        <div className="card" style={{ padding: 26 }}>
          <GuideProgress session={session} />
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            Ya registraste los tres pasos
          </h2>
          <p style={bodyStyle}>
            Cuando quieras, cierra la guía para dejarla registrada como
            terminada.
          </p>
          <div style={actionsStyle}>
            <button
              type="button"
              className="btn primary"
              onClick={run.finish}
              disabled={busy}
              style={{ minHeight: 44 }}
            >
              {busy ? "Guardando…" : labels.finish}
            </button>
          </div>
        </div>
      ) : null}

      {screen === "completed" ? (
        <div className="card" style={{ padding: 26 }}>
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            Guía completada
          </h2>
          <p style={bodyStyle}>Completaste los tres pasos de esta guía.</p>
          <div style={actionsStyle}>
            <Link
              href="/dashboard/exploraciones"
              className="btn primary"
              style={linkBtnStyle}
            >
              {labels.back}
            </Link>
            <button
              type="button"
              className="btn ghost"
              onClick={run.restart}
              style={{ minHeight: 44 }}
            >
              Repetir guía
            </button>
          </div>
        </div>
      ) : null}

      {screen === "cancelled" ? (
        <div className="card" style={{ padding: 26 }}>
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            Guía cerrada
          </h2>
          <p style={bodyStyle}>
            Cerraste esta guía. Puedes empezarla de nuevo cuando quieras.
          </p>
          <div style={actionsStyle}>
            <Link
              href="/dashboard/exploraciones"
              className="btn primary"
              style={linkBtnStyle}
            >
              {labels.back}
            </Link>
            <button
              type="button"
              className="btn ghost"
              onClick={run.restart}
              style={{ minHeight: 44 }}
            >
              {labels.restart}
            </button>
          </div>
        </div>
      ) : null}

      {screen === "inconsistent" ? (
        <div className="card" style={{ padding: 26 }}>
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            No pudimos mostrar el estado actual.
          </h2>
          <p style={bodyStyle}>
            Tu avance está guardado. Vuelve a intentarlo más tarde.
          </p>
          <div style={actionsStyle}>
            <Link
              href="/dashboard/exploraciones"
              className="btn primary"
              style={linkBtnStyle}
            >
              {labels.back}
            </Link>
          </div>
        </div>
      ) : null}

      {screen === "unknown-step" ? (
        <div className="card" style={{ padding: 26 }}>
          <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
            No pudimos mostrar el paso actual.
          </h2>
          <p style={bodyStyle}>
            Tu avance está guardado. Vuelve a intentarlo más tarde.
          </p>
          <div style={actionsStyle}>
            <Link
              href="/dashboard/exploraciones"
              className="btn primary"
              style={linkBtnStyle}
            >
              {labels.back}
            </Link>
          </div>
        </div>
      ) : null}

      <p
        style={{
          marginTop: 18,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--color-warm-500)",
          maxWidth: 540,
        }}
      >
        {GUIDE_SCOPE_NOTE}
      </p>
    </>
  );
}

/**
 * Progress, entirely from the server's numbers. The bar is decoration; the
 * text is the information, so it still reads without colour.
 */
function GuideProgress({ session }: { session: GuideSessionView }) {
  const { stepsCompleted, totalSteps } = session;
  const pct =
    totalSteps > 0 ? Math.round((stepsCompleted / totalSteps) * 100) : 0;
  return (
    <div style={{ marginBottom: 18 }}>
      <p
        className="sec-label"
        style={{ margin: 0, color: "var(--color-warm-500)" }}
      >
        {stepsCompleted} de {totalSteps} pasos registrados
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSteps}
        aria-valuenow={stepsCompleted}
        aria-label={`${stepsCompleted} de ${totalSteps} pasos registrados`}
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--color-warm-100)",
          overflow: "hidden",
          marginTop: 8,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--color-sage-500)",
          }}
        />
      </div>
    </div>
  );
}

const headingStyle: React.CSSProperties = {
  font: "700 21px/1.25 var(--font-sans)",
  color: "var(--color-warm-900)",
  margin: "0 0 12px",
  outlineOffset: 4,
};

const bodyStyle: React.CSSProperties = {
  fontSize: 14.5,
  lineHeight: 1.65,
  color: "var(--color-warm-700)",
  margin: "0 0 12px",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 20,
};

const linkBtnStyle: React.CSSProperties = {
  minHeight: 44,
  textDecoration: "none",
};
