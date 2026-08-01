/**
 * GR-3 — where inside a checkpoint the reader is standing.
 *
 * The server owns the RUN: three checkpoints, derived from the accepted-step
 * ledger. This file owns something much smaller and strictly local: which of
 * the eight screens of the current checkpoint is on screen right now.
 *
 * That distinction is the whole design. Losing this record costs the reader a
 * tap; it can never cost them progress, because progress is not here. So it
 * lives in `localStorage`, it is validated against the server's own state on
 * every read, and anything unrecognised falls back to the FIRST scene of the
 * CURRENT checkpoint — never to the beginning of the guide.
 *
 * Nothing about a run syncs across browsers, and that is a property of V1, not
 * of this file. The Guide has no read endpoint: a browser learns state ONLY by
 * replaying the START idempotency key it stored locally. Without that key there
 * is no session to find, so another device shows the cover and starts a new
 * run.
 *
 * ```
 * CROSS_DEVICE_RESUME_V1=false
 * CROSS_DEVICE_SCENE_SYNC=false
 * CROSS_DEVICE_CHECKPOINT_SYNC=false
 * ANOTHER_DEVICE_BEHAVIOR=NEW_COVER_NEW_SESSION
 * ```
 *
 * GR-4 — one slot PER PIN, and the first scene of a checkpoint is now READ
 * from the pinned presentation instead of inferred from the step key. The old
 * `stepKey.startsWith("practicar")` made a Spanish word part of the contract:
 * a guide whose steps were named differently would have opened on the wrong
 * screen silently. Now an unknown step is `null` — a fail-closed signal the
 * caller renders as "we could not show the current step", never as the cover.
 */

import { guidePinKey, type GuidePin } from "./guide-pin";
import type { GuidePresentation } from "./guide-presentation";
import type { GuideRecallOutcome } from "@psico/types";

/** The eight presentation scenes. Only the server's three are domain. */
export type GuideScene =
  | "cover"
  | "clip"
  | "anchor"
  | "practice"
  | "recall"
  | "feedback"
  | "finish"
  | "completed";

const SCENES: readonly GuideScene[] = [
  "cover",
  "clip",
  "anchor",
  "practice",
  "recall",
  "feedback",
  "finish",
  "completed",
];

/**
 * What is written down. Deliberately NOT here: any token, any userId, the
 * option the reader picked, the catalog's correct option, anything they typed,
 * and any signed URL. The outcome IS here — it is what the server already told
 * this browser, and re-showing it is not re-deciding it.
 */
export interface GuideSceneRecord {
  schemaVersion: 1;
  actorScope: string;
  guideKey: string;
  guideVersion: number;
  sessionId: string;
  currentStepKey: string | null;
  scene: GuideScene;
  recallOutcome?: GuideRecallOutcome;
}

const RECORD_KEYS = [
  "schemaVersion",
  "actorScope",
  "guideKey",
  "guideVersion",
  "sessionId",
  "currentStepKey",
  "scene",
  "recallOutcome",
] as const;

/** `psico.guide.scene.<guideKey>.v<guideVersion>` — one slot per exact guide. */
export function sceneStorageKey(pin: GuidePin): string | null {
  const key = guidePinKey(pin);
  if (key === null) return null;
  return `psico.guide.scene.${pin.guideKey}.v${pin.guideVersion}`;
}

function isScene(value: unknown): value is GuideScene {
  return typeof value === "string" && SCENES.includes(value as GuideScene);
}

/** Structural parse. An unknown key is a rejection, not a field to ignore. */
export function parseGuideSceneRecord(
  raw: unknown,
  actorScope: string,
  pin: GuidePin,
): GuideSceneRecord | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  if (Object.keys(rec).some((k) => !RECORD_KEYS.includes(k as never))) {
    return null;
  }
  if (rec.schemaVersion !== 1) return null;
  // The actor is the authority. A record written by another account must not
  // vouch for itself just because it is in this browser's storage.
  if (rec.actorScope !== actorScope) return null;
  // …and neither must a record written for another guide.
  if (guidePinKey(pin) === null) return null;
  if (rec.guideKey !== pin.guideKey) return null;
  if (rec.guideVersion !== pin.guideVersion) return null;
  if (typeof rec.sessionId !== "string" || rec.sessionId.length === 0) {
    return null;
  }
  if (rec.currentStepKey !== null && typeof rec.currentStepKey !== "string") {
    return null;
  }
  if (!isScene(rec.scene)) return null;
  if (
    rec.recallOutcome !== undefined &&
    rec.recallOutcome !== "CORRECT" &&
    rec.recallOutcome !== "REVIEW"
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    actorScope,
    guideKey: pin.guideKey,
    guideVersion: pin.guideVersion,
    sessionId: rec.sessionId,
    currentStepKey: rec.currentStepKey,
    scene: rec.scene,
    ...(rec.recallOutcome ? { recallOutcome: rec.recallOutcome } : {}),
  };
}

export function readGuideScene(
  actorScope: string,
  pin: GuidePin,
): GuideSceneRecord | null {
  const storageKey = sceneStorageKey(pin);
  if (storageKey === null) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    return parseGuideSceneRecord(JSON.parse(raw), actorScope, pin);
  } catch {
    // Storage blocked, or a corrupt string. Neither is worth an error: the
    // reader just starts this checkpoint at its first scene.
    return null;
  }
}

export function writeGuideScene(record: GuideSceneRecord, pin: GuidePin): void {
  const storageKey = sceneStorageKey(pin);
  if (storageKey === null) return;
  if (record.guideKey !== pin.guideKey) return;
  if (record.guideVersion !== pin.guideVersion) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Best effort by construction — nothing here is progress.
  }
}

export function clearGuideScene(pin: GuidePin): void {
  const storageKey = sceneStorageKey(pin);
  if (storageKey === null) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* nothing to clear if we cannot reach storage */
  }
}

/**
 * The first scene of a checkpoint, READ from the pinned presentation.
 *
 *   - `null` step key → `finish` (the server says every step is accepted);
 *   - a known step  → its declared `initialReaderScene`;
 *   - an unknown step → `null`, the UNKNOWN_STEP signal.
 *
 * That last case used to become `cover`. It cannot any more: showing the cover
 * for a step this build cannot render would offer «Empezar» on a guide whose
 * current checkpoint has no screen.
 */
export function firstSceneOf(
  currentStepKey: string | null,
  presentation: GuidePresentation,
): GuideScene | null {
  if (currentStepKey === null) return "finish";
  const step = presentation.steps.find((s) => s.stepKey === currentStepKey);
  return step ? step.initialReaderScene : null;
}

/**
 * The scene to render, given what the SERVER says and what this browser
 * remembers. The server always wins: a record pinned to another session, or to
 * a checkpoint the reader has already left, is discarded.
 *
 * `null` propagates: when the checkpoint itself is unknown there is no scene
 * to fall back to.
 */
export function resolveScene(
  server: { sessionId: string; currentStepKey: string | null },
  stored: GuideSceneRecord | null,
  presentation: GuidePresentation,
): GuideScene | null {
  const fallback = firstSceneOf(server.currentStepKey, presentation);
  if (fallback === null) return null;
  if (!stored) return fallback;
  if (stored.sessionId !== server.sessionId) return fallback;
  if (stored.currentStepKey !== server.currentStepKey) return fallback;
  // `completed` is a server status, not a scene the browser may assert.
  if (stored.scene === "completed") return fallback;
  // A `feedback` scene is only meaningful WITH the verdict it is showing. A
  // record that lost its outcome (or carries a corrupt one — the parser would
  // have rejected that, so this is the belt to that braces) would render an
  // empty verdict, so it falls back to the checkpoint instead.
  if (stored.scene === "feedback" && !stored.recallOutcome) return fallback;
  return stored.scene;
}

/**
 * The outcome to show, from the record — but only when the record still
 * describes THIS session. A verdict from a previous run, or from a session
 * this browser no longer holds, is not this reader's answer.
 *
 * Another device has no record at all — and no START key either, so it never
 * reaches this function: it lands on the cover and starts a new run
 * (`CROSS_DEVICE_RESUME_V1=false`).
 */
export function storedOutcomeFor(
  server: { sessionId: string },
  stored: GuideSceneRecord | null,
): GuideRecallOutcome | null {
  if (!stored || stored.sessionId !== server.sessionId) return null;
  return stored.recallOutcome ?? null;
}
