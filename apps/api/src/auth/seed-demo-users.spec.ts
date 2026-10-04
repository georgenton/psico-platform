import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// The demo-seed guard lives in a runnable ops script; we import the extracted,
// side-effect-free config resolver (it runs before any DB connection).
import { resolveSeedConfig } from "../../scripts/seed-demo-users.mjs";

const SCRIPT_SRC = readFileSync(
  fileURLToPath(new URL("../../scripts/seed-demo-users.mjs", import.meta.url)),
  "utf8",
);

describe("seed-demo-users · resolveSeedConfig (P0 credential guard)", () => {
  it("has NO default password — aborts when neither --password nor DEMO_USER_PASSWORD is set", () => {
    expect(() =>
      resolveSeedConfig({ argv: ["node", "seed"], env: {} }),
    ).toThrow(/password is required/i);
  });

  it("accepts a password from --password=…", () => {
    const cfg = resolveSeedConfig({
      argv: ["node", "seed", "--password=Sup3r!Secret"],
      env: {},
    });
    expect(cfg.password).toBe("Sup3r!Secret");
  });

  it("accepts a password from DEMO_USER_PASSWORD", () => {
    const cfg = resolveSeedConfig({
      argv: ["node", "seed"],
      env: { DEMO_USER_PASSWORD: "FromEnv!123" },
    });
    expect(cfg.password).toBe("FromEnv!123");
  });

  it("a bare --password (no value) is NOT a password — still aborts", () => {
    expect(() =>
      resolveSeedConfig({ argv: ["node", "seed", "--password"], env: {} }),
    ).toThrow(/password is required/i);
  });

  it("does NOT rotate existing passwords by default (rotatePasswords=false unless --rotate-passwords)", () => {
    const off = resolveSeedConfig({
      argv: ["node", "seed", "--password=x"],
      env: {},
    });
    expect(off.rotatePasswords).toBe(false);

    const on = resolveSeedConfig({
      argv: ["node", "seed", "--password=x", "--rotate-passwords"],
      env: {},
    });
    expect(on.rotatePasswords).toBe(true);
  });
});

/**
 * The environment guard, rewritten in this cycle.
 *
 * What it used to be, in full:
 *
 *     env.PSICO_ENV === "production" && env.ALLOW_DEMO_USERS_IN_PRODUCTION !== "on"
 *
 * Three defects in one line, and the tests below pin each of them shut:
 *
 *   1. It failed OPEN. A deployed box with no `PSICO_ENV` — a Railway or
 *      Coolify service that never declared its posture — matched nothing, so
 *      the script went ahead and minted working logins on it.
 *   2. The comparison was not normalized, so `PSICO_ENV="Production"` or a
 *      value with a stray space walked past it.
 *   3. `ALLOW_DEMO_USERS_IN_PRODUCTION=on` was a THIRD authorization vocabulary
 *      with a different value shape from the other two. Three vocabularies is
 *      three chances to reach for whichever one happens to be loosest.
 *
 * Production is now unconditional and staging reuses the QA fixture's variable,
 * because it is the same hazard: a working login on a host that answers to the
 * internet.
 */
describe("seed-demo-users · the environment guard", () => {
  const withPassword = { DEMO_USER_PASSWORD: "irrelevant-but-present" };

  it("HARD DENIES production — no variable lifts it", () => {
    expect(() =>
      resolveSeedConfig({
        argv: ["node", "seed"],
        env: { ...withPassword, PSICO_ENV: "production" },
      }),
    ).toThrow(/PRODUCTION/);

    // Including the variable that used to be the override, now deleted. If it
    // ever comes back as a live code path, this is where it shows up.
    expect(() =>
      resolveSeedConfig({
        argv: ["node", "seed"],
        env: {
          ...withPassword,
          PSICO_ENV: "production",
          ALLOW_DEMO_USERS_IN_PRODUCTION: "on",
        },
      }),
    ).toThrow(/PRODUCTION/);

    // And not via the deployed-box variable either.
    expect(() =>
      resolveSeedConfig({
        argv: ["node", "seed"],
        env: {
          ...withPassword,
          PSICO_ENV: "production",
          ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: "1",
        },
      }),
    ).toThrow(/PRODUCTION/);
  });

  it.each(["Production", "PRODUCTION", " production", "production "])(
    "%s is production too — the comparison is normalized",
    (value) => {
      // Defect 2. The old `===` waved every one of these through.
      expect(() =>
        resolveSeedConfig({
          argv: ["node", "seed"],
          env: { ...withPassword, PSICO_ENV: value },
        }),
      ).toThrow(/PRODUCTION/);
    },
  );

  it.each([
    ["Railway", { RAILWAY_ENVIRONMENT_NAME: "production" }],
    ["Railway (project)", { RAILWAY_PROJECT_ID: "proj-1" }],
    ["Coolify", { COOLIFY_RESOURCE_UUID: "res-abc" }],
    ["our own marker", { PSICO_DEPLOYED: "1" }],
  ])(
    "a deployed %s box with no PSICO_ENV is refused, not accepted",
    (_label, env) => {
      // Defect 1, the fail-open one. This is the shape the old guard let through.
      expect(() =>
        resolveSeedConfig({
          argv: ["node", "seed"],
          env: { ...withPassword, ...env },
        }),
      ).toThrow(/does not declare a valid posture/);
    },
  );

  it("an undeclared deployed box is not rescued by the deployed-box variable", () => {
    expect(() =>
      resolveSeedConfig({
        argv: ["node", "seed"],
        env: {
          ...withPassword,
          COOLIFY_RESOURCE_UUID: "res-abc",
          ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: "1",
        },
      }),
    ).toThrow(/does not declare a valid posture/);
  });

  it("refuses staging without the deployed-box variable", () => {
    expect(() =>
      resolveSeedConfig({
        argv: ["node", "seed"],
        env: {
          ...withPassword,
          COOLIFY_RESOURCE_UUID: "res-abc",
          PSICO_ENV: "staging",
          // The box really does carry this; it must not be read as production.
          NODE_ENV: "production",
        },
      }),
    ).toThrow(/ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX/);
  });

  it("allows staging with the exact variable, reusing the QA fixture's switch", () => {
    const cfg = resolveSeedConfig({
      argv: ["node", "seed"],
      env: {
        ...withPassword,
        COOLIFY_RESOURCE_UUID: "res-abc",
        PSICO_ENV: "staging",
        NODE_ENV: "production",
        ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: "1",
      },
    });
    expect(cfg.password).toBe("irrelevant-but-present");
  });

  it.each(["true", "on", "yes", "01", " 1", "1 ", "0", ""])(
    "%s does not authorize staging — exactly '1' or nothing",
    (value) => {
      // Defect 3's legacy: `on` was a real value in the old vocabulary, so it
      // is the one most likely to be typed from memory.
      expect(() =>
        resolveSeedConfig({
          argv: ["node", "seed"],
          env: {
            ...withPassword,
            PSICO_ENV: "staging",
            PSICO_DEPLOYED: "1",
            ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: value,
          },
        }),
      ).toThrow(/ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX/);
    },
  );

  it("a local box needs no variable at all", () => {
    expect(() =>
      resolveSeedConfig({ argv: ["node", "seed"], env: withPassword }),
    ).not.toThrow();
    expect(() =>
      resolveSeedConfig({
        argv: ["node", "seed"],
        env: { ...withPassword, NODE_ENV: "test" },
      }),
    ).not.toThrow();
  });

  it("refuses on the environment BEFORE asking about the password", () => {
    // Ordering matters for the message an operator reads: told the box is
    // wrong, they fix the box. Told the password is missing, they supply one and
    // try again against the same wrong box.
    expect(() =>
      resolveSeedConfig({
        argv: ["node", "seed"],
        env: { PSICO_ENV: "production" },
      }),
    ).toThrow(/PRODUCTION/);
  });

  it("the refusals leak nothing", () => {
    for (const env of [
      { ...withPassword, PSICO_ENV: "production" },
      { ...withPassword, COOLIFY_RESOURCE_UUID: "res-abc" },
      { ...withPassword, PSICO_ENV: "staging", PSICO_DEPLOYED: "1" },
    ]) {
      let caught: unknown;
      try {
        resolveSeedConfig({ argv: ["node", "seed"], env });
      } catch (err) {
        caught = err;
      }
      const message = String((caught as Error).message);
      expect(message).not.toMatch(/postgres(ql)?:\/\/|redis:\/\//);
      expect(message).not.toContain("irrelevant-but-present");
      expect(message).not.toMatch(/DEMO_USER_PASSWORD\s*=/);
      expect(message).not.toMatch(/res-abc/);
    }
  });
});

describe("seed-demo-users · source ratchets (fail if the footgun returns)", () => {
  it("has no trace of the removed production override", () => {
    // Removed rather than tightened: a third authorization vocabulary is a
    // third chance to type the loosest one. If this string reappears anywhere
    // in the script — even in a comment suggesting it — this fails.
    expect(SCRIPT_SRC).not.toContain("ALLOW_DEMO_USERS_IN_PRODUCTION");
  });

  it("never deletes a whole table", () => {
    // Every delete here is scoped to one user and one time window. An unscoped
    // `deleteMany({})` or `deleteMany()` in this file would wipe real rows on
    // whatever database DATABASE_URL happens to point at.
    expect(SCRIPT_SRC).not.toMatch(/deleteMany\(\s*\)/);
    expect(SCRIPT_SRC).not.toMatch(/deleteMany\(\s*\{\s*\}\s*\)/);
    // And each surviving call scopes by userId.
    const calls = SCRIPT_SRC.match(/deleteMany\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain("userId");
    }
  });

  it("classifies with the shared mirror rather than its own copy", () => {
    // One mirror of the posture rules, imported — not a second inline copy that
    // the conformance spec would not be watching.
    expect(SCRIPT_SRC).toMatch(
      /import \{[^}]*\bseedPosture\b[^}]*\} from "\.\/seed-posture\.mjs"/,
    );
  });

  it("carries no literal default demo password", () => {
    expect(SCRIPT_SRC).not.toContain("Demo1234!");
    // no `?? "…"` fallback default for the password
    expect(SCRIPT_SRC).not.toMatch(/args\.password\s*\?\?\s*["'`]/);
  });

  it("rotates the password only behind the --rotate-passwords guard (no implicit reset)", () => {
    expect(SCRIPT_SRC).toMatch(/rotatePasswords\s*\?\s*\{\s*passwordHash\s*\}/);
  });

  it("never prints the password", () => {
    expect(SCRIPT_SRC).not.toMatch(
      /Contraseña para todas:\s*["'`]?\s*\+\s*password/,
    );
  });
});
