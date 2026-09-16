#!/usr/bin/env node
/**
 * The Círculos end-to-end stack: a throwaway copy of a COMMIT, built and run.
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
 * So nothing in the shipped source changes. This script copies the COMMITTED
 * tree, appends the synthetic fixture to the catalog THERE, builds that tree
 * for production, and runs it. The repository's catalog carries only what
 * somebody approved, and its ratchets keep asserting so.
 *
 * It used to rewrite three more lines — publishing `@2`, archiving `@1`, moving
 * the eligibility mapping — because the repository shipped `@2` as a DRAFT.
 * Jorge approved it after walking it here, so the repository publishes it now
 * and those patches were removed: `patch()` refuses a find string that matches
 * nothing, and leaving them would have stopped every run.
 *
 * ── One tree, not two ──────────────────────────────────────────────────────
 *
 * The fixture, the walk and the sources under test ALL come from the archived
 * commit. An earlier cut copied the fixture from the working tree and ran the
 * walk from the repository while building the archive — so a local edit to
 * either could change the result without changing what was supposedly tested.
 * `HEAD_SHA` is printed, and the harness refuses to run against a dirty
 * harness directory unless told to (`--dirty-ok`), because silently testing
 * something other than the named commit is the failure this guards.
 *
 * ── What it owns, and what it refuses to touch ─────────────────────────────
 *
 * Every resource carries this run's id: the work tree, both containers, both
 * databases, the log directory. The run writes a state file recording the
 * services it started — pid, process group and START TIME — so a later
 * `--down` can prove a pid is still the process this run spawned before it
 * signals anything. Teardown removes what that file names and nothing else: it
 * never kills by pattern, never drops a container it did not create, and never
 * reuses a name it did not choose.
 *
 * Usage:
 *   node apps/web/e2e/circulos/stack.mjs              # build, walk, tear down
 *   node apps/web/e2e/circulos/stack.mjs --keep       # leave it up to explore
 *   node apps/web/e2e/circulos/stack.mjs --down <runId>
 *   node apps/web/e2e/circulos/stack.mjs --run-id <10 hex>   # name it up front
 *   node apps/web/e2e/circulos/stack.mjs --worktree          # build local edits
 *   node apps/web/e2e/circulos/stack.mjs --prepare-only <dir> # emit the artifact
 *   node apps/web/e2e/circulos/stack.mjs --dirty-ok   # test the working tree
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
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

import {
  ownedResources,
  planTeardown,
  readProcessStart,
} from "./ownership.mjs";
import { redactDiagnostics } from "./redact.mjs";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO = resolve(HERE, "../../../..");

const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const DIRTY_OK = args.includes("--dirty-ok");
/**
 * Build the WORKING TREE instead of the commit.
 *
 * For negative controls, which break production source on purpose and need the
 * stack to run the broken version. `git stash create` writes a commit object
 * for the current tracked state WITHOUT touching the working tree or the stash
 * list, so the archive step stays exactly the same — it just points at a
 * different tree-ish. The run is then evidence about that tree, not a commit,
 * and says so.
 */
const WORKTREE = args.includes("--worktree");
/**
 * Prepare the patched copy at a named directory and stop.
 *
 * The hosted test environment needs exactly what this script already builds —
 * the commit plus the synthetic catalog — but as an artifact a deploy can
 * upload, not a stack this process runs. Reusing the same archive-and-patch
 * path keeps one mechanism: there is no second place where a fixture could be
 * applied differently, and no second place to audit.
 */
const PREPARE_AT =
  args.indexOf("--prepare-only") >= 0
    ? args[args.indexOf("--prepare-only") + 1]
    : null;
const DOWN_AT = args.indexOf("--down");

/**
 * The run id, which every resource this run owns is named after.
 *
 * `--run-id` exists for CI: a cancelled job never reaches the line that would
 * print a randomly chosen id, so its cleanup step would have nothing to tear
 * down and would have to sweep by pattern — killing whatever else happened to
 * match. A caller that names the run up front can always clean up exactly it.
 */
const RUN_ID_AT = args.indexOf("--run-id");
const RUN =
  DOWN_AT >= 0
    ? args[DOWN_AT + 1]
    : RUN_ID_AT >= 0
      ? args[RUN_ID_AT + 1]
      : randomBytes(5).toString("hex");
if (!/^[0-9a-f]{10}$/.test(RUN ?? "")) {
  console.error(`refusing an unsafe run id: ${RUN}`);
  process.exit(2);
}

const WORK = join(tmpdir(), `circulos-e2e-${RUN}`);
const PG = `circulos-e2e-pg-${RUN}`;
const REDIS = `circulos-e2e-redis-${RUN}`;
const STATE = join(tmpdir(), `circulos-e2e-${RUN}.json`);
const LOGS = join(tmpdir(), `circulos-e2e-${RUN}-logs`);

/** Everything this run owns. Written to STATE so `--down` can find it. */
const owned = {
  runId: RUN,
  headSha: null,
  work: WORK,
  logs: LOGS,
  containers: [],
  services: [],
};

/** service name → its log file, so a boot failure can be explained. */
const logPaths = new Map();

function log(step, detail = "") {
  console.log(`\n▸ ${step}${detail ? ` — ${detail}` : ""}`);
}

function sh(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    encoding: "utf8",
    stdio: opts.quiet ? "pipe" : "inherit",
    ...opts,
  });
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

// ── Process identity ────────────────────────────────────────────────────────

/**
 * When this pid started, as the OS reports it.
 *
 * A pid alone is not an identity: pids are recycled, and `--down` runs in a
 * DIFFERENT process minutes or hours later. Signalling a bare recorded pid is
 * how a cleanup script kills somebody's editor. The start time makes the pair
 * (pid, lstart) effectively unique, and a mismatch means the pid was reused and
 * this run's process is already gone.
 */
function startedAt(pid) {
  try {
    const out = execFileSync(
      "ps",
      ["-p", String(pid), "-o", "state=,lstart="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return readProcessStart(out);
  } catch {
    return null; // not running
  }
}

function isAlive(pid) {
  return startedAt(pid) !== null;
}

function persistState() {
  try {
    writeFileSync(STATE, JSON.stringify(owned, null, 2));
  } catch {
    /* a state file we cannot write is not a reason to fail the run */
  }
}

// ── Teardown ────────────────────────────────────────────────────────────────

/**
 * Stop what this run owns, wait for it to be gone, then delete its files.
 *
 * Order matters: a directory removed while a service is still running produces
 * a process reading a tree that is disappearing under it, and logs that stop
 * mid-sentence. Services die first and are WAITED for; only then do the files go.
 *
 * Idempotent by construction — every step tolerates "already gone", so a second
 * `--down` is a no-op rather than an error, and a partially cleaned run
 * finishes cleaning.
 */
function teardown(state = owned, { quiet = false } = {}) {
  if (!quiet) log("teardown", state.runId ?? RUN);

  const stopped = [];
  const skipped = [];

  // The DECISION lives in `ownership.mjs` and is tested there; this function
  // only carries it out.
  for (const { service, action } of planTeardown(state, startedAt)) {
    if (action === "gone") {
      stopped.push(`${service.name} (already gone)`);
      continue;
    }
    if (action === "spare") {
      // The pid is alive but it is NOT the process we started. Somebody else
      // owns it now. Leaving it alone is the entire point of recording lstart.
      skipped.push(
        `${service.name} pid=${service.pid} (pid reused — not ours)`,
      );
      continue;
    }
    // The negative pid signals the whole process group. Services are spawned
    // detached, so each is its own group leader and its children (next-server,
    // pnpm's node) go with it instead of being orphaned.
    for (const signal of ["SIGTERM", "SIGKILL"]) {
      try {
        process.kill(-service.pid, signal);
      } catch {
        try {
          process.kill(service.pid, signal);
        } catch {
          /* gone between the check and the signal */
        }
      }
      const deadline = Date.now() + (signal === "SIGTERM" ? 10_000 : 5_000);
      while (Date.now() < deadline && isAlive(service.pid)) {
        // Busy-wait deliberately: teardown also runs from signal handlers and
        // from `process.on("exit")`, where nothing asynchronous can complete.
        try {
          execFileSync("sleep", ["0.1"], { stdio: "ignore" });
        } catch {
          /* sleep is not essential to the loop */
        }
      }
      if (!isAlive(service.pid)) break;
    }
    stopped.push(
      `${service.name} ${isAlive(service.pid) ? "STILL RUNNING" : "stopped"}`,
    );
  }

  const owned = ownedResources(state);
  for (const name of owned.containers) {
    try {
      execFileSync("docker", ["rm", "-f", name], { stdio: "pipe" });
    } catch {
      /* never existed, or already removed */
    }
  }

  for (const dir of owned.directories) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  const stateFile = join(tmpdir(), `circulos-e2e-${state.runId ?? RUN}.json`);
  if (existsSync(stateFile)) rmSync(stateFile, { force: true });

  if (!quiet) {
    for (const line of stopped) console.log(`   ${line}`);
    for (const line of skipped) console.log(`   ⚠ ${line}`);
  }
  return { stopped, skipped };
}

// ── `--down`: tear down a run this process did not start ────────────────────

if (DOWN_AT >= 0) {
  if (!existsSync(STATE)) {
    // Idempotent: a run already cleaned up, or one that never wrote state.
    // Still sweep the names this run id implies, so a crash between `docker
    // run` and the first state write cannot strand a container.
    teardown({ runId: RUN, work: WORK, logs: LOGS, containers: [PG, REDIS] });
    console.log(`\n✔ run ${RUN}: nothing left to clean`);
    process.exit(0);
  }
  const saved = JSON.parse(readFileSync(STATE, "utf8"));
  teardown(saved);
  console.log(`\n✔ run ${RUN} cleaned up`);
  process.exit(0);
}

// ── Signals ─────────────────────────────────────────────────────────────────

let tornDown = false;
function teardownOnce(opts) {
  if (tornDown || KEEP) return;
  tornDown = true;
  teardown(owned, opts);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    // A kept stack is deliberately outlived by this process; anything else is
    // cleaned up before we go.
    teardownOnce({ quiet: true });
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

// ── The synthetic environment ───────────────────────────────────────────────

/**
 * The ONLY variables a service inherits from this shell.
 *
 * Not `...process.env`. A developer's shell routinely carries `DATABASE_URL`,
 * `REDIS_URL`, `STRIPE_SECRET_KEY` or a Railway token, and a service that
 * inherits one of those is a test run holding a production credential — or,
 * worse, pointed at a production store while believing it is isolated. Every
 * value the stack needs is stated explicitly below; everything else is dropped.
 */
function baseEnv() {
  const allowed = ["PATH", "HOME", "SHELL", "LANG", "LC_ALL", "TMPDIR", "TERM"];
  const out = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  return out;
}

// ── The run ─────────────────────────────────────────────────────────────────

async function main() {
  // ── 0 · which commit, exactly ────────────────────────────────────────────

  const headSha = sh("git", ["rev-parse", "HEAD"], {
    cwd: REPO,
    quiet: true,
  }).trim();
  owned.headSha = headSha;

  // The harness has to be the one in the commit, or the run proves nothing
  // about that commit. `git status --porcelain` on the harness directory is
  // the cheap, exact question.
  const dirty = sh(
    "git",
    ["status", "--porcelain", "--", "apps/web/e2e/circulos"],
    { cwd: REPO, quiet: true },
  ).trim();
  if (dirty && !DIRTY_OK && !WORKTREE) {
    throw new Error(
      "the E2E harness has uncommitted changes, so a run would NOT be testing " +
        `${headSha.slice(0, 8)}:\n${dirty}\n\n` +
        "Commit them, or pass --dirty-ok to run the working tree knowingly " +
        "(the run is then not evidence about any commit).",
    );
  }

  log(
    "1/8 copy the commit into a throwaway tree",
    `${headSha.slice(0, 8)} → ${WORK}`,
  );
  if (dirty) {
    console.log(
      "   ⚠ --dirty-ok: the harness directory differs from the commit.\n" +
        "     The BUILD still comes from the commit, so those edits are NOT in it.",
    );
  }
  mkdirSync(WORK, { recursive: true });
  persistState();

  // `git archive` reads the committed tree, so the copy can never contain an
  // accidental local edit — and the original worktree is never written to.
  // `--worktree` archives the CURRENT tracked state; otherwise the commit.
  //
  // Through a TEMPORARY INDEX rather than `git stash create`. `stash create`
  // has a "nothing to stash" path whose behaviour depends on the tree being
  // dirty, and the negative control that uses this flag runs it three times —
  // mutated, then RESTORED, i.e. clean. Both times it failed on the clean run,
  // and the control reported "did not return to green" about a harness that had
  // never started.
  //
  // `read-tree` + `add -u` + `write-tree` has no such path: it writes a tree
  // object for exactly what is on disk, and on a clean tree that IS HEAD's
  // tree. The index it uses is its own file, so the repository's real index is
  // never touched.
  const treeish = WORKTREE ? writeWorktreeTree() : headSha;
  if (WORKTREE) {
    owned.headSha = treeish === headSha ? headSha : `${headSha}+worktree`;
    persistState();
    console.log(
      "   ⚠ --worktree: building the WORKING TREE, not the commit.\n" +
        "     This run is evidence about that tree only.",
    );
  }
  const tar = execFileSync("git", ["archive", treeish], {
    cwd: REPO,
    maxBuffer: 1024 * 1024 * 512,
  });
  const tarPath = join(tmpdir(), `circulos-e2e-${RUN}.tar`);
  writeFileSync(tarPath, tar);
  sh("tar", ["-x", "-f", tarPath, "-C", WORK], { quiet: true });
  rmSync(tarPath, { force: true });

  // `--dirty-ok` has to mean what it says. Leaving the archived harness in
  // place would run the COMMITTED walk while the author believes their edits
  // are being exercised — a quieter version of exactly the mixture this
  // refuses. So the working copy of the harness is laid over the archive, and
  // the banner says the run is no longer evidence about a commit.
  if (dirty && !WORKTREE) {
    cpSync(
      join(REPO, "apps/web/e2e/circulos"),
      join(WORK, "apps/web/e2e/circulos"),
      { recursive: true },
    );
    owned.headSha = `${headSha}+dirty-harness`;
    persistState();
  }

  // ── 2 · the fixture, applied EXPLICITLY and verified ─────────────────────

  log("2/8 apply the synthetic catalog to the copy");

  // From the ARCHIVE, not from `HERE`. Copying the working tree's fixture into
  // a build of the commit is how a run ends up testing a mixture of the two.
  const fixtureInArchive = join(
    WORK,
    "apps/web/e2e/circulos/fixtures/circles-e2e-fixture.ts",
  );
  if (!existsSync(fixtureInArchive)) {
    throw new Error(
      `the archived commit has no E2E fixture at ${fixtureInArchive}`,
    );
  }
  cpSync(
    fixtureInArchive,
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

  // The fixture is APPENDED to the approved catalog, not substituted for an
  // empty one. Both matter now: scenarios that name `e2e-duo-sintetica` by key
  // keep working, and the browser walk — which enters through the reading
  // surface — runs on `duo-lo-que-me-ayuda`, the template people will use.
  patch(
    "packages/types/src/circles-catalog.ts",
    "export const PRODUCTION_CIRCLE_TEMPLATES: readonly CircleActivityDefinition[] =\n  [",
    'import { E2E_DUO_TEMPLATE } from "./circles-e2e-fixture";\n\n' +
      "export const PRODUCTION_CIRCLE_TEMPLATES: readonly CircleActivityDefinition[] =\n" +
      "  [\n    E2E_DUO_TEMPLATE,",
  );

  // ── The candidate is no longer a candidate ───────────────────────────────
  //
  // This block used to flip `duo-lo-que-me-ayuda@2` to PUBLISHED, archive @1
  // and move the eligibility mapping, because the repository shipped @2 as a
  // DRAFT and the walk needed something to walk through.
  //
  // Jorge approved @2 after walking it end to end here, so the repository now
  // publishes it: @2 PUBLISHED, @1 ARCHIVED, the mapping on @2. Those three
  // patches became no-ops and were removed rather than left to fail — `patch()`
  // refuses a find string that matches nothing, which is exactly right and
  // would have stopped every run.
  //
  // What remains is the one patch that still has work to do: appending the
  // synthetic fixture, which never ships. The build is still NOT publishable
  // for that reason alone.

  // The scope ratchets in the copy would now fail BY DESIGN — they assert the
  // catalog is empty, and here it deliberately is not. They are not run from
  // the copy; they run against the repository, where they still hold.
  //
  // This build is therefore NOT publishable and never leaves the temp tree:
  // nothing here is pushed to a registry, uploaded, or reused as an artifact.
  log("   patched", "1 point + 1 fixture module (build is NOT publishable)");

  if (PREPARE_AT) {
    // The artifact is the point; nothing is installed, built or started here.
    // It is deliberately NOT byte-identical to the source commit — it carries
    // the fixture — so the caller is told both the source and what changed.
    const digest = (rel) =>
      createHash("sha256")
        .update(readFileSync(join(WORK, rel)))
        .digest("hex");
    const manifest = {
      preparedAt: new Date().toISOString(),
      sourceSha: headSha,
      dirtyHarness: Boolean(dirty),
      fixture: {
        path: "packages/types/src/circles-e2e-fixture.ts",
        sha256: digest("packages/types/src/circles-e2e-fixture.ts"),
      },
      patched: [
        {
          path: "packages/types/src/circles-catalog.ts",
          sha256: digest("packages/types/src/circles-catalog.ts"),
        },
        {
          path: "apps/web/src/lib/circulos/eligibility.ts",
          sha256: digest("apps/web/src/lib/circulos/eligibility.ts"),
        },
      ],
      // The fixture the harness may still name by key.
      templateKey: "e2e-duo-sintetica",
      templateVersion: 1,
      // What the reading surface actually offers, and therefore what the
      // browser walk exercises.
      surfaceTemplateKey: "duo-lo-que-me-ayuda",
      surfaceTemplateVersion: 2,
    };
    writeFileSync(
      join(WORK, "circulos-test-artifact.json"),
      JSON.stringify(manifest, null, 2),
    );
    if (existsSync(PREPARE_AT))
      rmSync(PREPARE_AT, { recursive: true, force: true });
    cpSync(WORK, PREPARE_AT, { recursive: true });
    rmSync(WORK, { recursive: true, force: true });
    rmSync(STATE, { force: true });
    log("prepared", PREPARE_AT);
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  // ── 3 · dependencies and build ───────────────────────────────────────────

  log("3/8 install dependencies in the copy (frozen lockfile)");
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

  log("5/8 start isolated PostgreSQL and Redis (loopback only)");
  const pgPort = await freePort();
  const redisPort = await freePort();
  const dbName = `circulos_e2e_${RUN}`;

  // `127.0.0.1:` on the published port, so a test store carrying synthetic
  // accounts is never reachable from the network the machine is on.
  sh(
    "docker",
    [
      "run",
      "-d",
      "--name",
      PG,
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "-e",
      "POSTGRES_USER=postgres",
      "-e",
      `POSTGRES_DB=${dbName}`,
      "-p",
      `127.0.0.1:${pgPort}:5432`,
      "pgvector/pgvector:pg16",
    ],
    { quiet: true },
  );
  owned.containers.push(PG);
  persistState();

  sh(
    "docker",
    [
      "run",
      "-d",
      "--name",
      REDIS,
      "-p",
      `127.0.0.1:${redisPort}:6379`,
      "redis:7-alpine",
    ],
    { quiet: true },
  );
  owned.containers.push(REDIS);
  persistState();

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

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/${dbName}`;
  const redisUrl = `redis://127.0.0.1:${redisPort}`;

  log("6/8 apply migrations");
  sh("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: join(WORK, "apps/api"),
    env: { ...baseEnv(), DATABASE_URL: databaseUrl, PRISMA_SKIP_SEED: "1" },
  });

  // ── 5 · services ─────────────────────────────────────────────────────────

  const apiPort = await freePort();
  const webPort = await freePort();

  const sharedEnv = {
    ...baseEnv(),
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

  const apiOffPort = await freePort();

  log("7/8 start API, worker and Web");
  start("api", "node", ["apps/api/dist/main"], {
    cwd: WORK,
    env: { ...sharedEnv, PORT: String(apiPort) },
  });
  start("worker", "node", ["apps/api/dist/worker"], {
    cwd: WORK,
    env: sharedEnv,
  });

  // A SECOND API from the same build, with the rollout off.
  //
  // `CirclesRolloutService` resolves the mode once at boot and never re-reads
  // it, deliberately, so "a mid-flight env change cannot half-open a surface".
  // The consequence is that `off` can only be observed on a process that booted
  // with it — there is no runtime switch to flip, and adding one to make the
  // test easier would remove the property the test is checking.
  start("api-off", "node", ["apps/api/dist/main"], {
    cwd: WORK,
    env: {
      ...sharedEnv,
      PORT: String(apiOffPort),
      CIRCLES_ROLLOUT_MODE: "off",
    },
  });

  await waitFor(
    async () => (await probe(`http://127.0.0.1:${apiPort}/health`)) === 200,
    120_000,
    "the API to report healthy",
    () =>
      `\n── api log ──\n${serviceLog("api")}\n── worker log ──\n${serviceLog("worker", 20)}`,
  );

  await waitFor(
    async () => (await probe(`http://127.0.0.1:${apiOffPort}/health`)) === 200,
    120_000,
    "the off-mode API to report healthy",
    () => `\n── api-off log ──\n${serviceLog("api-off")}`,
  );

  // Web is built AFTER the API is up, because its build reads nothing from it
  // but its runtime needs the URL baked in.
  sh("pnpm", ["--filter", "@psico/web...", "build"], {
    cwd: WORK,
    env: { ...sharedEnv, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}` },
  });
  start(
    "web",
    "pnpm",
    ["--filter", "@psico/web", "exec", "next", "start", "-p", String(webPort)],
    {
      cwd: WORK,
      env: {
        ...sharedEnv,
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
        PORT: String(webPort),
      },
    },
  );

  await waitFor(
    async () => (await probe(`http://127.0.0.1:${webPort}/login`)) === 200,
    120_000,
    "the Web app to serve",
    () => `\n── web log ──\n${serviceLog("web")}`,
  );

  owned.apiUrl = `http://127.0.0.1:${apiPort}`;
  owned.apiOffUrl = `http://127.0.0.1:${apiOffPort}`;
  owned.webUrl = `http://127.0.0.1:${webPort}`;
  owned.databaseUrl = databaseUrl;
  owned.redisUrl = redisUrl;
  owned.pgContainer = PG;
  owned.pgDatabase = dbName;
  owned.templateKey = "e2e-duo-sintetica";
  persistState();

  log("8/8 stack is up");
  console.log(`   commit ${headSha}`);
  console.log(`   web    ${owned.webUrl}`);
  console.log(`   api    ${owned.apiUrl}`);
  console.log(`   run id ${RUN}`);

  if (KEEP) {
    console.log(
      `\n✔ kept for exploration. Tear it down with:\n` +
        `    node apps/web/e2e/circulos/stack.mjs --down ${RUN}\n`,
    );
    return;
  }

  log("running the walk", `from the archived commit ${headSha.slice(0, 8)}`);
  // Run the walk FROM THE ARCHIVE, so the harness under test is the committed
  // one — and so `playwright` resolves from the copy's own `node_modules`,
  // installed from the frozen lockfile, rather than from whatever happens to
  // be on this machine.
  sh("node", ["apps/web/e2e/circulos/duo.walk.mjs"], {
    cwd: WORK,
    env: {
      ...baseEnv(),
      CIRCULOS_E2E_WEB: owned.webUrl,
      CIRCULOS_E2E_API: owned.apiUrl,
      CIRCULOS_E2E_API_OFF: owned.apiOffUrl,
      CIRCULOS_E2E_PG_CONTAINER: PG,
      CIRCULOS_E2E_PG_DATABASE: dbName,
      CIRCULOS_E2E_WORK: WORK,
      CIRCULOS_E2E_REDIS_URL: redisUrl,
      CIRCULOS_E2E_HEAD_SHA: headSha,
      // Forwarded because `baseEnv()` is an allowlist and this is a caller's
      // instruction, not ambient configuration: a negative control that names
      // one scenario runs that scenario three times instead of running fifteen
      // three times. Unset — which is every full run, including CI — means all
      // of them, so the default is not narrowed by having the option.
      ...(process.env.CIRCULOS_E2E_ONLY
        ? { CIRCULOS_E2E_ONLY: process.env.CIRCULOS_E2E_ONLY }
        : {}),
      // Playwright's browsers live in the user's cache, not in the copy.
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "",
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
 * `detached` puts each service in its own process group, so teardown can take
 * the whole group and leave no orphaned `next-server` behind; `unref` frees the
 * parent to exit without waiting on a service it deliberately left running.
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
  logPaths.set(name, logPath);
  owned.services.push({
    name,
    pid: child.pid,
    // Recorded NOW, while we know the pid is ours. `--down` compares against
    // this before signalling anything.
    lstart: startedAt(child.pid),
    log: logPath,
  });
  persistState();
  return child;
}

/**
 * A tree object for the working tree's tracked state, via a throwaway index.
 *
 * Staging into a temporary `GIT_INDEX_FILE` leaves the repository's real index
 * alone — nothing the developer has staged is disturbed, and nothing this
 * writes can be committed by accident.
 */
function writeWorktreeTree() {
  const indexFile = join(tmpdir(), `circulos-e2e-${RUN}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  try {
    sh("git", ["read-tree", "HEAD"], { cwd: REPO, env, quiet: true });
    sh("git", ["add", "-u"], { cwd: REPO, env, quiet: true });
    return sh("git", ["write-tree"], { cwd: REPO, env, quiet: true }).trim();
  } finally {
    rmSync(indexFile, { force: true });
  }
}

/**
 * The tail of a service's log — how a boot failure gets explained.
 *
 * Redacted HERE rather than at each caller, because there is more than one
 * caller and the one that leaked was the one nobody was looking at: a `waitFor`
 * that explains itself with the service's log, and a failure path that prints
 * four tails at once. A choke point cannot be forgotten at a new call site.
 *
 * What leaked was an email. `RESEND_API_KEY` is unset in the harness, so the
 * notifications service prints messages instead of sending them, and a
 * verification email carries a working link. Nothing about that is specific to
 * a test: it is the same code path, printing the same shape of thing.
 */
function serviceLog(name, lines = 40) {
  const path = logPaths.get(name);
  if (!path || !existsSync(path)) return `(no log for ${name})`;
  return redactDiagnostics(
    readFileSync(path, "utf8").split("\n").slice(-lines).join("\n"),
  );
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
    teardownOnce();
    process.exit(0);
  })
  .catch((err) => {
    // The message can carry a URL the harness was navigating to, and one of
    // those URLs is the invitation with its secret in the fragment.
    console.error(`\n✖ ${redactDiagnostics(err.message)}`);
    // Print the services' own logs BEFORE teardown removes them. A failed walk
    // says what the browser saw; the API log says what the server decided, and
    // without it the next step is always to re-run the whole thing just to look.
    for (const name of ["api", "api-off", "worker", "web"]) {
      if (logPaths.has(name)) {
        console.error(`\n── ${name} log (tail) ──\n${serviceLog(name, 30)}`);
      }
    }
    // A failure cleans up exactly like a success. `--keep` is the only thing
    // that leaves a stack behind, and only when the stack actually came up.
    tornDown = false;
    teardown(owned, { quiet: true });
    tornDown = true;
    process.exit(1);
  });
