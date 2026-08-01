"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChapterConcept, GuideRecallOutcome } from "@psico/types";
import { GUIDE_SCOPE_NOTE } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";
import type { GuideWebBundle } from "./guide-web-bundle";
import { useGuideRun } from "./use-guide-run";
import type { GuideAnchorResolution } from "./guide-anchor";
import {
  clearGuideScene,
  readGuideScene,
  resolveScene,
  storedOutcomeFor,
  writeGuideScene,
  type GuideScene,
} from "./guide-scene";

/**
 * GR-3 — guided reading, inside the reader.
 *
 * The chapter stays mounted behind this panel. That is the whole point of the
 * feature: the previous version navigated to `/dashboard/exploraciones`, and
 * the reader lost their place to answer three questions about the page they
 * were on.
 *
 * The run is `useGuideRun`, the same one the standalone route uses. What lives
 * here is presentation: which of the eight scenes of the CURRENT server-owned
 * checkpoint is on screen. Losing that costs a tap, never progress.
 *
 * It is NOT a modal: the chapter behind it stays readable and reachable. So it
 * takes focus when it opens (there is new content to read) and hands it back
 * when it closes, but it never traps it.
 */

/** The reader's tab points at this with `aria-controls`. */
export const READER_GUIDE_PANEL_ID = "reader-guide-panel";

export interface ReaderGuidePanelProps {
  actorScope: string;
  /**
   * GR-4 — the EXACT guide this panel renders, resolved by the caller from
   * the server's pin. The panel holds no default and no book-slug branch: it
   * renders the bundle it is handed, or nothing.
   */
  bundle: GuideWebBundle;
  /** Where the approved passage is in THIS chapter, or why it is not. */
  anchor: GuideAnchorResolution;
  concept: ChapterConcept;
  bookSlug: string;
  chapterOrder: number;
  apiBase: string;
  token: string;
  onClose: () => void;
  /** Scroll + focus the anchored paragraph. The panel stays open. */
  onGoToPassage: () => void;
  onContinueReading: () => void;
  onOpenExplicitCheckin: () => void;
}

export function ReaderGuidePanel({
  actorScope,
  bundle,
  anchor,
  concept,
  bookSlug,
  chapterOrder,
  apiBase,
  token,
  onClose,
  onGoToPassage,
  onContinueReading,
  onOpenExplicitCheckin,
}: ReaderGuidePanelProps) {
  const { presentation, pin } = bundle;
  const C: GuideReaderCopy = bundle.copy;
  const run = useGuideRun({ actorScope, pin, presentation });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { session, screen, busy } = run;

  /**
   * The step the SERVER says is current, resolved in the PINNED presentation.
   *
   * Every command this panel sends names this key. The previous build had the
   * step keys written into the JSX, which meant the anchor button always sent
   * `explorar-cuerpo-antes-que-mente` — correct for exactly one guide and
   * silently wrong for any other.
   */
  const currentStep = run.step;
  const confirmStepKey =
    currentStep?.surface === "confirm" ? currentStep.stepKey : null;
  const recallStep = currentStep?.surface === "recall" ? currentStep : null;

  const [scene, setSceneState] = useState<GuideScene>("cover");
  const [ackFeedback, setAckFeedback] = useState(false);
  const [storedOutcome, setStoredOutcome] = useState<GuideRecallOutcome | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState("");
  const panelRef = useRef<HTMLElement>(null);

  // Escape closes, from anywhere inside the panel or after it took focus.
  // The reader keeps the shortcut they already expect from every other
  // dismissible surface in the dashboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus enters the panel once, when it opens. Not a trap — Tab still walks
  // out into the chapter, which is the point of a non-modal surface.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);
  /**
   * «Empezar» does two things at once: it creates the session (the network
   * part, which is the server's) and it moves off the cover (the local part).
   * The second cannot happen in the click handler because the session only
   * exists once the response lands, so the intent is remembered here and the
   * scene effect honours it exactly once.
   */
  const justStarted = useRef(false);

  /** Move to a scene and remember it — always stamped with the CURRENT
   * server state, so a stale record can be detected instead of trusted. */
  const goToScene = useCallback(
    (next: GuideScene, outcome?: GuideRecallOutcome | null) => {
      setSceneState(next);
      if (!session) return;
      const verdict = outcome ?? run.recallOutcome ?? storedOutcome;
      writeGuideScene(
        {
          schemaVersion: 1,
          actorScope,
          guideKey: pin.guideKey,
          guideVersion: pin.guideVersion,
          sessionId: session.sessionId,
          currentStepKey: session.currentStepKey,
          scene: next,
          ...(verdict ? { recallOutcome: verdict } : {}),
        },
        pin,
      );
    },
    [actorScope, pin, run.recallOutcome, session, storedOutcome],
  );

  // Re-derive the scene whenever the SERVER's checkpoint moves. The stored
  // record only survives if it still describes this session and this
  // checkpoint; otherwise the reader lands on the first scene of where they
  // actually are — never at the start of the whole guide.
  const sessionId = session?.sessionId;
  const currentStepKey = session?.currentStepKey ?? null;
  useEffect(() => {
    if (!sessionId) return;
    const stored = readGuideScene(actorScope, pin);
    setStoredOutcome(storedOutcomeFor({ sessionId }, stored));
    const resolved = resolveScene(
      { sessionId, currentStepKey },
      stored,
      presentation,
    );
    // `null` means the pinned presentation does not know this checkpoint. The
    // run already reports `unknown-step`, which is the screen that shows; there
    // is no local scene to move to, so we leave the state where it is rather
    // than inventing a cover.
    if (resolved === null) return;
    // A reload lands here: `feedback` means the verdict was never
    // acknowledged, `finish` means it was. Both come from the record, so the
    // reader picks up exactly where they were instead of at the closing screen
    // with an answer they never saw.
    //
    // Only a record that DESCRIBES this exact checkpoint may answer that
    // question. When it does not — a fresh run, another device, a checkpoint
    // just left — the answer is "not acknowledged", because a verdict that
    // arrives a moment later must still be shown.
    const describesNow =
      stored?.sessionId === sessionId &&
      stored?.currentStepKey === currentStepKey;
    setAckFeedback(describesNow ? stored.scene !== "feedback" : false);
    if (justStarted.current) {
      justStarted.current = false;
      // A fresh start lands on the cover by definition; the reader already
      // pressed the button that says «Empezar», so leaving them on it again
      // would be asking twice.
      // Only off the cover. A start that resumes an existing session lands
      // wherever the server says it is, and that is not ours to skip.
      if (resolved === "cover" && !stored) {
        setSceneState("clip");
        return;
      }
    }
    setSceneState(resolved);
  }, [actorScope, pin, presentation, sessionId, currentStepKey]);

  // Focus the heading after a scene change so a screen reader announces the
  // new screen instead of a button that no longer exists.
  useEffect(() => {
    if (run.booting || busy) return;
    headingRef.current?.focus();
  }, [scene, screen, run.booting, busy]);

  const outcome = run.recallOutcome ?? storedOutcome;

  // The verdict arrives asynchronously; write it down as soon as it does, so a
  // reload one second later still shows it.
  // Deps are the verdict and the session, deliberately: `goToScene` changes
  // identity on every render, and including it would rewrite the record
  // continuously for no reason. The rule is not installed in this workspace,
  // so this note is the explanation rather than a disable comment.
  const freshOutcome = run.recallOutcome;
  const goToSceneRef = useRef(goToScene);
  goToSceneRef.current = goToScene;
  useEffect(() => {
    if (!freshOutcome || ackFeedback) return;
    goToSceneRef.current("feedback", freshOutcome);
  }, [freshOutcome, ackFeedback]);

  // ── Practice timer — optional, local, and written down nowhere ────────────
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      setSecondsLeft(null);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  // ── Resonance — explicit, after the guide, never automatic ────────────────
  const [resonance, setResonance] = useState<
    "idle" | "saving" | "saved" | "error" | "dismissed"
  >("idle");

  async function confirmResonance() {
    setResonance("saving");
    try {
      const res = await fetch(`${apiBase}/resonances`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conceptKey: concept.key,
          conceptLabel: concept.label,
          bookSlug,
          chapterOrder,
          source: "guide",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResonance("saved");
    } catch {
      setResonance("error");
    }
  }

  function repeatGuide() {
    // Clears only this browser's recovery + presentation. Nothing that was
    // recorded is touched: past sessions and their events stay exactly as
    // they were, because they happened.
    clearGuideScene(pin);
    setAckFeedback(false);
    setStoredOutcome(null);
    setResonance("idle");
    setSceneState("cover");
    run.restart();
  }

  function goToPassage() {
    onGoToPassage();
    setAnnouncement(C.anchor.located);
  }

  // The server's screen wins whenever it says something categorical (booting,
  // cancelled, closed). Only INSIDE a live checkpoint does the local scene
  // decide what shows — and even there, an unacknowledged recall verdict comes
  // first, because the reader answered a question and deserves the answer.
  const inCheckpoint = screen === "step" || screen === "finish";
  const effective: GuideScene | null = !inCheckpoint
    ? null
    : outcome && !ackFeedback && screen === "finish"
      ? "feedback"
      : scene;

  // Defence in depth. The reader already refuses to mount this panel without a
  // located passage; the panel refuses on its own too, because a cover with a
  // working «Empezar» would record progress through a guide whose first step
  // cannot be shown. No session is created, so nothing has to be undone.
  if (anchor.status !== "RESOLVED") {
    return (
      <aside
        id={READER_GUIDE_PANEL_ID}
        aria-label={C.panelLabel}
        data-testid="reader-guide-panel"
        className="reader-guide-panel"
        tabIndex={-1}
      >
        <style>{PANEL_CSS}</style>
        <div className="rgp-head">
          <span className="rgp-eyebrow">{C.cover.eyebrow}</span>
          <button type="button" onClick={onClose} className="rgp-close">
            {C.close}
          </button>
        </div>
        <div className="rgp-body">
          <p
            className="rgp-text"
            role="status"
            data-testid="rgp-anchor-unresolved"
          >
            {C.unavailable}
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      id={READER_GUIDE_PANEL_ID}
      ref={panelRef}
      aria-label={C.panelLabel}
      data-testid="reader-guide-panel"
      className="reader-guide-panel"
      tabIndex={-1}
    >
      <style>{PANEL_CSS}</style>

      <div className="rgp-head">
        <span className="rgp-eyebrow">{C.cover.eyebrow}</span>
        <button type="button" onClick={onClose} className="rgp-close">
          {C.close}
        </button>
      </div>

      {session ? (
        <p className="rgp-progress" data-testid="rgp-progress">
          {session.stepsCompleted} de {session.totalSteps} pasos registrados
        </p>
      ) : null}

      <div aria-live="polite" aria-atomic="true" className="rgp-live">
        {announcement}
        {run.error ? (
          <span role="alert" className="rgp-error">
            {run.error.message}
            {run.retry ? (
              <button
                type="button"
                onClick={run.retryPending}
                disabled={busy}
                className="rgp-btn ghost"
              >
                {presentation.labels.retry}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="rgp-body">
        {screen === "booting" ? (
          <p className="rgp-muted">Recuperando tu avance…</p>
        ) : null}

        {screen === "storage-unavailable" ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              No podemos guardar tu avance en este navegador
            </h2>
            <p className="rgp-text">
              Sin poder guardar la clave de recuperación no podemos garantizar
              que un paso se registre una sola vez, así que no iniciamos la
              guía.
            </p>
          </>
        ) : null}

        {/* Cover — the ONLY screen that can create a session, and only on a
            click. Opening the panel never starts anything. */}
        {screen === "cover" || effective === "cover" ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              {C.cover.title}
            </h2>
            <p className="rgp-duration">{C.cover.duration}</p>
            {C.cover.body.map((p) => (
              <p key={p} className="rgp-text">
                {p}
              </p>
            ))}
            {screen === "cover" ? (
              <button
                type="button"
                className="rgp-btn primary"
                disabled={busy}
                onClick={() => {
                  justStarted.current = true;
                  void run.start();
                }}
              >
                {busy ? "Abriendo…" : C.cover.start}
              </button>
            ) : (
              <button
                type="button"
                className="rgp-btn primary"
                onClick={() => goToScene("clip")}
              >
                {C.clip.continue}
              </button>
            )}
          </>
        ) : null}

        {effective === "clip" ? (
          <ClipScene copy={C} onContinue={() => goToScene("anchor")} />
        ) : null}

        {effective === "anchor" ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              {C.anchor.title}
            </h2>
            <p className="rgp-text">{C.anchor.body}</p>
            <button
              type="button"
              className="rgp-btn ghost"
              onClick={goToPassage}
            >
              {C.anchor.goToPassage}
            </button>
            <button
              type="button"
              className="rgp-btn primary"
              disabled={busy || confirmStepKey === null}
              onClick={() => confirmStepKey && run.completeStep(confirmStepKey)}
            >
              {busy ? "Guardando…" : C.anchor.confirm}
            </button>
            <p className="rgp-note">{C.anchor.confirmNote}</p>
          </>
        ) : null}

        {effective === "practice" ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              {C.practice.title}
            </h2>
            {C.practice.body.map((p) => (
              <p key={p} className="rgp-text">
                {p}
              </p>
            ))}
            {secondsLeft === null ? (
              <button
                type="button"
                className="rgp-btn ghost"
                onClick={() => setSecondsLeft(C.practice.timerSeconds)}
              >
                {C.practice.timerStart}
              </button>
            ) : (
              <button
                type="button"
                className="rgp-btn ghost"
                onClick={() => setSecondsLeft(null)}
              >
                {C.practice.timerStop} · {secondsLeft}s
              </button>
            )}
            <p className="rgp-note">{C.practice.timerNote}</p>
            <button
              type="button"
              className="rgp-btn primary"
              disabled={busy || confirmStepKey === null}
              onClick={() => confirmStepKey && run.completeStep(confirmStepKey)}
            >
              {busy ? "Guardando…" : C.practice.confirm}
            </button>
            <p className="rgp-note">{C.practice.confirmNote}</p>
          </>
        ) : null}

        {effective === "recall" && recallStep ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              {C.recall.title}
            </h2>
            <fieldset className="rgp-fieldset">
              <legend className="rgp-legend">{recallStep.question}</legend>
              <div role="radiogroup" aria-label={recallStep.question}>
                {recallStep.options.map((option) => (
                  <label key={option.optionKey} className="rgp-option">
                    <input
                      type="radio"
                      name="rgp-recall"
                      value={option.optionKey}
                      checked={run.choice === option.optionKey}
                      onChange={() => run.setChoice(option.optionKey)}
                      disabled={busy}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button
              type="button"
              className="rgp-btn primary"
              disabled={busy || run.choice === null}
              onClick={() =>
                run.choice && run.submitRecall(recallStep.stepKey, run.choice)
              }
            >
              {busy ? "Guardando…" : C.recall.submit}
            </button>
          </>
        ) : null}

        {effective === "feedback" && outcome ? (
          <div data-testid="rgp-feedback">
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              {outcome === "CORRECT"
                ? C.feedback.correct.title
                : C.feedback.review.title}
            </h2>
            <p className="rgp-text">
              {outcome === "CORRECT"
                ? C.feedback.correct.body
                : C.feedback.review.body}
            </p>
            {outcome === "REVIEW" ? (
              <button
                type="button"
                className="rgp-btn ghost"
                onClick={goToPassage}
              >
                {C.completed.returnToPassage}
              </button>
            ) : null}
            <button
              type="button"
              className="rgp-btn primary"
              onClick={() => {
                setAckFeedback(true);
                goToScene("finish", outcome);
              }}
            >
              {C.feedback.continue}
            </button>
          </div>
        ) : null}

        {screen === "finish" && (!outcome || ackFeedback) ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              {C.finish.title}
            </h2>
            <p className="rgp-text">{C.finish.body}</p>
            <button
              type="button"
              className="rgp-btn primary"
              disabled={busy}
              onClick={run.finish}
            >
              {busy ? "Guardando…" : C.finish.finish}
            </button>
          </>
        ) : null}

        {screen === "completed" ? (
          <div data-testid="rgp-completed">
            <p className="rgp-banner">{C.completed.banner}</p>

            {/* The resonance is a separate, explicit question — it is not a
                requirement to have finished, and «Ahora no» writes nothing. */}
            {resonance === "saved" ? (
              <p className="rgp-text">🌱 {C.resonance.saved}</p>
            ) : resonance === "dismissed" ? null : (
              <div className="rgp-resonance">
                <p className="rgp-text">{C.resonance.question}</p>
                {resonance === "error" ? (
                  <p className="rgp-error-text">{C.resonance.error}</p>
                ) : null}
                <button
                  type="button"
                  className="rgp-btn primary"
                  disabled={resonance === "saving"}
                  onClick={() => void confirmResonance()}
                >
                  {resonance === "saving" ? "Guardando…" : C.resonance.yes}
                </button>
                <button
                  type="button"
                  className="rgp-btn ghost"
                  onClick={() => setResonance("dismissed")}
                >
                  {C.resonance.no}
                </button>
              </div>
            )}

            <button
              type="button"
              className="rgp-btn ghost"
              onClick={onOpenExplicitCheckin}
            >
              {C.checkin.action}
            </button>
            <p className="rgp-note">{C.checkin.note}</p>

            <div className="rgp-actions">
              <button
                type="button"
                className="rgp-btn ghost"
                onClick={onContinueReading}
              >
                {C.completed.continueReading}
              </button>
              <button
                type="button"
                className="rgp-btn ghost"
                onClick={goToPassage}
              >
                {C.completed.returnToPassage}
              </button>
              <button
                type="button"
                className="rgp-btn ghost"
                onClick={repeatGuide}
              >
                {C.completed.repeat}
              </button>
            </div>
          </div>
        ) : null}

        {screen === "cancelled" ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              Guía cerrada
            </h2>
            <button
              type="button"
              className="rgp-btn ghost"
              onClick={repeatGuide}
            >
              {presentation.labels.restart}
            </button>
          </>
        ) : null}

        {screen === "unknown-step" || screen === "inconsistent" ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              No pudimos mostrar el paso actual.
            </h2>
            <p className="rgp-text">
              Tu avance está guardado. Vuelve a intentarlo más tarde.
            </p>
          </>
        ) : null}

        {screen === "start-retry" ? (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="rgp-title">
              No pudimos abrir tu guía
            </h2>
            <p className="rgp-text">
              Tu avance sigue guardado. Reintenta cuando quieras — usaremos el
              mismo intento, así que no se duplicará nada.
            </p>
          </>
        ) : null}
      </div>

      <p className="rgp-scope">{GUIDE_SCOPE_NOTE}</p>
    </aside>
  );
}

/** The clip scene. No player, because there is no asset — see the copy. */
function ClipScene({
  copy: C,
  onContinue,
}: {
  copy: GuideReaderCopy;
  onContinue: () => void;
}) {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <>
      <h2 ref={heading} tabIndex={-1} className="rgp-title">
        {C.clip.title}
      </h2>
      <div className="rgp-clip" data-testid="rgp-clip-pending">
        <span>🎬</span>
        <b>{C.clip.pending}</b>
        <span className="rgp-note">{C.clip.pendingNote}</span>
      </div>
      <button
        type="button"
        className="rgp-btn ghost"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? C.clip.hideTranscript : C.clip.readTranscript}
      </button>
      {open
        ? C.clip.transcript.map((p) => (
            <p key={p} className="rgp-text">
              {p}
            </p>
          ))
        : null}
      <button type="button" className="rgp-btn primary" onClick={onContinue}>
        {C.clip.continue}
      </button>
    </>
  );
}

/**
 * Two presentations, one breakpoint.
 *
 * **≥1024px** — a drawer on the right, and the reader RESERVES its width
 * (`.reader-guide-open`) instead of letting it float on top. A drawer that
 * covers the paragraph the guide just pointed at defeats the whole feature.
 *
 * **<1024px** — a bottom sheet, capped so the chapter stays visible behind it.
 * A 380px side panel on a 768px tablet would cover half the column, so the
 * phone presentation is the right one there too.
 *
 * Both cap their own size: the panel is never what makes the page scroll
 * sideways.
 */
const PANEL_CSS = `
.reader-guide-panel {
  position: fixed;
  z-index: 60;
  background: var(--bg-surface, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: 0 -8px 30px rgba(60, 45, 90, 0.16);
}
.reader-guide-panel:focus { outline: none; }
@media (max-width: 1023px) {
  .reader-guide-panel {
    left: 0; right: 0; bottom: 0;
    /* Capped so the chapter is never fully hidden behind the sheet — on a
       390×844 phone this leaves roughly a third of the screen reading. */
    max-height: 62vh;
    border-radius: 18px 18px 0 0;
  }
}
@media (min-width: 1024px) {
  .reader-guide-panel {
    top: 0; right: 0; bottom: 0;
    width: min(380px, 100vw);
    border-left: 1px solid var(--color-warm-200, #e7e2dc);
    box-shadow: -8px 0 30px rgba(60, 45, 90, 0.12);
  }
  /* The reader gives up the width rather than being covered. Its column is
     centred inside what remains, so the anchored paragraph stays fully
     visible after «Ir al pasaje». */
  .reader-guide-open {
    padding-right: 380px;
  }
}
.rgp-head { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px 0; }
.rgp-eyebrow { font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
  font-weight: 700; color: var(--color-lavender-500, #8a7ab8); }
.rgp-close { min-height: 44px; background: none; border: 0; cursor: pointer;
  font-size: 13px; color: var(--color-warm-600, #7a7069); }
.rgp-progress { margin: 4px 18px 0; font-size: 12px;
  color: var(--color-warm-500, #8d857d); }
.rgp-live { margin: 0 18px; font-size: 12.5px; }
.rgp-error { color: var(--color-warm-800, #4a423c); }
.rgp-error-text { margin: 6px 0 0; font-size: 12px;
  color: var(--color-rose-600, #b25454); }
.rgp-body { overflow-y: auto; padding: 10px 18px 4px; flex: 1; }
.rgp-title { font: 700 19px/1.25 var(--font-sans); margin: 8px 0 10px;
  color: var(--color-warm-900, #2f2a26); outline-offset: 4px; }
.rgp-duration { margin: 0 0 10px; font-size: 12.5px;
  color: var(--color-warm-500, #8d857d); }
.rgp-text { font-size: 14px; line-height: 1.6; margin: 0 0 10px;
  color: var(--color-warm-700, #5f574f); }
.rgp-note { font-size: 12px; line-height: 1.5; margin: 6px 0 12px;
  color: var(--color-warm-500, #8d857d); }
.rgp-btn { display: block; width: 100%; min-height: 44px; margin: 8px 0;
  border-radius: 12px; font-size: 13.5px; font-weight: 700; cursor: pointer; }
.rgp-btn.primary { border: 0; color: #fff;
  background: var(--color-lavender-500, #8a7ab8); }
.rgp-btn.ghost { background: transparent;
  border: 1px solid var(--color-warm-200, #e7e2dc);
  color: var(--color-warm-700, #5f574f); }
.rgp-btn:disabled { opacity: .6; cursor: default; }
.rgp-fieldset { border: 0; margin: 0; padding: 0; }
.rgp-legend { font-size: 14px; line-height: 1.55; font-weight: 600;
  margin-bottom: 8px; color: var(--color-warm-800, #4a423c); }
.rgp-option { display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px; min-height: 44px; border-radius: 12px;
  border: 1px solid var(--color-warm-200, #e7e2dc); margin-bottom: 8px;
  font-size: 13.5px; line-height: 1.5; cursor: pointer; }
.rgp-clip { display: flex; flex-direction: column; gap: 4px; padding: 18px;
  border-radius: 14px; text-align: center; font-size: 13.5px;
  background: var(--color-warm-100, #f3efe9); }
.rgp-banner { font: 700 12px/1.4 var(--font-sans); letter-spacing: .1em;
  margin: 8px 0 12px; color: var(--color-sage-600, #5f7a63); }
.rgp-resonance { padding: 12px; border-radius: 14px; margin-bottom: 10px;
  background: var(--color-lavender-50, #f4f1fa); }
.rgp-actions { margin-top: 14px; }
.rgp-scope { margin: 0; padding: 10px 18px 16px; font-size: 11.5px;
  line-height: 1.5; color: var(--color-warm-500, #8d857d); }
`;
