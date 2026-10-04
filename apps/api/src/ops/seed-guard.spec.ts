import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  DeployedSeedEnvironmentInvalidError,
  ProductionSeedNotAuthorizedError,
  QA_SEED_AUTHORIZATION_VAR,
  QaUserSeedForbiddenInProductionError,
  QaUserSeedNotAuthorizedError,
  SEED_AUTHORIZATION_VAR,
  STAGING_SEED_AUTHORIZATION_VAR,
  StagingSeedNotAuthorizedError,
  assertQaUserSeedAllowed,
  assertSeedAllowed,
  isDeployedEnvironment,
  isProductionEnvironment,
  isQaUserSeedAuthorized,
  isSeedAuthorized,
  isStagingSeedAuthorized,
} from "../../prisma/seed-guard";
import { runGuardedSeed } from "../../prisma/seed-runtime";
// The pure resolver, NOT `seed-test.ts` itself: importing the fixture would
// run `dotenv/config` and mutate this process's env.
import {
  QA_PASSWORD_MAX_LENGTH,
  QA_PASSWORD_MIN_LENGTH,
  QA_PASSWORD_VAR,
  resolveQaSeedConfig,
} from "../../prisma/seed-test-config";

/**
 * C.0A1 — the seed must never run as part of a deployment again.
 *
 * It ran on every production deploy until now, and it is not a read: it wipes
 * and reinserts therapist availability, rewrites `Journey.publishedAt` to the
 * deploy timestamp, and forces `isActive`/`isPublished` back to the values in
 * the file. The pre-deploy command has been changed; this guard is what makes
 * re-adding it fail loudly instead of quietly reverting operational data.
 */

/**
 * A Railway production box AS IT ACTUALLY IS: the vendor marker and our own
 * posture marker both present.
 *
 * It used to be the vendor marker alone, which quietly made it a different box
 * than the real one — a deployed host that never declared a posture. The guard
 * inferred "production" from the vendor signal and the production variable then
 * authorized it, so the fixture passed while modelling the exact gap that
 * `undeclaredRailway` below now pins shut. Verified against the live service's
 * variables: `PSICO_ENV` is set there.
 */
const prodRailway = {
  RAILWAY_ENVIRONMENT_NAME: "production",
  PSICO_ENV: "production",
};
const prodNode = { NODE_ENV: "production" };
/** Deployed, and silent about what it is. The case with no way in. */
const undeclaredRailway = { RAILWAY_ENVIRONMENT_NAME: "production" };

describe("seed guard · refusing production", () => {
  it("refuses a Railway production environment without authorization", () => {
    expect(() => assertSeedAllowed(prodRailway)).toThrow(
      ProductionSeedNotAuthorizedError,
    );
  });

  it("refuses when only NODE_ENV says production", () => {
    // NODE_ENV is not a deployment marker, so this is a LOCAL box calling
    // itself production — which still refuses, and still on the production
    // branch. Guessing wrong here is the expensive direction.
    expect(() => assertSeedAllowed(prodNode)).toThrow(
      ProductionSeedNotAuthorizedError,
    );
  });

  it("allows production with the exact single-invocation authorization", () => {
    expect(() =>
      assertSeedAllowed({ ...prodRailway, [SEED_AUTHORIZATION_VAR]: "1" }),
    ).not.toThrow();
  });

  it("leaves local and test boxes untouched", () => {
    expect(() => assertSeedAllowed({})).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: "test" })).not.toThrow();
    expect(() => assertSeedAllowed({ PSICO_ENV: "development" })).not.toThrow();
  });
});

describe("seed guard · a deployed box that will not say what it is", () => {
  /**
   * The hole this closes. Before posture classification, an undeclared deployed
   * box was read as production by the OR over every signal — which meant the
   * PRODUCTION variable authorized seeding a box nobody had identified. Worse in
   * the other direction: once staging got its own variable, that variable plus a
   * vendor marker would have been a second way in.
   *
   * So "deployed and undeclared" is now its own answer, and nothing lifts it.
   * The remedy is to declare the resource, not to type a stronger command.
   */
  it("refuses, and names the posture problem rather than a missing token", () => {
    expect(() => assertSeedAllowed(undeclaredRailway)).toThrow(
      DeployedSeedEnvironmentInvalidError,
    );
  });

  it.each([
    ["the production variable", SEED_AUTHORIZATION_VAR],
    ["the staging variable", STAGING_SEED_AUTHORIZATION_VAR],
  ])("%s does not lift it", (_label, variable) => {
    expect(() =>
      assertSeedAllowed({ ...undeclaredRailway, [variable]: "1" }),
    ).toThrow(DeployedSeedEnvironmentInvalidError);
  });

  it("both variables together do not lift it either", () => {
    expect(() =>
      assertSeedAllowed({
        ...undeclaredRailway,
        [SEED_AUTHORIZATION_VAR]: "1",
        [STAGING_SEED_AUTHORIZATION_VAR]: "1",
      }),
    ).toThrow(DeployedSeedEnvironmentInvalidError);
  });

  it("a deployed box calling itself development is a conflict, not a dev box", () => {
    // Renaming a deployed box does not let it opt out of the barriers. This is
    // the shape a copy-pasted local variable set produces on a real host.
    expect(() =>
      assertSeedAllowed({
        COOLIFY_RESOURCE_UUID: "res-abc",
        PSICO_ENV: "development",
      }),
    ).toThrow(DeployedSeedEnvironmentInvalidError);
  });

  it.each([
    ["Railway", { RAILWAY_PROJECT_ID: "proj-1" }],
    ["Railway (service)", { RAILWAY_SERVICE_ID: "svc-1" }],
    ["Coolify", { COOLIFY_CONTAINER_NAME: "api-xyz" }],
    ["our own neutral marker", { PSICO_DEPLOYED: "1" }],
  ])("%s alone is enough to be deployed, so undeclared refuses", (_l, env) => {
    expect(() => assertSeedAllowed(env)).toThrow(
      DeployedSeedEnvironmentInvalidError,
    );
  });

  it("a configured Coolify CLIENT is not a deployed box", () => {
    // COOLIFY_URL / COOLIFY_TOKEN are how a client is configured to TALK to a
    // Coolify, so the maintainer's own laptop carries them. Reading those as
    // "deployed" would refuse exactly where seeding is routine.
    expect(() =>
      assertSeedAllowed({
        COOLIFY_URL: "https://coolify.example",
        COOLIFY_TOKEN: "redacted",
      } as never),
    ).not.toThrow();
  });
});

describe("seed guard · staging has its own variable", () => {
  /**
   * The false positive this replaces: our Coolify staging box is built with
   * `NODE_ENV=production`, so the old OR-over-every-signal check called it
   * production and refused. The only ways out were to widen the production
   * check — handing production a quieter guard as a side effect — or a
   * workaround. It gets its own variable instead.
   */
  const coolifyStaging = {
    COOLIFY_RESOURCE_UUID: "res-abc",
    PSICO_ENV: "staging",
    NODE_ENV: "production",
  };

  it("refuses staging without its own authorization", () => {
    expect(() => assertSeedAllowed(coolifyStaging)).toThrow(
      StagingSeedNotAuthorizedError,
    );
  });

  it("allows staging with the exact single-invocation authorization", () => {
    expect(() =>
      assertSeedAllowed({
        ...coolifyStaging,
        [STAGING_SEED_AUTHORIZATION_VAR]: "1",
      }),
    ).not.toThrow();
  });

  it("PSICO_ENV beats NODE_ENV, so staging is not treated as production", () => {
    // If NODE_ENV won, this would be the production refusal and the staging
    // variable would be useless on the one box it was written for.
    let caught: unknown;
    try {
      assertSeedAllowed(coolifyStaging);
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeInstanceOf(ProductionSeedNotAuthorizedError);
    expect((caught as { code: string }).code).toBe(
      "STAGING_SEED_NOT_AUTHORIZED",
    );
  });

  it("neither variable substitutes for the other, in either direction", () => {
    // The whole reason there are two. A command typed for a staging refresh
    // must not be the command that authorizes a production one.
    expect(() =>
      assertSeedAllowed({ ...coolifyStaging, [SEED_AUTHORIZATION_VAR]: "1" }),
    ).toThrow(StagingSeedNotAuthorizedError);

    expect(() =>
      assertSeedAllowed({
        ...prodRailway,
        [STAGING_SEED_AUTHORIZATION_VAR]: "1",
      }),
    ).toThrow(ProductionSeedNotAuthorizedError);
  });

  it.each(["true", "TRUE", "on", "yes", "01", " 1", "1 ", "0", ""])(
    "%s does not authorize staging either",
    (value) => {
      expect(
        isStagingSeedAuthorized({
          [STAGING_SEED_AUTHORIZATION_VAR]: value,
        }),
      ).toBe(false);
      expect(() =>
        assertSeedAllowed({
          ...coolifyStaging,
          [STAGING_SEED_AUTHORIZATION_VAR]: value,
        }),
      ).toThrow(StagingSeedNotAuthorizedError);
    },
  );

  it("the staging refusal leaks nothing either", () => {
    let caught: unknown;
    try {
      assertSeedAllowed(coolifyStaging);
    } catch (err) {
      caught = err;
    }
    const message = String((caught as Error).message);
    expect(message).not.toMatch(/postgres(ql)?:\/\/|redis:\/\/|@[\w.-]+:\d+/);
    expect(message).not.toMatch(/DATABASE_URL|PASSWORD|SECRET|TOKEN|API_KEY/i);
    expect(message).not.toMatch(/PSICO_ENV\s*=|NODE_ENV\s*=|COOLIFY/i);
    expect(message).toContain(STAGING_SEED_AUTHORIZATION_VAR);
  });

  it("the undeclared refusal leaks nothing and says what to declare", () => {
    let caught: unknown;
    try {
      assertSeedAllowed(undeclaredRailway);
    } catch (err) {
      caught = err;
    }
    const message = String((caught as Error).message);
    expect(message).not.toMatch(/postgres(ql)?:\/\/|redis:\/\/|@[\w.-]+:\d+/);
    expect(message).not.toMatch(/DATABASE_URL|PASSWORD|SECRET|TOKEN|API_KEY/i);
    expect(message).not.toMatch(/RAILWAY_ENVIRONMENT_NAME\s*=/);
    expect(message).toContain("PSICO_ENV");
    // And it must NOT read as "set a variable and it will work".
    expect(message).not.toContain(SEED_AUTHORIZATION_VAR);
    expect(message).not.toContain(STAGING_SEED_AUTHORIZATION_VAR);
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

/**
 * The QA user fixture (`prisma/seed-test.ts`) had a different, worse problem
 * than the catalog seed: three plain-text passwords tracked in a PUBLIC
 * repository, one of them for an ADMIN account that opens the Pulso
 * back-office — and no environment guard of any kind, so nothing stopped
 * `DATABASE_URL` pointing at production. It also printed the passwords to
 * stdout, putting them in CI logs.
 */
describe("qa seed guard · refusing any deployed host", () => {
  const stagingCoolify = { PSICO_ENV: "staging", NODE_ENV: "production" };

  it("refuses production, with the stricter production error", () => {
    // Production does not take part in the token-gated path at all; the
    // unconditional guarantee is pinned in "production is a hard deny" below.
    expect(() => assertQaUserSeedAllowed({ PSICO_ENV: "production" })).toThrow(
      QaUserSeedForbiddenInProductionError,
    );
  });

  it("refuses STAGING too — the distinction production/staging is not the point", () => {
    // api-staging.feelverse.app answers to the internet, so an ADMIN login
    // there is a live credential. This is the case the catalog seed's
    // production-only guard would have waved through.
    expect(() => assertQaUserSeedAllowed(stagingCoolify)).toThrow(
      QaUserSeedNotAuthorizedError,
    );
  });

  it("allows a deployed host with the exact single-invocation authorization", () => {
    expect(() =>
      assertQaUserSeedAllowed({
        ...stagingCoolify,
        [QA_SEED_AUTHORIZATION_VAR]: "1",
      }),
    ).not.toThrow();
  });

  it("leaves a local box alone", () => {
    expect(() => assertQaUserSeedAllowed({})).not.toThrow();
    expect(() =>
      assertQaUserSeedAllowed({ NODE_ENV: "development" }),
    ).not.toThrow();
    expect(() => assertQaUserSeedAllowed({ NODE_ENV: "test" })).not.toThrow();
  });

  it.each(["true", "TRUE", "yes", "01", "1 ", " 1", "0", "", "on"])(
    "%s does not authorize",
    (value) => {
      expect(
        isQaUserSeedAuthorized({ [QA_SEED_AUTHORIZATION_VAR]: value }),
      ).toBe(false);
      expect(() =>
        assertQaUserSeedAllowed({
          ...stagingCoolify,
          [QA_SEED_AUTHORIZATION_VAR]: value,
        }),
      ).toThrow(QaUserSeedNotAuthorizedError);
    },
  );

  it("the two authorizations are NOT interchangeable", () => {
    // The load-bearing separation: authorizing a catalog refresh must never
    // also authorize minting an ADMIN login, and vice versa.
    // Checked on STAGING on purpose: production refuses on its own axis, which
    // would pass this assertion for the wrong reason and hide a swap of tokens.
    expect(() =>
      assertQaUserSeedAllowed({
        ...stagingCoolify,
        [SEED_AUTHORIZATION_VAR]: "1",
      }),
    ).toThrow(QaUserSeedNotAuthorizedError);

    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        [QA_SEED_AUTHORIZATION_VAR]: "1",
      }),
    ).toThrow(ProductionSeedNotAuthorizedError);
  });

  it("the refusal explains the credential hazard and leaks no values", () => {
    let caught: unknown;
    try {
      // Staging, because this asserts the TOKEN-GATED refusal's message. The
      // production refusal has its own wording and its own test.
      assertQaUserSeedAllowed({
        PSICO_ENV: "staging",
        NODE_ENV: "production",
        COOLIFY_RESOURCE_UUID: "abc123",
      });
    } catch (err) {
      caught = err;
    }
    const message = String((caught as Error).message);
    expect(message).not.toMatch(/postgres(ql)?:\/\/|redis:\/\/|@[\w.-]+:\d+/);
    expect(message).not.toMatch(/DATABASE_URL|PASSWORD|SECRET|TOKEN|API_KEY/i);
    expect(message).not.toMatch(/PSICO_ENV\s*=|NODE_ENV\s*=|abc123/);
    expect(message).toContain(QA_SEED_AUTHORIZATION_VAR);
    expect(message).toMatch(/ADMIN/);
  });
});

describe("qa seed guard · what counts as deployed", () => {
  it("PSICO_ENV is believed for both deployed postures", () => {
    expect(isDeployedEnvironment({ PSICO_ENV: "production" })).toBe(true);
    expect(isDeployedEnvironment({ PSICO_ENV: "staging" })).toBe(true);
  });

  it.each([
    ["PSICO_DEPLOYED", { PSICO_DEPLOYED: "1" }],
    ["RAILWAY_ENVIRONMENT", { RAILWAY_ENVIRONMENT: "production" }],
    ["RAILWAY_PROJECT_ID", { RAILWAY_PROJECT_ID: "p-1" }],
    ["RAILWAY_SERVICE_ID", { RAILWAY_SERVICE_ID: "s-1" }],
    ["RAILWAY_ENVIRONMENT_NAME", { RAILWAY_ENVIRONMENT_NAME: "staging" }],
    ["COOLIFY_RESOURCE_UUID", { COOLIFY_RESOURCE_UUID: "u-1" }],
    ["COOLIFY_CONTAINER_NAME", { COOLIFY_CONTAINER_NAME: "c-1" }],
    ["NODE_ENV=production", { NODE_ENV: "production" }],
  ])("%s marks the box as deployed", (_name, env) => {
    expect(isDeployedEnvironment(env)).toBe(true);
  });

  it("a Coolify CLIENT is not a deployed box", () => {
    // COOLIFY_URL / COOLIFY_TOKEN are how a client is configured to TALK to a
    // Coolify, so any laptop with the CLI or the MCP configured carries them.
    // Reading them as "I am deployed" would make the fixture refuse on the
    // maintainer's own machine — where it is legitimately used. Same exclusion
    // that `deploymentPlatform()` in cache-identity.ts learned the hard way.
    expect(
      isDeployedEnvironment({
        COOLIFY_URL: "https://coolify.example",
        COOLIFY_TOKEN: "t",
      } as Parameters<typeof isDeployedEnvironment>[0]),
    ).toBe(false);
  });

  it("a clean local environment is not deployed", () => {
    expect(isDeployedEnvironment({})).toBe(false);
    expect(isDeployedEnvironment({ NODE_ENV: "development" })).toBe(false);
    expect(isDeployedEnvironment({ PSICO_ENV: "development" })).toBe(false);
  });

  it("production detection now also believes PSICO_ENV", () => {
    // Additive: the platform-neutral marker is the only word that counts on a
    // deployed box, and a Coolify production service that sets PSICO_ENV but
    // not NODE_ENV was previously invisible to this guard.
    expect(isProductionEnvironment({ PSICO_ENV: "production" })).toBe(true);
    expect(isProductionEnvironment({ PSICO_ENV: "staging" })).toBe(false);
  });

  it("a stray space or capital does not open the guard", () => {
    expect(isProductionEnvironment({ NODE_ENV: " production" })).toBe(true);
    expect(isProductionEnvironment({ NODE_ENV: "PRODUCTION" })).toBe(true);
    expect(isProductionEnvironment({ PSICO_ENV: "Production " })).toBe(true);
    // Still not a false positive on something merely production-shaped.
    expect(isProductionEnvironment({ NODE_ENV: "production-like" })).toBe(
      false,
    );
  });
});

describe("qa seed config · the password has no default", () => {
  const argv = (...rest: string[]) => ["node", "seed-test", ...rest];

  it("aborts when neither --password nor the env var is set", () => {
    expect(() => resolveQaSeedConfig({ argv: argv(), env: {} })).toThrow(
      /password is required/i,
    );
  });

  it("accepts a password from --password=…", () => {
    const cfg = resolveQaSeedConfig({
      argv: argv("--password=Sup3r!Secret"),
      env: {},
    });
    expect(cfg).toEqual({ wipe: false, password: "Sup3r!Secret" });
  });

  it(`accepts a password from ${QA_PASSWORD_VAR}`, () => {
    const cfg = resolveQaSeedConfig({
      argv: argv(),
      env: { [QA_PASSWORD_VAR]: "Sup3r!Secret" },
    });
    expect(cfg).toEqual({ wipe: false, password: "Sup3r!Secret" });
  });

  it("a bare --password fails closed instead of seeding the string 'true'", () => {
    expect(() =>
      resolveQaSeedConfig({ argv: argv("--password"), env: {} }),
    ).toThrow(/password is required/i);
  });

  it("--password wins over the env var", () => {
    const cfg = resolveQaSeedConfig({
      argv: argv("--password=FromFlag!1"),
      env: { [QA_PASSWORD_VAR]: "FromEnv!1" },
    });
    expect(cfg).toEqual({ wipe: false, password: "FromFlag!1" });
  });

  it("enforces the app's own length window", () => {
    const short = "x".repeat(QA_PASSWORD_MIN_LENGTH - 1);
    const long = "x".repeat(QA_PASSWORD_MAX_LENGTH + 1);
    expect(() =>
      resolveQaSeedConfig({ argv: argv(), env: { [QA_PASSWORD_VAR]: short } }),
    ).toThrow(/too short/i);
    // Past 72 bytes bcrypt truncates silently, so a longer value would seed a
    // password no form in the app could reproduce.
    expect(() =>
      resolveQaSeedConfig({ argv: argv(), env: { [QA_PASSWORD_VAR]: long } }),
    ).toThrow(/too long/i);

    const atBounds = [
      "x".repeat(QA_PASSWORD_MIN_LENGTH),
      "x".repeat(QA_PASSWORD_MAX_LENGTH),
    ];
    for (const value of atBounds) {
      expect(() =>
        resolveQaSeedConfig({
          argv: argv(),
          env: { [QA_PASSWORD_VAR]: value },
        }),
      ).not.toThrow();
    }
  });

  it("never echoes the rejected value", () => {
    const secret = "tiny";
    let caught: unknown;
    try {
      resolveQaSeedConfig({ argv: argv(), env: { [QA_PASSWORD_VAR]: secret } });
    } catch (err) {
      caught = err;
    }
    expect(String((caught as Error).message)).not.toContain(secret);
  });

  it("a wipe needs no password — the remediation path stays the easy one", () => {
    // If an ADMIN fixture account turns up on a deployed box, deleting it must
    // not be harder than creating it was.
    expect(resolveQaSeedConfig({ argv: argv("--wipe"), env: {} })).toEqual({
      wipe: true,
    });
  });
});

describe("ratchet · the QA fixture carries no credential", () => {
  const src = () =>
    readFileSync(join(process.cwd(), "prisma/seed-test.ts"), "utf8");

  /**
   * Comments stripped, so these assertions read CODE and not prose. The
   * docstring legitimately contains `QA_USER_PASSWORD='…'` in its usage
   * examples, and a ratchet that forced the documentation to stop showing
   * people how to run the thing would be the tail wagging the dog.
   */
  const code = () =>
    src()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  /**
   * The three passwords this file used to carry are deliberately NOT listed
   * here. They are already public and permanent in git history, so an
   * assertion naming them would add nothing except a fresh copy of three
   * published credentials in the PR diff of a public repository — the exact
   * mistake being corrected, committed by the test that forbids it.
   *
   * The two checks below are stronger than a denylist anyway: whatever route a
   * password takes, it has to be written down somewhere and it has to reach
   * `bcrypt.hash`. Both routes are closed to literals, so a specific value
   * cannot come back under a different name either.
   */
  it("no password-shaped identifier is assigned a literal", () => {
    expect(code()).not.toMatch(/(password|passwd|pwd)\s*[:=]\s*["'`]/i);
  });

  it("the hashed value never originates as a literal", () => {
    expect(code()).not.toMatch(/bcrypt\.hash\(\s*["'`]/);
  });

  it("no log line interpolates a password", () => {
    // The original printed each one to stdout, so the values also landed in
    // CI logs and terminal scrollback that outlive the run.
    expect(code()).not.toMatch(/\$\{[^}]*password/i);
  });

  it("asks the deployed-host guard, not the production-only one", () => {
    expect(code()).toMatch(/assertQaUserSeedAllowed/);
  });

  it("builds Prisma inside a factory, not at module scope", () => {
    // Exactly the defect it shipped with: a module-scope Pool and
    // PrismaClient, constructed at import — which is before any refusal could
    // possibly execute.
    expect(code()).not.toMatch(/^const (prisma|pool|adapter) = new /m);
    expect(code()).toMatch(/function createSeedClient\(\)/);
  });

  it("delegates the ordering to the guarded runner", () => {
    expect(code()).toMatch(/runGuardedSeed\(\{/);
  });

  /**
   * `--wipe` must not be a side door.
   *
   * It needs no password, which is correct — making the remediation path harder
   * than the hazardous one would mean a compromised QA account stays alive out of
   * inconvenience. But "no password" must not slide into "no guard": a wipe
   * DELETEs rows from whatever database `DATABASE_URL` happens to name.
   *
   * The ordering is what guarantees it: the environment is asked before argv is
   * even parsed, so there is no branch in which `--wipe` is known about and the
   * guard is not.
   */
  it("asks the guard BEFORE it parses --wipe", () => {
    const src = code();
    const guardAt = src.indexOf("assertQaUserSeedAllowed(process.env)");
    const configAt = src.indexOf("resolveQaSeedConfig(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(configAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(configAt);
  });

  it("performs the wipe inside the guarded runner's callback", () => {
    // If `wipeTestUsers()` were called from `main` directly it would run after
    // the first guard but outside the runner's — losing the second, structural
    // check that no client exists on a refusal.
    const runner = code().slice(code().indexOf("runGuardedSeed({"));
    expect(runner).toMatch(/wipeTestUsers\(\)/);
  });

  // Deliberately NOT ratcheted: "no longer claims to be SAFE in any
  // environment". The docstring quotes that old claim in order to explain why
  // it was false, so a grep for the phrase matches the very paragraph that
  // debunks it — and the test would only pass if the history were paraphrased
  // to suit the grep. The claims worth pinning are material, not prose, and
  // the cases above pin those.
});

describe("seed runtime · a custom refusal keeps the ordering", () => {
  it("the QA guard also precedes client construction", async () => {
    const createClient = vi.fn(() => ({ dispose: async () => undefined }));
    const seed = vi.fn(async () => undefined);

    await expect(
      runGuardedSeed({
        env: { PSICO_ENV: "staging" },
        assert: assertQaUserSeedAllowed,
        createClient,
        seed,
        log: () => undefined,
      }),
    ).rejects.toBeInstanceOf(QaUserSeedNotAuthorizedError);

    expect(createClient).not.toHaveBeenCalled();
    expect(seed).not.toHaveBeenCalled();
  });

  it("the default refusal is still the catalog seed's", async () => {
    // Omitting `assert` must not silently downgrade seed.ts's guard.
    const createClient = vi.fn(() => ({ dispose: async () => undefined }));
    await expect(
      runGuardedSeed({
        env: { NODE_ENV: "production" },
        createClient,
        seed: vi.fn(async () => undefined),
        log: () => undefined,
      }),
    ).rejects.toBeInstanceOf(ProductionSeedNotAuthorizedError);
    expect(createClient).not.toHaveBeenCalled();
  });
});

/**
 * Production is not "a deployed host that needs a token" — it is off limits.
 *
 * `ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX` exists so staging can run the fixture on
 * purpose. Letting that same token also work in production would mean the
 * difference between "staging, deliberately" and "production, by a typo in which
 * terminal was focused" is one environment variable the operator has already got
 * into the habit of typing — which is exactly the habit the staging gate creates.
 *
 * So production refuses unconditionally, with its own error: telling an operator
 * to set a token that cannot work would send them looking for a configuration
 * problem instead of reading the sentence.
 */
describe("qa seed guard · production is a hard deny", () => {
  const prodShapes: ReadonlyArray<[string, Record<string, string>]> = [
    ["PSICO_ENV", { PSICO_ENV: "production" }],
    ["NODE_ENV", { NODE_ENV: "production" }],
    ["RAILWAY_ENVIRONMENT_NAME", { RAILWAY_ENVIRONMENT_NAME: "production" }],
    ["PSICO_ENV with whitespace/case", { PSICO_ENV: " Production " }],
  ];

  it.each(prodShapes)(
    "refuses production detected via %s even WITH the QA authorization",
    (_label, env) => {
      expect(() =>
        assertQaUserSeedAllowed({ ...env, [QA_SEED_AUTHORIZATION_VAR]: "1" }),
      ).toThrow(QaUserSeedForbiddenInProductionError);
    },
  );

  it("refuses production even with BOTH tokens set", () => {
    expect(() =>
      assertQaUserSeedAllowed({
        PSICO_ENV: "production",
        [QA_SEED_AUTHORIZATION_VAR]: "1",
        [SEED_AUTHORIZATION_VAR]: "1",
      }),
    ).toThrow(QaUserSeedForbiddenInProductionError);
  });

  it("the production refusal does NOT advertise a token that cannot work", () => {
    let caught: unknown;
    try {
      assertQaUserSeedAllowed({ PSICO_ENV: "production" });
    } catch (err) {
      caught = err;
    }
    const message = (caught as Error).message;
    // Naming the variable here would read as "set this and it will work".
    expect(message).not.toContain(QA_SEED_AUTHORIZATION_VAR);
    expect(message).toMatch(/production/i);
    // And it still leaks nothing about the environment.
    expect(message).not.toMatch(/PSICO_ENV\s*=|NODE_ENV\s*=/);
  });

  it("staging keeps its token-gated path — the deny is production-only", () => {
    const staging = { PSICO_ENV: "staging", NODE_ENV: "production" };
    expect(() => assertQaUserSeedAllowed(staging)).toThrow(
      QaUserSeedNotAuthorizedError,
    );
    expect(() =>
      assertQaUserSeedAllowed({
        ...staging,
        [QA_SEED_AUTHORIZATION_VAR]: "1",
      }),
    ).not.toThrow();
  });

  it("refuses production BEFORE any client is constructed", async () => {
    const createClient = vi.fn(() => ({
      dispose: vi.fn(async () => undefined),
    }));
    await expect(
      runGuardedSeed({
        env: { PSICO_ENV: "production", [QA_SEED_AUTHORIZATION_VAR]: "1" },
        assert: assertQaUserSeedAllowed,
        createClient,
        seed: vi.fn(async () => undefined),
        log: () => undefined,
      }),
    ).rejects.toBeInstanceOf(QaUserSeedForbiddenInProductionError);
    expect(createClient).not.toHaveBeenCalled();
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
