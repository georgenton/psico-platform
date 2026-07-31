/**
 * GR-3 — the release gate, start to finish, as one command.
 *
 *   EVIDENCE_ADMIN_URL=… EVIDENCE_PASSWORD=… EVIDENCE_DISPOSABLE_ACK=DROP_GR3_EVIDENCE_ONLY \
 *     node apps/web/e2e/gr3-release-gate.mjs --shots
 *
 * Why this file exists: the gate used to depend on a human having started the
 * right servers with the right environment, and on a rate limiter that had been
 * hand-cleared. That is not a reproducible gate — it is a gate that happens to
 * pass on one machine. Everything the browser run needs is now created here,
 * asserted here, and destroyed here.
 *
 * The three things that used to be manual:
 *
 *   CORS         the API is started with ALLOWED_ORIGINS set to the exact
 *                origin of E2E_BASE_URL. Without it the API answers `*` with
 *                credentials, browsers reject the preflight, and the guide
 *                honestly reports itself unavailable — a real failure caused
 *                entirely by the harness.
 *
 *   rate limit   the API is started with NO REDIS_URL, so `createRedisClient`
 *                falls back to the in-memory client the codebase already
 *                supports. The throttle counters live inside this process and
 *                die with it. Nothing is deleted from a shared Redis, because
 *                nothing shared is ever touched.
 *
 *   database     the disposable `gr3_evidence` database, created by
 *                `gr3-evidence-setup.mjs` and dropped in `finally`.
 *
 * Teardown runs even when the gate fails, and it is VERIFIED: a signal sent is
 * not a process stopped, and a drop attempted is not a database gone. The exit
 * code is `PRIMARY_GATE_PASS && TEARDOWN_PASS`, so a run that leaves something
 * behind cannot report success.
 *
 * `--keep-database` retains the database for debugging, and requires
 * `EVIDENCE_DEBUG_RETAIN_ACK=KEEP_GR3_EVIDENCE_FOR_DEBUG` — refused at startup,
 * before anything is built.
 */

import { spawn, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRetainAllowed,
  stopProcess,
  teardownDatabase,
  teardownReport,
} from "./gr3-teardown.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const API_DIR = join(REPO, "apps", "api");
const WEB_DIR = join(REPO, "apps", "web");

const API_PORT = Number(process.env.GR3_API_PORT ?? 4310);
const WEB_PORT = Number(process.env.GR3_WEB_PORT ?? 3310);
const API_ORIGIN = `http://localhost:${API_PORT}`;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const EMAIL = process.env.EVIDENCE_EMAIL ?? "gr3.shots@local.test";
const PASSWORD = process.env.EVIDENCE_PASSWORD;
const SHOTS = process.argv.includes("--shots");
const KEEP = process.argv.includes("--keep-database");
const RETAIN_ACK_ENV = process.env.EVIDENCE_DEBUG_RETAIN_ACK ?? null;
const DB_NAME = process.env.EVIDENCE_DB ?? "gr3_evidence";

function refuse(reason) {
  console.error(`refusing: ${reason}`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production") refuse("NODE_ENV=production");
if (process.env.VERCEL_ENV === "production") refuse("VERCEL_ENV=production");
if (!PASSWORD) refuse("EVIDENCE_PASSWORD is required");
if (!process.env.EVIDENCE_ADMIN_URL) refuse("EVIDENCE_ADMIN_URL is required");
// Before the database exists, not after: keeping one has to be asked for.
try {
  assertRetainAllowed({ keep: KEEP, ack: RETAIN_ACK_ENV });
} catch (err) {
  console.error(`STARTUP_REFUSED=true DATABASE_CREATED=false`);
  refuse(err.message);
}

/**
 * The API's own env, minus everything that would reach shared infrastructure.
 * `REDIS_URL` is deleted rather than overridden: absent means in-memory, and
 * an override would still be a URL pointing somewhere.
 */
function apiEnv(databaseUrl) {
  const env = { ...process.env };
  delete env.REDIS_URL;
  delete env.SENTRY_DSN;
  return {
    ...env,
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
    PORT: String(API_PORT),
    ALLOWED_ORIGINS: WEB_ORIGIN,
    GUIDE_ROLLOUT_MODE: "on",
  };
}

function databaseUrl() {
  const u = new URL(process.env.EVIDENCE_ADMIN_URL);
  u.pathname = `/${process.env.EVIDENCE_DB ?? "gr3_evidence"}`;
  return u.toString();
}

async function waitFor(url, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return res.status;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`${label} did not come up at ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function run(cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

let api = null;
let web = null;
let primaryPass = true;
let exitCode = 1;

try {
  // ── 1. The disposable database, built from THIS checkout ─────────────────
  execFileSync("node", [join(HERE, "gr3-evidence-setup.mjs")], {
    cwd: REPO,
    stdio: "inherit",
  });

  const DB_URL = databaseUrl();

  // ── 2. The API, with CORS set and no shared rate-limit store ─────────────
  api = run("node", ["dist/main.js"], { cwd: API_DIR, env: apiEnv(DB_URL) });
  const apiStatus = await waitFor(`${API_ORIGIN}/health`, "the API");
  console.log(`\napiHealth=${apiStatus} allowedOrigin=${WEB_ORIGIN}`);
  console.log("RATE_LIMIT_STORE_ISOLATED=true (in-memory, this process only)");
  console.log("SHARED_REDIS_KEYS_DELETED=false");

  // The preflight is the thing that actually broke before. Assert it.
  const preflight = await fetch(`${API_ORIGIN}/api/guide/sessions`, {
    method: "OPTIONS",
    headers: {
      Origin: WEB_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,authorization",
    },
  });
  const allowOrigin = preflight.headers.get("access-control-allow-origin");
  if (allowOrigin !== WEB_ORIGIN) {
    throw new Error(`CORS preflight returned "${allowOrigin}", expected ${WEB_ORIGIN}`);
  }
  console.log(`CORS_CONFIG_AUTOMATED=true (preflight → ${allowOrigin})`);

  // ── 3. The web app, pointed at that API ──────────────────────────────────
  web = run("pnpm", ["exec", "next", "dev", "-p", String(WEB_PORT)], {
    cwd: WEB_DIR,
    env: {
      ...process.env,
      NODE_ENV: "development",
      // The API ROOT, not `${root}/api`: the client appends the prefix itself.
      NEXT_PUBLIC_API_URL: API_ORIGIN,
    },
  });
  const webStatus = await waitFor(`${WEB_ORIGIN}/login`, "the web app", 180_000);
  console.log(`webLogin=${webStatus}\n`);

  // ── 4. The browser gate ──────────────────────────────────────────────────
  execFileSync("node", [join(HERE, "gr3-runtime.mjs"), ...(SHOTS ? ["--shots"] : [])], {
    cwd: REPO,
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_BASE_URL: WEB_ORIGIN,
      E2E_EMAIL: EMAIL,
      E2E_PASSWORD: PASSWORD,
    },
  });
} catch (err) {
  primaryPass = false;
  // Kept, and printed, even if teardown fails too: the first failure is the
  // one that explains the run.
  console.error(`\nPRIMARY_GATE_FAILURE: ${err.message}`);
} finally {
  // ── 5. Give everything back, and prove it ────────────────────────────────
  const apiStop = await stopProcess(api);
  const webStop = await stopProcess(web);
  if (!apiStop.stopped) console.error(`the API did not stop: ${apiStop.how}`);
  if (!webStop.stopped) console.error(`the web app did not stop: ${webStop.how}`);

  const db = await teardownDatabase({
    keep: KEEP,
    ack: RETAIN_ACK_ENV,
    dbName: DB_NAME,
    drop: () =>
      execFileSync("node", [join(HERE, "gr3-evidence-setup.mjs"), "--drop"], {
        cwd: REPO,
        stdio: "inherit",
      }),
  });
  if (db.retained) {
    // The name is safe to print; the connection string is not.
    console.log(`\nretained for debugging: ${DB_NAME}`);
    console.log(`drop it with: EVIDENCE_DISPOSABLE_ACK=DROP_GR3_EVIDENCE_ONLY node apps/web/e2e/gr3-evidence-setup.mjs --drop`);
  }
  if (db.reason) console.error(`\n${db.reason}`);

  const report = teardownReport({ api: apiStop, web: webStop, db, primary: primaryPass });
  console.log(`\n${report.lines.join("\n")}`);
  exitCode = report.finalPass ? 0 : 1;
}

process.exit(exitCode);
