/**
 * GR-3 — build the disposable environment the evidence needs.
 *
 * The ordinary dev database holds the SEEDED chapter, not the ingested one, so
 * the guide's passage does not exist there and the anchor correctly refuses to
 * resolve. Capturing that state would document the fallback, not the feature —
 * and mutating the dev database to make the screenshots look right would be
 * fixing the evidence instead of the code.
 *
 * So this builds a throwaway one: fresh database, migrations, the canonical
 * chapter through the real ingestion tool, the Content Core backfill, and ONE
 * synthetic account. It touches nothing shared, and `--drop` removes it.
 *
 *   node apps/web/e2e/gr3-evidence-setup.mjs            # create
 *   node apps/web/e2e/gr3-evidence-setup.mjs --drop     # remove
 *
 * Env:
 *   EVIDENCE_ADMIN_URL      postgres superuser url (required, LOCAL host only)
 *   EVIDENCE_DB             database name (default gr3_evidence)
 *   EVIDENCE_EMAIL          synthetic account (default gr3.shots@local.test)
 *   EVIDENCE_PASSWORD       its password (required to create)
 *   EVIDENCE_DISPOSABLE_ACK must be DROP_GR3_EVIDENCE_ONLY
 *
 * It DROPs a database, so every guard below is a refusal, not a warning: a
 * non-local host, a name outside the `gr3_evidence*` whitelist, a production
 * environment, a missing acknowledgement, or a target that is the admin
 * connection's own database all abort before anything runs. `DATABASE_URL` is
 * never printed.
 *
 * The account is synthetic and local-only. No real person's data is involved,
 * and no credential is committed here.
 */

import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = join(HERE, "..", "..", "api");

const ADMIN = process.env.EVIDENCE_ADMIN_URL;
const DB = process.env.EVIDENCE_DB ?? "gr3_evidence";
const EMAIL = process.env.EVIDENCE_EMAIL ?? "gr3.shots@local.test";
const PASSWORD = process.env.EVIDENCE_PASSWORD;
const DROP = process.argv.includes("--drop");
const BOOK_SLUG = "emociones-en-construccion";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
/** Whitelist, not a sanitiser: the name is interpolated into DDL. */
const DB_NAME = /^gr3_evidence(?:_[a-z0-9_]+)?$/;

function refuse(reason) {
  console.error(`refusing: ${reason}`);
  process.exit(1);
}

if (!ADMIN) refuse("EVIDENCE_ADMIN_URL is required (postgres superuser url)");
if (!DROP && !PASSWORD) {
  refuse("EVIDENCE_PASSWORD is required to create the environment");
}

// ── Guards. Every one of them can only say no. ────────────────────────────
if (process.env.NODE_ENV === "production") refuse("NODE_ENV=production");
if (process.env.VERCEL_ENV === "production") refuse("VERCEL_ENV=production");
if (process.env.EVIDENCE_DISPOSABLE_ACK !== "DROP_GR3_EVIDENCE_ONLY") {
  refuse("EVIDENCE_DISPOSABLE_ACK must be DROP_GR3_EVIDENCE_ONLY");
}
if (!DB_NAME.test(DB)) refuse(`EVIDENCE_DB "${DB}" is outside the whitelist`);

let adminUrl;
try {
  adminUrl = new URL(ADMIN);
} catch {
  refuse("EVIDENCE_ADMIN_URL is not a valid URL");
}
const adminHost = adminUrl.hostname;
if (!LOCAL_HOSTS.has(adminHost)) {
  refuse(`EVIDENCE_ADMIN_URL host "${adminHost}" is not local`);
}
// Dropping the database the admin connection is using would be a different
// (and much worse) operation than the one this script claims to perform.
const adminDb = adminUrl.pathname.replace(/^\//, "");
if (adminDb === DB) refuse("the target database is the admin connection's own");

console.log(`databaseHost=<local:${adminHost}>`);
console.log(`databaseName=${DB}`);

function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

const DB_URL = withDatabase(ADMIN, DB);

async function main() {
  const { Pool } = require(join(API_DIR, "node_modules", "pg"));
  const admin = new Pool({ connectionString: ADMIN });
  let pool;
  let prisma;
  try {
    await run(admin, (p, pr) => {
      pool = p;
      prisma = pr;
    });
  } finally {
    // Always: a leaked pool keeps the process (and the database) pinned open,
    // and the next run's DROP would fail on an active connection.
    await prisma?.$disconnect().catch(() => {});
    await pool?.end().catch(() => {});
    await admin.end().catch(() => {});
  }
}

async function run(admin, handOff) {
  const { Pool } = require(join(API_DIR, "node_modules", "pg"));

  if (DROP) {
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    console.log(`dropped ${DB}`);
    return;
  }

  await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${DB}"`);
  console.log(`created ${DB}`);

  execSync("pnpm exec prisma migrate deploy", {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: DB_URL, PRISMA_SKIP_SEED: "1" },
    stdio: "inherit",
  });

  const { PrismaClient } = require(join(API_DIR, "node_modules", "@prisma/client"));
  const { PrismaPg } = require(join(API_DIR, "node_modules", "@prisma/adapter-pg"));
  const bcrypt = require(join(API_DIR, "node_modules", "bcryptjs"));
  const pool = new Pool({ connectionString: DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  handOff(pool, prisma);

  const book = await prisma.book.create({
    data: {
      slug: BOOK_SLUG,
      title: "Emociones en Construcción",
      description: "Ingested for GR-3 evidence.",
      isPublished: true,
    },
  });

  // The real ingestion tool on the real manuscript. Its destructive-replace
  // guard is bypassed ONLY here: the database is seconds old and has no marks.
  execSync(
    `node scripts/ingest-chapter-md.mjs --file content/${BOOK_SLUG}/capitulo-01.md --order 1 --book ${BOOK_SLUG}`,
    {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: DB_URL,
        ALLOW_LEGACY_DESTRUCTIVE_INGEST: "on",
      },
      stdio: "inherit",
    },
  );

  // §5 — always build. The presence of `dist/` proves only that SOMEONE built
  // SOMETHING here once; it says nothing about which commit produced it. A
  // backfill compiled from a different SHA than the one under audit would make
  // the evidence describe code that is not in the PR, and the failure mode is
  // silent. So the artifact is removed and rebuilt every run, and the cost of
  // a rebuild is the price of the SHA meaning what it says.
  const distDir = join(API_DIR, "dist");
  rmSync(distDir, { recursive: true, force: true });
  console.log("building the API from the current checkout…");
  execSync("pnpm build", { cwd: API_DIR, stdio: "inherit" });
  console.log("API_BUILT_FOR_EVIDENCE_SHA=true STALE_DIST_REUSED=false");

  const backfillPath = join(distDir, "content-core", "backfill.js");
  if (!existsSync(backfillPath)) {
    throw new Error("the build did not produce content-core/backfill.js");
  }
  const { backfillContentCore } = require(backfillPath);
  await backfillContentCore(prisma);
  console.log("content core backfilled");

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  if (!passwordHash || passwordHash.length < 20) {
    throw new Error("refusing to create an account with an empty hash");
  }
  // A neutral display name: the topbar renders it, so it lands in the
  // captures. Nothing about the product changes for real users — this is the
  // name of one synthetic row in a throwaway database.
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Lectora",
      passwordHash,
      plan: "PRO",
      role: "USER",
      emailVerified: true,
      // Past the onboarding gate, so the reader is reachable directly.
      onboardingState: {
        create: {
          onboardingCompletedAt: new Date(),
          tourCompletedAt: new Date(),
        },
      },
    },
  });

  // Neither the address nor the id: the log is read by whoever audits this,
  // and an identifier printed once is an identifier that can be pasted twice.
  if (!user.id) throw new Error("the synthetic account was not created");
  console.log("syntheticUserCreated=true");
  // Never the URL: it carries the superuser credential.
  console.log("databaseCreated=true");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
