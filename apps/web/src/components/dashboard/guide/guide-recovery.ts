import { guidePinKey, type GuidePin } from "./guide-pin";
import {
  isGuideOptionKeyForStep,
  isGuideStepKey,
  type GuidePresentation,
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
 * The record holds no raw identity: no userId, no email, no token, no session
 * content. It does carry an OPAQUE `actorScope` derived server-side, whose only
 * job is to stop one account's record from being replayed by another — a start
 * key belongs to `(userId, idempotencyKey)` on the server, so replaying it as
 * someone else would start a guide they never asked for.
 *
 * GR-4 — one storage slot PER PIN. A start key belongs to a
 * `guideKey@guideVersion` as much as it belongs to an actor: replaying one
 * guide's key while reading another would open a session for a chapter the
 * reader is not in, and the server would happily return it because the key is
 * genuinely theirs. The record states its pin and the parser demands it match
 * the requested one, so a shared key is impossible by construction rather than
 * by remembering to check.
 */

/** `psico.guide.<guideKey>.v<guideVersion>` — one slot per exact guide. */
export function guideStorageKey(pin: GuidePin): string | null {
  const key = guidePinKey(pin);
  if (key === null) return null;
  return `psico.guide.${pin.guideKey}.v${pin.guideVersion}`;
}

/** A command whose outcome this browser does not know yet. */
export type PendingGuideCommand =
  | {
      commandType: "STEP_COMPLETE";
      idempotencyKey: string;
      sessionId: string;
      stepKey: string;
    }
  | {
      commandType: "STEP_RECALL";
      idempotencyKey: string;
      sessionId: string;
      stepKey: string;
      selectedOptionKey: string;
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
  /** Opaque server-derived partition — never a userId, never a credential. */
  actorScope: string;
  guideKey: string;
  guideVersion: number;
  /**
   * The key that identifies the START this browser sent.
   *
   * ABSENT on a session this browser ADOPTED rather than started — GR-5's
   * cross-device resume. The distinction is load-bearing: replaying a start
   * key is how a browser re-finds its own run, but minting one for a session
   * somebody else's device opened would AUTOCANCEL that run, because on the
   * server a START with an unseen key ends the active session and creates a
   * new one. So an adopted record carries no key, and boot re-asks the server
   * instead of replaying anything.
   */
  startIdempotencyKey?: string;
  sessionId?: string;
  pendingCommand?: PendingGuideCommand;
}

const RECORD_KEYS = [
  "schemaVersion",
  "actorScope",
  "guideKey",
  "guideVersion",
  "startIdempotencyKey",
  "sessionId",
  "pendingCommand",
] as const;

/** SHA-256 in base64url — exactly what `deriveGuideRecoveryActorScope` emits. */
const ACTOR_SCOPE_RE = /^[A-Za-z0-9_-]{43}$/;

function isActorScope(value: unknown): value is string {
  return typeof value === "string" && ACTOR_SCOPE_RE.test(value);
}

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
 * Which command a step accepts, read from the PINNED presentation's surface.
 * A confirm step is completed by `STEP_COMPLETE`; the recall step is completed
 * ONLY by its dedicated command. Pairing them the other way round is not a
 * command the server would accept, so it is not a command we replay.
 */
function commandTypeForStep(
  stepKey: string,
  presentation: GuidePresentation,
): "STEP_COMPLETE" | "STEP_RECALL" | null {
  const step = presentation.steps.find((s) => s.stepKey === stepKey);
  if (!step) return null;
  return step.surface === "recall" ? "STEP_RECALL" : "STEP_COMPLETE";
}

/**
 * Rebuild a pending command field by field, against the PINNED presentation.
 * A command whose step or option is not in that exact catalog is rejected:
 * retrying a key we cannot describe would be guessing at someone's answer, and
 * a step borrowed from another guide is exactly that.
 */
export function parsePendingGuideCommand(
  value: unknown,
  presentation: GuidePresentation,
): PendingGuideCommand | null {
  if (!isPlainObject(value)) return null;
  const { commandType, idempotencyKey, sessionId } = value;
  if (!isUuid(idempotencyKey) || !isSessionId(sessionId)) return null;

  switch (commandType) {
    case "STEP_COMPLETE": {
      const allowed = ["commandType", "idempotencyKey", "sessionId", "stepKey"];
      if (!hasOnlyKeys(value, allowed)) return null;
      if (!isGuideStepKey(value.stepKey, presentation)) return null;
      // A confirm command aimed at the recall step is not a command the
      // server accepts, so it is not one we hold on to.
      if (commandTypeForStep(value.stepKey, presentation) !== "STEP_COMPLETE") {
        return null;
      }
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
      if (!isGuideStepKey(value.stepKey, presentation)) return null;
      if (commandTypeForStep(value.stepKey, presentation) !== "STEP_RECALL") {
        return null;
      }
      // The option must belong to THIS recall, not merely to some recall of
      // this guide: a two-recall guide would otherwise replay an answer under
      // a question the reader was never shown.
      if (
        !isGuideOptionKeyForStep(
          value.stepKey,
          value.selectedOptionKey,
          presentation,
        )
      ) {
        return null;
      }
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
 * blob, a foreign guide, another actor, an older schema, an extra key, a
 * malformed UUID — returns `null`, and the caller treats that as "no recovery"
 * rather than as an error to show.
 */
export function parseGuideRecoveryRecord(
  value: unknown,
  expectedActorScope: string,
  pin: GuidePin,
  presentation: GuidePresentation,
): GuideRecoveryRecord | null {
  if (!isPlainObject(value)) return null;
  if (!hasOnlyKeys(value, RECORD_KEYS)) return null;
  if (value.schemaVersion !== 1) return null;
  // The scope check comes BEFORE anything else usable: a record written by
  // another account (or by a build that predates scoping, which has no scope
  // at all) must never become a START. Same failure as a corrupt blob.
  if (!isActorScope(expectedActorScope)) return null;
  if (!isActorScope(value.actorScope)) return null;
  if (value.actorScope !== expectedActorScope) return null;
  // The pin is the second authority. A record that names another guide — or
  // another version of this one — is not this run's start key.
  if (guidePinKey(pin) === null) return null;
  if (value.guideKey !== pin.guideKey) return null;
  if (value.guideVersion !== pin.guideVersion) return null;
  // A key that is PRESENT must be well formed. A key that is absent means an
  // adopted session — legal, but only alongside the session it adopted.
  const hasStartKey = value.startIdempotencyKey !== undefined;
  if (hasStartKey && !isUuid(value.startIdempotencyKey)) return null;
  if (!hasStartKey && !isSessionId(value.sessionId)) return null;

  const record: GuideRecoveryRecord = {
    schemaVersion: 1,
    actorScope: expectedActorScope,
    guideKey: pin.guideKey,
    guideVersion: pin.guideVersion,
    ...(hasStartKey
      ? { startIdempotencyKey: value.startIdempotencyKey as string }
      : {}),
  };

  if (value.sessionId !== undefined) {
    if (!isSessionId(value.sessionId)) return null;
    record.sessionId = value.sessionId;
  }

  if (value.pendingCommand !== undefined) {
    const pending = parsePendingGuideCommand(
      value.pendingCommand,
      presentation,
    );
    // A record with an unreadable pending command still has a usable START
    // key — drop the command, keep the recovery.
    if (pending) record.pendingCommand = pending;
  }

  return record;
}

/**
 * The three answers storage can give. "unavailable" is NOT "empty": a browser
 * that cannot read is a browser that cannot write either, and treating it as
 * "no session yet" would invite a START whose key nobody can remember.
 */
export type GuideRecoveryReadResult =
  | { state: "empty" }
  | { state: "valid"; record: GuideRecoveryRecord }
  | { state: "unavailable" };

/** Read + validate for ONE pin. Never throws, even if storage is blocked. */
export function readGuideRecovery(
  expectedActorScope: string,
  pin: GuidePin,
  presentation: GuidePresentation,
): GuideRecoveryReadResult {
  const storageKey = guideStorageKey(pin);
  // A malformed pin has no slot at all. Reporting "unavailable" rather than
  // "empty" keeps the caller from starting a run it could never recover.
  if (storageKey === null) return { state: "unavailable" };

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return { state: "unavailable" };
  }
  if (raw === null) return { state: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearGuideRecovery(pin);
    return { state: "empty" };
  }

  const record = parseGuideRecoveryRecord(
    parsed,
    expectedActorScope,
    pin,
    presentation,
  );
  if (!record) {
    // Includes the cross-account and cross-guide cases: a foreign record is
    // dropped, not handed back, so the next screen is a fresh cover with no
    // START in it.
    clearGuideRecovery(pin);
    return { state: "empty" };
  }
  return { state: "valid", record };
}

/**
 * Whether the record actually reached storage. The caller MUST check it: the
 * whole recovery model rests on the key surviving the request, so a write that
 * silently failed would leave an applied command with no way to identify it.
 */
export type GuideStorageWriteResult = { ok: true } | { ok: false };

export function writeGuideRecovery(
  record: GuideRecoveryRecord,
  pin: GuidePin,
): GuideStorageWriteResult {
  const storageKey = guideStorageKey(pin);
  if (storageKey === null) return { ok: false };
  // A record is only ever written to ITS OWN slot. Writing one guide's record
  // under another's key is the corruption this whole module exists to avoid.
  if (record.guideKey !== pin.guideKey) return { ok: false };
  if (record.guideVersion !== pin.guideVersion) return { ok: false };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(record));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function clearGuideRecovery(pin: GuidePin): void {
  const storageKey = guideStorageKey(pin);
  if (storageKey === null) return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Nothing to do — the caller's next write will report the failure.
  }
}

/** For surfaces that only need to know whether a run can be resumed. */
export function guideRecoveryState(
  expectedActorScope: string,
  pin: GuidePin,
  presentation: GuidePresentation,
): GuideRecoveryReadResult["state"] {
  if (typeof window === "undefined") return "empty";
  return readGuideRecovery(expectedActorScope, pin, presentation).state;
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
