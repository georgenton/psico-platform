#!/usr/bin/env node
/**
 * seed-demo-users — creates ready-to-use demo accounts so you can just LOG IN
 * and look at the Emotional Map. One command, then open the app and sign in.
 *
 * Each account is created directly in the DB (bcrypt password, LOCAL provider,
 * onboarding pre-completed so you land on the dashboard) and seeded with:
 *   • MoodLog spread across N past days  → drives the affect-dynamics (OU) block
 *   • a ReadingSession                   → lights the Conexión / Propósito axes
 *
 * It writes ONLY ordinal mood + timestamps + reading counters (ADR 0007 — no
 * text, no ciphertext). It never touches the Diario/Eco encrypted content, so
 * don't open those tabs on demo accounts (there's nothing there).
 *
 * Run it where DATABASE_URL points at the target DB (prod via Railway):
 *   cd apps/api
 *   railway run node scripts/seed-demo-users.mjs
 *   # optional: --reset (wipe + recreate), --password=Otra123!
 *
 * If REDIS_URL is set, each account's map cache is busted so the data shows up
 * on the first visit.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const MOODS = ["hard", "low", "ok", "good", "great"];
const DAY = 86400_000;

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

/** The demo roster. `expect` is what you should see on /dashboard/mapa. */
const USERS = [
  {
    email: "demo-estable@psico.test",
    name: "Demo Estable",
    pattern: "stable",
    days: 90,
    reading: true,
    streak: 7,
    expect:
      "Dinámica afectiva ACTIVA · estabilidad ~60% · recuperación e inercia visibles · Calma/Conexión/Propósito encendidos",
  },
  {
    email: "demo-volatil@psico.test",
    name: "Demo Volátil",
    pattern: "volatile",
    days: 30,
    reading: true,
    streak: 3,
    expect: "Dinámica afectiva ACTIVA · estabilidad ~0% (ánimo muy variable)",
  },
  {
    email: "demo-recuperando@psico.test",
    name: "Demo Recuperándose",
    pattern: "improving",
    days: 60,
    reading: false,
    streak: 5,
    expect:
      "Dinámica afectiva ACTIVA · tendencia a mejorar · estabilidad baja (esperado en tendencias)",
  },
  {
    email: "demo-nuevo@psico.test",
    name: "Demo Nuevo",
    pattern: "stable",
    days: 3,
    reading: false,
    streak: 2,
    expect:
      "'Reuniendo datos' — pocos registros. Muestra el estado honesto vacío (no inventa un 50%)",
  },
];

function moodForDay(pattern, i, total) {
  const t = total <= 1 ? 0 : i / (total - 1); // 0 (oldest) .. 1 (newest)
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
  } catch {
    /* non-fatal */
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const password = String(args.password ?? "Demo1234!");
  const reset = Boolean(args.reset);
  const prisma = new PrismaClient();

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    // One shared chapter for reading sessions (defensive: may not exist if the
    // content seed never ran).
    const chapter = await prisma.chapter.findFirst({ select: { id: true } });
    if (!chapter) {
      console.warn(
        "• No hay capítulos en la DB — omito las sesiones de lectura (el resto funciona).",
      );
    }

    const now = Date.now();
    const results = [];

    for (const u of USERS) {
      // ── Account (idempotent; password is reset every run so login siempre va)
      const cryptoSalt = randomBytes(16).toString("base64url");
      const user = await prisma.user.upsert({
        where: { email: u.email },
        create: {
          email: u.email,
          name: u.name,
          passwordHash,
          authProvider: "LOCAL",
          cryptoSalt,
          currentStreakDays: u.streak,
          profile: { create: {} },
        },
        update: {
          name: u.name,
          passwordHash,
          currentStreakDays: u.streak,
        },
        select: { id: true },
      });

      // ── Onboarding pre-completed → lands on the dashboard, no tour popup
      await prisma.onboardingState.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          onboardingCompletedAt: new Date(now),
          tourCompletedAt: new Date(now),
        },
        update: {
          onboardingCompletedAt: new Date(now),
          tourCompletedAt: new Date(now),
        },
      });

      // ── Mood history (backdated, irregular) → drives the OU affect dynamics
      const windowStart = new Date(now - u.days * DAY);
      await prisma.moodLog.deleteMany({
        where: { userId: user.id, createdAt: { gte: windowStart } },
      });
      const rows = [];
      for (let d = u.days - 1; d >= 0; d--) {
        if (Math.random() < 0.25) continue; // irregular Δt
        const i = u.days - 1 - d;
        const jitter = Math.floor(Math.random() * DAY);
        rows.push({
          userId: user.id,
          mood: moodForDay(u.pattern, i, u.days),
          createdAt: new Date(now - d * DAY - jitter),
        });
      }
      if (rows.length) await prisma.moodLog.createMany({ data: rows });

      // ── A reading session → Conexión / Propósito axes
      if (u.reading && chapter) {
        await prisma.readingSession.upsert({
          where: { userId_chapterId: { userId: user.id, chapterId: chapter.id } },
          create: {
            userId: user.id,
            chapterId: chapter.id,
            progressPct: 85,
            timeSpentSec: 1500,
            completedAt: new Date(now - 2 * DAY),
            lastSeenAt: new Date(now - DAY),
          },
          update: {
            progressPct: 85,
            timeSpentSec: 1500,
            completedAt: new Date(now - 2 * DAY),
            lastSeenAt: new Date(now - DAY),
          },
        });
      }

      await bustCache(user.id);
      results.push({ ...u, moods: rows.length });
    }

    // ── Report ────────────────────────────────────────────────────────────
    console.log("\n✓ Cuentas demo listas. Contraseña para todas: " + password + "\n");
    for (const r of results) {
      console.log(`• ${r.email}`);
      console.log(`    datos:   ${r.days} días de ánimo (${r.moods} registros, patrón "${r.pattern}")${r.reading ? " + 1 lectura completada" : ""} · racha ${r.streak}d`);
      console.log(`    verás:   ${r.expect}\n`);
    }
    console.log(
      "→ Abre la web, inicia sesión con cualquiera y entra a 'Mi Mapa Emocional'.",
    );
    console.log(
      "  (No abras Diario/Eco en estas cuentas: no tienen contenido, solo datos para el mapa.)",
    );
    if (reset) {
      console.log("\n(--reset: se limpió y recreó todo)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
