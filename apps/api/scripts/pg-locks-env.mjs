/**
 * Run the pg-spec suites against a database built for them, then throw it away.
 *
 *   pnpm --filter @psico/api pg:locks              # all of test:locks
 *   pnpm --filter @psico/api pg:locks -- <file...> # only those files
 *
 * Why this exists: the suites need an EMPTY database, and that requirement used
 * to live in a comment. Someone (me) read "throwaway database", created one,
 * helpfully ran `prisma migrate deploy` on it first, and then spent a while
 * looking at a 42704 on `vector` and a Prisma error about a NOT NULL column —
 * neither of which had anything to do with the code under test. The precondition
 * is now asserted in the suites; this script makes satisfying it the easy path.
 *
 * `TEMPLATE template0` rather than the default: `template1` is whatever the
 * local machine has made of it, and an extension somebody installed there
 * months ago would silently become part of every "clean" database this script
 * hands to the suites. template0 is the one Postgres guarantees is pristine.
 *
 * Env:
 *   PG_LOCKS_ADMIN_URL   postgres superuser url (LOCAL host only). Defaults to
 *                        DATABASE_URL with the database swapped for `postgres`.
 *   PG_LOCKS_DB          database name (default: pg_locks_<pid>)
 *
 * It creates and DROPs a database, so the guards are refusals: production
 * environments, non-local hosts, names outside the whitelist, a name that
 * already exists, and a target that is the admin connection's own database all
 * abort. No connection string is ever printed.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A compact restatement of the two facts the guard cares about. The authority
 * for the suites is `src/test/pg-precondition.ts`; this is a smoke test of
 * template0 on THIS server, run before any suite starts, and it is deliberately
 * simple enough that duplicating it costs less than making a .ts module
 * importable from a plain .mjs script.
 */
const CLEANLINESS_SQL = `
  SELECT
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
    (SELECT count(*) FROM pg_extension WHERE extname = 'vector') AS vector`;

const require = createRequire(import.meta.url);
const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const DB = process.env.PG_LOCKS_DB ?? `pg_locks_${process.pid}`;
const FILES = process.argv.slice(2);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
/** Whitelist, not a sanitiser: the name is interpolated into DDL. */
const DB_NAME = /^pg_locks[a-z0-9_]*$/;

/**
 * A refusal. Thrown, never `process.exit` — once a pool is open, exiting
 * directly skips the `finally` that drops the database this script created.
 * The one thing worse than a failed run is a failed run that leaves a
 * database behind.
 */
class Refusal extends Error {}
const refuse = (reason) => {
  throw new Refusal(reason);
};

let created = false;
let failed = false;

try {
  // ── Synchronous refusals, before anything is opened ──────────────────────
  if (process.env.NODE_ENV === "production") refuse("NODE_ENV=production");
  if (process.env.VERCEL_ENV === "production") refuse("VERCEL_ENV=production");
  if (!DB_NAME.test(DB)) refuse(`PG_LOCKS_DB "${DB}" is outside the whitelist`);

  const raw = process.env.PG_LOCKS_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!raw) refuse("PG_LOCKS_ADMIN_URL or DATABASE_URL is required");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    refuse("the admin url is not a valid URL");
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    refuse(`host "${parsed.hostname}" is not local`);
  }
  if (parsed.pathname.replace(/^\//, "") === DB) {
    refuse("the target database is the admin connection's own");
  }

  const adminUrl = new URL(raw);
  adminUrl.pathname = "/postgres";
  const ADMIN = adminUrl.toString();
  const targetUrl = new URL(ADMIN);
  targetUrl.pathname = `/${DB}`;
  const TARGET = targetUrl.toString();

  const { Pool } = require(join(API_DIR, "node_modules", "pg"));

  // ── Create, from template0 ───────────────────────────────────────────────
  const admin = new Pool({ connectionString: ADMIN });
  try {
    // Refuse a name that already exists rather than dropping it. The name is
    // pid-derived, so a collision means something else is using it — and a
    // script whose first act is DROP on a database it did not create is one
    // typo away from being a very different script.
    const { rows } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [DB],
    );
    if (rows.length > 0) {
      refuse(
        `database "${DB}" already exists — this script never reuses or drops one it did not create`,
      );
    }
    await admin.query(`CREATE DATABASE "${DB}" TEMPLATE template0`);
    created = true;
    console.log(
      `databaseName=${DB} databaseCreated=true template=template0 migrationsPreapplied=false`,
    );
  } finally {
    await admin.end().catch(() => {});
  }

  // ── Verify what we just created is actually clean ────────────────────────
  //
  // Creating from template0 SHOULD give a pristine database. Checking says so
  // rather than assuming it, and turns a surprising local Postgres into an
  // immediate, legible failure instead of a confusing one inside a suite.
  const check = new Pool({ connectionString: TARGET });
  try {
    const { rows } = await check.query(CLEANLINESS_SQL);
    const tables = Number(rows[0]?.tables ?? 0);
    const vector = Number(rows[0]?.vector ?? 0) > 0;
    if (tables !== 0 || vector) {
      refuse(
        `the database this script just created is not clean ` +
          `(tables=${tables}, vector=${vector}) — ` +
          `check what template0 looks like on this server`,
      );
    }
    console.log(
      "applicationTables=0 vectorExtensionPresent=false databaseCleanAfterCreate=true",
    );
  } finally {
    await check.end().catch(() => {});
  }

  // ── Run the suites ───────────────────────────────────────────────────────
  //
  // No `migrate deploy` here, deliberately. The suites that need migrations run
  // them themselves, into their own schema; pre-applying them to `public` is
  // exactly the mistake this script exists to prevent.
  execFileSync(
    "pnpm",
    ["exec", "vitest", "run", "--config", "vitest.locks.config.ts", ...FILES],
    { cwd: API_DIR, stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: TARGET } },
  );
} catch (err) {
  failed = true;
  console.error(
    err instanceof Refusal ? `refusing: ${err.message}` : `\npg:locks failed: ${err.message}`,
  );
} finally {
  if (created) {
    const { Pool } = require(join(API_DIR, "node_modules", "pg"));
    const adminUrl = new URL(process.env.PG_LOCKS_ADMIN_URL ?? process.env.DATABASE_URL);
    adminUrl.pathname = "/postgres";
    const admin = new Pool({ connectionString: adminUrl.toString() });
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
      console.log(`\ndatabaseDropped=true`);
    } catch {
      console.error(`\ndatabaseDropped=false — drop "${DB}" by hand`);
      failed = true;
    } finally {
      await admin.end().catch(() => {});
    }
  } else {
    console.log("databaseCreated=false");
  }
}

process.exit(failed ? 1 : 0);
