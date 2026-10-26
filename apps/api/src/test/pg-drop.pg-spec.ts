import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dropWhenIdle } from "./pg-drop";

/**
 * The teardown contract, against a real server.
 *
 * `pg-drop.spec.ts` keeps the static half (no suite drops on its own, no two
 * suites share a name). This is the half that needs PostgreSQL: that by the
 * time we drop, none of OUR connections are left — which is what makes the
 * `FATAL 57P01` impossible rather than merely unhandled.
 *
 * Measured, not asserted by feel: with the force-straight-away teardown this
 * replaced, 6 of 12 iterations of this exact shape raised an uncaught
 * exception, and the server logged 12 terminations. See `pg-drop.ts`.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;

const DB = "pg_drop_contract_db";

const withDatabase = (url: string, db: string): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
};

/** Several clients, each used many times — the condition of the real case. */
async function workPool(url: string): Promise<Pool> {
  const pool = new Pool({ connectionString: url, max: 10 });
  for (let round = 0; round < 4; round += 1) {
    await Promise.all(
      Array.from({ length: 10 }, () => pool.query("SELECT pg_sleep(0.01)")),
    );
  }
  return pool;
}

const exists = async (admin: Pool, db: string): Promise<boolean> => {
  const { rows } = await admin.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_database WHERE datname = $1",
    [db],
  );
  return (rows[0]?.n ?? 0) > 0;
};

suite("dropWhenIdle · the teardown of every pg-spec (real PostgreSQL)", () => {
  let admin: Pool;

  beforeAll(() => {
    admin = new Pool({ connectionString: base });
  });

  afterAll(async () => {
    await dropWhenIdle(admin, DB).catch(() => undefined);
    await admin.end();
  });

  it("drops with none of our own backends left", async () => {
    await dropWhenIdle(admin, DB);
    await admin.query(`CREATE DATABASE "${DB}"`);

    const pool = await workPool(withDatabase(base as string, DB));
    await pool.end();

    const outcome = await dropWhenIdle(admin, DB);

    // The invariant. Zero stragglers means the FORCE had nothing of ours to
    // terminate, so no FATAL could be generated — let alone delivered late to
    // a client that was already closing.
    expect(outcome.stragglers).toBe(0);
    expect(await exists(admin, DB)).toBe(false);
  }, 60_000);

  it("reports and still drops when something is genuinely holding the database", async () => {
    await admin.query(`CREATE DATABASE "${DB}"`);

    // A connection we deliberately do NOT close: the timeout branch, made
    // deterministic. Without this the branch would only ever run by accident,
    // which is the same as not being tested.
    const squatter = new Pool({
      connectionString: withDatabase(base as string, DB),
      max: 1,
    });
    // This one connection IS going to be force-terminated — that is the point
    // of the case — so its error is expected and must be tolerated here. Note
    // that this is not the fix for the suites: swallowing the termination
    // leaves it happening (measured: 14 FATALs on the server with the listener
    // alone, none with the wait). Here we are provoking it deliberately.
    squatter.on("error", () => undefined);
    await squatter.query("SELECT 1");

    const outcome = await dropWhenIdle(admin, DB, 150);

    expect(outcome.stragglers).toBeGreaterThan(0);
    expect(outcome.waitedMs).toBeGreaterThanOrEqual(150);
    // FORCE is the backstop, and it has to stay one: leaving the database
    // behind would break the next run.
    expect(await exists(admin, DB)).toBe(false);

    await squatter.end().catch(() => undefined);
  }, 60_000);
});
