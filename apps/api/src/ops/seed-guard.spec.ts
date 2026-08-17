import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  ProductionSeedNotAuthorizedError,
  SEED_AUTHORIZATION_VAR,
  assertSeedAllowed,
  isProductionEnvironment,
  isSeedAuthorized,
} from "../../prisma/seed-guard";
import { runGuardedSeed } from "../../prisma/seed-runtime";

/**
 * C.0A1 — the seed must never run as part of a deployment again.
 *
 * It ran on every production deploy until now, and it is not a read: it wipes
 * and reinserts therapist availability, rewrites `Journey.publishedAt` to the
 * deploy timestamp, and forces `isActive`/`isPublished` back to the values in
 * the file. The pre-deploy command has been changed; this guard is what makes
 * re-adding it fail loudly instead of quietly reverting operational data.
 */

const prodRailway = { RAILWAY_ENVIRONMENT_NAME: "production" };
const prodNode = { NODE_ENV: "production" };

describe("seed guard · refusing production", () => {
  it("refuses a Railway production environment without authorization", () => {
    expect(() => assertSeedAllowed(prodRailway)).toThrow(
      ProductionSeedNotAuthorizedError,
    );
  });

  it("refuses when only NODE_ENV says production", () => {
    // Either signal is enough: a box that reports one and not the other is
    // still production, and guessing wrong here is the expensive direction.
    expect(() => assertSeedAllowed(prodNode)).toThrow(
      ProductionSeedNotAuthorizedError,
    );
  });

  it("allows production with the exact single-invocation authorization", () => {
    expect(() =>
      assertSeedAllowed({ ...prodRailway, [SEED_AUTHORIZATION_VAR]: "1" }),
    ).not.toThrow();
  });

  it("leaves non-production untouched", () => {
    expect(() => assertSeedAllowed({})).not.toThrow();
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "test", RAILWAY_ENVIRONMENT_NAME: "dev" }),
    ).not.toThrow();
  });
});

describe("seed guard · only '1' authorizes", () => {
  // A loose check is how a bypass gets switched on by a value somebody typed
  // for an unrelated reason.
  it.each(["true", "TRUE", "yes", "01", "1 ", " 1", "0", "", "on"])(
    "%s does not authorize",
    (value) => {
      expect(isSeedAuthorized({ [SEED_AUTHORIZATION_VAR]: value })).toBe(false);
      expect(() =>
        assertSeedAllowed({ ...prodRailway, [SEED_AUTHORIZATION_VAR]: value }),
      ).toThrow(ProductionSeedNotAuthorizedError);
    },
  );

  it("detects production from either signal", () => {
    expect(isProductionEnvironment(prodRailway)).toBe(true);
    expect(isProductionEnvironment(prodNode)).toBe(true);
    expect(isProductionEnvironment({ NODE_ENV: "production-like" })).toBe(
      false,
    );
  });
});

describe("seed guard · the refusal leaks nothing", () => {
  it("carries no environment values", () => {
    let caught: unknown;
    try {
      assertSeedAllowed({
        ...prodRailway,
        // Values that must never surface in the message.
        NODE_ENV: "production",
      });
    } catch (err) {
      caught = err;
    }
    const message = String((caught as Error).message);
    // No connection string, no credential, no host — and no variable NAME=VALUE
    // pair echoed back from the environment it just inspected.
    expect(message).not.toMatch(/postgres(ql)?:\/\/|redis:\/\/|@[\w.-]+:\d+/);
    expect(message).not.toMatch(/DATABASE_URL|PASSWORD|SECRET|TOKEN|API_KEY/i);
    expect(message).not.toMatch(/RAILWAY_ENVIRONMENT_NAME\s*=|NODE_ENV\s*=/);
    // The word "production" is the subject of the sentence, not a leaked value.
    // It does say what to do about it.
    expect(message).toContain(SEED_AUTHORIZATION_VAR);
    expect(message).toContain("administrative operation");
  });
});

describe("seed runtime · the guard precedes client construction", () => {
  /** A factory that records whether it was ever asked to build anything. */
  const spyFactory = () => {
    const calls = { built: 0, disposed: 0 };
    const createClient = vi.fn(() => {
      calls.built += 1;
      return {
        dispose: async () => {
          calls.disposed += 1;
        },
      };
    });
    return { calls, createClient };
  };

  it("production without authorization throws BEFORE the factory runs", async () => {
    // The load-bearing claim: not "no query was issued", but "no client, no
    // adapter and no pool were even constructed".
    const f = spyFactory();
    const seed = vi.fn(async () => undefined);

    await expect(
      runGuardedSeed({
        env: prodRailway,
        createClient: f.createClient,
        seed,
        log: () => undefined,
      }),
    ).rejects.toBeInstanceOf(ProductionSeedNotAuthorizedError);

    expect(f.createClient).not.toHaveBeenCalled();
    expect(f.calls.built).toBe(0);
    expect(seed).not.toHaveBeenCalled();
  });

  it.each(["true", "yes", "01", "0", ""])(
    "production authorized with %s still builds nothing",
    async (value) => {
      const f = spyFactory();
      await expect(
        runGuardedSeed({
          env: { ...prodRailway, [SEED_AUTHORIZATION_VAR]: value },
          createClient: f.createClient,
          seed: vi.fn(async () => undefined),
          log: () => undefined,
        }),
      ).rejects.toBeInstanceOf(ProductionSeedNotAuthorizedError);
      expect(f.createClient).not.toHaveBeenCalled();
    },
  );

  it("production with the exact authorization builds, seeds and disposes", async () => {
    const f = spyFactory();
    const order: string[] = [];
    const seed = vi.fn(async () => {
      order.push("seed");
    });

    await runGuardedSeed({
      env: { ...prodRailway, [SEED_AUTHORIZATION_VAR]: "1" },
      createClient: () => {
        order.push("build");
        return f.createClient();
      },
      seed,
      log: () => undefined,
    });

    expect(order).toEqual(["build", "seed"]);
    expect(f.calls.built).toBe(1);
    expect(f.calls.disposed).toBe(1);
  });

  it("PRISMA_SKIP_SEED=1 builds nothing and does not throw", async () => {
    const f = spyFactory();
    const seed = vi.fn(async () => undefined);

    await expect(
      runGuardedSeed({
        env: { PRISMA_SKIP_SEED: "1" },
        createClient: f.createClient,
        seed,
        log: () => undefined,
      }),
    ).resolves.toBeUndefined();

    expect(f.createClient).not.toHaveBeenCalled();
    expect(seed).not.toHaveBeenCalled();
  });

  it("the skip wins even in production, without authorization", async () => {
    // pg-specs run `migrate deploy` against a production-shaped env in CI;
    // they need the schema, not a production token.
    const f = spyFactory();
    await expect(
      runGuardedSeed({
        env: { ...prodRailway, PRISMA_SKIP_SEED: "1" },
        createClient: f.createClient,
        seed: vi.fn(async () => undefined),
        log: () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(f.createClient).not.toHaveBeenCalled();
  });

  it("development still runs the seed", async () => {
    const f = spyFactory();
    const seed = vi.fn(async () => undefined);
    await runGuardedSeed({
      env: { NODE_ENV: "development" },
      createClient: f.createClient,
      seed,
      log: () => undefined,
    });
    expect(f.calls.built).toBe(1);
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("disposes even when the seed itself throws", async () => {
    const f = spyFactory();
    await expect(
      runGuardedSeed({
        env: { NODE_ENV: "test" },
        createClient: f.createClient,
        seed: async () => {
          throw new Error("seed blew up");
        },
        log: () => undefined,
      }),
    ).rejects.toThrow("seed blew up");
    expect(f.calls.disposed).toBe(1);
  });
});

describe("ratchet · seed.ts owns no client at import time", () => {
  const seed = () =>
    readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");

  it("builds Prisma inside a factory, not at module scope", () => {
    const src = seed();
    // Module-level `const prisma = new PrismaClient(...)` would run at import,
    // which is before any refusal could possibly execute.
    expect(src).not.toMatch(/^const (prisma|pool|adapter) = new /m);
    expect(src).toMatch(/function createSeedClient\(\)/);
  });

  it("delegates the ordering to the guarded runner", () => {
    expect(seed()).toMatch(/runGuardedSeed\(\{/);
  });
});
