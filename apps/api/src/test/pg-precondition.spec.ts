import { describe, expect, it, vi } from "vitest";

import { assertEmptyTestDatabase } from "./pg-precondition";

/**
 * The regression guard for a debugging detour.
 *
 * Two pg-spec suites failed for forty seconds each with errors that pointed at
 * the product — a NOT NULL violation, and SQLSTATE 42704 on the `vector` type —
 * when the only thing wrong was that TEST_DATABASE_URL named a database with the
 * schema already applied. This runs in the ordinary suite (no PostgreSQL) so the
 * guard cannot quietly stop guarding.
 */

function probeReturning(count: number) {
  return { query: vi.fn().mockResolvedValue({ rows: [{ count }] }) };
}

describe("assertEmptyTestDatabase", () => {
  it("passes on an empty database", async () => {
    await expect(
      assertEmptyTestDatabase(probeReturning(0), "some.pg-spec"),
    ).resolves.toBeUndefined();
  });

  it("refuses a database that already carries the schema", async () => {
    // The exact shape of the mistake: 87 tables, because someone ran
    // `prisma migrate deploy` against the throwaway database first.
    await expect(
      assertEmptyTestDatabase(probeReturning(87), "some.pg-spec"),
    ).rejects.toThrow(/87 application table/);
  });

  it("names the suite and points at the fix, not at the product", async () => {
    const err = await assertEmptyTestDatabase(
      probeReturning(87),
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
    const probe = probeReturning(0);
    await assertEmptyTestDatabase(probe, "some.pg-spec");
    const sql = probe.query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("t.table_name = 'User'");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("<= 3");
    expect(sql).toContain("t.table_schema = 'public'");
  });

  it("a database holding only _prisma_migrations is still refused", async () => {
    // The migration ledger is a base table in `public`, so it counts: a
    // database that has been migrated is never empty, whatever else it holds.
    await expect(
      assertEmptyTestDatabase(probeReturning(1), "some.pg-spec"),
    ).rejects.toThrow(/1 application table/);
  });

  it("counts only base tables, so views cannot trip it", async () => {
    const probe = probeReturning(0);
    await assertEmptyTestDatabase(probe, "some.pg-spec");
    expect(probe.query.mock.calls[0]?.[0]).toContain("BASE TABLE");
  });
});
