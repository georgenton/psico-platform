import { describe, expect, it, vi } from "vitest";

import {
  assertEmptyTestDatabase,
  inspectTestDatabase,
} from "./pg-precondition";

/**
 * The regression guard for a debugging detour.
 *
 * Two pg-spec suites failed for forty seconds each with errors that pointed at
 * the product — a NOT NULL violation, and SQLSTATE 42704 on the `vector` type —
 * when the only thing wrong was that TEST_DATABASE_URL named a database with the
 * schema already applied. This runs in the ordinary suite (no PostgreSQL) so the
 * guard cannot quietly stop guarding.
 */

/** A fake catalog. Defaults describe a pristine database. */
function probe({
  tables = 0,
  migrations = 0,
  userColumns = 0,
  vectorSchema = null as string | null,
} = {}) {
  return {
    query: vi.fn().mockResolvedValue({
      rows: [
        {
          application_tables: tables,
          prisma_migrations: migrations,
          user_columns: userColumns,
          vector_schema: vectorSchema,
        },
      ],
    }),
  };
}

describe("assertEmptyTestDatabase", () => {
  it("passes on an empty database", async () => {
    await expect(
      assertEmptyTestDatabase(probe(), "some.pg-spec"),
    ).resolves.toBeUndefined();
  });

  it("refuses a database that already carries the schema", async () => {
    // The exact shape of the mistake: 87 tables, because someone ran
    // `prisma migrate deploy` against the throwaway database first.
    await expect(
      assertEmptyTestDatabase(
        probe({ tables: 87, migrations: 1, userColumns: 31 }),
        "some.pg-spec",
      ),
    ).rejects.toThrow(/87 application table/);
  });

  it("names the suite and points at the fix, not at the product", async () => {
    const err = await assertEmptyTestDatabase(
      probe({ tables: 87, migrations: 1, userColumns: 31 }),
      "privacy-barrier.pg-spec",
    ).catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("privacy-barrier.pg-spec");
    expect(message).toContain("pnpm --filter @psico/api pg:locks");
    // The trap that produced the confusing failures, stated in the message.
    expect(message).toContain("prisma migrate deploy");
  });

  it("tolerates the harness's own narrow User, but not the real one", async () => {
    // A passing run leaves a two-column `User` behind; that must not read as a
    // dirty database. The real 30-column `User` must — it is exactly what makes
    // `CREATE TABLE IF NOT EXISTS` a silent no-op.
    const p = probe();
    await assertEmptyTestDatabase(p, "some.pg-spec");
    const sql = p.query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("t.table_name = 'User'");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("<= 3");
    expect(sql).toContain("t.table_schema = 'public'");
    expect(sql).toContain("pg_extension");
  });

  it("a database holding only _prisma_migrations is still refused", async () => {
    // The migration ledger is a base table in `public`, so it counts: a
    // database that has been migrated is never empty, whatever else it holds.
    await expect(
      assertEmptyTestDatabase(
        probe({ tables: 1, migrations: 1 }),
        "some.pg-spec",
      ),
    ).rejects.toThrow(/1 application table/);
  });

  it("counts only base tables, so views cannot trip it", async () => {
    const p = probe();
    await assertEmptyTestDatabase(p, "some.pg-spec");
    expect(p.query.mock.calls[0]?.[0]).toContain("BASE TABLE");
  });

  it("refuses a database whose ONLY contamination is the vector extension", async () => {
    // Zero tables and still unusable: CREATE EXTENSION IF NOT EXISTS becomes a
    // no-op and the migration dies on `vector(1024)` under an isolated schema.
    const err = await assertEmptyTestDatabase(
      probe({ vectorSchema: "public" }),
      "mood-normalization-migration.pg-spec",
    ).catch((e: Error) => e);

    const message = (err as Error).message;
    expect(message).toContain(
      "mood-normalization-migration.pg-spec: TEST_DATABASE_URL contains the vector extension and is not a clean pg-spec database.",
    );
    expect(message).toContain("Run: pnpm --filter @psico/api pg:locks");
    expect(message).toContain(
      "Do not pre-install extensions or run prisma migrate deploy.",
    );
    // "0 tables" must not read as "fine".
    expect(message).not.toContain("0 application table");
  });

  it("catches vector in ANY schema, not just public", async () => {
    await expect(
      assertEmptyTestDatabase(
        probe({ vectorSchema: "extensions" }),
        "s.pg-spec",
      ),
    ).rejects.toThrow(/vector extension/);
  });

  it("never puts a host, user or connection string in the message", async () => {
    const err = await assertEmptyTestDatabase(
      probe({
        tables: 87,
        migrations: 1,
        userColumns: 31,
        vectorSchema: "public",
      }),
      "s.pg-spec",
    ).catch((e: Error) => e);
    const message = (err as Error).message;
    for (const leak of [
      "postgres://",
      "postgresql://",
      "@localhost",
      "password",
    ]) {
      expect(message).not.toContain(leak);
    }
  });
});

describe("inspectTestDatabase", () => {
  it("reports each fact separately", async () => {
    const state = await inspectTestDatabase(
      probe({
        tables: 87,
        migrations: 1,
        userColumns: 31,
        vectorSchema: "public",
      }),
    );
    expect(state).toEqual({
      applicationTables: 87,
      prismaMigrationTable: true,
      applicationUserTable: true,
      vectorExtension: true,
      vectorExtensionSchema: "public",
    });
  });

  it("a narrow User is not the application User", async () => {
    const state = await inspectTestDatabase(probe({ userColumns: 2 }));
    expect(state.applicationUserTable).toBe(false);
    expect(state.vectorExtension).toBe(false);
  });
});
