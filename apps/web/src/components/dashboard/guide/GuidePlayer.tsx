"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { guideApi } from "@psico/api-client";
import type { GuideCommandResponse, GuideSessionView } from "@psico/types";
import {
  GUIDE_KEY,
  GUIDE_PRESENTATION,
  GUIDE_SCOPE_NOTE,
  GUIDE_VERSION,
  stepPresentationFor,
  type GuideOptionKeyWeb,
  type GuideStepPresentation,
} from "./guide-presentation";
import { toGuideUiError, type GuideUiError } from "./guide-errors";
import {
  clearGuideRecovery,
  newIdempotencyKey,
  readGuideRecovery,
  writeGuideRecovery,
  type GuideRecoveryRecord,
  type PendingGuideCommand,
} from "./guide-recovery";

/**
 * CC-7.5 — the Guide V1 player.
 *
 * The server owns the run. This component never computes what comes next: it
 * reads `status`, `currentStepKey`, `stepsCompleted` and `totalSteps` from the
 * last command response and renders the screen those describe. It does not
 * add one to a counter, it does not walk a local index, and it does not decide
 * a transition from how many buttons were clicked.
 *
 * Two consequences worth naming:
 *
 *   - a `currentStepKey` this build does not know FAILS CLOSED. Falling back
 *     to "probably the first step" would be inventing progress.
 *   - the recall never says correct or incorrect. The response does not carry
 *     that verdict, and the catalog answer is not in this bundle — so there is
 *     nothing here that could tell the user how they did, by design.
 */

const { labels } = GUIDE_PRESENTATION;

type Screen =
  | "booting"
  | "cover"
  | "step"
  | "finish"
  | "completed"
  | "cancelled"
  | "unknown-step";

interface PlayerState {
  session: GuideSessionView | null;
  record: GuideRecoveryRecord | null;
  booting: boolean;
  busy: boolean;
  error: GuideUiError | null;
  /** Present when a write's outcome is unknown and can be retried as-is. */
  retryable: PendingGuideCommand | null;
}

const INITIAL: PlayerState = {
  session: null,
  record: null,
  booting: true,
  busy: false,
  error: null,
  retryable: null,
};

/** The screen is a pure function of server state — never of local counters. */
function screenOf(state: PlayerState): Screen {
  if (state.booting) return "booting";
  const s = state.session;
  if (!s) return "cover";
  if (s.status === "COMPLETED") return "completed";
  if (s.status === "CANCELLED") return "cancelled";
  if (s.currentStepKey === null) return "finish";
  return stepPresentationFor(s.currentStepKey) ? "step" : "unknown-step";
}

export function GuidePlayer() {
  const [state, setState] = useState<PlayerState>(INITIAL);
  const [choice, setChoice] = useState<GuideOptionKeyWeb | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bootedRef = useRef(false);

  const patch = useCallback((next: Partial<PlayerState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  /** Persist the record BEFORE anything reaches the network. */
  const remember = useCallback((record: GuideRecoveryRecord) => {
    writeGuideRecovery(record);
    return record;
  }, []);

  /**
   * Replay the stored START. Returns the session the server currently has for
   * that idempotency key — this is the ONLY way the browser learns state.
   */
  const replayStart = useCallback(
    async (record: GuideRecoveryRecord): Promise<GuideSessionView> => {
      const res = await guideApi.createGuideSession({
        idempotencyKey: record.startIdempotencyKey,
        guideKey: GUIDE_KEY,
        guideVersion: GUIDE_VERSION,
      });
      return res.session;
    },
    [],
  );

  const invoke = useCallback(
    (command: PendingGuideCommand): Promise<GuideCommandResponse> => {
      switch (command.commandType) {
        case "STEP_COMPLETE":
          return guideApi.completeGuideSessionStep(
            command.sessionId,
            command.stepKey,
            { idempotencyKey: command.idempotencyKey },
          );
        case "STEP_RECALL":
          return guideApi.submitGuideStepRecall(
            command.sessionId,
            command.stepKey,
            {
              idempotencyKey: command.idempotencyKey,
              selectedOptionKey: command.selectedOptionKey,
            },
          );
        case "CANCEL":
          return guideApi.cancelGuideSession(command.sessionId, {
            idempotencyKey: command.idempotencyKey,
          });
        case "SESSION_COMPLETE":
          return guideApi.completeGuideSession(command.sessionId, {
            idempotencyKey: command.idempotencyKey,
          });
      }
    },
    [],
  );

  /**
   * Send a command that is already persisted. `created` and `replayed` are
   * both success: the second means an identical earlier attempt had applied.
   */
  const dispatch = useCallback(
    async (command: PendingGuideCommand, record: GuideRecoveryRecord) => {
      patch({ busy: true, error: null, retryable: null });
      try {
        const res = await invoke(command);
        const settled: GuideRecoveryRecord = {
          schemaVersion: 1,
          guideKey: GUIDE_KEY,
          guideVersion: GUIDE_VERSION,
          startIdempotencyKey: record.startIdempotencyKey,
          sessionId: res.session.sessionId,
        };
        remember(settled);
        setChoice(null);
        patch({
          session: res.session,
          record: settled,
          busy: false,
          retryable: null,
        });
      } catch (err) {
        const uiError = toGuideUiError(err);
        if (uiError.kind === "resync") {
          // The state moved under us. Re-read it from the server with the
          // START key — never by inventing a different command.
          try {
            const session = await replayStart(record);
            const settled: GuideRecoveryRecord = {
              schemaVersion: 1,
              guideKey: GUIDE_KEY,
              guideVersion: GUIDE_VERSION,
              startIdempotencyKey: record.startIdempotencyKey,
              sessionId: session.sessionId,
            };
            remember(settled);
            setChoice(null);
            patch({
              session,
              record: settled,
              busy: false,
              error: uiError,
              retryable: null,
            });
            return;
          } catch {
            patch({ busy: false, error: uiError, retryable: null });
            return;
          }
        }

        if (uiError.kind === "retryable") {
          // Keep the command AND its key: the retry must be the same attempt.
          const pendingRecord: GuideRecoveryRecord = {
            ...record,
            pendingCommand: command,
          };
          remember(pendingRecord);
          patch({
            busy: false,
            error: uiError,
            retryable: command,
            record: pendingRecord,
          });
          return;
        }

        if (uiError.kind === "gone") {
          clearGuideRecovery();
          patch({
            busy: false,
            error: uiError,
            retryable: null,
            session: null,
            record: null,
          });
          return;
        }

        remember({ ...record, pendingCommand: undefined });
        patch({ busy: false, error: uiError, retryable: null });
      }
    },
    [invoke, patch, remember, replayStart],
  );

  // ── Mount: recover, never auto-start ──────────────────────────────────────
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const record = readGuideRecovery();
    if (!record) {
      // No prior START from this browser ⇒ the cover, and an explicit click.
      patch({ booting: false });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const session = await replayStart(record);
        if (cancelled) return;
        const settled: GuideRecoveryRecord = {
          ...record,
          sessionId: session.sessionId,
        };
        remember(settled);
        patch({ session, record: settled, booting: false });
        if (record.pendingCommand) {
          await dispatch(record.pendingCommand, settled);
        }
      } catch (err) {
        if (cancelled) return;
        const uiError = toGuideUiError(err);
        if (uiError.kind === "gone") {
          clearGuideRecovery();
          patch({
            booting: false,
            session: null,
            record: null,
            error: uiError,
          });
          return;
        }
        patch({ booting: false, error: uiError });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch, patch, remember, replayStart]);

  // Move focus to the heading after a transition so a screen reader announces
  // the new step instead of leaving the user on a button that is now gone.
  const screen = screenOf(state);
  useEffect(() => {
    if (state.booting || state.busy) return;
    headingRef.current?.focus();
  }, [screen, state.session?.currentStepKey, state.booting, state.busy]);

  // ── Explicit start ────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    const idempotencyKey = newIdempotencyKey();
    if (!idempotencyKey) {
      patch({
        error: {
          kind: "terminal",
          message: "Este navegador no puede iniciar la guía.",
        },
      });
      return;
    }
    const record = remember({
      schemaVersion: 1,
      guideKey: GUIDE_KEY,
      guideVersion: GUIDE_VERSION,
      startIdempotencyKey: idempotencyKey,
    });

    patch({ busy: true, error: null, retryable: null, record });
    try {
      const session = await replayStart(record);
      const settled = remember({ ...record, sessionId: session.sessionId });
      patch({ session, record: settled, busy: false });
    } catch (err) {
      // The key stays stored: a retry replays this START, it never opens a
      // second session.
      patch({ busy: false, error: toGuideUiError(err) });
    }
  }, [patch, remember, replayStart]);

  const restart = useCallback(() => {
    clearGuideRecovery();
    setChoice(null);
    patch({ session: null, record: null, error: null, retryable: null });
  }, [patch]);

  // ── Commands ──────────────────────────────────────────────────────────────
  const send = useCallback(
    (build: (key: string, sessionId: string) => PendingGuideCommand) => {
      const { session, record } = state;
      if (!session || !record || state.busy) return;
      const key = newIdempotencyKey();
      if (!key) {
        patch({
          error: {
            kind: "terminal",
            message: "Este navegador no puede continuar la guía.",
          },
        });
        return;
      }
      const command = build(key, session.sessionId);
      // Persisted BEFORE the request: an ambiguous timeout is retried with
      // this exact key, never with a fresh one.
      const pendingRecord = remember({ ...record, pendingCommand: command });
      void dispatch(command, pendingRecord);
    },
    [dispatch, patch, remember, state],
  );

  const completeStep = (stepKey: GuideStepPresentation["stepKey"]) =>
    send((idempotencyKey, sessionId) => ({
      commandType: "STEP_COMPLETE",
      idempotencyKey,
      sessionId,
      stepKey,
    }));

  const submitRecall = (
    stepKey: GuideStepPresentation["stepKey"],
    selectedOptionKey: GuideOptionKeyWeb,
  ) =>
    send((idempotencyKey, sessionId) => ({
      commandType: "STEP_RECALL",
      idempotencyKey,
      sessionId,
      stepKey,
      selectedOptionKey,
    }));

  const finish = () =>
    send((idempotencyKey, sessionId) => ({
      commandType: "SESSION_COMPLETE",
      idempotencyKey,
      sessionId,
    }));

  const cancel = () =>
    send((idempotencyKey, sessionId) => ({
      commandType: "CANCEL",
      idempotencyKey,
      sessionId,
    }));

  const retry = () => {
    if (state.retryable && state.record) {
      void dispatch(state.retryable, state.record);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const session = state.session;
  const step = session ? stepPresentationFor(session.currentStepKey) : null;

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
        {state.error ? (
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
            {state.error.message}
            {state.retryable ? (
              <>
                {" "}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={retry}
                  disabled={state.busy}
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
              onClick={() => void start()}
              disabled={state.busy}
              style={{ minHeight: 44 }}
            >
              {state.busy ? "Abriendo…" : labels.start}
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
                      disabled={state.busy}
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
              disabled={
                state.busy || (step.surface === "recall" && choice === null)
              }
              onClick={() =>
                step.surface === "recall"
                  ? choice && submitRecall(step.stepKey, choice)
                  : completeStep(step.stepKey)
              }
              style={{ minHeight: 44 }}
            >
              {state.busy ? "Guardando…" : step.actionLabel}
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
                  cancel();
                }
              }}
              disabled={state.busy}
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
              onClick={finish}
              disabled={state.busy}
              style={{ minHeight: 44 }}
            >
              {state.busy ? "Guardando…" : labels.finish}
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
              onClick={restart}
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
              onClick={restart}
              style={{ minHeight: 44 }}
            >
              {labels.restart}
            </button>
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
