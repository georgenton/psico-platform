/**
 * QA user fixture — idempotent. Creates three known accounts so QA can hit the
 * app without registering and without depending on the `/register` form.
 *
 * Accounts (the password is supplied per run; all three share it):
 *
 *   1. admin@psico.test   role ADMIN  · plan PRO   · email verified
 *   2. free@psico.test    role USER   · plan FREE  · email verified
 *   3. pro@psico.test     role USER   · plan PRO   · email verified
 *
 * Each gets:
 *   - bcrypt-hashed password (same hash cost as production register: 10).
 *   - cryptoSalt (16 random bytes b64url, identical to AuthService.register).
 *   - emailVerified set to true so the verify-email gate doesn't block flows.
 *   - cryptoSeedShownAt set so the BIP39 modal doesn't fire on first unlock.
 *
 * ── SECURITY ───────────────────────────────────────────────────────────────
 *
 * This file used to carry three plain-text passwords, and said of itself that
 * both commands were "SAFE in any environment". Neither half held up:
 *
 *   - `georgenton/psico-platform` is a PUBLIC repository, so a tracked
 *     password is a published one. `admin@psico.test` carries the ADMIN role,
 *     which opens the Pulso back-office — overview, reports, cohorts, user
 *     listings. A published ADMIN password plus a host that answers to the
 *     internet is not a fixture, it is a front door.
 *   - "SAFE in any environment" described the BLAST RADIUS (it only touches
 *     three `.test` addresses) and was then read as a statement about WHERE it
 *     may run. It had no environment guard at all: nothing stopped
 *     `DATABASE_URL` pointing at production.
 *   - It printed each password to stdout, so the values also landed in CI logs
 *     and terminal scrollback.
 *
 * What replaces that:
 *
 *   - No default password. It MUST come from `--password=…` or
 *     `QA_USER_PASSWORD`, and is validated BEFORE anything connects.
 *   - It refuses to run against a DEPLOYED host — production *and* staging —
 *     unless `ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1` is set for that single
 *     invocation. Staging is in scope on purpose: `api-staging.feelverse.app`
 *     is reachable from the internet, so an ADMIN login there is live.
 *   - The password is never printed, and never appears in a log line.
 *
 * The guard is a SECOND line, not the first one. The first is that nobody
 * should be pointing this at a deployed database; the guard is what makes
 * doing so by accident fail loudly instead of succeeding quietly.
 *
 * ── USAGE ──────────────────────────────────────────────────────────────────
 *
 *   QA_USER_PASSWORD='…' pnpm --filter @psico/api seed:test
 *   pnpm --filter @psico/api seed:test -- --password='…'
 *
 * To remove the fixture accounts (no password needed — it only deletes):
 *
 *   pnpm --filter @psico/api seed:test:wipe
 *
 * On a deployed host, prefix either with the authorization for that one run:
 *
 *   ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1 QA_USER_PASSWORD='…' \
 *     pnpm --filter @psico/api seed:test
 *
 * Choose the password with a generator and keep it in the operator's own
 * secret store, never in this repository. Treat it as a real credential for
 * as long as the accounts exist, and wipe them when the test window closes.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

import { assertQaUserSeedAllowed } from "./seed-guard";
import { runGuardedSeed, type SeedClientHandle } from "./seed-runtime";
import { resolveQaSeedConfig } from "./seed-test-config";

/**
 * Assigned by `createSeedClient()`, and only once the run is allowed and
 * configured. A module-level `const` would be built at import time — before
 * any refusal could possibly execute. (The same reasoning, and the same
 * ratchet, as `seed.ts`.)
 */
let prisma!: PrismaClient;

function createSeedClient(): SeedClientHandle {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });
  prisma = client;
  return {
    dispose: async () => {
      await client.$disconnect();
      await pool.end();
    },
  };
}

interface TestUserSpec {
  email: string;
  name: string;
  role: "ADMIN" | "USER";
  plan: "FREE" | "PRO" | "B2B" | "ANNUAL";
}

/**
 * The roster carries no secret — only which accounts exist and what they are
 * entitled to. The credential arrives per run and lives in memory.
 */
const TEST_USERS: TestUserSpec[] = [
  {
    email: "admin@psico.test",
    name: "Admin Test",
    role: "ADMIN",
    plan: "PRO",
  },
  {
    email: "free@psico.test",
    name: "Free Test",
    role: "USER",
    plan: "FREE",
  },
  {
    email: "pro@psico.test",
    name: "Pro Test",
    role: "USER",
    plan: "PRO",
  },
];

async function upsertTestUser(
  spec: TestUserSpec,
  password: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 10);
  const cryptoSalt = randomBytes(16).toString("base64url");
  const now = new Date();

  await prisma.user.upsert({
    where: { email: spec.email },
    create: {
      email: spec.email,
      name: spec.name,
      passwordHash,
      cryptoSalt,
      role: spec.role,
      plan: spec.plan,
      authProvider: "LOCAL",
      emailVerified: true,
      cryptoSeedShownAt: now,
    },
    update: {
      // Idempotent — re-running sets the password to the one supplied for THIS
      // run (intentional: it is how you recover if a tester locked themselves
      // out). cryptoSalt is intentionally NOT regenerated, to preserve any
      // encrypted diary content the tester wrote with the old key.
      name: spec.name,
      passwordHash,
      role: spec.role,
      plan: spec.plan,
      emailVerified: true,
    },
  });
}

async function wipeTestUsers(): Promise<void> {
  const result = await prisma.user.deleteMany({
    where: {
      email: { in: TEST_USERS.map((u) => u.email) },
    },
  });
  console.log(`🗑️  wiped ${result.count} test user(s)`);
}

async function seedTestUsers(password: string): Promise<void> {
  for (const spec of TEST_USERS) {
    await upsertTestUser(spec, password);
    // The password is deliberately absent. Whoever ran this supplied it and
    // already has it; stdout is read by CI logs and terminal scrollback that
    // outlive the run.
    console.log(`✅  ${spec.email}  role: ${spec.role}  plan: ${spec.plan}`);
  }
  console.log(
    "\n🔑  Password not printed by design — it is the value you supplied.",
  );
}

async function main(): Promise<void> {
  // Asked explicitly, and FIRST, so that "you should not be running this here"
  // wins over "you forgot the password". The environment is the more
  // fundamental objection; reporting it second would imply the run was
  // otherwise fine and send the operator off to generate a credential it is
  // going to refuse anyway.
  //
  // `runGuardedSeed` is handed the same assertion below. That is what
  // GUARANTEES no client, adapter or pool is constructed before a refusal —
  // and it keeps holding even if this function is reordered later.
  assertQaUserSeedAllowed(process.env);

  // Pure, and before any client exists.
  const config = resolveQaSeedConfig({ argv: process.argv, env: process.env });

  await runGuardedSeed({
    env: process.env,
    assert: assertQaUserSeedAllowed,
    createClient: createSeedClient,
    seed: async () => {
      if (config.wipe) {
        await wipeTestUsers();
      } else {
        await seedTestUsers(config.password);
      }
    },
  });
}

// Refuse → configure → build → seed → dispose. Nothing above this line
// touches a database, and the guard tests import `seed-test-config` rather
// than this file, so no spec ever reaches here.
main().catch((err) => {
  // Message only. Dumping the error object could carry the connection string
  // out of a Prisma initialization failure.
  console.error(
    `seed-test failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
