import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The staging wrapper, checked by reading it.
 *
 * ── Why a source ratchet and not an import ────────────────────────────────
 *
 * `staging-seed.mjs` runs at module scope: it reads `process.argv`, decides, and
 * calls `process.exit`. Importing it from a test would execute it — and on a
 * machine that happens to look like staging, execute a seed. The same hazard
 * `seed-guard.spec.ts` documents for `seed-test.ts`.
 *
 * So this asserts the SHAPE of a shell whose entire job is what it refuses to
 * do. Each absence below is a specific way a convenience wrapper turns into the
 * thing the guards exist to prevent; the classification it shares with the guard
 * is covered for real in `seed-environment-conformance.spec.ts`.
 */

const SRC = readFileSync(
  fileURLToPath(new URL("../../scripts/staging-seed.mjs", import.meta.url)),
  "utf8",
);

/** Executable text only, so prose about what was avoided stays allowed. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("staging-seed wrapper · what it refuses to do", () => {
  it("classifies with the shared mirror, not its own comparison", () => {
    expect(CODE).toMatch(
      /import \{[^}]*\bseedPosture\b[^}]*\} from "\.\/seed-posture\.mjs"/,
    );
    // No inline environment comparison that could drift from the guard.
    expect(CODE).not.toMatch(/PSICO_ENV\s*===/);
  });

  it("refuses anything that is not staging", () => {
    expect(CODE).toMatch(/posture !== "staging"/);
    // Including production explicitly, so the message is about production
    // rather than a generic mismatch.
    expect(CODE).toMatch(/posture === "production"/);
    expect(CODE).toMatch(/posture === "invalid"/);
  });

  it("never builds or reads a connection string", () => {
    // A wrapper that assembles DATABASE_URL is a wrapper that can assemble the
    // wrong one. You run it where the connection already points where you mean.
    expect(CODE).not.toMatch(/DATABASE_URL/);
    expect(CODE).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("never runs migrations", () => {
    // Migrations are a deployment step; the seed is an administrative one.
    // Re-chaining them is exactly what C.0A1 removed from the pre-deploy.
    expect(CODE).not.toMatch(/migrate/i);
    expect(CODE).not.toMatch(/prisma db push/);
  });

  it("has no 'all' target — one seed per invocation", () => {
    // So "refresh the catalog" can never also mean "mint logins".
    expect(CODE).not.toMatch(/["']all["']\s*:/);
    const targets = CODE.slice(
      CODE.indexOf("const TARGETS"),
      CODE.indexOf("function fail"),
    );
    expect(targets).toMatch(/catalog/);
    expect(targets).toMatch(/qa-users/);
    expect(targets).toMatch(/demo-users/);
    expect(targets).toMatch(/mood-history/);
    // Exactly four, each with exactly one command. The count is asserted so
    // adding a target is a visible decision rather than a quiet one.
    expect(targets.match(/command:/g)).toHaveLength(4);
  });

  it("pins every target to its own variable, and no other", () => {
    /**
     * All four mappings, asserted exactly.
     *
     * The whole reason there is more than one variable: a command typed to
     * refresh content must not be the command that mints an ADMIN login or
     * rewrites somebody's mood history. Pinning each pair here means swapping
     * one — the quiet way a two-switch design collapses into one — fails the
     * build rather than passing review.
     */
    const targets = CODE.slice(
      CODE.indexOf("const TARGETS"),
      CODE.indexOf("function fail"),
    );

    const EXPECTED: ReadonlyArray<readonly [string, string]> = [
      ["catalog", "ALLOW_STAGING_BOOTSTRAP_SEED"],
      ["qa-users", "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX"],
      ["demo-users", "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX"],
      ["mood-history", "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX"],
    ];

    // Parse the table rather than pattern-matching across it, so a target
    // missing its own block cannot be satisfied by a neighbour's token.
    const found = new Map<string, string>();
    for (const m of targets.matchAll(
      /"?([a-z-]+)"?:\s*\{\s*token:\s*"([A-Z_]+)"/g,
    )) {
      found.set(m[1]!, m[2]!);
    }

    expect([...found.entries()].sort()).toStrictEqual(
      EXPECTED.map(([k, v]) => [k, v]).sort(),
    );

    // The catalog's variable belongs to the catalog ALONE.
    const catalogVar = "ALLOW_STAGING_BOOTSTRAP_SEED";
    expect(
      [...found.entries()].filter(([, v]) => v === catalogVar),
    ).toStrictEqual([["catalog", catalogVar]]);

    // And the account/data variable never reaches the catalog.
    expect(found.get("catalog")).not.toBe("ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX");

    // Production's variable appears nowhere in this file at all.
    expect(CODE).not.toMatch(/ALLOW_PRODUCTION_BOOTSTRAP_SEED/);
    // No variable beyond the two this wrapper is allowed to supply.
    expect(new Set(CODE.match(/ALLOW_[A-Z_]+/g) ?? [])).toStrictEqual(
      new Set([catalogVar, "ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX"]),
    );
  });

  it("scopes the authorization to the child process", () => {
    // Not exported into the operator's shell, not written to a file, and not a
    // Coolify variable — which is how an ephemeral token becomes a permanent
    // bypass. `process.env` of the wrapper itself is never mutated.
    expect(CODE).toMatch(/env: \{ \.\.\.process\.env, \[token\]: "1" \}/);
    expect(CODE).not.toMatch(/process\.env\[[^\]]+\]\s*=/);
    expect(CODE).not.toMatch(/writeFileSync|appendFileSync/);
  });

  it("invents no hostname check", () => {
    // A seed run cannot see a hostname, and trusting a string that looks like a
    // staging URL is how you seed production from a copied command. The posture
    // marker on the resource is the evidence.
    expect(CODE).not.toMatch(/staging\.feelverse|api-staging|hostname|\.app\b/);
  });

  it("reads no secret beyond what it passes through", () => {
    expect(CODE).not.toMatch(
      /JWT_SECRET|R2_|STRIPE|ANTHROPIC|RESEND|VAPID|REDIS_URL/,
    );
  });
});
