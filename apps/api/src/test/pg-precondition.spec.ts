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

  it("tolerates the harness's own leftover table", async () => {
    // A passing run leaves its minimal `User` behind; that must not be read as
    // a dirty database on the next run.
    const probe = probeReturning(0);
    await assertEmptyTestDatabase(probe, "some.pg-spec");
    const sql = probe.query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("table_name NOT IN ('User')");
    expect(sql).toContain("table_schema = 'public'");
  });

  it("counts only base tables, so views cannot trip it", async () => {
    const probe = probeReturning(0);
    await assertEmptyTestDatabase(probe, "some.pg-spec");
    expect(probe.query.mock.calls[0]?.[0]).toContain("BASE TABLE");
  });
});
