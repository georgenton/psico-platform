/**
 * GR-6 — where the reader is standing inside an experience.
 *
 * A pure function, deliberately. It reads no network, touches no storage and
 * uses no React, so the rules below can be argued about in a test instead of
 * inferred from a render. Everything that talks to a server lives in
 * `useGuideRun`; everything that decides what a person sees lives here.
 *
 * The division of authority is the whole design:
 *
 *   - the SERVER owns progress. `currentStepKey` and the accepted-step count
 *     come from the guide ledger and are never recomputed here.
 *   - this file owns PRESENTATION. Which panel of the current checkpoint is on
 *     screen is a local matter; losing it costs a tap, never progress.
 *
 * Cross-device resume follows from that split. A second device knows the
 * checkpoint exactly and the panel not at all, so it opens the FIRST scene
 * after the previous checkpoint and lets the reader walk forward to the
 * pending one. It never jumps over a domain step that has not been accepted,
 * and it never claims the reader had already seen a panel it cannot know
 * about:
 *
 * ```
 * CROSS_DEVICE_CHECKPOINT_RESUME=true
 * CROSS_DEVICE_EXACT_SCENE_RESUME=false
 * ```
 */

import { SCENE_BINDABLE_STEP_KINDS } from "@psico/types";
import type {
  ChapterExperiencePublicView,
  ExperienceScenePublicView,
  ExperienceSceneKind,
  GuideSessionView,
} from "@psico/types";

/** The runtime set of the twelve kinds, derived from the binding matrix. */
const KNOWN_SCENE_KINDS = new Set<string>(
  Object.keys(SCENE_BINDABLE_STEP_KINDS),
);

export type ExperiencePresentationStatus =
  | "cover"
  | "recoverable"
  | "in_progress"
  | "awaiting_guide_completion"
  | "completed"
  | "contract_error";

/**
 * Why a definition cannot be rendered. Each one is a fact about the DATA, not
 * about the reader — which is why every one of them ends in the same place: a
 * plain message and a way back to the chapter.
 */
export type ExperienceContractErrorCode =
  | "EXPERIENCE_HAS_NO_SCENES"
  | "UNKNOWN_SCENE_KIND"
  | "NO_SCENE_FOR_CURRENT_STEP"
  | "DUPLICATE_SCENE_FOR_STEP";

export interface ExperiencePresentationState {
  status: ExperiencePresentationStatus;
  /** Whether an explicit «Empezar» is the right offer right now. */
  startable: boolean;
  /** Whether a recovered session is waiting to be continued. */
  resumable: boolean;
  /**
   * The scenes the reader may move through at this checkpoint, as indices into
   * `definition.scenes`. Inclusive on both ends. Outside this window a scene
   * either belongs to a checkpoint already behind them, or to one whose domain
   * step the server has not accepted.
   */
  windowStartIndex: number;
  windowEndIndex: number;
  activeIndex: number;
  activeScene: ExperienceScenePublicView | null;
  /** Movement inside the window. Neither direction touches the ledger. */
  canGoBack: boolean;
  canGoForward: boolean;
  /**
   * The guide step the ACTIVE scene offers to complete, when that step is the
   * one the server is waiting for. `null` on every presentational scene and on
   * a bound scene whose step is already accepted.
   */
  pendingStepKey: string | null;
  contractError: ExperienceContractErrorCode | null;
}

export interface DeriveExperiencePresentationInput {
  definition: ChapterExperiencePublicView;
  /** The server's view of the run, or `null` when there is no session yet. */
  guideSession: GuideSessionView | null;
  /**
   * A recoverable session the reader has NOT yet chosen to continue. Distinct
   * from `guideSession`: this one is an offer, not a run.
   */
  recoverableSession?: GuideSessionView | null;
  /** The scene this device remembers, if any. Advisory — never authority. */
  localSceneKey?: string | null;
}

/** The scene bound to a step, or `null`. Duplicates are a contract error. */
function sceneIndexForStep(
  scenes: readonly ExperienceScenePublicView[],
  stepKey: string,
): number | "DUPLICATE" | null {
  let found: number | null = null;
  for (let i = 0; i < scenes.length; i += 1) {
    if (scenes[i]?.completesGuideStepKey !== stepKey) continue;
    if (found !== null) return "DUPLICATE";
    found = i;
  }
  return found;
}

/** Indices of every bound scene, in scene order. */
function boundIndices(scenes: readonly ExperienceScenePublicView[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < scenes.length; i += 1) {
    if (scenes[i]?.completesGuideStepKey !== undefined) out.push(i);
  }
  return out;
}

function structuralError(
  scenes: readonly ExperienceScenePublicView[],
): ExperienceContractErrorCode | null {
  if (scenes.length === 0) return "EXPERIENCE_HAS_NO_SCENES";
  for (const scene of scenes) {
    if (!KNOWN_SCENE_KINDS.has(scene.kind as ExperienceSceneKind)) {
      // A kind this build cannot name is a kind it cannot render. Guessing
      // would put an unknown panel in front of a reader; failing closed puts a
      // sentence and a way out.
      return "UNKNOWN_SCENE_KIND";
    }
  }
  return null;
}

function errorState(
  code: ExperienceContractErrorCode,
): ExperiencePresentationState {
  return {
    status: "contract_error",
    startable: false,
    resumable: false,
    windowStartIndex: 0,
    windowEndIndex: 0,
    activeIndex: 0,
    activeScene: null,
    canGoBack: false,
    canGoForward: false,
    pendingStepKey: null,
    contractError: code,
  };
}

/**
 * The one place that answers "what should this reader see right now?".
 *
 * Order matters here. A contract error outranks everything, because a
 * definition we cannot render honestly cannot be offered either. After that
 * the server's status decides, and only then does this device's memory get a
 * say — and only inside the window the server's checkpoint defines.
 */
export function deriveExperiencePresentationState({
  definition,
  guideSession,
  recoverableSession = null,
  localSceneKey = null,
}: DeriveExperiencePresentationInput): ExperiencePresentationState {
  const scenes = definition.scenes;

  const structural = structuralError(scenes);
  if (structural) return errorState(structural);

  const lastIndex = scenes.length - 1;

  // ── No run yet ────────────────────────────────────────────────────────────
  if (guideSession === null) {
    const resumable = recoverableSession !== null;
    return {
      // A recoverable session is its own answer: offering only «Empezar» would
      // quietly abandon a journey the reader already started elsewhere.
      status: resumable ? "recoverable" : "cover",
      startable: !resumable,
      resumable,
      windowStartIndex: 0,
      windowEndIndex: 0,
      activeIndex: 0,
      activeScene: null,
      canGoBack: false,
      canGoForward: false,
      pendingStepKey: null,
      contractError: null,
    };
  }

  // ── Terminal server states ────────────────────────────────────────────────
  if (
    guideSession.status === "COMPLETED" ||
    guideSession.status === "CANCELLED"
  ) {
    return {
      status: "completed",
      // Starting again is a real offer, but it is the caller's lifecycle call,
      // not something this function performs.
      startable: true,
      resumable: false,
      windowStartIndex: lastIndex,
      windowEndIndex: lastIndex,
      activeIndex: lastIndex,
      activeScene: scenes[lastIndex] ?? null,
      canGoBack: false,
      canGoForward: false,
      pendingStepKey: null,
      contractError: null,
    };
  }

  const bound = boundIndices(scenes);

  // ── Every checkpoint accepted ─────────────────────────────────────────────
  if (guideSession.currentStepKey === null) {
    const lastCheckpoint = bound.length > 0 ? bound[bound.length - 1]! : -1;
    const start = Math.min(lastCheckpoint + 1, lastIndex);
    // Scenes after the last checkpoint are the close: a summary, sometimes an
    // optional resonance. When there are none, the experience simply ends.
    const hasClosing = lastCheckpoint < lastIndex;
    const active = clampToWindow(
      indexOfSceneKey(scenes, localSceneKey),
      start,
      lastIndex,
    );
    return {
      status: hasClosing ? "awaiting_guide_completion" : "completed",
      startable: false,
      resumable: false,
      windowStartIndex: start,
      windowEndIndex: lastIndex,
      activeIndex: active,
      activeScene: scenes[active] ?? null,
      canGoBack: active > start,
      canGoForward: active < lastIndex,
      pendingStepKey: null,
      contractError: null,
    };
  }

  // ── A checkpoint is pending ───────────────────────────────────────────────
  const target = sceneIndexForStep(scenes, guideSession.currentStepKey);
  if (target === "DUPLICATE") return errorState("DUPLICATE_SCENE_FOR_STEP");
  if (target === null) {
    // The server named a step this experience does not present. Opening the
    // first scene instead would silently hand the reader a different
    // checkpoint than the one they owe.
    return errorState("NO_SCENE_FOR_CURRENT_STEP");
  }

  // The window opens right after the PREVIOUS checkpoint — the last thing the
  // server confirms this reader finished. On a second device that is all we
  // honestly know, and it is enough.
  const previousCheckpoint = bound.filter((i) => i < target).pop() ?? -1;
  const start = previousCheckpoint + 1;

  const active = clampToWindow(
    indexOfSceneKey(scenes, localSceneKey),
    start,
    target,
  );
  const activeScene = scenes[active] ?? null;

  return {
    status: "in_progress",
    startable: false,
    resumable: false,
    windowStartIndex: start,
    windowEndIndex: target,
    activeIndex: active,
    activeScene,
    canGoBack: active > start,
    // Forward stops AT the pending checkpoint. Walking past it would be the
    // client deciding a step happened.
    canGoForward: active < target,
    pendingStepKey:
      activeScene?.completesGuideStepKey === guideSession.currentStepKey
        ? guideSession.currentStepKey
        : null,
    contractError: null,
  };
}

/** Index of a remembered scene key, or -1 when absent or unknown. */
function indexOfSceneKey(
  scenes: readonly ExperienceScenePublicView[],
  sceneKey: string | null,
): number {
  if (sceneKey === null) return -1;
  return scenes.findIndex((s) => s.sceneKey === sceneKey);
}

/**
 * A remembered scene counts only INSIDE the current window. Outside it the
 * memory is stale — the checkpoint moved on, or moved back — and the honest
 * answer is the start of the window rather than a panel from another moment.
 */
function clampToWindow(index: number, start: number, end: number): number {
  if (index < start || index > end) return start;
  return index;
}

/**
 * The scene the reader lands on for a given window. Exported because the
 * player writes it to local storage and the test reads it back.
 */
export function sceneKeyAt(
  definition: ChapterExperiencePublicView,
  index: number,
): string | null {
  return definition.scenes[index]?.sceneKey ?? null;
}
