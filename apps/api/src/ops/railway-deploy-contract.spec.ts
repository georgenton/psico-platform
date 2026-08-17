import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * C.0A1 — the deployment contract, versioned.
 *
 * Two facts made this necessary. Railway ran `migrate:deploy && prisma db seed`
 * on every API deploy, so a schema change and a rewrite of curated content
 * shipped together and a failure could not be attributed to either. And
 * `apps/api/railway.json` — the only deployment config in the repository —
 * was not the configuration Railway used: it declared NIXPACKS and a
 * seedless pre-deploy while production ran RAILPACK and seeded. Anyone reading
 * the repo was reading fiction.
 *
 * SCOPE, stated plainly:
 *
 *   REPO_CONFIG_RATCHET=true
 *   EFFECTIVE_RAILWAY_BINDING_VERIFIED=false
 *
 * This file checks the files in the repository. It CANNOT check what Railway
 * is configured to use — the services are not linked to these paths yet, and
 * linking is a separate authorized operation. Until then the effective config
 * lives in the dashboard and is verified out-of-band (see the runbook).
 */

const API_DIR = process.cwd();
const apiPath = join(API_DIR, "railway.api.json");
const workerPath = join(API_DIR, "railway.worker.json");

interface RailwayConfig {
  build?: {
    builder?: string;
    buildCommand?: string;
    watchPatterns?: string[];
  };
  deploy?: {
    startCommand?: string;
    preDeployCommand?: string[];
    healthcheckPath?: string;
    restartPolicyType?: string;
    restartPolicyMaxRetries?: number;
  };
}

const read = (p: string): RailwayConfig =>
  JSON.parse(readFileSync(p, "utf8")) as RailwayConfig;

const api = () => read(apiPath);
const worker = () => read(workerPath);

/** Every way the seed could be spelled into a deploy step. */
const SEED_MARKERS = ["db seed", "prisma seed", "seed.ts", "seed:"];

const preDeployText = (c: RailwayConfig) =>
  (c.deploy?.preDeployCommand ?? []).join(" ");

describe("deploy contract · exactly one migration owner", () => {
  it("the API runs migrate:deploy", () => {
    expect(preDeployText(api())).toContain("migrate:deploy");
  });

  it("the worker runs no pre-deploy at all", () => {
    // Two concurrent `migrate deploy` runs do not politely queue: Prisma's
    // advisory lock times out at a non-configurable 10s, and the pair ends
    // with one deadlocked, an INVALID index left behind and every later
    // migration blocked by P3009. One owner is the design, not an accident.
    expect(worker().deploy?.preDeployCommand).toBeUndefined();
  });

  it("only ONE of the two services migrates", () => {
    const owners = [api(), worker()].filter((c) =>
      preDeployText(c).includes("migrate:deploy"),
    );
    expect(owners).toHaveLength(1);
  });
});

describe("deploy contract · the seed is not a deployment step", () => {
  it.each([
    ["api", () => api()],
    ["worker", () => worker()],
  ])("%s pre-deploy does not seed", (_name, get) => {
    const text = preDeployText(get());
    for (const marker of SEED_MARKERS) {
      expect(text).not.toContain(marker);
    }
  });
});

describe("deploy contract · the two services stay distinct", () => {
  it("start commands differ and each is the right one", () => {
    const a = api().deploy?.startCommand ?? "";
    const w = worker().deploy?.startCommand ?? "";
    expect(a).not.toBe(w);
    expect(a).toContain("dist/main");
    expect(w).toContain("start:worker");
  });

  it("watch patterns match the effective configuration", () => {
    // The worker watches only the API workspace; the API also watches shared
    // packages. Both are reproduced from the live settings, not invented.
    expect(api().build?.watchPatterns).toEqual(["apps/api/**", "packages/**"]);
    expect(worker().build?.watchPatterns).toEqual(["apps/api/**"]);
  });

  it("both declare the effective builder", () => {
    expect(api().build?.builder).toBe("RAILPACK");
    expect(worker().build?.builder).toBe("RAILPACK");
  });
});

describe("deploy contract · nothing secret is versioned", () => {
  it.each([
    ["api", apiPath],
    ["worker", workerPath],
  ])("%s config carries no credentials or URLs", (_name, path) => {
    const raw = readFileSync(path, "utf8");
    expect(raw).not.toMatch(
      /postgres(ql)?:\/\/|redis:\/\/|https?:\/\/(?!railway\.com)/,
    );
    expect(raw).not.toMatch(/SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL/i);
  });
});

describe("deploy contract · the dead config is gone", () => {
  it("apps/api/railway.json no longer exists", () => {
    // It declared NIXPACKS and a seedless pre-deploy while Railway ran
    // RAILPACK and seeded. Keeping a file that contradicts production is
    // worse than having none.
    expect(existsSync(join(API_DIR, "railway.json"))).toBe(false);
  });

  it("the replacements exist", () => {
    expect(existsSync(apiPath)).toBe(true);
    expect(existsSync(workerPath)).toBe(true);
  });
});
