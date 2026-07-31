/**
 * GR-3 — where inside a checkpoint the reader is standing.
 *
 * The server owns the RUN: three checkpoints (Concepto · Práctica · Recordar),
 * derived from the accepted-step ledger. This file owns something much smaller
 * and strictly local: which of the eight screens of the current checkpoint is
 * on screen right now.
 *
 * That distinction is the whole design. Losing this record costs the reader a
 * tap; it can never cost them progress, because progress is not here. So it
 * lives in `localStorage`, it is validated against the server's own state on
 * every read, and anything unrecognised falls back to the FIRST scene of the
 * CURRENT checkpoint — never to the beginning of the guide.
 *
 * `CROSS_DEVICE_SCENE_SYNC=false` / `CROSS_DEVICE_CHECKPOINT_SYNC=true`.
 */

import { GUIDE_KEY, GUIDE_VERSION } from "./guide-presentation";
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
  guideKey: typeof GUIDE_KEY;
  guideVersion: typeof GUIDE_VERSION;
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

const STORAGE_KEY = `psico.guide.scene.${GUIDE_KEY}.v1`;

function isScene(value: unknown): value is GuideScene {
  return typeof value === "string" && SCENES.includes(value as GuideScene);
}

/** Structural parse. An unknown key is a rejection, not a field to ignore. */
export function parseGuideSceneRecord(
  raw: unknown,
  actorScope: string,
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
  if (rec.guideKey !== GUIDE_KEY || rec.guideVersion !== GUIDE_VERSION) {
    return null;
  }
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
    guideKey: GUIDE_KEY,
    guideVersion: GUIDE_VERSION,
    sessionId: rec.sessionId,
    currentStepKey: rec.currentStepKey,
    scene: rec.scene,
    ...(rec.recallOutcome ? { recallOutcome: rec.recallOutcome } : {}),
  };
}

export function readGuideScene(actorScope: string): GuideSceneRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return parseGuideSceneRecord(JSON.parse(raw), actorScope);
  } catch {
    // Storage blocked, or a corrupt string. Neither is worth an error: the
    // reader just starts this checkpoint at its first scene.
    return null;
  }
}

export function writeGuideScene(record: GuideSceneRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Best effort by construction — nothing here is progress.
  }
}

export function clearGuideScene(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear if we cannot reach storage */
  }
}

/** The first scene of a checkpoint — the fallback whenever the record fails. */
export function firstSceneOf(currentStepKey: string | null): GuideScene {
  if (currentStepKey === null) return "finish";
  if (currentStepKey.startsWith("explorar")) return "cover";
  if (currentStepKey.startsWith("practicar")) return "practice";
  if (currentStepKey.startsWith("recordar")) return "recall";
  return "cover";
}

/**
 * The scene to render, given what the SERVER says and what this browser
 * remembers. The server always wins: a record pinned to another session, or to
 * a checkpoint the reader has already left, is discarded.
 */
export function resolveScene(
  server: { sessionId: string; currentStepKey: string | null },
  stored: GuideSceneRecord | null,
): GuideScene {
  const fallback = firstSceneOf(server.currentStepKey);
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
 * Another device has no record at all: it gets `null` here and lands on the
 * first scene of the server-owned checkpoint. Scene position does not sync;
 * the checkpoint does.
 */
export function storedOutcomeFor(
  server: { sessionId: string },
  stored: GuideSceneRecord | null,
): GuideRecallOutcome | null {
  if (!stored || stored.sessionId !== server.sessionId) return null;
  return stored.recallOutcome ?? null;
}

export const GUIDE_SCENE_STORAGE_KEY = STORAGE_KEY;
