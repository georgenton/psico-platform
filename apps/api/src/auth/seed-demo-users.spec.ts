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

  it("in production it ABORTS without ALLOW_DEMO_USERS_IN_PRODUCTION=on, even with a password", () => {
    expect(() =>
      resolveSeedConfig({
        argv: ["node", "seed", "--password=whatever"],
        env: { PSICO_ENV: "production", DEMO_USER_PASSWORD: "x" },
      }),
    ).toThrow(/production/i);
  });

  it("in production it runs only with the explicit allow-flag + a password", () => {
    const cfg = resolveSeedConfig({
      argv: ["node", "seed"],
      env: {
        PSICO_ENV: "production",
        ALLOW_DEMO_USERS_IN_PRODUCTION: "on",
        DEMO_USER_PASSWORD: "prodpass",
      },
    });
    expect(cfg.password).toBe("prodpass");
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

describe("seed-demo-users · source ratchets (fail if the footgun returns)", () => {
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
