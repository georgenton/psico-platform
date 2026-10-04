import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// The pure resolver, NOT the script's `main()`. Importing the module is inert:
// it only runs when invoked directly, so this opens no connection.
import {
  MOOD_PATTERNS,
  SYNTHETIC_EMAIL_SUFFIX,
  resolveMoodSeedConfig,
} from "../../scripts/seed-mood-history.mjs";

/**
 * C.1 — the mood-history tool writes SYNTHETIC EMOTIONS into a real account.
 *
 * Until this cycle it had no environment guard of any kind: it connected to
 * whatever `DATABASE_URL` pointed at and accepted a `--email` for any stored
 * account. The rows it inserts carry `moodEligibleForDynamics: true`, so they
 * feed that person's affect dynamics and change what their Emotional Map says
 * about them — the surface the V2 programme spent eight phases making honest.
 *
 * Two independent barriers, and both are exercised here:
 *
 *   - POSTURE: production is a hard deny; an undeclared deployed box likewise;
 *     deployed staging needs the existing QA/demo variable.
 *   - TARGET NAMESPACE: on a deployed box, `@psico.test` only, EVEN WITH the
 *     authorization present. Authorizing a host is not authorizing every
 *     account on it.
 *
 * The namespace is deliberately NOT enforced locally — pointing this at your own
 * dev account is the normal use, and the posture gate is what keeps "local"
 * meaning local.
 */

const ok = { email: "demo-x@psico.test" } as const;
const argv = (...flags: string[]) => ["node", "seed-mood-history", ...flags];
const withEmail = (email: string) => argv(`--email=${email}`);

/** A real deployed staging box: the marker, the posture, and NODE_ENV=production. */
const stagingBox = {
  COOLIFY_RESOURCE_UUID: "res-abc",
  PSICO_ENV: "staging",
  NODE_ENV: "production",
};
const authorized = { ...stagingBox, ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: "1" };

describe("seed-mood-history · production is a hard deny", () => {
  it("refuses production, even for a @psico.test address", () => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email),
        env: { PSICO_ENV: "production" },
      }),
    ).toThrow(/PRODUCTION/);
  });

  it("refuses production with the QA authorization present", () => {
    // Not a missing-authorization error. The variable that opens staging must
    // not read as "set this and it will work" here.
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email),
        env: {
          PSICO_ENV: "production",
          ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: "1",
        },
      }),
    ).toThrow(/PRODUCTION/);
  });

  it("refuses production on a deployed box with every known variable set", () => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email),
        env: {
          PSICO_DEPLOYED: "1",
          PSICO_ENV: "production",
          ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: "1",
          ALLOW_STAGING_BOOTSTRAP_SEED: "1",
          ALLOW_PRODUCTION_BOOTSTRAP_SEED: "1",
        },
      }),
    ).toThrow(/PRODUCTION/);
  });

  it.each(["Production", "PRODUCTION", " production", "production "])(
    "%s is production too — the comparison is normalized",
    (value) => {
      expect(() =>
        resolveMoodSeedConfig({
          argv: withEmail(ok.email),
          env: { PSICO_ENV: value },
        }),
      ).toThrow(/PRODUCTION/);
    },
  );

  it("the production refusal names the real reason, not a config fix", () => {
    let caught: unknown;
    try {
      resolveMoodSeedConfig({
        argv: withEmail(ok.email),
        env: { PSICO_ENV: "production" },
      });
    } catch (err) {
      caught = err;
    }
    const message = String((caught as Error).message);
    expect(message).toMatch(/no environment variable\s+lifts it/);
    expect(message).not.toContain("ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX");
  });
});

describe("seed-mood-history · a box that will not say what it is", () => {
  it.each([
    ["Railway", { RAILWAY_ENVIRONMENT_NAME: "production" }],
    ["Railway (project)", { RAILWAY_PROJECT_ID: "proj-1" }],
    ["Coolify", { COOLIFY_RESOURCE_UUID: "res-abc" }],
    ["our own marker", { PSICO_DEPLOYED: "1" }],
  ])("a deployed %s box with no PSICO_ENV is refused", (_label, env) => {
    expect(() =>
      resolveMoodSeedConfig({ argv: withEmail(ok.email), env }),
    ).toThrow(/does not declare a valid posture/);
  });

  it("the QA authorization does not rescue an undeclared box", () => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email),
        env: {
          COOLIFY_RESOURCE_UUID: "res-abc",
          ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: "1",
        },
      }),
    ).toThrow(/does not declare a valid posture/);
  });

  it("PSICO_ENV=prod is refused, and told it is a typo rather than a platform", () => {
    // The divergence the conformance table found in C: `prod` is the shorthand
    // people actually type, and it used to classify as a development machine.
    let caught: unknown;
    try {
      resolveMoodSeedConfig({
        argv: withEmail(ok.email),
        env: { PSICO_ENV: "prod" },
      });
    } catch (err) {
      caught = err;
    }
    const message = String((caught as Error).message);
    expect(message).toMatch(/does not recognize/);
    expect(message).toMatch(/typo/);
    expect(message).not.toMatch(/this box is deployed/);
  });

  it("a deployed box calling itself development is a conflict", () => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email),
        env: { PSICO_DEPLOYED: "1", PSICO_ENV: "development" },
      }),
    ).toThrow(/does not declare a valid posture/);
  });
});

describe("seed-mood-history · deployed staging needs the existing variable", () => {
  it("refuses staging without it", () => {
    expect(() =>
      resolveMoodSeedConfig({ argv: withEmail(ok.email), env: stagingBox }),
    ).toThrow(/ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX/);
  });

  it("allows staging with the exact value and a synthetic target", () => {
    const cfg = resolveMoodSeedConfig({
      argv: withEmail(ok.email),
      env: authorized,
    });
    expect(cfg.email).toBe(ok.email);
    expect(cfg.days).toBe(90);
    expect(cfg.pattern).toBe("volatile");
    expect(cfg.reset).toBe(false);
  });

  it.each(["true", "on", "yes", "01", " 1", "1 ", "0", "", "TRUE"])(
    "%s does not authorize — exactly '1' or nothing",
    (value) => {
      expect(() =>
        resolveMoodSeedConfig({
          argv: withEmail(ok.email),
          env: {
            ...stagingBox,
            ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX: value,
          },
        }),
      ).toThrow(/ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX/);
    },
  );

  it("the catalog seed's variable does not authorize this", () => {
    // Different hazard, different switch. Refreshing content must not also
    // authorize rewriting somebody's emotional history.
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email),
        env: { ...stagingBox, ALLOW_STAGING_BOOTSTRAP_SEED: "1" },
      }),
    ).toThrow(/ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX/);
  });

  it("PSICO_ENV beats NODE_ENV, so the real staging box is not read as production", () => {
    // The box genuinely carries NODE_ENV=production. If that won, the staging
    // path would be unreachable and the variable useless.
    let caught: unknown;
    try {
      resolveMoodSeedConfig({ argv: withEmail(ok.email), env: stagingBox });
    } catch (err) {
      caught = err;
    }
    expect(String((caught as Error).message)).not.toMatch(/PRODUCTION/);
  });
});

describe("seed-mood-history · the target account, on a deployed box", () => {
  it.each([
    "user@gmail.com",
    "persona@empresa.com",
    "someone@feelverse.app",
    // Looks like the namespace but is not: the suffix must END the address.
    "x@psico.test.attacker.com",
    "x@psico.testing.com",
    // A suffix with no local part is not an address.
    "@psico.test",
  ])("refuses %s even WITH the authorization", (email) => {
    expect(() =>
      resolveMoodSeedConfig({ argv: withEmail(email), env: authorized }),
    ).toThrow(new RegExp(`outside ${SYNTHETIC_EMAIL_SUFFIX}`));
  });

  it.each([
    "demo-estable@psico.test",
    "demo-volatil@psico.test",
    "demo-recuperando@psico.test",
    "qa-foo@psico.test",
    // Case and surrounding whitespace are normalized for the check.
    "Demo-Estable@PSICO.TEST",
    "  demo-x@psico.test  ",
  ])("accepts %s", (email) => {
    const cfg = resolveMoodSeedConfig({
      argv: withEmail(email),
      env: authorized,
    });
    expect(cfg.email).toBe(email.trim());
  });

  it("the refusal explains that the variable authorized the HOST, not the account", () => {
    let caught: unknown;
    try {
      resolveMoodSeedConfig({
        argv: withEmail("real@gmail.com"),
        env: authorized,
      });
    } catch (err) {
      caught = err;
    }
    expect(String((caught as Error).message)).toMatch(
      /authorizes the HOST, not every account/,
    );
  });

  it("does NOT enforce the namespace locally", () => {
    // Deliberate: seeding your own dev account is the normal use, and a local
    // box is not a shared one. The posture gate is what keeps this honest.
    const cfg = resolveMoodSeedConfig({
      argv: withEmail("me@example.com"),
      env: {},
    });
    expect(cfg.email).toBe("me@example.com");
  });

  it("still requires an email, everywhere", () => {
    expect(() => resolveMoodSeedConfig({ argv: argv(), env: {} })).toThrow(
      /--email is required/,
    );
    // A bare `--email` parses to boolean true, which is not an address.
    expect(() =>
      resolveMoodSeedConfig({ argv: argv("--email"), env: {} }),
    ).toThrow(/--email is required/);
    expect(() =>
      resolveMoodSeedConfig({ argv: argv("--email=   "), env: {} }),
    ).toThrow(/--email is required/);
  });
});

describe("seed-mood-history · arguments fail closed", () => {
  it.each([
    ["abc", "not a number"],
    ["NaN", "NaN"],
    ["Infinity", "an endless loop in the old code"],
    ["-5", "negative"],
    ["0", "zero"],
    ["1.5", "fractional"],
    ["3651", "beyond the cap"],
  ])("--days=%s is refused (%s)", (value) => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email).concat(`--days=${value}`),
        env: {},
      }),
    ).toThrow(/--days must be a whole number/);
  });

  it.each(["1", "90", "3650"])("--days=%s is accepted", (value) => {
    const cfg = resolveMoodSeedConfig({
      argv: withEmail(ok.email).concat(`--days=${value}`),
      env: {},
    });
    expect(cfg.days).toBe(Number(value));
  });

  it.each(["chaotic", "Stable", "", "volatil", "random"])(
    "--pattern=%s is refused rather than silently becoming volatile",
    (value) => {
      // This was a `default:` arm in the switch, so a typo produced the volatile
      // curve and the operator read the resulting map as the pattern they asked
      // for. Substituting a different behaviour is worse than stopping.
      expect(() =>
        resolveMoodSeedConfig({
          argv: withEmail(ok.email).concat(`--pattern=${value}`),
          env: {},
        }),
      ).toThrow(/--pattern must be one of/);
    },
  );

  it.each(MOOD_PATTERNS)("--pattern=%s is accepted", (value) => {
    const cfg = resolveMoodSeedConfig({
      argv: withEmail(ok.email).concat(`--pattern=${value}`),
      env: {},
    });
    expect(cfg.pattern).toBe(value);
  });

  it.each(["1", "1.5", "-0.1", "NaN", "abc", "Infinity"])(
    "--skip=%s is refused",
    (value) => {
      expect(() =>
        resolveMoodSeedConfig({
          argv: withEmail(ok.email).concat(`--skip=${value}`),
          env: {},
        }),
      ).toThrow(/--skip must be a number/);
    },
  );

  it.each(["0", "0.25", "0.99"])("--skip=%s is accepted", (value) => {
    const cfg = resolveMoodSeedConfig({
      argv: withEmail(ok.email).concat(`--skip=${value}`),
      env: {},
    });
    expect(cfg.skip).toBe(Number(value));
  });
});

describe("seed-mood-history · --reset obeys the same barriers", () => {
  it("is refused on production", () => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email).concat("--reset"),
        env: { PSICO_ENV: "production" },
      }),
    ).toThrow(/PRODUCTION/);
  });

  it("is refused on staging without the authorization", () => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email).concat("--reset"),
        env: stagingBox,
      }),
    ).toThrow(/ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX/);
  });

  it("is refused for a non-synthetic target even with the authorization", () => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: argv("--email=real@gmail.com", "--reset"),
        env: authorized,
      }),
    ).toThrow(new RegExp(`outside ${SYNTHETIC_EMAIL_SUFFIX}`));
  });

  it("is refused on an undeclared deployed box", () => {
    expect(() =>
      resolveMoodSeedConfig({
        argv: withEmail(ok.email).concat("--reset"),
        env: { PSICO_DEPLOYED: "1" },
      }),
    ).toThrow(/does not declare a valid posture/);
  });

  it("there is no separate path to reset — it is the same resolver", () => {
    // Nothing about `--reset` is consulted before the guards, so there is no
    // ordering in which a reset reaches the database on a refused box.
    const cfg = resolveMoodSeedConfig({
      argv: withEmail(ok.email).concat("--reset"),
      env: authorized,
    });
    expect(cfg.reset).toBe(true);
  });

  it("--reset=false does NOT delete", () => {
    // `Boolean("false")` is true, so this used to enable the destructive branch
    // for somebody writing what looks like an explicit opt-out.
    const cfg = resolveMoodSeedConfig({
      argv: withEmail(ok.email).concat("--reset=false"),
      env: {},
    });
    expect(cfg.reset).toBe(false);
  });

  it("--reset=true does delete, and anything else is refused", () => {
    expect(
      resolveMoodSeedConfig({
        argv: withEmail(ok.email).concat("--reset=true"),
        env: {},
      }).reset,
    ).toBe(true);

    for (const value of ["yes", "1", "on", "0", "maybe"]) {
      expect(() =>
        resolveMoodSeedConfig({
          argv: withEmail(ok.email).concat(`--reset=${value}`),
          env: {},
        }),
      ).toThrow(/--reset takes no value/);
    }
  });

  it("defaults to false when absent", () => {
    expect(
      resolveMoodSeedConfig({ argv: withEmail(ok.email), env: {} }).reset,
    ).toBe(false);
  });
});

describe("seed-mood-history · the refusals leak nothing", () => {
  it("carries no connection string, no secret, no echoed environment", () => {
    for (const env of [
      { PSICO_ENV: "production" },
      { PSICO_DEPLOYED: "1" },
      stagingBox,
      authorized,
      { PSICO_ENV: "prod" },
    ]) {
      let caught: unknown;
      try {
        resolveMoodSeedConfig({ argv: withEmail("real@gmail.com"), env });
      } catch (err) {
        caught = err;
      }
      const message = String((caught as Error).message);
      // What a leak actually looks like: a connection string or a secret VALUE.
      expect(message).not.toMatch(/postgres(ql)?:\/\/|redis:\/\//);
      expect(message).not.toMatch(/PASSWORD|SECRET|API_KEY/i);
      // `DATABASE_URL` is deliberately NOT forbidden. The typo refusal says the
      // value "must not be read as a development machine while DATABASE_URL
      // points somewhere real" — that is the sentence explaining WHY the guard
      // is fail-closed, and the name of a variable is not its value. The regex
      // above is what guards the value. This spec inherited the broader pattern
      // from the sibling guard, where no message happened to name it.
      expect(message).not.toMatch(/DATABASE_URL\s*=/);
      // No VALUE read out of the environment it just inspected.
      expect(message).not.toMatch(/res-abc/);
      expect(message).not.toMatch(/NODE_ENV\s*=/);
      // `PSICO_ENV=production` DOES appear, as the remedy to type — that is
      // instruction, not a leaked value, and the same text the sibling guards
      // carry. Forbidding the string outright would have cost the one sentence
      // that tells an operator what to do.
      expect(message).not.toMatch(/PSICO_ENV\s*=\s*["']/);
    }
  });
});

describe("seed-mood-history · source ratchets", () => {
  const RAW = readFileSync(
    fileURLToPath(
      new URL("../../scripts/seed-mood-history.mjs", import.meta.url),
    ),
    "utf8",
  );
  /** Executable text only, so prose about what was avoided stays allowed. */
  const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("classifies with the shared mirror, not its own comparison", () => {
    expect(CODE).toMatch(
      /import \{[^}]*\bseedPosture\b[^}]*\} from "\.\/seed-posture\.mjs"/,
    );
    expect(CODE).not.toMatch(/PSICO_ENV\s*===/);
    expect(CODE).not.toMatch(/NODE_ENV\s*===/);
  });

  it("introduces no new authorization variable", () => {
    // One switch per hazard. A fourth vocabulary would be a fourth chance to
    // reach for whichever one happens to be loosest.
    const allowVars = new Set(CODE.match(/ALLOW_[A-Z_]+/g) ?? []);
    expect([...allowVars]).toStrictEqual([
      "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX",
    ]);
  });

  it("has no production override of any kind", () => {
    expect(CODE).not.toMatch(/ALLOW_DEMO_USERS_IN_PRODUCTION/);
    expect(CODE).not.toMatch(/ALLOW_PRODUCTION/);
    // The production branch takes no variable at all.
    const prodBranch = CODE.slice(
      CODE.indexOf('posture === "production"'),
      CODE.indexOf('posture === "invalid"'),
    );
    expect(prodBranch).not.toMatch(/env\./);
  });

  it("never deletes without a userId scope", () => {
    expect(CODE).not.toMatch(/deleteMany\(\s*\)/);
    expect(CODE).not.toMatch(/deleteMany\(\s*\{\s*\}\s*\)/);
    const calls = CODE.match(/deleteMany\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("userId");
    // And bounded by the window, not the whole history.
    expect(calls[0]).toContain("windowStart");
  });

  it("builds no connection before the guard has run", () => {
    // Ordering as a textual fact: the resolver call precedes the first `new
    // Pool`, so a refusal cannot have opened a socket. The behavioural proof is
    // the live negative control (unreachable DATABASE_URL still fails on guard).
    const guardAt = CODE.indexOf("resolveMoodSeedConfig({");
    const poolAt = CODE.indexOf("new Pool(");
    const prismaAt = CODE.indexOf("new PrismaClient(");
    expect(guardAt).toBeGreaterThan(-1);
    expect(poolAt).toBeGreaterThan(guardAt);
    expect(prismaAt).toBeGreaterThan(guardAt);
    // Redis is reached only from `bustCache`, after the writes.
    expect(CODE.indexOf("ioredis")).toBeGreaterThan(guardAt);
  });

  it("does not run on import", () => {
    // So a test can import the resolver without seeding whatever DATABASE_URL
    // points at — the trap `seed.ts` and `seed-test.ts` still carry.
    expect(CODE).toMatch(/import\.meta\.url === pathToFileURL/);
    expect(CODE).toMatch(/if \(invokedDirectly\)/);
  });

  it("keeps the SEED provenance on every row it writes", () => {
    // Synthetic mood must never masquerade as a real tap (PR-2A/2B).
    expect(CODE).toMatch(/moodProvenance: "SEED"/);
    expect(CODE).not.toMatch(/moodProvenance: "MOOD_LOG"/);
  });
});
