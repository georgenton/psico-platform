import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  c0aStartLockKeys,
  globalStartLockKey,
  lineageStartLockKey,
} from "./guide-active-capability";

/**
 * C.0A — the mixed-fleet guarantee, against real advisory locks.
 *
 * The whole reason C.0A takes TWO start locks is that a rolling deploy runs
 * two binaries at once, and two versions only serialise against each other if
 * they hash the SAME key. The schema transition was never the hard part: an
 * index says which rows may exist, not which STARTs may run at the same time,
 * so a version pair sharing no lock can interleave freely and still satisfy
 * every constraint.
 *
 * Each version is modelled by the keys it takes, because that is precisely
 * what distinguishes them:
 *
 *   V0 (pre-C.0A)    global
 *   V1 (C.0A)        global → lineage
 *   V2 (C.0B3)       lineage
 *
 * Every claim below uses deferred promises: a lock that "would" block is not
 * evidence, so the test holds a real transaction open and observes whether the
 * other one gets in.
 *
 * Runs under `test:locks` (TEST_DATABASE_URL set); skipped otherwise.
 */

const base = process.env.TEST_DATABASE_URL;
const suite = base ? describe : describe.skip;
const DB = "c0a_rolling_locks_db";
const API_DIR = process.cwd();

const U = "u-roll";
const GUIDE_A = "guia-a";
const GUIDE_B = "guia-b";

/** A promise plus the handles to settle it from the test body. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

suite("C.0A · start locks across a rolling deploy", () => {
  let pool: Pool;
  let prisma: PrismaClient;

  /**
   * One version's START, reduced to what matters here: it takes its keys, says
   * it is inside, and stays inside until released.
   */
  async function versionStart(
    keys: string[],
    opts: { entered: () => void; release: Promise<void> },
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      for (const key of keys) {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 42))`,
          key,
        );
      }
      opts.entered();
      await opts.release;
    });
  }

  // V0 and V2 are modelled — neither exists in this tree, one is history and
  // one is the future. V1 is NOT modelled: it is the very function `start()`
  // iterates, so a passing test says production serialises, not that a
  // hand-copied list would.
  const V0 = () => [globalStartLockKey(U)];
  const V1 = (guideKey: string) => [...c0aStartLockKeys(U, guideKey)];
  const V2 = (guideKey: string) => [lineageStartLockKey(U, guideKey)];

  /**
   * Does `second` get in while `first` is still holding?
   *
   * `false` means the pair serialises. The wait is bounded so a serialised
   * pair reports as serialised instead of hanging the suite.
   */
  async function canProceedConcurrently(
    firstKeys: string[],
    secondKeys: string[],
  ): Promise<boolean> {
    const firstIn = deferred();
    const secondIn = deferred();
    const releaseFirst = deferred();
    const releaseSecond = deferred();

    const first = versionStart(firstKeys, {
      entered: firstIn.resolve,
      release: releaseFirst.promise,
    });
    await firstIn.promise;

    const second = versionStart(secondKeys, {
      entered: secondIn.resolve,
      release: releaseSecond.promise,
    });

    const got = await Promise.race([
      secondIn.promise.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 750)),
    ]);

    releaseFirst.resolve();
    await first;
    releaseSecond.resolve();
    await second;
    return got;
  }

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const u = new URL(base as string);
    u.pathname = `/${DB}`;
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: u.toString(),
        PRISMA_SKIP_SEED: "1",
      },
      stdio: "inherit",
    });
    // Two connections minimum: the second START must be able to wait.
    pool = new Pool({ connectionString: u.toString(), max: 6 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  }, 240_000);

  // Explicit budget, matching `beforeAll`: this suite holds transactions open
  // on purpose, so teardown can genuinely wait on connections draining.
  afterAll(async () => {
    try {
      if (prisma) await prisma.$disconnect();
    } catch {
      /* fall through */
    }
    try {
      if (pool) await pool.end();
    } catch {
      /* idem */
    }
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  }, 240_000);

  it("V0 and V1 serialise — the compatibility lock is shared", async () => {
    // The C.0A rollout window. Without the global key in V1, a pre-C.0A
    // instance and a C.0A instance would both start for the same user at once.
    expect(await canProceedConcurrently(V0(), V1(GUIDE_A))).toBe(false);
    expect(await canProceedConcurrently(V1(GUIDE_A), V0())).toBe(false);
  });

  it("V1 and V2 serialise for the SAME lineage — the lineage lock is shared", async () => {
    // The C.0B3 rollout window. This is what the second lock buys: by the time
    // V2 exists, V1 has been taking its key for two phases.
    expect(await canProceedConcurrently(V1(GUIDE_A), V2(GUIDE_A))).toBe(false);
    expect(await canProceedConcurrently(V2(GUIDE_A), V1(GUIDE_A))).toBe(false);
  });

  it("V1 and V2 on DIFFERENT lineages both proceed", async () => {
    // The point of the whole programme: independent journeys must not queue
    // behind each other once the schema allows them to coexist.
    expect(await canProceedConcurrently(V1(GUIDE_A), V2(GUIDE_B))).toBe(true);
  });

  it("two V2 instances serialise per lineage and not across them", async () => {
    expect(await canProceedConcurrently(V2(GUIDE_A), V2(GUIDE_A))).toBe(false);
    expect(await canProceedConcurrently(V2(GUIDE_A), V2(GUIDE_B))).toBe(true);
  });

  it("V0 and V2 share NOTHING — which is why they may never coexist", async () => {
    // Not a bug to fix in code: it is the reason C.0B2 is gated on V0 being
    // drained, and the reason V2 cannot ship until then.
    expect(await canProceedConcurrently(V0(), V2(GUIDE_A))).toBe(true);
  });

  it("the canonical sequence is exactly the two keys, in order", async () => {
    // The negative controls for "drop a lock" live in the AUTHORITY, not
    // here: mutating `c0aStartLockKeys` breaks the pairs above, because V1 is
    // that function. This pins the shape so a silent third key or a swap is
    // visible in one place.
    expect([...c0aStartLockKeys(U, GUIDE_A)]).toEqual([
      globalStartLockKey(U),
      lineageStartLockKey(U, GUIDE_A),
    ]);
  });

  it("a mutate holding ONLY the session lock makes START wait, not cycle", async () => {
    // The schedule that could actually deadlock if the order were free: a
    // `mutate()` command holds the session lock and wants nothing else, while
    // START holds both start locks and then reaches for that same session to
    // autocancel it. START waits; `mutate` never waits on a start lock, so it
    // can finish — and when it does, START proceeds. Wait, not cycle.
    const sessionKey = `guide:session:${U}:s-mutate`;

    const mutateIn = deferred();
    const releaseMutate = deferred();
    const mutate = versionStart([sessionKey], {
      entered: mutateIn.resolve,
      release: releaseMutate.promise,
    });
    await mutateIn.promise;

    const startIn = deferred();
    const releaseStart = deferred();
    const start = versionStart([...V1(GUIDE_A), sessionKey], {
      entered: startIn.resolve,
      release: releaseStart.promise,
    });

    // START holds global + lineage and is now blocked on the session lock.
    const gotEarly = await Promise.race([
      startIn.promise.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 600)),
    ]);
    expect(gotEarly).toBe(false);

    // `mutate` is not waiting on anything START holds, so it commits freely.
    releaseMutate.resolve();
    await mutate;

    // And START gets in — it was waiting, not deadlocked.
    await startIn.promise;
    releaseStart.resolve();
    await start;
  });

  it("holding both keys is deadlock-free against a session-lock holder", async () => {
    // Every actor acquires along one total order — global, lineage, session —
    // so no pair can build a wait cycle. A START that autocancels takes the
    // session lock LAST, which is the case modelled here.
    const sessionKey = `guide:session:${U}:s-1`;
    const firstIn = deferred();
    const release = deferred();
    const holder = versionStart([...V1(GUIDE_A), sessionKey], {
      entered: firstIn.resolve,
      release: release.promise,
    });
    await firstIn.promise;

    const secondIn = deferred();
    const releaseSecond = deferred();
    const waiter = versionStart(V1(GUIDE_A), {
      entered: secondIn.resolve,
      release: releaseSecond.promise,
    });

    const got = await Promise.race([
      secondIn.promise.then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 500)),
    ]);
    expect(got).toBe(false);

    release.resolve();
    await holder;
    // Once the holder commits, the waiter proceeds — it waited, it did not
    // deadlock.
    await secondIn.promise;
    releaseSecond.resolve();
    await waiter;
  });
});
