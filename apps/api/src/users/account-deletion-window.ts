/**
 * The days between asking for an account to be deleted and its deletion.
 *
 * ── One number, read in five places ───────────────────────────────────────
 *
 *   `UsersService.requestDelete`          tells the person when it will happen
 *   `UsersService.getMe`                  tells them again every time they look
 *   `UsersService.cancelDeleteRequest`    decides whether they may still undo it
 *   `JobsService.enqueueAccountDeletion`  delays the job by it
 *   `AccountDeletionProcessor`            refuses to act before it has elapsed
 *
 * It used to be three literals that happened to agree, and a comment asking the
 * next person to keep them that way. They are one decision: the date somebody is
 * shown, the last moment they can change their mind and the first moment the
 * worker may act are the SAME instant. Moved apart, the product either promises
 * a cancellation the worker no longer honours, or deletes before the date it
 * printed.
 *
 * Not the retention of a data export, nor the cooldown between two of them.
 * Those are also 30 and are a different decision — see `data-export-retention`.
 */
export const ACCOUNT_DELETION_COOLDOWN_DAYS = 30;

export const ACCOUNT_DELETION_COOLDOWN_MS =
  ACCOUNT_DELETION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/** When an account whose deletion was requested at `requestedAt` goes away. */
export function accountDeletionDueAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_COOLDOWN_MS);
}

/**
 * The boundary, as a request instant. A request made STRICTLY AFTER it can still
 * be cancelled; one made at it or before is due and belongs to the worker.
 *
 * The exact complement of the processor's `elapsed < COOLDOWN_MS`, so there is
 * no instant that belongs to both and none that belongs to neither. Takes `now`
 * so the caller decides WHEN the clock is read — for a cancellation that has to
 * be after the row lock, not before it.
 */
export function accountDeletionCutoff(now: Date): Date {
  return new Date(now.getTime() - ACCOUNT_DELETION_COOLDOWN_MS);
}
