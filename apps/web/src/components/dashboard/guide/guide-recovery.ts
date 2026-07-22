import {
  GUIDE_KEY,
  GUIDE_VERSION,
  isGuideOptionKey,
  isGuideStepKey,
  type GuideOptionKeyWeb,
  type GuideStepKeyWeb,
} from "./guide-presentation";

/**
 * CC-7.5 — local recovery WITHOUT a GET.
 *
 * The Guide surface exposes five commands and no read endpoint, by design.
 * So the browser does not remember a session's STATE — it remembers the
 * `idempotencyKey` of the START it once sent. Replaying that exact START
 * returns the original session with its CURRENT server-derived projection
 * (`replayed: true`), which keeps the server the single source of truth even
 * across a reload, a crash or a second tab.
 *
 * The same idea covers an ambiguous write: a command's key is persisted
 * BEFORE the request leaves, so a timeout can be retried with the SAME key.
 * Either the original applied (replay) or it never did (created) — never twice.
 *
 * Nothing here identifies a person: no userId, no email, no session content.
 * Everything stored is a key this browser generated plus catalog identifiers.
 */

const STORAGE_KEY = `psico.guide.${GUIDE_KEY}.v1`;

/** A command whose outcome this browser does not know yet. */
export type PendingGuideCommand =
  | {
      commandType: "STEP_COMPLETE";
      idempotencyKey: string;
      sessionId: string;
      stepKey: GuideStepKeyWeb;
    }
  | {
      commandType: "STEP_RECALL";
      idempotencyKey: string;
      sessionId: string;
      stepKey: GuideStepKeyWeb;
      selectedOptionKey: GuideOptionKeyWeb;
    }
  | {
      commandType: "CANCEL";
      idempotencyKey: string;
      sessionId: string;
    }
  | {
      commandType: "SESSION_COMPLETE";
      idempotencyKey: string;
      sessionId: string;
    };

export interface GuideRecoveryRecord {
  schemaVersion: 1;
  guideKey: typeof GUIDE_KEY;
  guideVersion: typeof GUIDE_VERSION;
  startIdempotencyKey: string;
  sessionId?: string;
  pendingCommand?: PendingGuideCommand;
}

const RECORD_KEYS = [
  "schemaVersion",
  "guideKey",
  "guideVersion",
  "startIdempotencyKey",
  "sessionId",
  "pendingCommand",
] as const;

/** Canonical UUID, versions 1-8 — the shape the API accepts. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A session id is a server-generated opaque token (a cuid today). Validating
 * it as an ALLOW-list — not as "anything without control characters" — means
 * no whitespace, no separator and no control byte can be reconstructed out of
 * storage by construction, rather than by remembering to exclude them.
 */
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

/** No undeclared key at all — and no symbol keys either. */
function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  return Object.keys(value).every((k) => allowed.includes(k));
}

/**
 * Rebuild a pending command field by field. A command whose step or option is
 * not in this build's catalog is rejected: retrying a key we cannot describe
 * would be guessing at someone's answer.
 */
export function parsePendingGuideCommand(
  value: unknown,
): PendingGuideCommand | null {
  if (!isPlainObject(value)) return null;
  const { commandType, idempotencyKey, sessionId } = value;
  if (!isUuid(idempotencyKey) || !isSessionId(sessionId)) return null;

  switch (commandType) {
    case "STEP_COMPLETE": {
      const allowed = ["commandType", "idempotencyKey", "sessionId", "stepKey"];
      if (!hasOnlyKeys(value, allowed)) return null;
      if (!isGuideStepKey(value.stepKey)) return null;
      return {
        commandType: "STEP_COMPLETE",
        idempotencyKey,
        sessionId,
        stepKey: value.stepKey,
      };
    }
    case "STEP_RECALL": {
      const allowed = [
        "commandType",
        "idempotencyKey",
        "sessionId",
        "stepKey",
        "selectedOptionKey",
      ];
      if (!hasOnlyKeys(value, allowed)) return null;
      if (!isGuideStepKey(value.stepKey)) return null;
      if (!isGuideOptionKey(value.selectedOptionKey)) return null;
      return {
        commandType: "STEP_RECALL",
        idempotencyKey,
        sessionId,
        stepKey: value.stepKey,
        selectedOptionKey: value.selectedOptionKey,
      };
    }
    case "CANCEL":
    case "SESSION_COMPLETE": {
      const allowed = ["commandType", "idempotencyKey", "sessionId"];
      if (!hasOnlyKeys(value, allowed)) return null;
      return { commandType, idempotencyKey, sessionId };
    }
    default:
      return null;
  }
}

/**
 * Parse a stored record. Pure, total and closed: any deviation — a corrupt
 * blob, a foreign guide, an older schema, an extra key, a malformed UUID —
 * returns `null`, and the caller treats that as "no recovery" rather than as
 * an error to show.
 */
export function parseGuideRecoveryRecord(
  value: unknown,
): GuideRecoveryRecord | null {
  if (!isPlainObject(value)) return null;
  if (!hasOnlyKeys(value, RECORD_KEYS)) return null;
  if (value.schemaVersion !== 1) return null;
  if (value.guideKey !== GUIDE_KEY) return null;
  if (value.guideVersion !== GUIDE_VERSION) return null;
  if (!isUuid(value.startIdempotencyKey)) return null;

  const record: GuideRecoveryRecord = {
    schemaVersion: 1,
    guideKey: GUIDE_KEY,
    guideVersion: GUIDE_VERSION,
    startIdempotencyKey: value.startIdempotencyKey,
  };

  if (value.sessionId !== undefined) {
    if (!isSessionId(value.sessionId)) return null;
    record.sessionId = value.sessionId;
  }

  if (value.pendingCommand !== undefined) {
    const pending = parsePendingGuideCommand(value.pendingCommand);
    // A record with an unreadable pending command still has a usable START
    // key — drop the command, keep the recovery.
    if (pending) record.pendingCommand = pending;
  }

  return record;
}

/** Read + validate. Never throws, even if `localStorage` is unavailable. */
export function readGuideRecovery(): GuideRecoveryRecord | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearGuideRecovery();
    return null;
  }

  const record = parseGuideRecoveryRecord(parsed);
  if (!record) clearGuideRecovery();
  return record;
}

export function writeGuideRecovery(record: GuideRecoveryRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // A browser with storage disabled loses recovery, not correctness: every
    // command still carries its own key for the lifetime of the page.
  }
}

export function clearGuideRecovery(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — see writeGuideRecovery.
  }
}

/** True when a stored record could resume a run. Safe to call on the server. */
export function hasGuideRecovery(): boolean {
  if (typeof window === "undefined") return false;
  return readGuideRecovery() !== null;
}

/**
 * A fresh idempotency key. Returns `null` when the platform has no
 * `crypto.randomUUID` — the caller surfaces that as an error instead of
 * inventing a weaker key.
 */
export function newIdempotencyKey(): string | null {
  const c: Crypto | undefined = globalThis.crypto;
  if (typeof c?.randomUUID !== "function") return null;
  const key = c.randomUUID();
  return isUuid(key) ? key : null;
}

/** Exposed so tests can assert the exact storage key. */
export const GUIDE_STORAGE_KEY = STORAGE_KEY;
