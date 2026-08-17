import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ProductionSeedNotAuthorizedError,
  SEED_AUTHORIZATION_VAR,
  assertSeedAllowed,
  isProductionEnvironment,
  isSeedAuthorized,
} from "../../prisma/seed-guard";

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

describe("ratchet · the guard is wired ahead of every write", () => {
  const seed = () =>
    readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");

  it("seed.ts calls the guard", () => {
    expect(seed()).toMatch(/assertSeedAllowed\(\)/);
  });

  it("the guard runs before the first Prisma operation", () => {
    // A refusal must not even open a connection, let alone write.
    const src = seed();
    const guard = src.indexOf("assertSeedAllowed()");
    // An awaited CALL, not the `Parameters<typeof prisma.chapter.upsert>` type
    // reference in the locked-upsert helper above `main()`.
    const firstWrite = src.search(
      /await\s+(prisma|tx)\.[a-zA-Z]+\.(upsert|create|createMany|update|updateMany|delete|deleteMany)\(/,
    );
    expect(guard).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstWrite);
  });

  it("PRISMA_SKIP_SEED stays a no-op that needs no authorization", () => {
    // pg-specs chain the seed through `migrate deploy` and only need the
    // schema; forcing them to carry a production token would be absurd.
    const src = seed();
    expect(src.indexOf('PRISMA_SKIP_SEED === "1"')).toBeLessThan(
      src.indexOf("assertSeedAllowed()"),
    );
  });
});
