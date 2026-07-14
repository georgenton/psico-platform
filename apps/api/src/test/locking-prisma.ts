import { vi } from "vitest";

/**
 * A Prisma double that MODELS THE ROW LOCK.
 *
 * The point of a race test is the interleaving, and an interleaving you cannot
 * reproduce is a story, not a test. A mock whose `$transaction` just calls the
 * callback would let both orderings "pass" while proving nothing: the writer and
 * the revocation would never actually contend, so a version of the code with NO
 * barrier at all would pass too.
 *
 * So this double implements the two things Postgres actually gives us:
 *
 *   1. `$queryRaw` recognises `FOR UPDATE` / `FOR SHARE` on the `User` row and
 *      takes the corresponding lock, with Postgres's conflict rules: shares are
 *      compatible with each other and conflict with the exclusive lock.
 *   2. Locks are held until the transaction ENDS, not until the statement ends.
 *
 * That is enough to make a missing `lockUserShared` show up as a failing test,
 * which is the only property that matters here. What it does NOT model is real
 * MVCC snapshot isolation — a transaction here reads the store as it is right
 * now. That is why there is also a directed test against a real PostgreSQL
 * (`privacy-barrier.pg-spec.ts`): the lock SEMANTICS are verified against the
 * database, and the CODE PATHS are verified here.
 */

export interface LockingStore {
  privacySettings: Array<{
    userId: string;
    localTextAnalysis: boolean;
    emotionalMapPrivacyRevision: number;
  }>;
  diaryTextFeature: Array<Record<string, unknown>>;
  emotionalMapSnapshot: Array<Record<string, unknown>>;
}

export function emptyStore(): LockingStore {
  return {
    privacySettings: [],
    diaryTextFeature: [],
    emotionalMapSnapshot: [],
  };
}

/** One user row's lock. Postgres's rules, in twenty lines. */
class RowLock {
  private shared = 0;
  private exclusive = false;
  private readonly waiters: Array<() => void> = [];

  async acquireShared(): Promise<void> {
    while (this.exclusive) await this.park();
    this.shared++;
  }

  async acquireExclusive(): Promise<void> {
    // Waits for every share to be released — this is the revocation waiting for
    // an in-flight writer to commit.
    while (this.exclusive || this.shared > 0) await this.park();
    this.exclusive = true;
  }

  release(mode: "shared" | "exclusive"): void {
    if (mode === "shared") this.shared = Math.max(0, this.shared - 1);
    else this.exclusive = false;
    // Wake everyone; each re-checks its own condition.
    const woken = this.waiters.splice(0);
    for (const w of woken) w();
  }

  private park(): Promise<void> {
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }
}

export function makeLockingPrisma(store: LockingStore) {
  const locks = new Map<string, RowLock>();
  const lockFor = (userId: string) => {
    let l = locks.get(userId);
    if (!l) locks.set(userId, (l = new RowLock()));
    return l;
  };

  /** Models `{ increment: n }` and plain assignment, like Prisma's update data. */
  const applyUpdate = (
    row: Record<string, unknown>,
    data: Record<string, unknown>,
  ) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && "increment" in (v as object)) {
        row[k] =
          ((row[k] as number) ?? 0) + (v as { increment: number }).increment;
      } else {
        row[k] = v;
      }
    }
  };

  const models = () => ({
    privacySettings: {
      findUnique: vi.fn(
        async ({ where }: { where: { userId: string } }) =>
          store.privacySettings.find((p) => p.userId === where.userId) ?? null,
      ),
      upsert: vi.fn(
        async ({
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
            } as LockingStore["privacySettings"][number];
            store.privacySettings.push(row);
            return row;
          }
          applyUpdate(existing as unknown as Record<string, unknown>, update);
          return existing;
        },
      ),
    },
    diaryTextFeature: {
      findUnique: vi.fn(
        async ({ where }: { where: { entryId: string } }) =>
          store.diaryTextFeature.find((r) => r.entryId === where.entryId) ??
          null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `dtf-${store.diaryTextFeature.length + 1}`, ...data };
        store.diaryTextFeature.push(row);
        return row;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { entryId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = store.diaryTextFeature.find(
            (r) => r.entryId === where.entryId,
          );
          if (existing) return existing;
          const row = {
            id: `dtf-${store.diaryTextFeature.length + 1}`,
            ...create,
          };
          store.diaryTextFeature.push(row);
          return row;
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const before = store.diaryTextFeature.length;
        store.diaryTextFeature = store.diaryTextFeature.filter(
          (r) => r.userId !== where.userId,
        );
        return { count: before - store.diaryTextFeature.length };
      }),
    },
    emotionalMapSnapshot: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        store.emotionalMapSnapshot.filter((r) => r.userId === where.userId),
      ),
      upsert: vi.fn(
        async ({
          create,
        }: {
          where: unknown;
          create: Record<string, unknown>;
          update: unknown;
        }) => {
          const row = {
            id: `snap-${store.emotionalMapSnapshot.length + 1}`,
            ...create,
          };
          store.emotionalMapSnapshot.push(row);
          return row;
        },
      ),
      deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const before = store.emotionalMapSnapshot.length;
        store.emotionalMapSnapshot = store.emotionalMapSnapshot.filter(
          (r) => r.userId !== where.userId,
        );
        return { count: before - store.emotionalMapSnapshot.length };
      }),
    },
    user: {
      findMany: vi.fn(async () => [{ id: "user-1" }]),
      findUnique: vi.fn(async () => ({ id: "user-1", currentStreakDays: 0 })),
    },
  });

  const root = models();

  /**
   * A transaction: the callback gets its own handle, whose `$queryRaw` takes row
   * locks that are RELEASED WHEN THE CALLBACK ENDS — success or failure. That is
   * the whole reason a paused writer can block a revocation in these tests.
   */
  const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const held: Array<{ userId: string; mode: "shared" | "exclusive" }> = [];
    const tx = {
      ...models(),
      $queryRaw: vi.fn(
        async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.join(" ");
          const userId = String(values[0]);
          if (/FOR UPDATE/i.test(sql)) {
            await lockFor(userId).acquireExclusive();
            held.push({ userId, mode: "exclusive" });
          } else if (/FOR SHARE/i.test(sql)) {
            await lockFor(userId).acquireShared();
            held.push({ userId, mode: "shared" });
          }
          return [{ id: userId }];
        },
      ),
    };
    try {
      return await cb(tx);
    } finally {
      for (const h of held) lockFor(h.userId).release(h.mode);
    }
  });

  return {
    ...root,
    $transaction,
    $queryRaw: vi.fn(async () => []),
  };
}
