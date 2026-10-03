/**
 * How long a data export's BYTES live, and how long a link to them lives.
 *
 * These are two different clocks and this file exists so they cannot be
 * confused, because conflating them is the mistake that reads as a fix:
 *
 *   ACCESS TTL       120 seconds   how long one signed GET works
 *   OBJECT RETENTION 30 days       how long the object stays in the bucket
 *
 * A 2-minute signed URL does not mean the file is gone in 2 minutes. It means a
 * copied URL is useless almost immediately. The object itself sat in R2
 * indefinitely until this policy existed — no lifecycle rule, no sweep, and
 * nothing deleting it on account deletion either.
 *
 * ── Why 30 days and not 7 ─────────────────────────────────────────────────
 *
 * Because `DATA_EXPORT_COOLDOWN_DAYS` is 30. A shorter retention creates a gap
 * where the file is already deleted and a replacement is still refused: expire
 * at 7 days and a user spends 23 days with no export and no way to ask for one.
 * Matching the two means the object survives exactly as long as it is the only
 * one the user is allowed to have.
 */

/** Object retention. NOT the signed-URL TTL — see the header. */
export const DATA_EXPORT_RETENTION_DAYS = 30;

/**
 * `DataExportRequest.status` values.
 *
 * A plain `String` column with no Prisma enum, so these strings ARE the
 * contract. Collected here because `EXPIRED` is new and the previous four were
 * spelled inline at each use — which is how a fifth state gets missed by a
 * reader that only ever saw four.
 *
 * Every reader was audited before adding this: nothing branches exhaustively on
 * status, so no `switch` was left silently incomplete, and no migration is
 * needed to widen a string.
 */
export const DATA_EXPORT_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  /**
   * Retention elapsed: the object was deleted and `fileUrl` cleared, while the
   * row itself stays. The row is the operational record of who asked for their
   * data and when — worth keeping precisely because the file is not.
   */
  EXPIRED: "EXPIRED",
} as const;

export type DataExportStatus =
  (typeof DATA_EXPORT_STATUS)[keyof typeof DATA_EXPORT_STATUS];

/**
 * The instant before which a READY export has outlived its retention.
 *
 * Takes `now` so a test can pin the boundary instead of sleeping, and so the
 * sweep and its tests compute it the same way rather than each rounding
 * differently.
 */
export function dataExportRetentionCutoff(now: Date): Date {
  return new Date(
    now.getTime() - DATA_EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}
