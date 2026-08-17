import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RailwayServiceConfigSchema,
  type RailwayServiceConfig,
} from "./railway-config.schema";

/**
 * C.0A1 — the deployment contract, versioned and EXACT.
 *
 * Two facts made this necessary. Railway ran `migrate:deploy && prisma db seed`
 * on every API deploy, so a schema change and a rewrite of curated content
 * shipped as one step and a failure could not be attributed to either. And
 * `apps/api/railway.json` — the repository's only deployment config — was not
 * the configuration Railway used: it declared NIXPACKS and a seedless
 * pre-deploy while production ran RAILPACK and seeded.
 *
 * Assertions here are EQUALITY, not `toContain`. "Contains migrate:deploy" is
 * satisfied by `migrate:deploy && anything-else`, which is exactly the shape
 * this phase exists to remove.
 *
 * SCOPE, stated plainly:
 *
 *   REPO_CONFIG_RATCHET=true
 *   EFFECTIVE_RAILWAY_BINDING_VERIFIED=false
 *
 * These are the files in the repository. They are NOT yet what Railway reads —
 * the services are not linked to these paths, and linking is a separate
 * authorized step. Until then the effective config lives in the dashboard and
 * is compared out-of-band (see the runbook).
 */

const API_DIR = process.cwd();
const apiPath = join(API_DIR, "railway.api.json");
const workerPath = join(API_DIR, "railway.worker.json");

const raw = (p: string) => readFileSync(p, "utf8");
const parsed = (p: string): RailwayServiceConfig =>
  RailwayServiceConfigSchema.parse(JSON.parse(raw(p)));

/** The approved API contract, field for field. */
const API_EXPECTED: RailwayServiceConfig = {
  $schema: "https://railway.com/railway.schema.json",
  build: {
    builder: "RAILPACK",
    buildCommand:
      "pnpm install --frozen-lockfile && pnpm turbo run build --filter=@psico/api",
    watchPatterns: [
      "apps/api/**",
      "packages/**",
      "config/**",
      ".npmrc",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      // Only the API builds through Turbo; the worker calls pnpm directly.
      "turbo.json",
    ],
  },
  deploy: {
    startCommand: "node apps/api/dist/main",
    preDeployCommand: ["pnpm --filter @psico/api migrate:deploy"],
    healthcheckPath: "/health",
    restartPolicyType: "ON_FAILURE",
    restartPolicyMaxRetries: 10,
    sleepApplication: false,
  },
};

/** The approved worker contract. No pre-deploy at all. */
const WORKER_EXPECTED: RailwayServiceConfig = {
  $schema: "https://railway.com/railway.schema.json",
  build: {
    builder: "RAILPACK",
    buildCommand:
      "pnpm install --frozen-lockfile && pnpm --filter @psico/api... build",
    watchPatterns: [
      "apps/api/**",
      "packages/**",
      "config/**",
      ".npmrc",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ],
  },
  deploy: {
    startCommand: "pnpm --filter @psico/api start:worker",
    restartPolicyType: "ON_FAILURE",
    restartPolicyMaxRetries: 10,
    sleepApplication: false,
  },
};

describe("deploy contract · the files are exactly the approved contract", () => {
  it("the API config matches field for field", () => {
    expect(parsed(apiPath)).toEqual(API_EXPECTED);
  });

  it("the worker config matches field for field", () => {
    expect(parsed(workerPath)).toEqual(WORKER_EXPECTED);
  });

  it("the worker's file declares no pre-deploy", () => {
    // What this asserts, exactly: the FILE contains no pre-deploy. It does NOT
    // assert that the worker cannot inherit one from the dashboard.
    //
    // Railway merges file and dashboard on every deployment, and the official
    // documentation states only that code overrides dashboard values "when
    // present" — it does not define what an omitted field does, nor whether
    // `null` clears an existing value. The schema accepts string, a
    // single-element array, and null, but accepting null is not the same as
    // documenting that null unsets.
    //
    // Today there is nothing to inherit: the worker's effective
    // `preDeployCommand` is unset. The authoritative "no pre-deploy"
    // representation is an open question (see ROADMAP), and choosing `[]` or
    // `null` on a guess would be worse than saying so.
    expect("preDeployCommand" in parsed(workerPath).deploy).toBe(false);
  });
});

describe("deploy contract · schema validity and closed shape", () => {
  it.each([
    ["api", apiPath],
    ["worker", workerPath],
  ])("%s is valid JSON accepted by the local Railway subset", (_n, path) => {
    expect(() => JSON.parse(raw(path))).not.toThrow();
    expect(() =>
      RailwayServiceConfigSchema.parse(JSON.parse(raw(path))),
    ).not.toThrow();
  });

  it("rejects a key Railway supports but we have not approved", () => {
    // `cronSchedule` is real and valid to Railway — and would turn a service
    // into something else entirely. `.strict()` is what makes adding it a
    // deliberate act.
    const withCron = {
      ...JSON.parse(raw(workerPath)),
      deploy: {
        ...JSON.parse(raw(workerPath)).deploy,
        cronSchedule: "0 * * * *",
      },
    };
    expect(() => RailwayServiceConfigSchema.parse(withCron)).toThrow();
  });

  it("rejects a wrong type on an approved key", () => {
    const bad = JSON.parse(raw(apiPath));
    bad.deploy.restartPolicyMaxRetries = "10";
    expect(() => RailwayServiceConfigSchema.parse(bad)).toThrow();
  });
});

describe("deploy contract · exactly one migration owner", () => {
  const migrates = (c: RailwayServiceConfig) =>
    (c.deploy.preDeployCommand ?? []).some((cmd) =>
      cmd.includes("migrate:deploy"),
    );

  it("the API is the owner and the worker is not", () => {
    expect(migrates(parsed(apiPath))).toBe(true);
    expect(migrates(parsed(workerPath))).toBe(false);
  });

  it("only ONE of the two migrates", () => {
    // Two concurrent `migrate deploy` runs do not queue. Prisma's advisory
    // lock times out at a non-configurable 10s and the pair ends with one
    // deadlocked (40P01), an INVALID index left behind and every later
    // migration blocked by P3009 — reproduced on PostgreSQL 18.4.
    const owners = [parsed(apiPath), parsed(workerPath)].filter(migrates);
    expect(owners).toHaveLength(1);
  });

  it("the API pre-deploy is that ONE command and nothing more", () => {
    expect(parsed(apiPath).deploy.preDeployCommand).toEqual([
      "pnpm --filter @psico/api migrate:deploy",
    ]);
  });
});

describe("deploy contract · no command can carry a passenger", () => {
  const everyCommand = (c: RailwayServiceConfig) => [
    c.build.buildCommand,
    c.deploy.startCommand,
    ...(c.deploy.preDeployCommand ?? []),
  ];

  it("pre-deploy and start commands are single commands", () => {
    // `buildCommand` is exempt from the chaining rule by necessity — install
    // then build is one logical step Railway has no other way to express —
    // and it is pinned by exact equality above, so it cannot grow either.
    for (const config of [parsed(apiPath), parsed(workerPath)]) {
      const guarded = [
        config.deploy.startCommand,
        ...(config.deploy.preDeployCommand ?? []),
      ];
      for (const cmd of guarded) {
        expect(cmd).not.toMatch(/&&|\|\||[;|]|\$\(|`/);
      }
    }
  });

  it("no command anywhere mentions the seed", () => {
    const markers = [
      "db seed",
      "prisma seed",
      "seed.ts",
      "seed:",
      "ALLOW_PRODUCTION_BOOTSTRAP_SEED",
    ];
    for (const config of [parsed(apiPath), parsed(workerPath)]) {
      for (const cmd of everyCommand(config)) {
        for (const marker of markers) {
          expect(cmd).not.toContain(marker);
        }
      }
    }
  });

  it("neither raw document mentions the seed or its override", () => {
    for (const path of [apiPath, workerPath]) {
      const text = raw(path);
      expect(text).not.toMatch(/db\s+seed|seed\.ts|prisma\s+seed/);
      expect(text).not.toContain("ALLOW_PRODUCTION_BOOTSTRAP_SEED");
    }
  });
});

describe("deploy contract · nothing secret is versioned", () => {
  it.each([
    ["api", apiPath],
    ["worker", workerPath],
  ])("%s carries no credentials or URLs", (_n, path) => {
    const text = raw(path);
    expect(text).not.toMatch(
      /postgres(ql)?:\/\/|redis:\/\/|https?:\/\/(?!railway\.com)/,
    );
    expect(text).not.toMatch(/SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL/i);
  });
});

describe("deploy contract · the dead config is gone", () => {
  it("apps/api/railway.json no longer exists", () => {
    // It declared NIXPACKS and a seedless pre-deploy while Railway ran
    // RAILPACK and seeded. A file that contradicts production is worse than
    // no file at all.
    expect(existsSync(join(API_DIR, "railway.json"))).toBe(false);
  });

  it("the replacements exist", () => {
    expect(existsSync(apiPath)).toBe(true);
    expect(existsSync(workerPath)).toBe(true);
  });
});

describe("deploy contract · the watch patterns close the build graph", () => {
  /**
   * What can change either artifact, established from the real graph rather
   * than from intuition:
   *
   *   apps/api/**        the service source itself
   *   packages/**        `@psico/types` is imported by 96 production files;
   *                      `@psico/crypto` is in the build set via `...`
   *   config/**          `packages/types/tsconfig.json` EXTENDS
   *                      `@psico/typescript-config/base.json`, and `tsup --dts`
   *                      emits declarations through it — so a change there
   *                      changes the types artifact the API compiles against
   *   pnpm-lock.yaml     both builds run `pnpm install --frozen-lockfile`
   *   pnpm-workspace.yaml which packages exist at all
   *   package.json       pins `packageManager: pnpm@10.33.2`
   *   .npmrc             hoisting and peer-dependency resolution
   *   turbo.json         API ONLY — it builds via `turbo run build`; the
   *                      worker calls `pnpm --filter @psico/api... build`
   */
  const REQUIRED_BOTH = [
    "apps/api/**",
    "packages/**",
    "config/**",
    ".npmrc",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ];

  it.each([
    ["api", apiPath],
    ["worker", workerPath],
  ])("%s watches every input that can change its artifact", (_n, path) => {
    const patterns = parsed(path).build.watchPatterns;
    for (const required of REQUIRED_BOTH) {
      expect(patterns).toContain(required);
    }
  });

  it("only the API watches turbo.json, and that difference is earned", () => {
    // The two may differ only where the commands actually differ.
    expect(parsed(apiPath).build.watchPatterns).toContain("turbo.json");
    expect(parsed(workerPath).build.watchPatterns).not.toContain("turbo.json");
    expect(parsed(apiPath).build.buildCommand).toContain("turbo run build");
    expect(parsed(workerPath).build.buildCommand).not.toContain("turbo");
  });

  it("the sets differ by exactly that one entry", () => {
    const a = new Set(parsed(apiPath).build.watchPatterns);
    const w = new Set(parsed(workerPath).build.watchPatterns);
    const onlyApi = [...a].filter((p) => !w.has(p));
    const onlyWorker = [...w].filter((p) => !a.has(p));
    expect(onlyApi).toEqual(["turbo.json"]);
    expect(onlyWorker).toEqual([]);
  });

  it("watches nothing that cannot change the artifact", () => {
    // A web-only or docs-only change must not redeploy either service.
    const forbidden = ["apps/web/**", "apps/mobile/**", "docs/**", "**"];
    for (const path of [apiPath, workerPath]) {
      for (const p of parsed(path).build.watchPatterns) {
        expect(forbidden).not.toContain(p);
      }
    }
  });

  it("the order is canonical: workspaces first, then root inputs sorted", () => {
    // Railway does not treat order as significant, but a fixed order makes a
    // diff readable and keeps two people from reshuffling the same list.
    const canonical = (patterns: readonly string[]) => {
      const globs = patterns.filter((p) => p.endsWith("/**"));
      const roots = patterns.filter((p) => !p.endsWith("/**"));
      return [...globs, ...[...roots].sort()];
    };
    for (const path of [apiPath, workerPath]) {
      const patterns = parsed(path).build.watchPatterns;
      expect(patterns).toEqual(canonical(patterns));
    }
  });
});
