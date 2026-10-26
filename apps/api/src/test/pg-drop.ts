/**
 * Dropping a throwaway test database without racing its own teardown.
 *
 * ── The defect this exists to remove ───────────────────────────────────────
 *
 * Every pg-spec tears down the same way, and the shape looks airtight:
 *
 *   await prisma.$disconnect();
 *   await pool.end();
 *   await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
 *
 * It is not. `pool.end()` resolving means the CLIENT finished closing; it does
 * not mean PostgreSQL has finished reaping the backends. In that window the
 * `FORCE` sends SIGTERM to backends that were already leaving, each one answers
 * with `FATAL 57P01 terminating connection due to administrator command`, and
 * those bytes can still be delivered to a client that is mid-close. `pg.Pool`
 * re-emits an idle-client error, and with no `error` listener Node turns it
 * into an uncaught exception.
 *
 * The consequence is a test run that reports every single test as passing and
 * then exits 1:
 *
 *   Test Files  74 passed | 1 skipped (75)
 *   ⎯⎯ Unhandled Errors ⎯⎯
 *   error: terminating connection due to administrator command
 *
 * Which is the worst failure shape there is — it points at nothing. It bit CI
 * on 2026-10-25: the SAME commit passed under `pull_request` and failed under
 * `push`, because whether the bytes land before or after the socket closes is a
 * matter of microseconds.
 *
 * ── Why waiting, and not an `error` listener ───────────────────────────────
 *
 * Both make the run green, and they are not equivalent. Measured on a
 * throwaway database, 12 iterations each (`pg-drop.spec.ts` keeps a smaller
 * version of the same experiment):
 *
 *   | teardown                   | uncaught errors | FATAL 57P01 on the server |
 *   |----------------------------|-----------------|---------------------------|
 *   | close, then FORCE at once  | 6 of 12 runs    | yes — 12                  |
 *   | + `pool.on("error")` only  | 0               | yes — 14                   |
 *   | wait for our backends      | 0               | **none**                  |
 *
 * The listener hides a termination that still happens. Waiting means it never
 * happens: there is nothing left to terminate, so no FATAL is generated and
 * nothing can arrive late. The wait cost is what it should be — the backends
 * were already leaving. Observed worst case: 23 ms.
 *
 * `FORCE` is kept as the backstop. If something we do not own is still in
 * there, the database still goes; we just stop force-terminating the
 * connections we ourselves asked to close one millisecond earlier.
 */

import type { Pool } from "pg";

/**
 * How long to wait for our own client backends to disappear.
 *
 * Generous against the 23 ms observed, because the cost of being wrong in the
 * two directions is not symmetric: waiting a few milliseconds too long costs
 * milliseconds, and forcing too early costs a run that fails pointing at
 * nothing.
 */
const DEFAULT_WAIT_MS = 3_000;

/** How often to re-ask. Short enough that the common case is one poll. */
const POLL_MS = 10;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Client backends only — deliberately.
 *
 * An autovacuum worker on the same database would otherwise hold the count
 * above zero until the timeout, every time, turning a 23 ms wait into a 3 s
 * one for nothing: an autovacuum worker is not a connection we asked to close,
 * and terminating it produces no client-side error.
 */
const LIVE_CLIENTS = `
  SELECT count(*)::int AS n
    FROM pg_stat_activity
   WHERE datname = $1
     AND backend_type = 'client backend'
     AND pid <> pg_backend_pid()
`;

/**
 * `a-z0-9_`, starting with a letter, within PostgreSQL's identifier limit —
 * the same rule `circles-account-deletion.pg-spec.ts` already applied to its
 * own names, generalised here because this helper now builds the `DROP` for
 * every suite.
 *
 * A validator, not an escaper: an identifier that needs escaping to be safe is
 * an identifier no test should be generating, and refusing it says so instead
 * of quietly dropping something adjacent.
 */
const SAFE_IDENT = /^[a-z][a-z0-9_]{0,62}$/;

export interface DropOutcome {
  /** Milliseconds spent waiting for our backends to go. */
  readonly waitedMs: number;
  /** Client backends still there when we gave up waiting; 0 in the normal case. */
  readonly stragglers: number;
}

/**
 * Drops `db` once our own connections to it are actually gone.
 *
 * `admin` must be connected to some OTHER database (the suite's base URL), as
 * every pg-spec already does — you cannot drop the database you are in.
 *
 * Returns what it observed rather than staying silent, so a suite that wants
 * to assert on the teardown can, and so the timeout path is reportable instead
 * of invisible.
 */
export async function dropWhenIdle(
  admin: Pool,
  db: string,
  waitMs: number = DEFAULT_WAIT_MS,
): Promise<DropOutcome> {
  if (!SAFE_IDENT.test(db)) {
    throw new Error(`refusing to drop an unsafe database identifier: ${db}`);
  }

  const started = Date.now();
  let stragglers = 0;

  for (;;) {
    const { rows } = await admin.query<{ n: number }>(LIVE_CLIENTS, [db]);
    stragglers = rows[0]?.n ?? 0;
    if (stragglers === 0) break;
    if (Date.now() - started > waitMs) {
      // Say it, and drop anyway. Leaving the database behind would break the
      // next run, and staying quiet would re-create exactly the failure this
      // helper exists to remove — only now with a cause we chose not to print.
      console.warn(
        `dropWhenIdle: ${stragglers} client backend(s) still on "${db}" after ` +
          `${waitMs} ms; dropping with FORCE. If this repeats, a pool is not ` +
          `being closed before the drop.`,
      );
      break;
    }
    await delay(POLL_MS);
  }

  await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  return { waitedMs: Date.now() - started, stragglers };
}
