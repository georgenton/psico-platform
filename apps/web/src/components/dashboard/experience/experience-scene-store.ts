/**
 * GR-6 — the local scene cursor.
 *
 * The successor to the eight-scene record of GR-3, and it keeps that file's
 * one good idea: what is written here is never progress. Progress lives in the
 * accepted-step ledger on the server. Losing this costs the reader a tap.
 *
 * What that buys is the freedom to be strict. Every read is validated against
 * the actor, the exact experience pin, the session and the checkpoint the
 * server just reported; anything that fails any of those checks is discarded
 * rather than repaired, and the caller falls back to the first scene of the
 * current checkpoint.
 *
 * What is deliberately NOT here: any token, any userId, any email, the text a
 * reader typed into a reflection, the option they picked, the catalog's
 * answer, and any signed media URL. The record is a scene key and the
 * coordinates that make it meaningful.
 */

import type { ExperiencePin } from "@psico/types";

export interface ExperienceSceneRecord {
  schemaVersion: 1;
  actorScope: string;
  experienceKey: string;
  experienceVersion: number;
  sessionId: string;
  /** The checkpoint this scene belonged to. A moved cursor invalidates it. */
  currentStepKey: string | null;
  sceneKey: string;
}

const RECORD_KEYS = [
  "schemaVersion",
  "actorScope",
  "experienceKey",
  "experienceVersion",
  "sessionId",
  "currentStepKey",
  "sceneKey",
] as const;

/** `psico.experience.scene.<experienceKey>.v<version>` — one slot per pin. */
export function experienceSceneStorageKey(pin: ExperiencePin): string | null {
  if (typeof pin.experienceKey !== "string" || pin.experienceKey.length === 0) {
    return null;
  }
  if (!Number.isInteger(pin.experienceVersion) || pin.experienceVersion <= 0) {
    return null;
  }
  return `psico.experience.scene.${pin.experienceKey}.v${pin.experienceVersion}`;
}

/** Structural parse. An unknown key is a rejection, not a field to ignore. */
export function parseExperienceSceneRecord(
  raw: unknown,
  actorScope: string,
  pin: ExperiencePin,
): ExperienceSceneRecord | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const rec = raw as Record<string, unknown>;
  if (Object.keys(rec).some((k) => !RECORD_KEYS.includes(k as never))) {
    return null;
  }
  if (rec.schemaVersion !== 1) return null;
  // The actor is the authority. A record written by another account must not
  // vouch for itself just because it sits in this browser's storage.
  if (rec.actorScope !== actorScope) return null;
  if (rec.experienceKey !== pin.experienceKey) return null;
  if (rec.experienceVersion !== pin.experienceVersion) return null;
  if (typeof rec.sessionId !== "string" || rec.sessionId.length === 0) {
    return null;
  }
  if (rec.currentStepKey !== null && typeof rec.currentStepKey !== "string") {
    return null;
  }
  if (typeof rec.sceneKey !== "string" || rec.sceneKey.length === 0) {
    return null;
  }
  return {
    schemaVersion: 1,
    actorScope,
    experienceKey: pin.experienceKey,
    experienceVersion: pin.experienceVersion,
    sessionId: rec.sessionId,
    currentStepKey: rec.currentStepKey,
    sceneKey: rec.sceneKey,
  };
}

export function readExperienceScene(
  actorScope: string,
  pin: ExperiencePin,
): ExperienceSceneRecord | null {
  const storageKey = experienceSceneStorageKey(pin);
  if (storageKey === null) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    return parseExperienceSceneRecord(JSON.parse(raw), actorScope, pin);
  } catch {
    // Storage blocked, or a corrupt string. Neither deserves an error screen:
    // the reader just opens this checkpoint at its first panel.
    return null;
  }
}

/**
 * The remembered scene, but only when the record still describes the run the
 * server just reported. A cursor from a previous session, or from a checkpoint
 * the reader has already left, is not this moment.
 */
export function sceneKeyFor(
  server: { sessionId: string; currentStepKey: string | null },
  stored: ExperienceSceneRecord | null,
): string | null {
  if (!stored) return null;
  if (stored.sessionId !== server.sessionId) return null;
  if (stored.currentStepKey !== server.currentStepKey) return null;
  return stored.sceneKey;
}

export function writeExperienceScene(
  record: ExperienceSceneRecord,
  pin: ExperiencePin,
): void {
  const storageKey = experienceSceneStorageKey(pin);
  if (storageKey === null) return;
  if (record.experienceKey !== pin.experienceKey) return;
  if (record.experienceVersion !== pin.experienceVersion) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Best effort by construction — nothing here is progress.
  }
}

export function clearExperienceScene(pin: ExperiencePin): void {
  const storageKey = experienceSceneStorageKey(pin);
  if (storageKey === null) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* nothing to clear if we cannot reach storage */
  }
}
