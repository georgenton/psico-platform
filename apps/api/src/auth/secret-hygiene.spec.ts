import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural secret-hygiene ratchets (incident follow-up).
 *
 * These fail the build if a class of mistake from the demo-credential incident
 * reappears — they assert on SHAPE, not on the one rotated password string.
 * (The literal-default-password + implicit-rotation + no-print ratchets live in
 * seed-demo-users.spec.ts; these cover the production-seed gate and the
 * "never log a password value" rule across the whole auth/users surface.)
 */

const SEED = fileURLToPath(
  new URL("../../scripts/seed-demo-users.mjs", import.meta.url),
);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(p, out);
    } else if (/\.(ts|mjs|cjs)$/.test(name) && !/\.spec\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("secret hygiene · structural ratchets", () => {
  it("the demo seed keeps its production gate (no prod seed without an explicit flag)", () => {
    const src = readFileSync(SEED, "utf8");
    // The guard must key off BOTH the environment AND the explicit allow-flag.
    expect(src).toMatch(/PSICO_ENV\s*===\s*["'`]production["'`]/);
    expect(src).toMatch(/ALLOW_DEMO_USERS_IN_PRODUCTION\s*!==\s*["'`]on["'`]/);
  });

  it("never logs a password / passwordHash VALUE anywhere in auth/users/scripts", () => {
    const roots = [
      fileURLToPath(new URL(".", import.meta.url)), // src/auth
      fileURLToPath(new URL("../users", import.meta.url)), // src/users
      fileURLToPath(new URL("../../scripts", import.meta.url)), // scripts
    ];
    // A logger/console call whose arguments interpolate or pass a password
    // variable — not a plain quoted string like "password reset requested".
    const LOG_PW =
      /(console|logger|this\.logger|Logger)\.(log|info|warn|error|debug|verbose)\([^)]*(\$\{[^}]*password|[,(\s]password(Hash)?\b|[,(\s](new|current)Password\b)/i;
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (LOG_PW.test(line)) offenders.push(`${file}:${i + 1}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
