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
 * Env:
 *   PG_LOCKS_ADMIN_URL   postgres superuser url (LOCAL host only). Defaults to
 *                        DATABASE_URL with the database swapped for `postgres`.
 *   PG_LOCKS_DB          database name (default: pg_locks_<pid>)
 *
 * It creates and DROPs a database, so the guards are refusals: production
 * environments, non-local hosts, names outside the whitelist, and a target that
 * is the admin connection's own database all abort before anything runs. No
 * connection string is ever printed.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const DB = process.env.PG_LOCKS_DB ?? `pg_locks_${process.pid}`;
const FILES = process.argv.slice(2);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
/** Whitelist, not a sanitiser: the name is interpolated into DDL. */
const DB_NAME = /^pg_locks[a-z0-9_]*$/;

function refuse(reason) {
  console.error(`refusing: ${reason}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") refuse("NODE_ENV=production");
if (!DB_NAME.test(DB)) refuse(`PG_LOCKS_DB "${DB}" is outside the whitelist`);

function adminUrl() {
  const raw = process.env.PG_LOCKS_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!raw) refuse("PG_LOCKS_ADMIN_URL or DATABASE_URL is required");
  let u;
  try {
    u = new URL(raw);
  } catch {
    return refuse("the admin url is not a valid URL");
  }
  if (!LOCAL_HOSTS.has(u.hostname)) refuse(`host "${u.hostname}" is not local`);
  if (u.pathname.replace(/^\//, "") === DB) {
    refuse("the target database is the admin connection's own");
  }
  u.pathname = "/postgres";
  return u.toString();
}

const ADMIN = adminUrl();
const TARGET = (() => {
  const u = new URL(ADMIN);
  u.pathname = `/${DB}`;
  return u.toString();
})();

const { Pool } = require(join(API_DIR, "node_modules", "pg"));

let created = false;
let failed = false;

try {
  const admin = new Pool({ connectionString: ADMIN });
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    created = true;
    console.log(`databaseName=${DB} databaseCreated=true migrationsPreapplied=false`);
  } finally {
    await admin.end().catch(() => {});
  }

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
  console.error(`\npg:locks failed: ${err.message}`);
} finally {
  if (created) {
    const admin = new Pool({ connectionString: ADMIN });
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
      console.log(`\ndatabaseDropped=true`);
    } catch {
      console.error(`\ndatabaseDropped=false — drop "${DB}" by hand`);
      failed = true;
    } finally {
      await admin.end().catch(() => {});
    }
  }
}

process.exit(failed ? 1 : 0);
