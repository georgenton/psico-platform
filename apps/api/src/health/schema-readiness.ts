/**
 * Whether THIS image's schema expectations are actually satisfied by the
 * database it is talking to.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The runbook already said it: «Un `/health` verde no dice nada sobre el
 * esquema.» It was measured on 2026-10-01, when a first deploy skipped its
 * migration and the API answered `/health` 200 against an empty database —
 * endpoints that avoided Postgres worked, the rest returned 500.
 *
 * It happened again on 2026-10-22, by a different route: Coolify runs the
 * pre-deployment command with `docker exec` INTO THE OUTGOING CONTAINER, so
 * `prisma migrate deploy` read the previous commit's migration folder, found
 * every one of its 69 already applied, and reported success. The deployment
 * went green with the 70th migration unapplied.
 *
 * Both failures share a shape: the schema was behind and nothing said so.
 * This module is the thing that says so.
 *
 * ── Why it is a diff and not a count ──────────────────────────────────────
 *
 * Comparing totals would call a database "ready" whenever the numbers happen
 * to match — including the case where one migration was applied and a
 * different one is missing. Names are compared, so the answer is about
 * identity rather than arithmetic.
 *
 * ── Why it fails closed ───────────────────────────────────────────────────
 *
 * Every outcome that is not «I read both sides and they agree» reports NOT
 * ready. A pruned build with no migrations folder, an unreachable database, a
 * half-written `_prisma_migrations` row: none of those is evidence of a
 * current schema, and answering 200 to any of them would rebuild the exact
 * silence this exists to break.
 */

/** A row of `_prisma_migrations`, reduced to what the verdict depends on. */
export interface AppliedMigrationRow {
  migration_name: string;
  /** Null while a migration is mid-flight or was interrupted. */
  finished_at: Date | null;
  /** Set when `prisma migrate resolve --rolled-back` marked it undone. */
  rolled_back_at: Date | null;
}

export type SchemaReadinessReason =
  /** Read both sides and every shipped migration is applied. */
  | "ok"
  /** Shipped migrations the database has not applied. */
  | "pending"
  /** Rows the database holds unfinished or rolled back. */
  | "failed"
  /** The image's migration folder could not be located. */
  | "migrations-unreadable"
  /** The database could not be asked. */
  | "database-unreachable";

export interface SchemaReadiness {
  ready: boolean;
  reason: SchemaReadinessReason;
  /** Shipped in this image but not applied. Names only — all public. */
  pending: string[];
  /** Applied rows the database considers unfinished or rolled back. */
  failed: string[];
  shippedCount: number;
  appliedCount: number;
}

/**
 * The verdict, as a pure function of the two inventories.
 *
 * `shipped` is the list of migration directory names baked into the image;
 * `applied` is what `_prisma_migrations` holds. Neither is trusted to be
 * sorted or de-duplicated.
 */
export function diffMigrations(input: {
  shipped: readonly string[];
  applied: readonly AppliedMigrationRow[];
}): SchemaReadiness {
  const shipped = [...new Set(input.shipped)].sort();

  // A row only counts as applied when the database says it finished AND was
  // not rolled back. Anything else is reported under `failed`, because
  // `migrate deploy` itself refuses to continue past such a row — treating it
  // as "applied" would promise a schema that cannot move forward.
  const failed = [
    ...new Set(
      input.applied
        .filter((r) => r.finished_at === null || r.rolled_back_at !== null)
        .map((r) => r.migration_name),
    ),
  ].sort();

  const appliedOk = new Set(
    input.applied
      .filter((r) => r.finished_at !== null && r.rolled_back_at === null)
      .map((r) => r.migration_name),
  );

  const pending = shipped.filter((name) => !appliedOk.has(name));

  // Deliberately NOT reported: migrations the database has and this image
  // does not. That is what a rollback to a previous image looks like, and the
  // additive-migration posture means the older code runs fine against the
  // newer schema. Calling it "not ready" would make every rollback look
  // broken.
  return {
    ready: pending.length === 0 && failed.length === 0,
    reason: failed.length > 0 ? "failed" : pending.length > 0 ? "pending" : "ok",
    pending,
    failed,
    shippedCount: shipped.length,
    appliedCount: appliedOk.size,
  };
}

/** The fail-closed verdict for a side that could not be read at all. */
export function unreadable(
  reason: Extract<
    SchemaReadinessReason,
    "migrations-unreadable" | "database-unreachable"
  >,
  shippedCount = 0,
): SchemaReadiness {
  return {
    ready: false,
    reason,
    pending: [],
    failed: [],
    shippedCount,
    appliedCount: 0,
  };
}
