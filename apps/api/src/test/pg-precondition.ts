/**
 * The precondition the pg-spec suites always had, and never stated.
 *
 * Several `*.pg-spec.ts` suites build their own minimal world — a two-column
 * `"User"`, or a migration run into an isolated schema — and that only works on
 * an EMPTY database. Point them at one that already carries the application
 * schema, or merely the `vector` extension, and they fail in ways that look
 * like product bugs:
 *
 *   - `CREATE TABLE IF NOT EXISTS "User" (id text PRIMARY KEY)` silently does
 *     nothing, because the real 30-column `User` is already there. The spec then
 *     inserts a row missing half a dozen NOT NULL columns and reports a Prisma
 *     error about a statement that is, in isolation, perfectly correct.
 *
 *   - `CREATE EXTENSION IF NOT EXISTS "vector"` also does nothing, because the
 *     extension exists — in `public`, or in any other schema. A migration into
 *     `pr2a_migrate` then hits `embedding vector(1024)` with `search_path`
 *     pinned to that schema, cannot resolve the type, and dies with SQLSTATE
 *     42704 — pointing at a migration that has been fine for months.
 *
 * The second case is why counting tables is not enough: a database can hold
 * zero tables and still be unusable. The extension alone is contamination.
 *
 * Cheap by construction: one catalog query, no writes.
 */

export interface EmptyDatabaseProbe {
  query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * The harness leaves one table behind: the two-column `"User"` that
 * `privacy-barrier.pg-spec` creates in the same run. That one is tolerated.
 * The REAL `User` is not — it is the thing that makes
 * `CREATE TABLE IF NOT EXISTS` a silent no-op. Told apart by width, which is
 * the property that actually matters: anything wider is somebody else's schema.
 */
const HARNESS_USER_MAX_COLUMNS = 3;

export interface TestDatabaseState {
  /** Base tables in `public`, excluding a `User` narrow enough to be ours. */
  applicationTables: number;
  prismaMigrationTable: boolean;
  applicationUserTable: boolean;
  vectorExtension: boolean;
  /** The schema `vector` lives in, when present. Never a connection detail. */
  vectorExtensionSchema: string | null;
}

/** One round trip; every fact the guard needs. */
export async function inspectTestDatabase(
  probe: EmptyDatabaseProbe,
): Promise<TestDatabaseState> {
  const { rows } = await probe.query(
    `SELECT
       (SELECT count(*)
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
           )
       ) AS application_tables,
       (SELECT count(*)
          FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = '_prisma_migrations'
       ) AS prisma_migrations,
       (SELECT count(*)
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'User'
       ) AS user_columns,
       (SELECT n.nspname
          FROM pg_extension e
          JOIN pg_namespace n ON n.oid = e.extnamespace
         WHERE e.extname = 'vector'
       ) AS vector_schema`,
  );

  const row = rows[0] ?? {};
  const userColumns = Number(row.user_columns ?? 0);
  const vectorSchema = (row.vector_schema as string | null) ?? null;

  return {
    applicationTables: Number(row.application_tables ?? 0),
    prismaMigrationTable: Number(row.prisma_migrations ?? 0) > 0,
    applicationUserTable: userColumns > HARNESS_USER_MAX_COLUMNS,
    vectorExtension: vectorSchema !== null,
    vectorExtensionSchema: vectorSchema,
  };
}

/**
 * Fail fast unless the target database is clean for these suites.
 *
 * @param probe anything with `query` — a `pg.Pool`, or a fake in a unit test.
 * @param label the suite name, so the message says which run refused.
 */
export async function assertEmptyTestDatabase(
  probe: EmptyDatabaseProbe,
  label: string,
): Promise<void> {
  const state = await inspectTestDatabase(probe);

  // The extension-only case gets its own message: "0 tables" would otherwise
  // read as "the database is fine", and the reader would go looking at the
  // migration instead of at the target.
  if (state.applicationTables === 0 && state.vectorExtension) {
    throw new Error(
      [
        `${label}: TEST_DATABASE_URL contains the vector extension and is not a clean pg-spec database.`,
        "Run: pnpm --filter @psico/api pg:locks",
        "Do not pre-install extensions or run prisma migrate deploy.",
      ].join("\n"),
    );
  }

  if (state.applicationTables === 0 && !state.vectorExtension) return;

  const found: string[] = [];
  if (state.applicationTables > 0) {
    found.push(`${state.applicationTables} application table(s)`);
  }
  if (state.prismaMigrationTable) found.push("_prisma_migrations");
  if (state.applicationUserTable) found.push("the application User table");
  if (state.vectorExtension) found.push("the vector extension");

  throw new Error(
    [
      `${label}: TEST_DATABASE_URL is not a clean pg-spec database — found ${found.join(", ")}.`,
      "",
      "These suites build their own minimal schema and need an EMPTY database.",
      "Against a migrated one they fail with errors that blame the product",
      "(a missing NOT NULL column, or SQLSTATE 42704 on `vector`) when the only",
      "thing wrong is the target.",
      "",
      "Run: pnpm --filter @psico/api pg:locks",
      "Do not pre-install extensions or run prisma migrate deploy.",
    ].join("\n"),
  );
}
