import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lockUserExclusive, lockUserShared } from "./privacy-barrier";

/**
 * PR-0.1 — the lock, against a real PostgreSQL.
 *
 * `privacy-revocation.spec.ts` proves the CODE PATHS: with the barrier removed,
 * a paused writer resurrects a revoked row and those tests go red. But it proves
 * them against a Prisma double whose lock is a hand-written mutex — which means
 * it proves our code is correct *given our belief about how Postgres locks
 * behave*. That belief is exactly the kind of thing that is easy to get wrong and
 * impossible to notice, so this file asks the database itself, with two genuinely
 * concurrent transactions.
 *
 * A note on the mode, because the first two versions of this file got it wrong.
 * Both `FOR SHARE` and the weaker `FOR KEY SHARE` conflict with `FOR UPDATE`, so
 * either would keep the revocation from cutting in front of a writer — the first
 * four tests below pass under both. The difference is `FOR NO KEY UPDATE`, the
 * lock a plain UPDATE of a NON-KEY column takes: `FOR SHARE` conflicts with it,
 * `FOR KEY SHARE` does not. That is the last test, and it pins the mode we chose.
 *
 * The subtlety that bit the earlier version: Postgres upgrades a plain UPDATE to
 * the STRONG `FOR UPDATE` when the updated columns overlap the key, so
 * `UPDATE "User" SET id = id` is NOT a clean probe of `FOR NO KEY UPDATE` — it
 * would conflict with `FOR KEY SHARE` too, and the test would pass under both
 * modes, proving nothing. So the table carries a throwaway non-key column
 * `marker`, and the last test updates THAT: an UPDATE that genuinely takes
 * `FOR NO KEY UPDATE`. We pay this contention deliberately — a revocation must
 * not be able to slip through on any path that touches the user row, including
 * one a future refactor writes as a plain column update instead of a lock.
 *
 * It runs only when `TEST_DATABASE_URL` is set — locally against a throwaway
 * container, in CI against the `postgres` service. CI uses postgres:18 to match
 * production; lock semantics are stable across versions but we align anyway.
 *
 *   docker run --rm -d -p 55432:5432 -e POSTGRES_PASSWORD=x -e POSTGRES_DB=locks postgres:18
 *   TEST_DATABASE_URL=postgresql://postgres:x@localhost:55432/locks \
 *     pnpm --filter @psico/api test:locks
 *
 * The table it needs is a `User(id)` plus a `marker` column — the barrier locks
 * nothing else, so the spec creates that much itself rather than dragging in the
 * full schema.
 */

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A gate the test opens when it wants a held transaction to commit. */
function latch() {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  return { gate, open };
}

const TX = { timeout: 20_000, maxWait: 10_000 };

suite("privacy barrier — real PostgreSQL lock semantics (PR-0.1)", () => {
  let prisma: PrismaClient;
  let pool: Pool;

  beforeAll(async () => {
    // Built exactly like `PrismaService`: Prisma 7 takes its connection through
    // a driver adapter, not a `datasourceUrl`. Same client, same pool semantics,
    // pointed at the throwaway database.
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "User" (id text PRIMARY KEY)`,
    );
    // A non-key column. The mode-pinning test updates THIS, so its UPDATE takes
    // FOR NO KEY UPDATE — not the strong FOR UPDATE that Postgres would use if we
    // touched the primary key.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS marker integer NOT NULL DEFAULT 0`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" (id) VALUES ('u1'), ('u2') ON CONFLICT DO NOTHING`,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it("a writer's shared lock BLOCKS the revocation's exclusive lock", async () => {
    // This is the property the whole design rests on. If `FOR SHARE` did not
    // conflict with `FOR UPDATE`, the revocation would sail past an in-flight
    // writer and delete rows the writer is about to re-create.
    const holding = latch();
    const release = latch();

    const writer = prisma.$transaction(async (tx) => {
      await lockUserShared(tx, "u1");
      holding.open();
      await release.gate; // hold the share open
    }, TX);

    await holding.gate;

    let revokerGotTheLock = false;
    const revoker = prisma.$transaction(async (tx) => {
      await lockUserExclusive(tx, "u1");
      revokerGotTheLock = true;
    }, TX);

    await sleep(400);
    expect(revokerGotTheLock).toBe(false); // ← blocked, as it must be

    release.open();
    await writer;
    await revoker;

    expect(revokerGotTheLock).toBe(true); // and it proceeds the moment we commit
  });

  it("the revocation's exclusive lock BLOCKS a writer's shared lock", async () => {
    // The mirrored direction. A writer that arrives while the revocation is
    // committing waits, and therefore re-reads the consent AFTER it changed.
    const holding = latch();
    const release = latch();

    const revoker = prisma.$transaction(async (tx) => {
      await lockUserExclusive(tx, "u1");
      holding.open();
      await release.gate;
    }, TX);

    await holding.gate;

    let writerGotTheLock = false;
    const writer = prisma.$transaction(async (tx) => {
      await lockUserShared(tx, "u1");
      writerGotTheLock = true;
    }, TX);

    await sleep(400);
    expect(writerGotTheLock).toBe(false);

    release.open();
    await revoker;
    await writer;

    expect(writerGotTheLock).toBe(true);
  });

  it("two writers' shared locks do NOT block each other", async () => {
    // The cost side of the design. Only the revocation is serialized; a
    // text-feature upload and a snapshot write for the same user proceed in
    // parallel, which is what makes this barrier affordable.
    const first = latch();
    const release = latch();

    const writerA = prisma.$transaction(async (tx) => {
      await lockUserShared(tx, "u1");
      first.open();
      await release.gate;
    }, TX);

    await first.gate;

    let writerBGotTheLock = false;
    const writerB = prisma.$transaction(async (tx) => {
      await lockUserShared(tx, "u1");
      writerBGotTheLock = true;
    }, TX);

    await sleep(300);
    expect(writerBGotTheLock).toBe(true); // ← straight through, no waiting

    release.open();
    await Promise.all([writerA, writerB]);
  });

  it("the lock is scoped to ONE user — a revocation never stalls another user's writer", async () => {
    // Row-level, not table-level. Worth asserting: a barrier that quietly
    // serialized every user would be a production incident of its own.
    const holding = latch();
    const release = latch();

    const revokerU1 = prisma.$transaction(async (tx) => {
      await lockUserExclusive(tx, "u1");
      holding.open();
      await release.gate;
    }, TX);

    await holding.gate;

    let writerU2Done = false;
    const writerU2 = prisma.$transaction(async (tx) => {
      await lockUserShared(tx, "u2");
      writerU2Done = true;
    }, TX);

    await sleep(300);
    expect(writerU2Done).toBe(true); // different row, no contention

    release.open();
    await Promise.all([revokerU1, writerU2]);
  });

  it("pins the MODE: a writer's shared lock also blocks a plain UPDATE of a non-key column", async () => {
    // The test that distinguishes `FOR SHARE` from `FOR KEY SHARE` — every other
    // test in this file passes under both, because both conflict with FOR UPDATE.
    //
    // It updates the NON-KEY `marker` column, so the UPDATE takes FOR NO KEY
    // UPDATE. `FOR SHARE` conflicts with it (the update waits); `FOR KEY SHARE`
    // does NOT (the update sails through, and the `toBe(false)` below fails).
    // That is exactly why it is here: it is the only assertion that would notice
    // someone "optimising" the barrier into a weaker lock and quietly opening a
    // path — a plain column update of the user row — a revocation could slip
    // through. Touching `id` instead would let Postgres upgrade the UPDATE to the
    // strong lock and pass under both modes, proving nothing.
    const holding = latch();
    const release = latch();

    const writer = prisma.$transaction(async (tx) => {
      await lockUserShared(tx, "u1");
      holding.open();
      await release.gate;
    }, TX);

    await holding.gate;

    let plainUpdateDone = false;
    const updater = prisma
      .$executeRawUnsafe(
        `UPDATE "User" SET marker = marker + 1 WHERE id = 'u1'`,
      )
      .then(() => {
        plainUpdateDone = true;
      });

    await sleep(400);
    expect(plainUpdateDone).toBe(false); // ← FOR SHARE conflicts with FOR NO KEY UPDATE

    release.open();
    await writer;
    await updater;

    expect(plainUpdateDone).toBe(true);
  });
});
