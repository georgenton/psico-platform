"use client";

import { useCallback, useEffect, useState } from "react";
import { guideApi } from "@psico/api-client";
import type {
  GuideCommandResponse,
  GuideRecallOutcome,
  GuideSessionView,
} from "@psico/types";
import {
  GUIDE_KEY,
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
};

const STORAGE_BLOCKED: GuideUiError = {
  kind: "terminal",
  message: "Este navegador no puede guardar la recuperación de la guía.",
};

/** The screen is a pure function of server state — never of local counters. */
function screenOf(state: PlayerState): GuideScreen {
  if (state.booting) return "booting";
  if (state.storageBlocked) return "storage-unavailable";
  const s = state.session;
  if (!s) return state.retry?.kind === "START" ? "start-retry" : "cover";
  if (s.status === "COMPLETED") return "completed";
  if (s.status === "CANCELLED") return "cancelled";
  if (s.currentStepKey === null) {
    // A null cursor is not enough to offer completion: an ACTIVE session that
    // reports fewer accepted steps than the guide has is contradictory, and
    // completing it would be asserting something the server did not say.
    return s.stepsCompleted === s.totalSteps ? "finish" : "inconsistent";
  }
  return stepPresentationFor(s.currentStepKey) ? "step" : "unknown-step";
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
  choice: GuideOptionKeyWeb | null;
  setChoice: (option: GuideOptionKeyWeb | null) => void;
  start: () => Promise<void>;
  completeStep: (stepKey: GuideStepPresentation["stepKey"]) => void;
  submitRecall: (
    stepKey: GuideStepPresentation["stepKey"],
    selectedOptionKey: GuideOptionKeyWeb,
  ) => void;
  finish: () => void;
  cancel: () => void;
  retryPending: () => void;
  restart: () => void;
}

export function useGuideRun(actorScope: string): GuideRun {
  const [state, setState] = useState<PlayerState>(INITIAL);
  const [choice, setChoice] = useState<GuideOptionKeyWeb | null>(null);

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
      writeGuideRecovery(record).ok ? record : null,
    [],
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
      guideKey: GUIDE_KEY,
      guideVersion: GUIDE_VERSION,
      ...fields,
    }),
    [actorScope],
  );

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
      } catch (err) {
        const uiError = toGuideUiError(err);
        if (uiError.kind === "resync") {
          // The state moved under us. Re-read it from the server with the
          // START key — never by inventing a different command.
          try {
            const session = await replayStart(record);
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
          clearGuideRecovery();
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
    [invoke, patch, recordFor, remember, replayStart],
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
          clearGuideRecovery();
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
    [blockOnStorage, patch, remember, replayStart],
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
      } catch (err) {
        const uiError = toGuideUiError(err);
        if (uiError.kind === "gone") {
          clearGuideRecovery();
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
    [blockOnStorage, dispatch, patch, recordFor, remember, replayStart],
  );

  // ── Mount: recover, never auto-start ──────────────────────────────────────
  // No "already booted" guard: under StrictMode React mounts, tears down and
  // mounts again, and a ref that swallowed the second setup would leave the
  // screen stuck on "booting" forever. Every setup runs its own recovery —
  // START replay is idempotent, so two requests with the SAME key are strictly
  // better than a frozen screen. `cancelled` only discards THIS setup's answer.
  useEffect(() => {
    const read = readGuideRecovery(actorScope);
    if (read.state === "unavailable") {
      blockOnStorage();
      return;
    }
    if (read.state === "empty") {
      // No prior START from this browser ⇒ the cover, and an explicit click.
      patch({ booting: false });
      return;
    }

    const record = read.record;
    let cancelled = false;
    void (async () => {
      try {
        const session = await replayStart(record);
        if (cancelled) return;

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
          clearGuideRecovery();
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
    recordFor,
    remember,
    replayStart,
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

  const restart = useCallback(() => {
    clearGuideRecovery();
    setChoice(null);
    patch({
      session: null,
      record: null,
      error: null,
      retry: null,
      recallOutcome: null,
    });
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

  const submitRecall = useCallback(
    (
      stepKey: GuideStepPresentation["stepKey"],
      selectedOptionKey: GuideOptionKeyWeb,
    ) =>
      send((idempotencyKey, sessionId) => ({
        commandType: "STEP_RECALL",
        idempotencyKey,
        sessionId,
        stepKey,
        selectedOptionKey,
      })),
    [send],
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
    screen: screenOf(state),
    session,
    step: session ? stepPresentationFor(session.currentStepKey) : null,
    error: state.error,
    retry: state.retry,
    busy: state.busy,
    booting: state.booting,
    recallOutcome: state.recallOutcome,
    choice,
    setChoice,
    start,
    completeStep,
    submitRecall,
    finish,
    cancel,
    retryPending,
    restart,
  };
}
