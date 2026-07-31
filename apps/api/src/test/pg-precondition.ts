/**
 * The precondition the pg-spec suites always had, and never stated.
 *
 * Several `*.pg-spec.ts` suites build their own minimal world — a two-column
 * `"User"`, or a migration run into an isolated schema — and that only works on
 * an EMPTY database. Point them at one that already carries the application
 * schema and they fail in ways that look like product bugs:
 *
 *   - `CREATE TABLE IF NOT EXISTS "User" (id text PRIMARY KEY)` silently does
 *     nothing, because the real 30-column `User` is already there. The spec then
 *     inserts a row missing half a dozen NOT NULL columns and reports a Prisma
 *     error about a statement that is, in isolation, perfectly correct.
 *
 *   - `CREATE EXTENSION IF NOT EXISTS "vector"` also does nothing, because the
 *     extension exists in `public`. A migration into schema `pr2a_migrate` then
 *     hits `embedding vector(1024)` with `search_path` pinned to that schema,
 *     cannot resolve the type, and dies with SQLSTATE 42704 — pointing at a
 *     migration that has been fine for months.
 *
 * Both messages send the reader after the wrong thing. This turns the mistake
 * into what it is — the wrong database — and says so before a single test runs.
 *
 * Cheap by construction: one catalog query, no writes.
 */

export interface EmptyDatabaseProbe {
  query(sql: string): Promise<{ rows: Array<{ count: string | number }> }>;
}

/**
 * The harness leaves one table behind: the two-column `"User"` that
 * `privacy-barrier.pg-spec` creates. That one is fine to find on the next run.
 * The REAL `User` is not — it is the thing whose presence makes
 * `CREATE TABLE IF NOT EXISTS` a silent no-op. They are told apart by width,
 * which is the property that actually matters here: anything wider than the
 * harness's own table is somebody else's schema.
 */
const HARNESS_USER_MAX_COLUMNS = 3;

/**
 * Fail fast unless the target database is empty of application tables.
 *
 * @param probe anything with `query` — a `pg.Pool`, or a fake in a unit test.
 * @param label the suite name, so the message says which run refused.
 */
export async function assertEmptyTestDatabase(
  probe: EmptyDatabaseProbe,
  label: string,
): Promise<void> {
  // Count every base table in `public`, EXCEPT a `"User"` narrow enough to be
  // the harness's own. `_prisma_migrations`, the real `User`, and anything left
  // over from a previous run all count.
  const { rows } = await probe.query(
    `SELECT count(*) AS count
       FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND NOT (
          t.table_name = 'User'
          AND (
            SELECT count(*)
              FROM information_schema.columns c
             WHERE c.table_schema = 'public'
               AND c.table_name = 'User'
          ) <= ${HARNESS_USER_MAX_COLUMNS}
        )`,
  );
  const found = Number(rows[0]?.count ?? 0);
  if (found === 0) return;

  throw new Error(
    [
      `${label}: TEST_DATABASE_URL points at a database that already has ${found} application table(s).`,
      "",
      "These suites build their own minimal schema and need an EMPTY database.",
      "Against a migrated one they fail with errors that blame the product",
      "(a missing NOT NULL column, or SQLSTATE 42704 on `vector`) when the only",
      "thing wrong is the target.",
      "",
      "Create a throwaway database and point TEST_DATABASE_URL at it:",
      "  pnpm --filter @psico/api pg:locks",
      "",
      "Do NOT run `prisma migrate deploy` against it first — the suites that need",
      "migrations run them themselves, into their own schema.",
    ].join("\n"),
  );
}
