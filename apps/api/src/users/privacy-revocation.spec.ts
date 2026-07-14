import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsersService } from "./users.service";
import { EmotionalMapService } from "../emotional-map/emotional-map.service";
import { EmotionalMapSnapshotProcessor } from "../jobs/processors/emotional-map-snapshot.processor";
import { JobName, QueueName } from "../jobs/queue-names";
import {
  emptyStore,
  makeLockingPrisma,
  type LockingStore,
} from "../test/locking-prisma";
import type {
  EmotionalMapMetadataPayload,
  IEmotionalMapProvider,
} from "../emotional-map/providers/provider.interface";

/**
 * PR-0.1 — the revocation, under CONCURRENCY.
 *
 * Making `updatePrivacy` atomic closed the sequential hole. It did nothing for
 * the concurrent one, which is the same bug with a longer fuse:
 *
 *     writer                          revocation
 *     ──────                          ──────────
 *     read consent = true
 *                                     delete the derived rows
 *                                     revision++  ← commits
 *     upsert  ← the deleted row is BACK
 *
 * Both writers have this shape, and the snapshot processor holds its stale read
 * across an LLM call, so its window is seconds wide, not microseconds.
 *
 * These tests run the REAL services against a Prisma double that models the
 * Postgres row lock (`test/locking-prisma.ts`): shares compatible with each
 * other, conflicting with the exclusive lock, held until the transaction ends.
 * That is what makes them worth writing — remove the barrier and they fail. The
 * lock SEMANTICS themselves are verified against a real PostgreSQL in
 * `emotional-map/privacy-barrier.pg-spec.ts`.
 */

function makeRedis(opts: { brokenIncr?: boolean } = {}) {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    }),
    incr: vi.fn(async (k: string) => {
      if (opts.brokenIncr) throw new Error("redis down");
      const n = Number(store.get(k) ?? "0") + 1;
      store.set(k, String(n));
      return n;
    }),
    del: vi.fn(),
  };
}

function makeProvider(): IEmotionalMapProvider {
  return {
    name: "test",
    score: async (_payload: EmotionalMapMetadataPayload) => ({
      calma: 0.5,
      claridad: 0.5,
      compasion: 0.5,
      consciencia: 0.5,
    }),
  };
}

const FEATURES = {
  wordCount: 120,
  selfFocus: 0.3,
  positive: 0.4,
  negative: 0.1,
  insight: 0.5,
  causal: 0.4,
  absolutist: 0.05,
  social: 0.2,
  selfKind: 0.4,
  selfCritic: 0.1,
};

const SNAPSHOT_JOB = {
  name: JobName.RUN_EMOTIONAL_MAP_SNAPSHOT,
  queueName: QueueName.EMOTIONAL_MAP_SNAPSHOT,
  data: {},
};

const COMPUTED = {
  pct: 74,
  coverage: 0.8,
  values: [0.7, 0.8, 0, 0, 0.6, 0.6],
  provider: "test",
};

/** A gate the test opens when it wants a paused actor to continue. */
function latch() {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  return { gate, open };
}

describe("Revoking localTextAnalysis — the concurrent flow (PR-0.1)", () => {
  let store: LockingStore;
  let prisma: ReturnType<typeof makeLockingPrisma>;
  let redis: ReturnType<typeof makeRedis>;
  let users: UsersService;
  let map: EmotionalMapService;

  const newUsers = () => {
    const svc = new UsersService(
      prisma as never,
      {} as never, // storage — unused on this path
      {} as never, // jobs — unused on this path
      { get: vi.fn() } as never,
      redis as never,
    );
    // getMe drags in half the schema and is not what any of this is about.
    vi.spyOn(svc, "getMe").mockResolvedValue({} as never);
    return svc;
  };

  beforeEach(() => {
    store = emptyStore();
    store.privacySettings.push({
      userId: "user-1",
      localTextAnalysis: true,
      emotionalMapPrivacyRevision: 0,
    });
    prisma = makeLockingPrisma(store);
    redis = makeRedis();
    users = newUsers();
    map = new EmotionalMapService(
      prisma as never,
      makeProvider(),
      redis as never,
    );
  });

  // ── Race A — the text-feature upload ──────────────────────────────────────

  it("A · an upload in flight when the revocation lands cannot resurrect the row", async () => {
    // Pause the writer INSIDE its transaction, after it has taken the shared
    // lock and read the consent, right before the upsert. That is the exact
    // instant the old code was vulnerable.
    const paused = latch();
    let writerIsInside = false;

    const original = prisma.$transaction;
    const spy = vi
      .spyOn(prisma, "$transaction")
      .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => {
        spy.mockRestore(); // only the FIRST transaction — the writer's — is paused
        return original(async (tx: unknown) => {
          const t = tx as {
            privacySettings: { findUnique: (a: unknown) => Promise<unknown> };
          };
          const inner = t.privacySettings.findUnique;
          t.privacySettings.findUnique = async (a: unknown) => {
            const res = await inner(a);
            writerIsInside = true;
            await paused.gate; // ← held inside the tx, shared lock still taken
            return res;
          };
          return cb(tx);
        });
      });

    const upload = map.logTextFeatures("user-1", {
      entryId: "e1",
      ...FEATURES,
    });
    await vi.waitFor(() => expect(writerIsInside).toBe(true));

    // The revocation arrives while the writer is mid-transaction.
    let revocationDone = false;
    const revoke = users
      .updatePrivacy("user-1", { localTextAnalysis: false } as never)
      .then(() => {
        revocationDone = true;
      });

    // It must NOT be able to finish: the writer holds the shared lock, so the
    // exclusive lock is still queued. If this ever flips true, the barrier is
    // not there and the test below would be passing by luck.
    await new Promise((r) => setTimeout(r, 20));
    expect(revocationDone).toBe(false);
    expect(store.diaryTextFeature).toHaveLength(0);

    // Release the writer: it commits its row…
    paused.open();
    await upload;
    expect(store.diaryTextFeature).toHaveLength(1);

    // …and the revocation, queued behind it, deletes it.
    await revoke;

    expect(revocationDone).toBe(true);
    expect(store.privacySettings[0].localTextAnalysis).toBe(false);
    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(1);
    expect(store.diaryTextFeature).toHaveLength(0); // ← the row does not survive
  });

  it("A' · an upload that starts after the revocation is refused (403), not written", async () => {
    // The other ordering. The revocation commits first; the writer then takes
    // its shared lock, re-reads the consent INSIDE the transaction, and sees the
    // truth. No row, and an honest 403 rather than a silent no-op.
    await users.updatePrivacy("user-1", { localTextAnalysis: false } as never);

    await expect(
      map.logTextFeatures("user-1", { entryId: "e1", ...FEATURES }),
    ).rejects.toThrow(/TEXT_ANALYSIS_NOT_ENABLED/);

    expect(store.diaryTextFeature).toHaveLength(0);
  });

  // ── Race B — the snapshot processor ───────────────────────────────────────

  it("B · a snapshot computed before the revocation is DROPPED, not persisted", async () => {
    // This race is different in kind. The processor holds NO lock while it
    // computes — that call can sit inside an LLM round-trip for seconds — so the
    // revocation genuinely commits underneath it. A lock cannot help here. What
    // saves us is re-reading the revision at write time and refusing to persist
    // numbers derived from a consent state the user has left behind.
    const computing = latch();
    const paused = latch();

    const slowMap = {
      compute: vi.fn(async () => {
        computing.open();
        await paused.gate; // ← the LLM call, in slow motion
        return COMPUTED;
      }),
    };
    const processor = new EmotionalMapSnapshotProcessor(
      prisma as never,
      slowMap as never,
    );

    const run = processor.process(SNAPSHOT_JOB as never);
    await computing.gate; // it has read revision 0 and is now computing

    // The revocation lands and COMMITS — nothing holds it back, because the
    // processor is not in a transaction yet.
    await users.updatePrivacy("user-1", { localTextAnalysis: false } as never);
    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(1);

    paused.open();
    const result = await run;

    expect(result.persisted).toBe(0);
    expect(result.skippedRevoked).toBe(1);
    expect(store.emotionalMapSnapshot).toHaveLength(0); // ← nothing written back
  });

  it("B' · a snapshot whose write wins the race is deleted by the revocation behind it", async () => {
    // The mirrored ordering: the processor gets its lock first, the revocation
    // queues, the snapshot lands, and the revocation then removes it. Same
    // destination, different road.
    const processor = new EmotionalMapSnapshotProcessor(
      prisma as never,
      {
        compute: vi.fn(async () => COMPUTED),
      } as never,
    );

    const result = await processor.process(SNAPSHOT_JOB as never);
    expect(result.persisted).toBe(1);
    expect(store.emotionalMapSnapshot).toHaveLength(1);
    // Provenance: the row records which consent state produced these numbers.
    expect(store.emotionalMapSnapshot[0].privacyRevision).toBe(0);

    await users.updatePrivacy("user-1", { localTextAnalysis: false } as never);

    expect(store.emotionalMapSnapshot).toHaveLength(0);
  });

  // ── And all of it holds with Redis on the floor ───────────────────────────

  it("survives a broken Redis: the revocation still commits and still deletes", async () => {
    redis = makeRedis({ brokenIncr: true });
    users = newUsers();

    store.diaryTextFeature.push({ id: "dtf-0", userId: "user-1", ...FEATURES });
    store.emotionalMapSnapshot.push({ id: "snap-0", userId: "user-1" });

    await users.updatePrivacy("user-1", { localTextAnalysis: false } as never);

    expect(redis.incr).toHaveBeenCalled(); // it was tried…
    await expect(redis.incr("x")).rejects.toThrow(/redis down/); // …and it failed
    // …and none of it mattered: the guarantee lives in Postgres.
    expect(store.diaryTextFeature).toHaveLength(0);
    expect(store.emotionalMapSnapshot).toHaveLength(0);
    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(1);
  });
});

// ── C · Consent idempotency ─────────────────────────────────────────────────

describe("Consent is idempotent — 'changed' means the VALUE moved (PR-0.1)", () => {
  let store: LockingStore;
  let prisma: ReturnType<typeof makeLockingPrisma>;
  let redis: ReturnType<typeof makeRedis>;
  let users: UsersService;

  const seed = (consent: boolean, revision: number) => {
    store.privacySettings.push({
      userId: "user-1",
      localTextAnalysis: consent,
      emotionalMapPrivacyRevision: revision,
    });
  };

  beforeEach(() => {
    store = emptyStore();
    prisma = makeLockingPrisma(store);
    redis = makeRedis();
    users = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      { get: vi.fn() } as never,
      redis as never,
    );
    vi.spyOn(users, "getMe").mockResolvedValue({} as never);
  });

  it("re-saving the SAME consent changes nothing: no revision, no delete, no cache churn", async () => {
    // The old rule was "the field was present in the DTO". A settings page that
    // PATCHes the whole form on every save would then bump the revision on every
    // click — churning the cache of a user who changed nothing, and, on the
    // `false` branch, deleting history they never asked to lose.
    seed(true, 3);
    store.diaryTextFeature.push({ id: "dtf-1", userId: "user-1", ...FEATURES });
    store.emotionalMapSnapshot.push({ id: "snap-1", userId: "user-1" });

    await users.updatePrivacy("user-1", { localTextAnalysis: true } as never);

    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(3); // unmoved
    expect(store.diaryTextFeature).toHaveLength(1);
    expect(store.emotionalMapSnapshot).toHaveLength(1);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("re-saving 'off' when it is already off does not delete a second time", async () => {
    seed(false, 2);
    // Snapshots rebuilt from the REMAINING consented sources after an earlier
    // revocation. Re-sending `false` must not take them out.
    store.emotionalMapSnapshot.push({ id: "snap-1", userId: "user-1" });

    await users.updatePrivacy("user-1", { localTextAnalysis: false } as never);

    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(2);
    expect(store.emotionalMapSnapshot).toHaveLength(1);
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("true → false: revision moves, BOTH derivatives deleted", async () => {
    seed(true, 0);
    store.diaryTextFeature.push({ id: "dtf-1", userId: "user-1", ...FEATURES });
    store.emotionalMapSnapshot.push({ id: "snap-1", userId: "user-1" });

    await users.updatePrivacy("user-1", { localTextAnalysis: false } as never);

    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(1);
    expect(store.diaryTextFeature).toHaveLength(0);
    expect(store.emotionalMapSnapshot).toHaveLength(0);
    expect(redis.incr).toHaveBeenCalled();
  });

  it("false → true: revision moves, NOTHING is deleted", async () => {
    // Granting consent changes the map's inputs, so the cache must miss — but it
    // is not a revocation, and it destroys nothing.
    seed(false, 1);
    store.emotionalMapSnapshot.push({ id: "snap-1", userId: "user-1" });

    await users.updatePrivacy("user-1", { localTextAnalysis: true } as never);

    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(2);
    expect(store.emotionalMapSnapshot).toHaveLength(1);
    expect(redis.incr).toHaveBeenCalled();
  });

  it("a privacy field that is NOT the consent moves nothing at all", async () => {
    seed(true, 5);

    await users.updatePrivacy("user-1", { shareAnalytics: false } as never);

    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(5);
    expect(store.privacySettings[0].localTextAnalysis).toBe(true);
    expect(redis.incr).not.toHaveBeenCalled();
  });
});
