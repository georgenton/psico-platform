"use client";

/**
 * GR-6 — the Experience Player. The ONE player.
 *
 * There is no second implementation. The standalone route and the reader panel
 * both mount this component; what differs between them is the frame around it
 * — a page heading in one case, a drawer with a way back to the book in the
 * other — never the run, never the scenes, never the rules.
 *
 * It owns almost nothing:
 *
 *   - the RUN (network, idempotency, recovery, resync, retry, error mapping)
 *     is `useGuideRun`, unchanged and shared;
 *   - the STATE (which panel, which window, what may be pressed) is
 *     `deriveExperiencePresentationState`, a pure function;
 *   - the PANELS are the twelve renderers, resolved through a closed registry.
 *
 * What is left here is wiring, and one decision worth naming: this component
 * never starts anything on its own. It asks whether a run exists, shows what
 * it found, and waits for a click. A player that auto-started would begin a
 * journey the reader only glanced at.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChapterConcept, ChapterExperiencePublicView } from "@psico/types";
import { useGuideRun, type GuideRun } from "../guide/use-guide-run";
import { GUIDE_SCOPE_NOTE } from "../guide/guide-presentation";
import type { GuideWebBundle } from "../guide/guide-web-bundle";
import type { GuideAnchorResolution } from "../guide/guide-anchor";
import {
  deriveExperiencePresentationState,
  sceneKeyAt,
} from "./experience-presentation";
import {
  clearExperienceScene,
  readExperienceScene,
  sceneKeyFor,
  writeExperienceScene,
} from "./experience-scene-store";
import { rendererForSceneKind } from "./experience-scene-registry";
import { CompletionSummary } from "./CompletionSummary";
import type {
  ExperienceMediaHooks,
  ExperienceSceneContext,
} from "./scene-contract";
import {
  SceneAction,
  SceneActions,
  SceneBody,
  SceneHeading,
} from "./scenes/scene-ui";

export interface ExperiencePlayerProps {
  /** Opaque server-derived partition. The authority on who this browser is. */
  actorScope: string;
  /** The exact experience to play, resolved by the caller. */
  definition: ChapterExperiencePublicView;
  /** The pinned guide whose steps this experience's scenes may complete. */
  bundle: GuideWebBundle;
  anchor?: GuideAnchorResolution | null;
  concept?: ChapterConcept | null;
  media?: ExperienceMediaHooks | null;
  /** Scroll + focus the anchored paragraph. The player stays open. */
  onGoToPassage?: () => void;
  /** Leave the player and select Leer explicitly. */
  onContinueReading?: () => void;
  /** Restore whatever surface the reader asked for before opening this. */
  onClose?: () => void;
  /**
   * Confirm the chapter concept as a resonance. One explicit tap, one write,
   * on the resonance endpoint — never the check-in.
   */
  onConfirmResonance?: () => Promise<void>;
  /**
   * GR-7 — back to Chapter Home to pick a different journey. Present only
   * when the chapter actually publishes another one, so the Completion
   * Summary never offers a door with nothing behind it.
   */
  onPickAnotherExperience?: () => void;
}

/**
 * The LIVE player: the reader's run, owned by the server.
 *
 * This is the only place `useGuideRun` is called, and it stays that way. The
 * CMS preview does not reach into this component or teach the hook a second
 * mode — it renders the same surface below from an in-memory run, so there is
 * one player, one registry and twelve renderers no matter who is looking.
 */
export function ExperiencePlayer(props: ExperiencePlayerProps) {
  const run = useGuideRun({
    actorScope: props.actorScope,
    pin: props.bundle.pin,
    presentation: props.bundle.presentation,
  });

  return <ExperiencePlayerSurface {...props} run={run} />;
}

export interface ExperiencePlayerSurfaceProps extends ExperiencePlayerProps {
  /** Where the run's state comes from. Live from the server, or in memory. */
  run: GuideRun;
  /**
   * Whether moving between panels is remembered for next time.
   *
   * The reader's cursor is per-experience and lives in `localStorage`. A
   * preview must not touch it: an editor stepping through a draft would
   * otherwise move the place a reader comes back to.
   */
  persistSceneCursor?: boolean;
}

/**
 * Everything that turns a run plus a definition into panels on screen.
 *
 * It holds no opinion about where the run came from, which is exactly what
 * lets the CMS preview reuse it without a fork.
 */
export function ExperiencePlayerSurface({
  actorScope,
  definition,
  bundle,
  anchor = null,
  concept = null,
  media = null,
  onGoToPassage,
  onContinueReading,
  onClose,
  onConfirmResonance,
  onPickAnotherExperience,
  run,
  persistSceneCursor = true,
}: ExperiencePlayerSurfaceProps) {
  const pin = useMemo(
    () => ({
      experienceKey: definition.experienceKey,
      experienceVersion: definition.experienceVersion,
    }),
    [definition.experienceKey, definition.experienceVersion],
  );

  // The remembered panel, re-read whenever the server's checkpoint moves. It
  // is advisory: `deriveExperiencePresentationState` clamps it to the window
  // and ignores it outright when it belongs to another session.
  const [localSceneKey, setLocalSceneKey] = useState<string | null>(null);
  /**
   * GR-7 — whether the reader saved a resonance during THIS run.
   *
   * Lifted out of the scene so the Completion Summary can report it, and set
   * only when the write actually succeeded. «Ahora no» leaves it false and
   * writes nothing: an absent yes is not a no worth recording.
   */
  const [resonanceConfirmed, setResonanceConfirmed] = useState(false);
  const confirmResonance = useCallback(async () => {
    if (!onConfirmResonance) return;
    await onConfirmResonance();
    setResonanceConfirmed(true);
  }, [onConfirmResonance]);
  const serverKey = `${run.session?.sessionId ?? ""}|${run.session?.currentStepKey ?? ""}`;
  useEffect(() => {
    if (!run.session) {
      setLocalSceneKey(null);
      return;
    }
    const stored = persistSceneCursor
      ? readExperienceScene(actorScope, pin)
      : null;
    setLocalSceneKey(sceneKeyFor(run.session, stored));
    // `serverKey` is the dependency on purpose: the cursor is only re-read when
    // the SERVER's coordinates change, not on every render.
  }, [actorScope, pin, persistSceneCursor, run.session, serverKey]);

  const state = useMemo(
    () =>
      deriveExperiencePresentationState({
        definition,
        guideSession: run.session,
        recoverableSession: run.recoverable,
        localSceneKey,
      }),
    [definition, run.session, run.recoverable, localSceneKey],
  );

  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (run.booting || run.busy) return;
    // Focus the panel after a transition so the change is announced instead of
    // leaving the reader on a control that no longer exists.
    headingRef.current?.querySelector<HTMLElement>("h3, h2")?.focus();
  }, [state.activeIndex, state.status, run.booting, run.busy]);

  /**
   * Move one panel forward. Presentation only — no command leaves, with ONE
   * exception at the very end.
   *
   * The scenes after the last checkpoint are the close: a summary, sometimes an
   * optional resonance. Their forward action is the only thing left to press,
   * so it is what completes the run. Without this the closing «Continuar» (and
   * the resonance's «Ahora no» / «Terminar», which share this handler) is inert
   * at `windowEndIndex`: every checkpoint is registered, nothing calls
   * SESSION_COMPLETE, and the session stays ACTIVE forever — so the Completion
   * Summary is unreachable and the card never stops saying «Continuar».
   *
   * `finish` is idempotent and server-owned; a second press replays rather than
   * opening anything new.
   */
  const goForward = useCallback(() => {
    if (!run.session) return;
    const next = state.activeIndex + 1;
    if (next > state.windowEndIndex) {
      if (state.status === "awaiting_guide_completion") void run.finish();
      return;
    }
    const key = sceneKeyAt(definition, next);
    if (key === null) return;
    setLocalSceneKey(key);
    if (!persistSceneCursor) return;
    writeExperienceScene(
      {
        schemaVersion: 1,
        actorScope,
        experienceKey: pin.experienceKey,
        experienceVersion: pin.experienceVersion,
        sessionId: run.session.sessionId,
        currentStepKey: run.session.currentStepKey,
        sceneKey: key,
      },
      pin,
    );
  }, [
    actorScope,
    definition,
    persistSceneCursor,
    pin,
    run,
    state.activeIndex,
    state.status,
    state.windowEndIndex,
  ]);

  const goBack = useCallback(() => {
    if (!run.session) return;
    const prev = state.activeIndex - 1;
    if (prev < state.windowStartIndex) return;
    const key = sceneKeyAt(definition, prev);
    if (key === null) return;
    setLocalSceneKey(key);
    if (!persistSceneCursor) return;
    writeExperienceScene(
      {
        schemaVersion: 1,
        actorScope,
        experienceKey: pin.experienceKey,
        experienceVersion: pin.experienceVersion,
        sessionId: run.session.sessionId,
        currentStepKey: run.session.currentStepKey,
        sceneKey: key,
      },
      pin,
    );
  }, [
    actorScope,
    definition,
    persistSceneCursor,
    pin,
    run.session,
    state.activeIndex,
    state.windowStartIndex,
  ]);

  // ── Terminal and pre-run screens ─────────────────────────────────────────
  if (run.booting) {
    return (
      <Panel busy>
        <p style={mutedStyle}>Recuperando tu avance…</p>
      </Panel>
    );
  }

  if (run.screen === "storage-unavailable") {
    return (
      <Panel>
        <SceneHeading>
          No podemos guardar tu avance en este navegador
        </SceneHeading>
        <SceneBody>
          Sin poder guardar la recuperación no podemos garantizar que un paso se
          registre una sola vez, así que no abrimos el recorrido.
        </SceneBody>
        {onClose ? (
          <SceneActions>
            <SceneAction label="Cerrar" onClick={onClose} variant="ghost" />
          </SceneActions>
        ) : null}
      </Panel>
    );
  }

  if (state.status === "contract_error" || run.screen === "inconsistent") {
    return (
      <Panel>
        {/* No internal code, no scene kind, no guess at what the data meant. */}
        <SceneHeading>No pudimos mostrar este recorrido</SceneHeading>
        <SceneBody>
          Tu avance está guardado. Puedes volver al capítulo y seguir leyendo.
        </SceneBody>
        <SceneActions>
          {onContinueReading ? (
            <SceneAction
              label="Continuar leyendo"
              onClick={onContinueReading}
            />
          ) : null}
          {onClose ? (
            <SceneAction label="Cerrar" onClick={onClose} variant="ghost" />
          ) : null}
        </SceneActions>
      </Panel>
    );
  }

  if (state.status === "cover") {
    return (
      <Panel>
        <SceneHeading>{definition.title}</SceneHeading>
        {definition.summary ? (
          <SceneBody>{definition.summary}</SceneBody>
        ) : null}
        <p style={mutedStyle}>
          {definition.scenes.length} momentos
          {definition.estimatedMinutes
            ? ` · unos ${definition.estimatedMinutes} minutos`
            : ""}
        </p>
        <SceneActions>
          <SceneAction
            label={run.busy ? "Abriendo…" : "Empezar experiencia"}
            onClick={() => void run.start()}
            disabled={run.busy}
          />
          {onClose ? (
            <SceneAction label="Ahora no" onClick={onClose} variant="ghost" />
          ) : null}
        </SceneActions>
        <ScopeNote />
      </Panel>
    );
  }

  if (state.status === "recoverable") {
    return (
      <Panel>
        <SceneHeading>Tienes este recorrido abierto</SceneHeading>
        <SceneBody>
          Lo empezaste antes — quizá en otro dispositivo. Puedes seguir donde lo
          dejaste o empezarlo de nuevo.
        </SceneBody>
        <SceneActions>
          {/* Continue ADOPTS the open session. Start fresh sends a real START,
              which the server answers by closing the open run and opening a
              new one — the existing lifecycle, not a client-side cancel. */}
          <SceneAction label="Continuar experiencia" onClick={run.adopt} />
          <SceneAction
            label={run.busy ? "Abriendo…" : "Empezar de nuevo"}
            onClick={() => {
              if (persistSceneCursor) clearExperienceScene(pin);
              void run.start();
            }}
            disabled={run.busy}
            variant="ghost"
          />
        </SceneActions>
        <ScopeNote />
      </Panel>
    );
  }

  if (state.status === "completed") {
    return (
      <Panel>
        {/* GR-7 — the end of a journey reports facts, not a score. */}
        <CompletionSummary
          experience={definition}
          session={run.session}
          facts={run.facts}
          serverSummary={run.serverSummary}
          resonanceConfirmed={resonanceConfirmed}
          {...(onContinueReading ? { onContinueReading } : {})}
          {...(onClose ? { onBackToChapter: onClose } : {})}
          {...(onPickAnotherExperience
            ? { onPickAnother: onPickAnotherExperience }
            : {})}
          onRepeat={() => {
            if (persistSceneCursor) clearExperienceScene(pin);
            void run.start();
          }}
        />
      </Panel>
    );
  }

  // ── A scene ───────────────────────────────────────────────────────────────
  const scene = state.activeScene;
  const Renderer = scene ? rendererForSceneKind(scene.kind) : null;

  if (!scene || !Renderer) {
    return (
      <Panel>
        <SceneHeading>No pudimos mostrar este momento</SceneHeading>
        <SceneBody>
          Tu avance está guardado. Puedes volver al capítulo y seguir leyendo.
        </SceneBody>
        <SceneActions>
          {onContinueReading ? (
            <SceneAction
              label="Continuar leyendo"
              onClick={onContinueReading}
            />
          ) : null}
        </SceneActions>
      </Panel>
    );
  }

  const context: ExperienceSceneContext = {
    scene,
    session: run.session,
    pendingStepKey: state.pendingStepKey,
    busy: run.busy,
    anchor,
    concept,
    media,
    recallOutcome: run.recallOutcome,
    confirmStep: run.completeStep,
    submitRecall: run.submitRecall,
    goForward,
    goToPassage: onGoToPassage ?? null,
    confirmResonance: onConfirmResonance ? confirmResonance : null,
  };

  // The renderer is typed against its own narrowed scene; the registry hands
  // back the erased form, so the cast happens once, here, rather than in each
  // of the twelve panels.
  const Scene = Renderer;

  return (
    <Panel>
      <Progress
        completed={run.session?.stepsCompleted ?? 0}
        total={run.session?.totalSteps ?? 0}
      />

      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="experience-live-region"
      >
        {run.error ? (
          <p
            role="alert"
            style={{ ...mutedStyle, color: "var(--color-warm-800)" }}
          >
            {run.error.message}
            {run.retry ? (
              <>
                {" "}
                <button
                  type="button"
                  className="btn ghost"
                  onClick={run.retryPending}
                  disabled={run.busy}
                  style={{ minHeight: 44, marginLeft: 8 }}
                >
                  Reintentar
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div ref={headingRef}>
        <Scene {...context} />
      </div>

      <SceneActions>
        {state.canGoBack ? (
          <SceneAction label="Anterior" onClick={goBack} variant="ghost" />
        ) : null}
        {onContinueReading ? (
          <SceneAction
            label="Continuar leyendo"
            onClick={onContinueReading}
            variant="ghost"
          />
        ) : null}
        {onClose ? (
          <SceneAction label="Cerrar" onClick={onClose} variant="ghost" />
        ) : null}
      </SceneActions>
      <ScopeNote />
    </Panel>
  );
}

function Panel({
  children,
  busy = false,
}: {
  children: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="card" style={{ padding: 24 }} aria-busy={busy || undefined}>
      {children}
    </div>
  );
}

/** Progress, entirely from the server's numbers. */
function Progress({ completed, total }: { completed: number; total: number }) {
  if (total <= 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <p
        className="sec-label"
        style={{ margin: 0, color: "var(--color-warm-500)" }}
      >
        {completed} de {total} pasos registrados
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-label={`${completed} de ${total} pasos registrados`}
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
            width: `${Math.round((completed / total) * 100)}%`,
            height: "100%",
            background: "var(--color-sage-500)",
          }}
        />
      </div>
    </div>
  );
}

function ScopeNote() {
  return (
    <p
      style={{
        marginTop: 16,
        fontSize: 12.5,
        lineHeight: 1.6,
        color: "var(--color-warm-500)",
        maxWidth: 540,
      }}
    >
      {GUIDE_SCOPE_NOTE}
    </p>
  );
}

const mutedStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "var(--color-warm-500)",
  margin: "0 0 8px",
};
