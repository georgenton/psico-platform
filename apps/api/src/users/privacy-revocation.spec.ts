import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsersService } from "./users.service";
import { EmotionalMapService } from "../emotional-map/emotional-map.service";
import { EvolucionService } from "../evolucion/evolucion.service";
import { factsIdentity, generationKey } from "../emotional-map/cache-identity";
import type {
  EmotionalMapMetadataPayload,
  IEmotionalMapProvider,
} from "../emotional-map/providers/provider.interface";

/**
 * PR-0.1 — the revocation, exercised for real.
 *
 * This is NOT the pure cache-key test (that one lives in cache-identity.spec and
 * proves a property of the key). This one wires the THREE services that actually
 * participate in a revocation over ONE shared, stateful store, and runs the whole
 * thing:
 *
 *     UsersService.updatePrivacy({ localTextAnalysis: false })
 *       → one transaction: bump revision, delete DiaryTextFeature,
 *         delete EmotionalMapSnapshot
 *       → the Redis INCR that follows FAILS
 *     EmotionalMapService.getForUser  → must not serve the p0 payload
 *     EvolucionService.getForUser     → must not serve the old snapshot
 *
 * Two derivatives, two paths, one promise. The privacy revision protects the live
 * map; only deleting the snapshot protects the chart, because Evolución serves
 * snapshots on their own facts identity and the revision never enters that path.
 */

// ── An in-memory store the three services share ─────────────────────────────

interface Store {
  privacySettings: Array<{
    userId: string;
    localTextAnalysis: boolean;
    emotionalMapPrivacyRevision: number;
  }>;
  diaryTextFeature: Array<Record<string, unknown>>;
  emotionalMapSnapshot: Array<Record<string, unknown>>;
}

function makeStatefulPrisma(store: Store) {
  const byUser = <T extends { userId: string }>(rows: T[], userId: string) =>
    rows.filter((r) => r.userId === userId);

  const models = {
    privacySettings: {
      findUnique: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          store.privacySettings.find((p) => p.userId === where.userId) ?? null,
        ),
      ),
      upsert: vi.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { userId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = store.privacySettings.find(
            (p) => p.userId === where.userId,
          );
          if (!existing) {
            const row = {
              userId: where.userId,
              localTextAnalysis: false,
              emotionalMapPrivacyRevision: 0,
              ...create,
            } as Store["privacySettings"][number];
            store.privacySettings.push(row);
            return Promise.resolve(row);
          }
          for (const [k, v] of Object.entries(update)) {
            if (
              v &&
              typeof v === "object" &&
              "increment" in (v as Record<string, unknown>)
            ) {
              // Prisma's `{ increment: n }` — the whole point of this test.
              (existing as Record<string, number>)[k] =
                ((existing as Record<string, number>)[k] ?? 0) +
                ((v as { increment: number }).increment ?? 0);
            } else {
              (existing as Record<string, unknown>)[k] = v;
            }
          }
          return Promise.resolve(existing);
        },
      ),
    },
    diaryTextFeature: {
      findMany: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(byUser(store.diaryTextFeature as never, where.userId)),
      ),
      deleteMany: vi.fn(({ where }: { where: { userId: string } }) => {
        const before = store.diaryTextFeature.length;
        store.diaryTextFeature = store.diaryTextFeature.filter(
          (r) => r.userId !== where.userId,
        );
        return Promise.resolve({
          count: before - store.diaryTextFeature.length,
        });
      }),
    },
    emotionalMapSnapshot: {
      findMany: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          byUser(store.emotionalMapSnapshot as never, where.userId),
        ),
      ),
      deleteMany: vi.fn(({ where }: { where: { userId: string } }) => {
        const before = store.emotionalMapSnapshot.length;
        store.emotionalMapSnapshot = store.emotionalMapSnapshot.filter(
          (r) => r.userId !== where.userId,
        );
        return Promise.resolve({
          count: before - store.emotionalMapSnapshot.length,
        });
      }),
    },
    // Everything the map/Evolución need, empty but present.
    diaryEntry: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    readingSession: { findMany: vi.fn(async () => []) },
    ecoMessage: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    voiceTranscription: { count: vi.fn(async () => 0) },
    highlight: { count: vi.fn(async () => 0) },
    annotation: { count: vi.fn(async () => 0) },
    moodLog: { findMany: vi.fn(async () => []) },
    checkinResponse: { findMany: vi.fn(async () => []) },
    resonance: { findMany: vi.fn(async () => []) },
    userAchievement: { findMany: vi.fn(async () => []), upsert: vi.fn() },
    userProgress: { count: vi.fn(async () => 0) },
    user: {
      findUnique: vi.fn(async () => ({
        id: "user-1",
        currentStreakDays: 0,
        longestStreakDays: 0,
      })),
    },
  };

  return {
    ...models,
    // A transaction that actually runs the callback against the same store, so a
    // partially-applied revocation would be visible to the assertions.
    $transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(models)),
    $queryRaw: vi.fn(async () => []),
  };
}

/** A Redis whose INCR always fails — the invalidation we used to rely on, gone. */
function makeBrokenRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: vi.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve("OK");
    }),
    incr: vi.fn(() => Promise.reject(new Error("redis down"))),
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

describe("Revoking localTextAnalysis — the real flow (PR-0.1)", () => {
  let store: Store;
  let prisma: ReturnType<typeof makeStatefulPrisma>;
  let redis: ReturnType<typeof makeBrokenRedis>;
  let users: UsersService;
  let map: EmotionalMapService;
  let evolucion: EvolucionService;

  beforeEach(() => {
    store = {
      // The user consented, and the map was computed WITH their text features.
      privacySettings: [
        {
          userId: "user-1",
          localTextAnalysis: true,
          emotionalMapPrivacyRevision: 0,
        },
      ],
      diaryTextFeature: [
        {
          userId: "user-1",
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
          createdAt: new Date(),
        },
      ],
      // The cron already persisted a monthly aggregate built from that map.
      emotionalMapSnapshot: [
        {
          userId: "user-1",
          month: new Date("2026-07-01T00:00:00Z"),
          pct: 74,
          coverage: 0.8,
          values: [0.7, 0.8, 0, 0, 0.6, 0.6],
          provider: "test",
          // Stamped with the RUNNING identity, so Evolución really would serve
          // it. A fixture that failed the identity check would make this test
          // pass for the wrong reason.
          ...factsIdentity(),
        },
      ],
    };

    prisma = makeStatefulPrisma(store);
    redis = makeBrokenRedis();

    users = new UsersService(
      prisma as never,
      {} as never, // storage — unused on this path
      {} as never, // jobs — unused on this path
      { get: vi.fn() } as never, // config
      redis as never,
    );
    map = new EmotionalMapService(
      prisma as never,
      makeProvider(),
      redis as never,
    );
    evolucion = new EvolucionService(prisma as never);

    // Silence getMe: it is not what this test is about, and it drags in half the
    // schema. The revocation itself has already committed by the time it runs.
    vi.spyOn(users, "getMe").mockResolvedValue({} as never);
  });

  it("deletes both derivatives and never serves either one again — with Redis broken", async () => {
    // ── 1. Warm the cache with the map built FROM the text features ──────────
    const before = await map.getForUser("user-1");
    expect(before.dimensions).toBeDefined();
    const keyAtRevision0 = [...redis.store.keys()].find((k) =>
      k.startsWith("emotional-map:w"),
    );
    expect(keyAtRevision0).toBeDefined();
    expect(keyAtRevision0).toContain(":p0:"); // privacy revision 0
    // Poison it so a cache HIT after the revocation would be unmistakable.
    redis.store.set(
      keyAtRevision0!,
      JSON.stringify({ builtFromRevokedData: true }),
    );

    // Evolución is serving the snapshot derived from that same map.
    const evoBefore = await evolucion.getForUser("user-1");
    expect(evoBefore.emotionalSeries).toHaveLength(1);

    // ── 2. The user revokes consent. Redis is down. ─────────────────────────
    await users.updatePrivacy("user-1", { localTextAnalysis: false } as never);

    // The transaction did all three things.
    expect(store.privacySettings[0].localTextAnalysis).toBe(false);
    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(1);
    expect(store.diaryTextFeature).toHaveLength(0);
    expect(store.emotionalMapSnapshot).toHaveLength(0);

    // The Redis INCR failed — and the request still succeeded, because the
    // guarantee never depended on it.
    expect(redis.incr).toHaveBeenCalledWith(generationKey("user-1"));
    await expect(redis.incr("x")).rejects.toThrow(/redis down/);

    // ── 3. Neither derivative can be served again ──────────────────────────
    const after = (await map.getForUser("user-1")) as unknown as {
      builtFromRevokedData?: boolean;
    };
    expect(after.builtFromRevokedData).toBeUndefined(); // the poisoned payload is unreachable
    expect(after).toHaveProperty("dimensions");

    const evoAfter = await evolucion.getForUser("user-1");
    expect(evoAfter.emotionalSeries).toHaveLength(0); // the chart no longer shows it

    // The orphaned cache entry is still on disk — unreachable, and it expires on
    // its own TTL. We never scanned or purged.
    expect(redis.store.get(keyAtRevision0!)).toBe(
      JSON.stringify({ builtFromRevokedData: true }),
    );
  });

  it("does not touch the derivatives when the consent is merely re-granted", async () => {
    // Opting IN is not a revocation: nothing is deleted, and the history stands.
    await users.updatePrivacy("user-1", { localTextAnalysis: true } as never);

    expect(store.diaryTextFeature).toHaveLength(1);
    expect(store.emotionalMapSnapshot).toHaveLength(1);
    // The revision still moves, because the map's inputs changed.
    expect(store.privacySettings[0].emotionalMapPrivacyRevision).toBe(1);
  });
});
