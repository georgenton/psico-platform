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
 *   EVIDENCE_ADMIN_URL   postgres superuser url (required)
 *   EVIDENCE_DB          database name (default gr3_evidence)
 *   EVIDENCE_EMAIL       synthetic account (default gr3.shots@local.test)
 *   EVIDENCE_PASSWORD    its password (required to create)
 *
 * The account is synthetic and local-only. No real person's data is involved,
 * and no credential is committed here.
 */

import { execSync } from "node:child_process";
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

if (!ADMIN) {
  console.error("EVIDENCE_ADMIN_URL is required (postgres superuser url).");
  process.exit(1);
}
if (!DROP && !PASSWORD) {
  console.error("EVIDENCE_PASSWORD is required to create the environment.");
  process.exit(1);
}

function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

const DB_URL = withDatabase(ADMIN, DB);

async function main() {
  const { Pool } = require(join(API_DIR, "node_modules", "pg"));
  const admin = new Pool({ connectionString: ADMIN });

  if (DROP) {
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
    console.log(`dropped ${DB}`);
    return;
  }

  await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${DB}"`);
  await admin.end();
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

  const { backfillContentCore } = require(join(API_DIR, "dist", "content-core", "backfill"));
  await backfillContentCore(prisma);
  console.log("content core backfilled");

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  if (!passwordHash || passwordHash.length < 20) {
    throw new Error("refusing to create an account with an empty hash");
  }
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "GR3 Evidence",
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

  console.log(`user ${user.email} (${user.id})`);
  console.log(`DATABASE_URL=${DB_URL}`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
