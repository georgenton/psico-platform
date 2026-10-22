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
 *
 * ── What it is NOT ────────────────────────────────────────────────────────
 *
 * It compares an INVENTORY OF NAMES against Prisma's ledger. It is not a
 * schema-drift check and says nothing about data integrity: a column dropped
 * by hand, a migration whose SQL was edited after being applied, a constraint
 * someone disabled in psql — all of those leave the ledger agreeing with the
 * folder, and this probe green. What a 200 means is narrow and worth keeping
 * narrow: «every migration this image ships is recorded as applied here».
 */

/** A row of `_prisma_migrations`, reduced to what the verdict depends on. */
export interface AppliedMigrationRow {
  migration_name: string;
  /** Null while a migration is mid-flight or was interrupted. */
  finished_at: Date | null;
  /**
   * Set when `prisma migrate resolve --rolled-back` marked it undone.
   *
   * NOT a permanent failure: it is the documented way out of a failed
   * migration, and `migrate deploy` applies that migration again afterwards,
   * writing a SECOND row for the same name. So a rolled-back row means «this
   * attempt did not count», never «this migration can never succeed».
   */
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

  // ── The ledger holds a HISTORY, not a set ────────────────────────────────
  //
  // `_prisma_migrations` can carry SEVERAL rows for one `migration_name`, and
  // the first version of this function got that wrong: it treated any row with
  // `rolled_back_at` as a permanent failure, so a migration that failed, was
  // resolved with `prisma migrate resolve --rolled-back` and then applied
  // cleanly would have reported NOT ready forever. That is the normal
  // recovery path from the runbook, turned into a dead end.
  //
  // The three states that matter, per migration name:
  //
  //   applied    some row finished and was not rolled back. The schema change
  //              is in place, whatever else the history says about it.
  //   blocked    no such row, AND a row sits unfinished and unresolved. This
  //              is what `migrate deploy` refuses to move past until someone
  //              resolves it, so nothing can be promised about the schema.
  //   pending    no applied row and nothing blocking — including the case
  //              where only a rolled-back row exists, which `migrate deploy`
  //              will simply apply again.
  const appliedOk = new Set(
    input.applied
      .filter((r) => r.finished_at !== null && r.rolled_back_at === null)
      .map((r) => r.migration_name),
  );

  // An unresolved failure blocks `migrate deploy` for the WHOLE database, not
  // just for the migration that failed — so it counts even when this image
  // does not ship that name. It is also why a failed row is not cleared by
  // rolling back to an older image: the ledger keeps it.
  const failed = [
    ...new Set(
      input.applied
        .filter(
          (r) =>
            r.finished_at === null &&
            r.rolled_back_at === null &&
            !appliedOk.has(r.migration_name),
        )
        .map((r) => r.migration_name),
    ),
  ].sort();

  const pending = shipped.filter((name) => !appliedOk.has(name));

  // Deliberately NOT reported: migrations the database has APPLIED and this
  // image does not ship. That is what a rollback to a previous image looks
  // like, and the additive-migration posture means the older code runs fine
  // against the newer schema. Calling it "not ready" would make every
  // rollback look broken.
  //
  // An unresolved FAILED row is the exception above, and on purpose: it is not
  // a schema the older image can ignore, it is a ledger nothing can migrate
  // past.
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
