"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { guideApi } from "@psico/api-client";
import type {
  GuideCommandResponse,
  GuideRecallOutcome,
  GuideSessionView,
} from "@psico/types";
import {
  isGuideOptionKeyForStep,
  stepPresentationFor,
  type GuidePresentation,
  type GuideStepPresentation,
} from "./guide-presentation";
import { samePin, type GuidePin } from "./guide-pin";
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
 * GR-3 — the ONE implementation of the Guide run.
 *
 * Extracted verbatim from the CC-7.5 player so the standalone route and the
 * reader panel share it rather than each keeping a copy. Network, idempotency,
 * recovery, resync, retry and the fail-closed rules live here and nowhere else:
 * two copies of this logic would eventually disagree about whether a command
 * had applied, and that disagreement is exactly what idempotency exists to
 * prevent.
 *
 * The server owns the run. This hook never computes what comes next — it reads
 * `status`, `currentStepKey`, `stepsCompleted` and `totalSteps` from the last
 * command response and reports them. It does not add one to a counter, it does
 * not walk a local index, and it does not decide a transition from clicks.
 */

/** Which surface is driving the run. Presentation only — same lifecycle. */
export type GuideSurface = "STANDALONE" | "READER_PANEL";

/**
 * What a `Reintentar` would repeat. START is NOT a `PendingGuideCommand`: its
 * identity already lives in `record.startIdempotencyKey`, and modelling it as
 * one would invite a second start key for the same ambiguous attempt.
 */
export type GuideRetryState =
  | { kind: "START"; record: GuideRecoveryRecord }
  | {
      kind: "COMMAND";
      record: GuideRecoveryRecord;
      command: PendingGuideCommand;
    };

export type GuideScreen =
  | "booting"
  | "cover"
  /** GR-5 — the server holds a run this browser never started. */
  | "recoverable"
  | "start-retry"
  | "storage-unavailable"
  | "step"
  | "finish"
  | "completed"
  | "cancelled"
  | "unknown-step"
  | "inconsistent";

interface PlayerState {
  session: GuideSessionView | null;
  record: GuideRecoveryRecord | null;
  booting: boolean;
  busy: boolean;
  error: GuideUiError | null;
  /** Present when an attempt's outcome is unknown and repeatable as-is. */
  retry: GuideRetryState | null;
  /** This browser cannot persist the recovery key, so it must not start. */
  storageBlocked: boolean;
  /** GR-3 — what the server said about the last recall of this session. */
  recallOutcome: GuideRecallOutcome | null;
  /**
   * GR-4 — the server handed back a session for a DIFFERENT
   * `guideKey@guideVersion`. Terminal by design: see `PIN_MISMATCH`.
   */
  pinMismatch: boolean;
  /**
   * GR-5 — a run the SERVER says is open for this actor and pin, which this
   * browser has no local record of. An offer, never a run: nothing is adopted
   * until the reader says so.
   */
  recoverable: GuideSessionView | null;
  /**
   * GR-7 — what THIS run has been told, for the Completion Summary.
   *
   * Not progress: the server owns that, and `session` carries it. This is the
   * detail the summary needs and the session view does not carry — which
   * checkpoints were confirmed here, and what the server answered about each
   * recall. It only ever grows from a server response, so it cannot claim a
   * step the ledger did not accept.
   */
  facts: GuideRunFacts;
}

export interface GuideRunFacts {
  confirmedStepKeys: readonly string[];
  recalls: readonly { stepKey: string; outcome: GuideRecallOutcome }[];
}

const NO_FACTS: GuideRunFacts = { confirmedStepKeys: [], recalls: [] };

/**
 * Fold one ACCEPTED command into the run's facts.
 *
 * Only reached after the server answered, so nothing here is a prediction.
 * Confirmations are deduplicated because a replayed idempotent command is the
 * same fact twice, not two confirmations.
 */
function extendFacts(
  facts: GuideRunFacts,
  command: PendingGuideCommand,
  feedback: { outcome: GuideRecallOutcome } | undefined,
): GuideRunFacts {
  if (command.commandType === "STEP_COMPLETE") {
    if (facts.confirmedStepKeys.includes(command.stepKey)) return facts;
    return {
      ...facts,
      confirmedStepKeys: [...facts.confirmedStepKeys, command.stepKey],
    };
  }
  if (command.commandType === "STEP_RECALL" && feedback) {
    return {
      ...facts,
      recalls: [
        ...facts.recalls.filter((r) => r.stepKey !== command.stepKey),
        { stepKey: command.stepKey, outcome: feedback.outcome },
      ],
    };
  }
  return facts;
}

const INITIAL: PlayerState = {
  session: null,
  record: null,
  booting: true,
  busy: false,
  error: null,
  retry: null,
  storageBlocked: false,
  recallOutcome: null,
  pinMismatch: false,
  recoverable: null,
  facts: NO_FACTS,
};

const STORAGE_BLOCKED: GuideUiError = {
  kind: "terminal",
  message: "Este navegador no puede guardar la recuperación de la guía.",
};

/**
 * GR-4 — a session that belongs to another pinned guide.
 *
 * Not retryable and not recoverable: re-aiming the run at whatever came back
 * would silently move the reader into a different chapter's guide, and
 * re-sending the command would apply it there. So nothing is persisted,
 * nothing is re-sent, and the run ends in a state the UI reports plainly.
 */
const PIN_MISMATCH: GuideUiError = {
  kind: "terminal",
  message: "No pudimos mostrar el estado actual.",
};

/** The screen is a pure function of server state — never of local counters. */
function screenOf(
  state: PlayerState,
  presentation: GuidePresentation,
): GuideScreen {
  if (state.booting) return "booting";
  // A foreign session outranks everything else: there is no screen of THIS
  // guide that could honestly describe it.
  if (state.pinMismatch) return "inconsistent";
  if (state.storageBlocked) return "storage-unavailable";
  const s = state.session;
  if (!s) {
    if (state.retry?.kind === "START") return "start-retry";
    // An open run the reader could continue is a different question from "do
    // you want to start this?". Collapsing them into the cover would quietly
    // offer to abandon a journey they left open on another device.
    return state.recoverable ? "recoverable" : "cover";
  }
  if (s.status === "COMPLETED") return "completed";
  if (s.status === "CANCELLED") return "cancelled";
  if (s.currentStepKey === null) {
    // A null cursor is not enough to offer completion: an ACTIVE session that
    // reports fewer accepted steps than the guide has is contradictory, and
    // completing it would be asserting something the server did not say.
    return s.stepsCompleted === s.totalSteps ? "finish" : "inconsistent";
  }
  return stepPresentationFor(s.currentStepKey, presentation)
    ? "step"
    : "unknown-step";
}

export interface GuideRun {
  screen: GuideScreen;
  session: GuideSessionView | null;
  step: GuideStepPresentation | null;
  error: GuideUiError | null;
  retry: GuideRetryState | null;
  busy: boolean;
  booting: boolean;
  /** The last recall verdict of this session, or null before one exists. */
  recallOutcome: GuideRecallOutcome | null;
  /** GR-5 — an open run the server offered, which nothing has adopted yet. */
  recoverable: GuideSessionView | null;
  /** GR-7 — what this run was told, for the Completion Summary. */
  facts: GuideRunFacts;
  choice: string | null;
  setChoice: (option: string | null) => void;
  start: () => Promise<void>;
  /** Accept `recoverable`. Never sends a START, so it never autocancels. */
  adopt: () => void;
  completeStep: (stepKey: GuideStepPresentation["stepKey"]) => void;
  submitRecall: (
    stepKey: GuideStepPresentation["stepKey"],
    selectedOptionKey: string,
  ) => void;
  finish: () => void;
  cancel: () => void;
  retryPending: () => void;
  restart: () => void;
}

export interface UseGuideRunInput {
  /**
   * Opaque partition derived server-side from the authenticated user. The
   * AUTHORITY on who this browser is right now — never read back from storage,
   * because a record written by another account would then vouch for itself.
   */
  actorScope: string;
  /** The EXACT guide this run is for. Supplied by the caller, never guessed. */
  pin: GuidePin;
  /** Its presentation, already resolved for that same pin. */
  presentation: GuidePresentation;
}

export function useGuideRun({
  actorScope,
  pin,
  presentation,
}: UseGuideRunInput): GuideRun {
  const [state, setState] = useState<PlayerState>(INITIAL);
  const [choice, setChoice] = useState<string | null>(null);
  // The pin travels as one value through every callback below. Depending on
  // the object identity would re-run the mount effect on every render, so the
  // two primitives are the dependency and this is rebuilt from them.
  const { guideKey, guideVersion } = pin;
  const runPin = useMemo<GuidePin>(
    () => ({ guideKey, guideVersion }),
    [guideKey, guideVersion],
  );

  const patch = useCallback((next: Partial<PlayerState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  /**
   * Persist the record BEFORE anything reaches the network, and report
   * whether it worked. A write that silently failed would leave an applied
   * command with no key to identify it — so the caller must not proceed.
   */
  const remember = useCallback(
    (record: GuideRecoveryRecord): GuideRecoveryRecord | null =>
      writeGuideRecovery(record, runPin).ok ? record : null,
    [runPin],
  );

  /** Storage refused: no request leaves, and no new key is minted. */
  const blockOnStorage = useCallback(() => {
    patch({
      busy: false,
      booting: false,
      storageBlocked: true,
      error: STORAGE_BLOCKED,
      retry: null,
    });
  }, [patch]);

  /** Every record this hook writes is stamped with the CURRENT actor. */
  const recordFor = useCallback(
    (
      fields: Omit<
        GuideRecoveryRecord,
        "schemaVersion" | "actorScope" | "guideKey" | "guideVersion"
      >,
    ): GuideRecoveryRecord => ({
      schemaVersion: 1,
      actorScope,
      guideKey: runPin.guideKey,
      guideVersion: runPin.guideVersion,
      ...fields,
    }),
    [actorScope, runPin],
  );

  /**
   * Every session this hook accepts must be for THIS pin. The server derives
   * the run from the start key, and a start key that resolved to another guide
   * means the local record and the server disagree about what is running —
   * which is not something a retry can fix.
   */
  const rejectForeignSession = useCallback(
    (session: GuideSessionView): boolean => {
      if (samePin(session, runPin)) return false;
      patch({
        pinMismatch: true,
        booting: false,
        busy: false,
        session: null,
        record: null,
        retry: null,
        recallOutcome: null,
        error: PIN_MISMATCH,
      });
      return true;
    },
    [patch, runPin],
  );

  /**
   * Replay the stored START. Returns the session the server currently has for
   * that idempotency key — this is the ONLY way the browser learns state.
   */
  const replayStart = useCallback(
    async (record: GuideRecoveryRecord): Promise<GuideSessionView> => {
      // Unreachable without a key: the boot effect routes adopted records to
      // the server recovery read instead. The throw makes that a fact rather
      // than a convention a refactor could quietly break.
      if (record.startIdempotencyKey === undefined) {
        throw new Error("GUIDE_ADOPTED_RECORD_HAS_NO_START_KEY");
      }
      const res = await guideApi.createGuideSession({
        idempotencyKey: record.startIdempotencyKey,
        guideKey: runPin.guideKey,
        guideVersion: runPin.guideVersion,
      });
      return res.session;
    },
    [runPin],
  );

  const invoke = useCallback(
    (
      command: PendingGuideCommand,
    ): Promise<
      GuideCommandResponse & { feedback?: { outcome: GuideRecallOutcome } }
    > => {
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
      patch({ busy: true, error: null, retry: null });
      try {
        const res = await invoke(command);
        if (rejectForeignSession(res.session)) return;
        const settled = recordFor({
          startIdempotencyKey: record.startIdempotencyKey,
          sessionId: res.session.sessionId,
        });
        remember(settled);
        setChoice(null);
        patch({
          session: res.session,
          record: settled,
          busy: false,
          retry: null,
          // Only the recall command carries a verdict; the others leave the
          // last one alone rather than blanking a screen the reader is on.
          ...(res.feedback ? { recallOutcome: res.feedback.outcome } : {}),
        });
        // Facts grow from the PREVIOUS facts, so this takes the updater form
        // rather than riding along in `patch`. React batches the two.
        setState((prev) => ({
          ...prev,
          facts: extendFacts(prev.facts, command, res.feedback),
        }));
      } catch (err) {
        const uiError = toGuideUiError(err);
        if (uiError.kind === "resync") {
          // The state moved under us. Re-read it from the server with the
          // START key — never by inventing a different command.
          try {
            const session = await replayStart(record);
            if (rejectForeignSession(session)) return;
            const settled = recordFor({
              startIdempotencyKey: record.startIdempotencyKey,
              sessionId: session.sessionId,
            });
            remember(settled);
            setChoice(null);
            patch({
              session,
              record: settled,
              busy: false,
              error: uiError,
              retry: null,
            });
            return;
          } catch {
            // The resync itself failed. Losing the pending command here would
            // strand an attempt whose outcome nobody knows — so it and its key
            // stay, and `Reintentar` resyncs before re-sending it.
            const pendingRecord: GuideRecoveryRecord = {
              ...record,
              pendingCommand: command,
            };
            remember(pendingRecord);
            patch({
              busy: false,
              error: uiError,
              record: pendingRecord,
              retry: { kind: "COMMAND", record: pendingRecord, command },
            });
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
            record: pendingRecord,
            retry: { kind: "COMMAND", record: pendingRecord, command },
          });
          return;
        }

        if (uiError.kind === "gone") {
          clearGuideRecovery(runPin);
          patch({
            busy: false,
            error: uiError,
            retry: null,
            session: null,
            record: null,
            recallOutcome: null,
          });
          return;
        }

        remember({ ...record, pendingCommand: undefined });
        patch({ busy: false, error: uiError, retry: null });
      }
    },
    [
      invoke,
      patch,
      recordFor,
      rejectForeignSession,
      remember,
      replayStart,
      runPin,
    ],
  );

  /**
   * Run (or re-run) the START for a stored record. The SAME key every time:
   * a failure here is ambiguous — the session may or may not exist — and a
   * fresh key would turn that ambiguity into a duplicate session.
   */
  const runStart = useCallback(
    async (record: GuideRecoveryRecord) => {
      try {
        const session = await replayStart(record);
        if (rejectForeignSession(session)) return;
        const settled = remember({
          ...record,
          sessionId: session.sessionId,
        });
        if (!settled) {
          blockOnStorage();
          return;
        }
        patch({ session, record: settled, busy: false, retry: null });
      } catch (err) {
        const uiError = toGuideUiError(err);
        if (uiError.kind === "gone") {
          clearGuideRecovery(runPin);
          patch({
            busy: false,
            error: uiError,
            session: null,
            record: null,
            retry: null,
          });
          return;
        }
        if (uiError.kind === "retryable") {
          patch({
            busy: false,
            error: uiError,
            record,
            retry: { kind: "START", record },
          });
          return;
        }
        patch({ busy: false, error: uiError, record, retry: null });
      }
    },
    [
      blockOnStorage,
      patch,
      rejectForeignSession,
      remember,
      replayStart,
      runPin,
    ],
  );

  /**
   * Retry a command whose outcome is unknown. It re-reads the session with
   * the START key FIRST, because the snapshot decides whether the command is
   * still applicable — and only then re-sends it with its ORIGINAL key.
   */
  const retryCommand = useCallback(
    async (record: GuideRecoveryRecord, command: PendingGuideCommand) => {
      patch({ busy: true, error: null, retry: null });
      let session: GuideSessionView;
      try {
        session = await replayStart(record);
        if (rejectForeignSession(session)) return;
      } catch (err) {
        const uiError = toGuideUiError(err);
        if (uiError.kind === "gone") {
          clearGuideRecovery(runPin);
          patch({
            busy: false,
            error: uiError,
            session: null,
            record: null,
            retry: null,
          });
          return;
        }
        // Still ambiguous: keep the command and its key for the next attempt.
        patch({
          busy: false,
          error: uiError,
          retry: { kind: "COMMAND", record, command },
        });
        return;
      }

      const settled = recordFor({
        startIdempotencyKey: record.startIdempotencyKey,
        sessionId: session.sessionId,
      });

      if (command.sessionId !== session.sessionId) {
        // The command belongs to another session. Drop it — never re-aim it.
        remember(settled);
        patch({ session, record: settled, busy: false, retry: null });
        return;
      }

      if (!remember({ ...settled, pendingCommand: command })) {
        blockOnStorage();
        return;
      }
      patch({ session, record: settled });
      await dispatch(command, settled);
    },
    [
      blockOnStorage,
      dispatch,
      patch,
      recordFor,
      rejectForeignSession,
      remember,
      replayStart,
    ],
  );

  // ── Mount: recover, never auto-start ──────────────────────────────────────
  // No "already booted" guard: under StrictMode React mounts, tears down and
  // mounts again, and a ref that swallowed the second setup would leave the
  // screen stuck on "booting" forever. Every setup runs its own recovery —
  // START replay is idempotent, so two requests with the SAME key are strictly
  // better than a frozen screen. `cancelled` only discards THIS setup's answer.
  useEffect(() => {
    const read = readGuideRecovery(actorScope, runPin, presentation);
    if (read.state === "unavailable") {
      blockOnStorage();
      return;
    }
    if (read.state === "empty") {
      // GR-5 — no prior START from THIS browser is no longer the end of the
      // question. The server may hold an open run for this actor and pin, and
      // asking costs one read. What it never does is start anything: the
      // answer becomes an offer the reader accepts with a click.
      let cancelled = false;
      void (async () => {
        try {
          const answer = await guideApi.getRecoverableSession(runPin);
          if (cancelled) return;
          patch({
            booting: false,
            recoverable: answer.recoverable ? answer.session : null,
          });
        } catch {
          // A failed recovery read is not an error worth a screen: the reader
          // still has the cover, and starting is still available. Reporting it
          // would turn "we could not check" into "something is wrong".
          if (!cancelled) patch({ booting: false });
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    const record = read.record;

    if (record.startIdempotencyKey === undefined) {
      // An ADOPTED run. There is no key to replay — re-ask the server, which
      // is the only authority on whether that session is still open.
      let cancelled = false;
      void (async () => {
        try {
          const answer = await guideApi.getRecoverableSession(runPin);
          if (cancelled) return;
          if (!answer.recoverable) {
            // The run ended elsewhere. The local pointer is stale, not a
            // reason to show an error.
            clearGuideRecovery(runPin);
            patch({ booting: false, record: null, session: null });
            return;
          }
          if (rejectForeignSession(answer.session)) return;
          patch({ session: answer.session, record, booting: false });
        } catch (err) {
          if (!cancelled) {
            patch({ booting: false, record, error: toGuideUiError(err) });
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    void (async () => {
      try {
        const session = await replayStart(record);
        if (cancelled) return;
        if (rejectForeignSession(session)) return;

        const pending = record.pendingCommand;
        // A pending command belongs to ONE session. If the server handed back
        // a different one, replaying it would apply someone else's attempt to
        // this run — so it is dropped, not guessed at.
        const bound = pending ? pending.sessionId === session.sessionId : false;

        const settled = recordFor({
          startIdempotencyKey: record.startIdempotencyKey,
          sessionId: session.sessionId,
          ...(pending && bound ? { pendingCommand: pending } : {}),
        });
        if (!remember(settled)) {
          blockOnStorage();
          return;
        }
        patch({ session, record: settled, booting: false, retry: null });

        if (pending && bound) {
          await dispatch(pending, settled);
        }
      } catch (err) {
        if (cancelled) return;
        const uiError = toGuideUiError(err);
        if (uiError.kind === "gone") {
          clearGuideRecovery(runPin);
          patch({
            booting: false,
            session: null,
            record: null,
            error: uiError,
            retry: null,
          });
          return;
        }
        if (uiError.kind === "retryable") {
          // The record stays: retrying must replay THIS start key, and the
          // fresh-start cover would offer to mint a different one.
          patch({
            booting: false,
            record,
            error: uiError,
            retry: { kind: "START", record },
          });
          return;
        }
        patch({ booting: false, record, error: uiError, retry: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    actorScope,
    blockOnStorage,
    dispatch,
    patch,
    presentation,
    recordFor,
    rejectForeignSession,
    remember,
    replayStart,
    runPin,
  ]);

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
    const record = remember(recordFor({ startIdempotencyKey: idempotencyKey }));
    // The key must be readable again before the request exists, not after.
    if (!record) {
      blockOnStorage();
      return;
    }

    patch({ busy: true, error: null, retry: null, record });
    await runStart(record);
  }, [blockOnStorage, patch, recordFor, remember, runStart]);

  /**
   * GR-5 — accept the run the server offered.
   *
   * Deliberately NOT a START. On the server a START with an unseen key
   * autocancels the active session and opens a new one, so "continue" and
   * "start over" have to be different calls or continuing would silently
   * destroy the thing it claims to resume.
   *
   * The record it writes carries no start key: the next boot re-asks the
   * server rather than replaying anything.
   */
  const adopt = useCallback(() => {
    const offered = state.recoverable;
    if (!offered) return;
    if (rejectForeignSession(offered)) return;
    const record = remember(recordFor({ sessionId: offered.sessionId }));
    if (!record) {
      blockOnStorage();
      return;
    }
    patch({ session: offered, record, recoverable: null, error: null });
  }, [
    blockOnStorage,
    patch,
    recordFor,
    rejectForeignSession,
    remember,
    state.recoverable,
  ]);

  const restart = useCallback(() => {
    // Clears ONLY this pin's slot. Another guide's recovery is not this run's
    // to discard, and a reader mid-way through it would lose their place.
    clearGuideRecovery(runPin);
    setChoice(null);
    patch({
      session: null,
      record: null,
      error: null,
      retry: null,
      recallOutcome: null,
      pinMismatch: false,
    });
  }, [patch, runPin]);

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
      // this exact key, never with a fresh one. If it cannot be persisted the
      // request does not happen at all.
      const pendingRecord = remember({ ...record, pendingCommand: command });
      if (!pendingRecord) {
        blockOnStorage();
        return;
      }
      void dispatch(command, pendingRecord);
    },
    [blockOnStorage, dispatch, patch, remember, state],
  );

  const completeStep = useCallback(
    (stepKey: GuideStepPresentation["stepKey"]) =>
      send((idempotencyKey, sessionId) => ({
        commandType: "STEP_COMPLETE",
        idempotencyKey,
        sessionId,
        stepKey,
      })),
    [send],
  );

  /**
   * The ONE place a recall answer becomes a command.
   *
   * The `(stepKey, optionKey)` pair is checked against the pinned presentation
   * BEFORE anything else happens — before a key is minted, before a record is
   * written, before a request leaves. That order matters: minting the key first
   * would leave a recovery record describing an attempt the server was always
   * going to reject, and the retry path would faithfully re-send it.
   */
  const submitRecall = useCallback(
    (stepKey: GuideStepPresentation["stepKey"], selectedOptionKey: string) => {
      if (!isGuideOptionKeyForStep(stepKey, selectedOptionKey, presentation)) {
        return;
      }
      send((idempotencyKey, sessionId) => ({
        commandType: "STEP_RECALL",
        idempotencyKey,
        sessionId,
        stepKey,
        selectedOptionKey,
      }));
    },
    [presentation, send],
  );

  const finish = useCallback(
    () =>
      send((idempotencyKey, sessionId) => ({
        commandType: "SESSION_COMPLETE",
        idempotencyKey,
        sessionId,
      })),
    [send],
  );

  const cancel = useCallback(
    () =>
      send((idempotencyKey, sessionId) => ({
        commandType: "CANCEL",
        idempotencyKey,
        sessionId,
      })),
    [send],
  );

  const retryPending = useCallback(() => {
    const pending = state.retry;
    if (!pending || state.busy) return;
    if (pending.kind === "START") {
      patch({ busy: true, error: null, retry: null });
      void runStart(pending.record);
      return;
    }
    void retryCommand(pending.record, pending.command);
  }, [patch, retryCommand, runStart, state.busy, state.retry]);

  const session = state.session;
  return {
    screen: screenOf(state, presentation),
    session,
    step: session
      ? stepPresentationFor(session.currentStepKey, presentation)
      : null,
    error: state.error,
    retry: state.retry,
    busy: state.busy,
    booting: state.booting,
    recallOutcome: state.recallOutcome,
    recoverable: state.recoverable,
    /** GR-7 — what this run was told, for the Completion Summary. */
    facts: state.facts,
    choice,
    setChoice,
    start,
    adopt,
    completeStep,
    submitRecall,
    finish,
    cancel,
    retryPending,
    restart,
  };
}
