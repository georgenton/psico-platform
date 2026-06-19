/**
 * Test users seed — idempotent. Creates three known accounts so QA can hit
 * the app without registering and without depending on the (currently
 * unreliable in prod) `/register` form.
 *
 * Accounts:
 *
 *   1. admin@psico.test    / Admin12345!   role ADMIN  · plan PRO     · email verified
 *   2. free@psico.test     / Free12345!    role USER   · plan FREE    · email verified
 *   3. pro@psico.test      / Pro12345!     role USER   · plan PRO     · email verified
 *
 * Each gets:
 *   - bcrypt-hashed password (same hash cost as production register: 10).
 *   - cryptoSalt (16 random bytes b64url, identical to AuthService.register).
 *   - emailVerified set to true so the verify-email gate doesn't block flows.
 *   - cryptoSeedShownAt set so the BIP39 modal doesn't fire on first unlock.
 *
 * USAGE:
 *
 *   pnpm --filter @psico/api seed:test
 *
 * To wipe the test users without touching catalogs:
 *
 *   pnpm --filter @psico/api seed:test:wipe
 *
 * Both commands are SAFE in any environment — they only operate on the three
 * `.test` email addresses. They never touch real user data.
 *
 * Plain-text passwords are intentional and tracked in the file so QA can
 * reference them. Rotate this file or move it to `.test` accounts only in
 * a staging environment if you ever expose this seed in prod.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface TestUserSpec {
  email: string;
  password: string;
  name: string;
  role: "ADMIN" | "USER";
  plan: "FREE" | "PRO" | "B2B" | "ANNUAL";
}

const TEST_USERS: TestUserSpec[] = [
  {
    email: "admin@psico.test",
    password: "Admin12345!",
    name: "Admin Test",
    role: "ADMIN",
    plan: "PRO",
  },
  {
    email: "free@psico.test",
    password: "Free12345!",
    name: "Free Test",
    role: "USER",
    plan: "FREE",
  },
  {
    email: "pro@psico.test",
    password: "Pro12345!",
    name: "Pro Test",
    role: "USER",
    plan: "PRO",
  },
];

async function upsertTestUser(spec: TestUserSpec): Promise<void> {
  const passwordHash = await bcrypt.hash(spec.password, 10);
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
      // Idempotent — re-running rotates the password (intentional: lets you
      // recover if a tester locked themselves out by changing it). cryptoSalt
      // is intentionally NOT regenerated to preserve any encrypted diary
      // content the tester wrote with the old key.
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

async function seedTestUsers(): Promise<void> {
  for (const spec of TEST_USERS) {
    await upsertTestUser(spec);
    console.log(
      `✅  ${spec.email}  password: ${spec.password}  role: ${spec.role}  plan: ${spec.plan}`,
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--wipe")) {
    await wipeTestUsers();
  } else {
    await seedTestUsers();
  }
}

main()
  .catch((err) => {
    console.error("seed-test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
