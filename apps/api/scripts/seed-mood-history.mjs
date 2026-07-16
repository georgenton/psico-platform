#!/usr/bin/env node
/**
 * seed-mood-history — backdated MoodLog generator for testing the affect
 * dynamics (Tier 2 OU) layer with real-shaped data.
 *
 * The OU fit needs mood observations SPREAD ACROSS DAYS (irregular Δt). You
 * can't get that by clicking the mood chip today — every row would land on the
 * same timestamp. This script inserts MoodLog rows dated across the past N days
 * for a given account, so you can open /dashboard/mapa and see the affect
 * dynamics block go "active".
 *
 * Privacy: only writes ordinal mood + a backdated createdAt. No text.
 *
 * Usage (from apps/api, with DATABASE_URL pointing at the target DB):
 *   node scripts/seed-mood-history.mjs --email=you@example.com
 *   node scripts/seed-mood-history.mjs --email=you@example.com --days=90 --pattern=volatile --reset
 *
 * Flags:
 *   --email    (required) account to seed
 *   --days     window length in days (default 90)
 *   --pattern  stable | volatile | improving | declining (default volatile)
 *   --skip     fraction of days to skip for irregular sampling (default 0.25)
 *   --reset    delete existing MoodLog in the window before inserting
 *
 * If REDIS_URL is set, the emotional-map cache for that user is busted so the
 * change shows up immediately.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const MOODS = ["hard", "low", "ok", "good", "great"];

// PR-2A · seeded MoodLog rows are canonical + explicit + eligible, but their
// provenance is SEED — NOT MOOD_LOG: seeded rows must not masquerade as real
// user taps. Raw `mood` is preserved; these are the additive normalization
// columns (kept inline — this is a plain .mjs).
function moodNorm(mood) {
  return {
    moodNormalized: mood, // seed moods are always canonical
    moodProvenance: "SEED",
    moodExplicitlySelected: true,
    moodVocabularyVersion: "diary-v1",
    moodNormalizerVersion: "norm-1",
    moodClientVersion: "seed",
    // PR-2B · versioned attestation for seeded moods (see seed-demo-users.mjs).
    moodSelectionVersion: "seed-v1",
    moodEligibleForDynamics: true,
    moodExclusionReason: null,
  };
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

function moodForDay(pattern, i, total) {
  // i = 0 (oldest) .. total-1 (most recent)
  const t = total <= 1 ? 0 : i / (total - 1); // 0..1
  const noise = () => Math.floor(Math.random() * 3) - 1; // -1,0,1
  const clampIdx = (n) => Math.max(0, Math.min(MOODS.length - 1, n));
  switch (pattern) {
    case "stable":
      return MOODS[clampIdx(3 + noise())]; // around "good"
    case "improving":
      return MOODS[clampIdx(Math.round(t * 4) + noise())];
    case "declining":
      return MOODS[clampIdx(Math.round((1 - t) * 4) + noise())];
    case "volatile":
    default:
      return MOODS[clampIdx(i % 2 === 0 ? 4 + noise() : 0 + noise())];
  }
}

async function bustCache(userId) {
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const { default: IORedis } = await import("ioredis");
    const redis = new IORedis(url, { maxRetriesPerRequest: 1 });
    await redis.del(`emotional-map:${userId}`);
    await redis.quit();
    console.log("• Busted emotional-map cache");
  } catch (e) {
    console.warn("• Could not bust cache (non-fatal):", e.message);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const email = args.email;
  if (!email) {
    console.error("ERROR: --email is required");
    process.exit(1);
  }
  const days = Number(args.days ?? 90);
  const pattern = String(args.pattern ?? "volatile");
  const skip = Number(args.skip ?? 0.25);
  const reset = Boolean(args.reset);

  // Prisma 7 requires an explicit driver adapter (same as the app's PrismaService).
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`ERROR: no user with email ${email}`);
      process.exit(1);
    }

    const now = Date.now();
    const windowStart = new Date(now - days * 86400_000);

    if (reset) {
      const del = await prisma.moodLog.deleteMany({
        where: { userId: user.id, createdAt: { gte: windowStart } },
      });
      console.log(`• Reset: deleted ${del.count} MoodLog rows in the window`);
    }

    const rows = [];
    for (let d = days - 1; d >= 0; d--) {
      if (Math.random() < skip) continue; // irregular sampling
      const i = days - 1 - d; // 0 = oldest
      // Randomize the time-of-day so Δt isn't a clean integer.
      const jitterMs = Math.floor(Math.random() * 86400_000);
      const createdAt = new Date(now - d * 86400_000 - jitterMs);
      const mood = moodForDay(pattern, i, days);
      rows.push({
        userId: user.id,
        mood,
        ...moodNorm(mood),
        createdAt,
      });
    }

    if (rows.length) {
      await prisma.moodLog.createMany({ data: rows });
    }
    console.log(
      `✓ Inserted ${rows.length} MoodLog rows for ${email} · pattern=${pattern} · window=${days}d`,
    );

    await bustCache(user.id);
    console.log(
      "→ Open /dashboard/mapa. With ≥8 mood points the 'Dinámica afectiva' block goes active.",
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
