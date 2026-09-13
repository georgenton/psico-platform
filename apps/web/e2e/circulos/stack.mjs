#!/usr/bin/env node
/**
 * The Círculos end-to-end stack: a throwaway copy of HEAD, built and run.
 *
 * ── Why a copy at all ──────────────────────────────────────────────────────
 *
 * The walk cannot happen without a PUBLISHED template and an eligibility
 * mapping, and both are compile-time constants that ship EMPTY on purpose. The
 * tempting fixes are all worse than the problem:
 *
 *   · an env var that turns on synthetic templates → a switch that exists in
 *     production, one misconfiguration away from publishing a fixture;
 *   · an endpoint that injects catalog entries → the same, with a URL;
 *   · `NODE_ENV !== "production"` guarding the fixture → then the walk is not
 *     testing a production build, which is the thing that has to work.
 *
 * So nothing in the shipped source changes. This script copies HEAD into a
 * temporary tree, rewrites exactly two catalog lines THERE, builds that tree
 * for production, and runs it. The repository's catalog stays empty and its
 * ratchets keep asserting so.
 *
 * ── What it owns, and what it refuses to touch ─────────────────────────────
 *
 * Every resource carries this run's id: the work tree, both containers, both
 * databases. Teardown removes those and nothing else — it never drops by
 * pattern and never reuses a name it did not create. The original worktree is
 * read ONCE, through `git archive`, and is never written to.
 *
 * Usage:
 *   node apps/web/e2e/circulos/stack.mjs            # build, run the walk, tear down
 *   node apps/web/e2e/circulos/stack.mjs --keep     # leave it up for exploring
 *   node apps/web/e2e/circulos/stack.mjs --down <runId>
 */

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../../../..");

const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const DOWN_AT = args.indexOf("--down");

const RUN = DOWN_AT >= 0 ? args[DOWN_AT + 1] : randomBytes(5).toString("hex");
if (!/^[0-9a-f]{10}$/.test(RUN)) {
  console.error(`refusing an unsafe run id: ${RUN}`);
  process.exit(2);
}

const WORK = join(tmpdir(), `circulos-e2e-${RUN}`);
const PG = `circulos-e2e-pg-${RUN}`;
const REDIS = `circulos-e2e-redis-${RUN}`;
const STATE = join(tmpdir(), `circulos-e2e-${RUN}.json`);
const LOGS = join(tmpdir(), `circulos-e2e-${RUN}-logs`);

const children = [];
/** service name → its log file, so a boot failure can be explained. */
const logPaths = new Map();

function sh(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    encoding: "utf8",
    stdio: opts.quiet ? "pipe" : "inherit",
    ...opts,
  });
}

function log(step, detail = "") {
  console.log(`\n▸ ${step}${detail ? ` — ${detail}` : ""}`);
}

/** A port nobody is listening on, asked of the OS rather than guessed. */
function freePort() {
  return new Promise((done, fail) => {
    const srv = createServer();
    srv.on("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => done(port));
    });
  });
}

// ── Teardown ────────────────────────────────────────────────────────────────

function teardown({ quiet = false } = {}) {
  if (!quiet) log("teardown", RUN);
  for (const child of children.splice(0)) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  for (const name of [PG, REDIS]) {
    try {
      execFileSync("docker", ["rm", "-f", name], { stdio: "pipe" });
    } catch {
      /* never existed */
    }
  }
  if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  if (existsSync(STATE)) rmSync(STATE, { force: true });
  if (existsSync(LOGS)) rmSync(LOGS, { recursive: true, force: true });
}

if (DOWN_AT >= 0) {
  teardown();
  console.log(`\n✔ run ${RUN} cleaned up`);
  process.exit(0);
}

process.on("SIGINT", () => {
  teardown({ quiet: true });
  process.exit(130);
});

// ── 1 · the copy ────────────────────────────────────────────────────────────

async function main() {
  log("1/8 copy HEAD into a throwaway tree", WORK);
  mkdirSync(WORK, { recursive: true });
  // `git archive` reads the committed tree, so the copy can never contain an
  // accidental local edit — and the original worktree is never written to.
  const tar = execFileSync("git", ["archive", "HEAD"], {
    cwd: REPO,
    maxBuffer: 1024 * 1024 * 512,
  });
  const tarPath = join(tmpdir(), `circulos-e2e-${RUN}.tar`);
  writeFileSync(tarPath, tar);
  sh("tar", ["-x", "-f", tarPath, "-C", WORK], { quiet: true });
  rmSync(tarPath, { force: true });

  // ── 2 · the fixture, applied EXPLICITLY and verified ─────────────────────

  log("2/8 apply the synthetic catalog to the copy");
  cpSync(
    join(HERE, "fixtures/circles-e2e-fixture.ts"),
    join(WORK, "packages/types/src/circles-e2e-fixture.ts"),
  );

  /** Replace exactly once, or fail loudly. A silent no-op is the thing to avoid. */
  function patch(relPath, find, replace) {
    const file = join(WORK, relPath);
    const before = readFileSync(file, "utf8");
    const hits = before.split(find).length - 1;
    if (hits !== 1) {
      throw new Error(
        `catalog patch did not match exactly once (${hits}) in ${relPath}`,
      );
    }
    const after = before.replace(find, replace);
    if (after === before) throw new Error(`patch was a no-op in ${relPath}`);
    writeFileSync(file, after);
  }

  // The fixture imports `@psico/types` where it lives, so it typechecks inside
  // `apps/web`. Here it becomes a sibling of `circles.ts` inside that very
  // package, which cannot import itself by name.
  patch(
    "packages/types/src/circles-e2e-fixture.ts",
    'from "@psico/types"',
    'from "./circles"',
  );

  patch(
    "packages/types/src/circles-catalog.ts",
    "export const PRODUCTION_CIRCLE_TEMPLATES: readonly CircleActivityDefinition[] =\n  [];",
    'import { E2E_DUO_TEMPLATE } from "./circles-e2e-fixture";\n\n' +
      "export const PRODUCTION_CIRCLE_TEMPLATES: readonly CircleActivityDefinition[] =\n" +
      "  [E2E_DUO_TEMPLATE];",
  );

  patch(
    "apps/web/src/lib/circulos/eligibility.ts",
    "export const PRODUCTION_DUO_ELIGIBILITY: readonly DuoEligibilityMapping[] = [];",
    "export const PRODUCTION_DUO_ELIGIBILITY: readonly DuoEligibilityMapping[] = [\n" +
      "  {\n" +
      '    experienceKey: "eec-c1-cuerpo-antes-que-mente",\n' +
      "    experienceVersion: 1,\n" +
      '    templateKey: "e2e-duo-sintetica",\n' +
      "    templateVersion: 1,\n" +
      "  },\n" +
      "];",
  );

  // The scope ratchets in the copy would now fail BY DESIGN — they assert the
  // catalog is empty, and here it deliberately is not. They are not run from
  // the copy; they run against the repository, where they still hold.
  log("   patched", "2 catalog points + 1 fixture module");

  // ── 3 · dependencies and build ───────────────────────────────────────────

  log("3/8 install dependencies in the copy");
  sh("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], {
    cwd: WORK,
  });

  log("4/8 build the API and its workspace dependencies (production build)");
  // `@psico/api...` — the trailing dots pull in the workspace packages it
  // depends on. Building only `@psico/types` was not enough: `nest build`
  // typechecks the whole app, and a spec there imports `@psico/crypto`, whose
  // declarations do not exist until that package is built.
  sh("pnpm", ["--filter", "@psico/api...", "build"], { cwd: WORK });

  // ── 4 · isolated stores ──────────────────────────────────────────────────

  log("5/8 start isolated PostgreSQL and Redis");
  const pgPort = await freePort();
  const redisPort = await freePort();
  sh(
    "docker",
    [
      "run", "-d", "--name", PG,
      "-e", "POSTGRES_PASSWORD=postgres",
      "-e", "POSTGRES_USER=postgres",
      "-e", `POSTGRES_DB=circulos_e2e_${RUN}`,
      "-p", `${pgPort}:5432`,
      "pgvector/pgvector:pg16",
    ],
    { quiet: true },
  );
  sh(
    "docker",
    ["run", "-d", "--name", REDIS, "-p", `${redisPort}:6379`, "redis:7-alpine"],
    { quiet: true },
  );

  await waitFor(
    () => {
      try {
        execFileSync("docker", ["exec", PG, "pg_isready", "-U", "postgres"], {
          stdio: "pipe",
        });
        return true;
      } catch {
        return false;
      }
    },
    60_000,
    "PostgreSQL to accept connections",
  );

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/circulos_e2e_${RUN}`;
  const redisUrl = `redis://127.0.0.1:${redisPort}`;

  log("6/8 apply migrations");
  sh("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: join(WORK, "apps/api"),
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_SKIP_SEED: "1" },
  });

  // ── 5 · services ─────────────────────────────────────────────────────────

  const apiPort = await freePort();
  const webPort = await freePort();

  const sharedEnv = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    JWT_SECRET: randomBytes(32).toString("hex"),
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    // The pilot is ON in this throwaway environment, which is the only place
    // that is ever true.
    CIRCLES_ROLLOUT_MODE: "on",
    // The Dúo is reached from a guide surface, so Guide V1 has to be reachable
    // too. `on` rather than `pilot`: the walk registers fresh accounts every
    // run, and an allowlist of ids that do not exist yet cannot be written.
    GUIDE_ROLLOUT_MODE: "on",
    // `CIRCLES_KEY_ENV` — a fresh 32-byte key per run, so envelopes written by
    // one run are unreadable by the next even if a database somehow outlived it.
    CIRCLES_SHARED_DATA_KEY_V1: randomBytes(32).toString("base64"),
    CLIENT_ATTESTATION_SECRET: randomBytes(32).toString("hex"),
    STRIPE_SECRET_KEY: "sk_test_e2e",
    STRIPE_WEBHOOK_SECRET: "whsec_e2e",
    DEFAULT_PAYMENT_PROVIDER: "stripe",
    // The env schema requires every integration the platform can use, not just
    // the ones a given walk touches. These are placeholders in the literal
    // sense: obviously-fake strings that let the process boot. Nothing in the
    // Dúo calls storage, the LLM, embeddings or billing, so no request is ever
    // made with them — and if some future code path did reach for one, it
    // would fail loudly against a nonexistent host rather than quietly
    // charging or writing somewhere real.
    R2_ACCOUNT_ID: "e2e-not-a-real-account",
    R2_ACCESS_KEY_ID: "e2e-not-a-real-key",
    R2_SECRET_ACCESS_KEY: "e2e-not-a-real-secret",
    R2_BUCKET_NAME: "e2e-not-a-real-bucket",
    ANTHROPIC_API_KEY: "sk-ant-e2e-not-a-real-key",
    VOYAGE_API_KEY: "e2e-not-a-real-key",
    // Conditional: the schema demands this one because VOICE_PROVIDER defaults
    // to whisper. Same reasoning as above.
    OPENAI_API_KEY: "sk-e2e-not-a-real-key",
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_e2e_monthly",
    STRIPE_PRO_YEARLY_PRICE_ID: "price_e2e_yearly",
    STRIPE_B2B_PRICE_ID: "price_e2e_b2b",
    APP_URL: `http://127.0.0.1:${webPort}`,
    ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`,

    // ── The emotional-map safety barriers ───────────────────────────────────
    //
    // NODE_ENV=production puts `assertEmotionalMapConfigured` on its strict
    // path: epochs and critical flags must be stated explicitly or the process
    // refuses to boot. That is the posture the real deployment runs under, so
    // the walk runs under it too rather than declaring PSICO_ENV=test and
    // quietly switching every barrier off.
    //
    // Each value below is the one `CRITICAL_FLAGS` REQUIRES in a deployed
    // environment — this states the required decision, it does not relax it.
    // A wrong value here would refuse to boot exactly as production would.
    EMOTIONAL_MAP_CACHE_EPOCH: "1",
    EMOTIONAL_MAP_FACTS_EPOCH: "1",
    EMOTIONAL_MAP_V2: "on",
    EMOTIONAL_MAP_LEGACY_UI: "off",
    EMOTIONAL_MAP_LLM_SCORING: "off",
    EMOTIONAL_MAP_EWS_PUBLIC: "off",
    EMOTIONAL_MAP_NARRATOR: "off",
    CONTENT_RESONANCE: "off",
    // Declared, not fixed: these two have no required value, but a deployed box
    // must say which one it chose.
    EMOTIONAL_MAP_OU: "on",
    EMOTIONAL_MAP_PUBLIC: "on",
  };

  log("7/8 start API, worker and Web");
  start("api", "node", ["apps/api/dist/main"], {
    cwd: WORK,
    env: { ...sharedEnv, PORT: String(apiPort) },
  });
  start("worker", "node", ["apps/api/dist/worker"], {
    cwd: WORK,
    env: sharedEnv,
  });

  await waitFor(
    async () => (await probe(`http://127.0.0.1:${apiPort}/health`)) === 200,
    120_000,
    "the API to report healthy",
    () => `\n── api log ──\n${serviceLog("api")}\n── worker log ──\n${serviceLog("worker", 20)}`,
  );

  // Web is built AFTER the API is up, because its build reads nothing from it
  // but its runtime needs the URL baked in.
  sh("pnpm", ["--filter", "@psico/web...", "build"], {
    cwd: WORK,
    env: {
      ...sharedEnv,
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
    },
  });
  start("web", "pnpm", ["--filter", "@psico/web", "exec", "next", "start", "-p", String(webPort)], {
    cwd: WORK,
    env: {
      ...sharedEnv,
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
      PORT: String(webPort),
    },
  });

  await waitFor(
    async () => (await probe(`http://127.0.0.1:${webPort}/login`)) === 200,
    120_000,
    "the Web app to serve",
    () => `\n── web log ──\n${serviceLog("web")}`,
  );

  const state = {
    runId: RUN,
    work: WORK,
    apiUrl: `http://127.0.0.1:${apiPort}`,
    webUrl: `http://127.0.0.1:${webPort}`,
    databaseUrl,
    redisUrl,
    pgContainer: PG,
    redisContainer: REDIS,
    templateKey: "e2e-duo-sintetica",
  };
  writeFileSync(STATE, JSON.stringify(state, null, 2));

  log("8/8 stack is up");
  console.log(`   web    ${state.webUrl}`);
  console.log(`   api    ${state.apiUrl}`);
  console.log(`   run id ${RUN}`);

  if (KEEP) {
    console.log(
      `\n✔ kept for exploration. Tear it down with:\n` +
        `    node apps/web/e2e/circulos/stack.mjs --down ${RUN}\n`,
    );
    return;
  }

  log("running the walk");
  // A plain Node script, like every other walk in `apps/web/e2e/`. It imports
  // `playwright` (which is installed) rather than `@playwright/test` (which is
  // not, in any workspace) — so the walk needs no new dependency and no change
  // to the lockfile.
  sh("node", ["apps/web/e2e/circulos/duo.walk.mjs"], {
    cwd: REPO,
    env: {
      ...process.env,
      CIRCULOS_E2E_STATE: STATE,
      CIRCULOS_E2E_WEB: state.webUrl,
      CIRCULOS_E2E_API: state.apiUrl,
      CIRCULOS_E2E_PG_CONTAINER: PG,
      CIRCULOS_E2E_PG_DATABASE: `circulos_e2e_${RUN}`,
    },
  });
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Start a long-running service, writing its output to a file.
 *
 * A FILE rather than a pipe to this process, because piping ties the child's
 * life to ours: under `--keep` the parent exits by design, the read end of the
 * pipe closes, and the next line the service logs kills it with EPIPE. The
 * stack would come up, report itself healthy, and be dead a moment later.
 *
 * `unref` completes the separation — the parent is free to exit without
 * waiting on a service it deliberately left running.
 */
function start(name, cmd, cmdArgs, opts) {
  mkdirSync(LOGS, { recursive: true });
  const logPath = join(LOGS, `${name}.log`);
  const fd = openSync(logPath, "a");
  const child = spawn(cmd, cmdArgs, {
    ...opts,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  children.push(child);
  logPaths.set(name, logPath);
  return child;
}

/** The tail of a service's log — how a boot failure gets explained. */
function serviceLog(name, lines = 40) {
  const path = logPaths.get(name);
  if (!path || !existsSync(path)) return `(no log for ${name})`;
  return readFileSync(path, "utf8").split("\n").slice(-lines).join("\n");
}

async function probe(url) {
  try {
    const res = await fetch(url);
    return res.status;
  } catch {
    return 0;
  }
}

async function waitFor(check, timeoutMs, what, explain) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  // A bare timeout says only that something did not happen. The service's own
  // log says WHY, and it is the difference between a diagnosis and a guess.
  throw new Error(
    `timed out after ${timeoutMs}ms waiting for ${what}${explain ? explain() : ""}`,
  );
}

main()
  .then(() => {
    if (!KEEP) teardown();
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n✖ ${err.message}`);
    // Print the services' own logs BEFORE teardown removes them. A failed walk
    // says what the browser saw; the API log says what the server decided, and
    // without it the next step is always to re-run the whole thing just to
    // look.
    for (const name of ["api", "worker", "web"]) {
      if (logPaths.has(name)) {
        console.error(`\n── ${name} log (tail) ──\n${serviceLog(name, 30)}`);
      }
    }
    teardown({ quiet: true });
    process.exit(1);
  });
