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
 * The seed creates synthetic mood history, check-ins, numeric text features,
 * resonances, reading activity and supporting account/onboarding metadata. It
 * does not create DiaryEntry, EcoThread, EcoMessage or VoiceTranscription, but a
 * demo account may contain such data created through later use.
 *
 * SECURITY (P0) — a demo account with a KNOWN default password is a live
 * credential. This script therefore:
 *   - has NO default password. Provide one via --password=… or the
 *     DEMO_USER_PASSWORD env var; otherwise it aborts before connecting.
 *   - HARD DENIES production. No environment variable lifts it.
 *   - refuses any other deployed box (staging) unless
 *     ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1 is set for that one invocation —
 *     the same switch the QA user fixture uses, because it is the same hazard.
 *   - refuses a deployed box that does not declare PSICO_ENV, rather than
 *     proceeding as it used to.
 *   - never rotates an EXISTING account's password unless --rotate-passwords
 *     is passed (a fresh account still gets the provided password on create).
 *   - never prints the password.
 *
 * Run it where DATABASE_URL points at the target DB:
 *   cd apps/api
 *   DEMO_USER_PASSWORD='…' node scripts/seed-demo-users.mjs
 *   # or: node scripts/seed-demo-users.mjs --password='…'
 *   # options: --reset (wipe + recreate mood/checkins) · --rotate-passwords
 *   # on staging also: ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1 (one invocation)
 *
 * If REDIS_URL is set, each account's map cache is busted so the data shows up
 * on the first visit.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
// Classification only. The posture rules live in `prisma/seed-guard.ts`; this is
// the dependency-free mirror that plain `node` can import, kept honest by
// `src/auth/seed-environment-conformance.spec.ts`.
import { isDeployedPlatform, seedPosture } from "./seed-posture.mjs";

const MOODS = ["hard", "low", "ok", "good", "great"];

// PR-2A · seeded MoodLog rows are canonical + explicit + eligible, but their
// provenance is SEED — NOT MOOD_LOG. They must not masquerade as real user taps.
// Raw `mood` preserved; these are the additive normalization columns.
function moodNorm(mood) {
  return {
    moodNormalized: mood,
    moodProvenance: "SEED",
    moodExplicitlySelected: true,
    moodVocabularyVersion: "diary-v1",
    moodNormalizerVersion: "norm-1",
    moodClientVersion: "seed",
    // PR-2B · the versioned attestation for seeded moods. `seed-v1` marks these
    // as explicit + eligible without pretending a client tapped them (that is
    // `explicit-v1`, reserved for the composer).
    moodSelectionVersion: "seed-v1",
    moodEligibleForDynamics: true,
    moodExclusionReason: null,
  };
}
const DAY = 86400_000;

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

/**
 * Resolve + VALIDATE the run configuration from argv + env. Pure and
 * side-effect free so it is unit-testable, and — crucially — it runs BEFORE any
 * DB/Redis connection, so a misconfigured run aborts before it can touch a
 * database.
 *
 * P0 security posture (a demo account with a known default password is a live
 * credential):
 *   - No default password. It MUST come from --password=… or DEMO_USER_PASSWORD;
 *     missing → throw.
 *   - PRODUCTION is a hard deny. No variable lifts it (see below).
 *   - Any other deployed box (staging) needs
 *     ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1 for that single invocation.
 *   - An EXISTING account's password is rotated only with --rotate-passwords.
 *   - The password is never logged (returned only for hashing).
 *
 * ── Why the old guard was not enough ──────────────────────────────────────
 *
 * It was a single `===` against `PSICO_ENV` with its own override variable, and
 * it failed in three ways at once:
 *
 *   1. It failed OPEN. A deployed box with no `PSICO_ENV` — a Railway or Coolify
 *      service that never declared its posture — matched nothing, and the script
 *      proceeded to mint working logins on it.
 *   2. The comparison was not normalized, so `PSICO_ENV="Production"` or a
 *      value with a stray space walked straight past it.
 *   3. Its override was a THIRD authorization vocabulary alongside the catalog
 *      seed's and the QA fixture's, with a different value shape. Three
 *      vocabularies is three chances to reach for whichever one happens to be
 *      loosest, so it was deleted rather than tightened. ADR 0025 records the
 *      name; a source ratchet in `src/auth/seed-demo-users.spec.ts` fails the
 *      build if it reappears here, including in a comment.
 *
 * So: the posture decides, production is unconditional, and staging reuses the
 * QA fixture's existing variable rather than inventing a fourth. Demo accounts
 * are working logins seeded with activity, which is the same hazard that
 * variable already governs — one switch for one hazard.
 *
 * @param {{ argv: string[], env: Record<string, string | undefined> }} io
 * @returns {{ password: string, rotatePasswords: boolean, reset: boolean }}
 */
export function resolveSeedConfig({ argv, env }) {
  const args = parseArgs(argv);

  const posture = seedPosture(env);

  if (posture === "production") {
    throw new Error(
      "Refusing to seed demo users against PRODUCTION.\n" +
        "This is not a missing-authorization error and no environment variable " +
        "lifts it. Demo accounts are working logins with a password you chose; " +
        "in production they are live credentials next to real users' data.\n" +
        "If production genuinely needs an account, create it through the normal " +
        "registration path, which is auditable.",
    );
  }

  if (posture === "invalid") {
    // Two shapes reach here, and they need different remedies: a deployed box
    // that declared nothing, and ANY box whose PSICO_ENV is a word nobody can
    // interpret. Saying "this box is deployed" for the second sent the operator
    // looking for a platform problem that was really a typo — caught by running
    // the refusals rather than only unit-testing that they fire.
    throw new Error(
      isDeployedPlatform(env)
        ? "Refusing to seed demo users: this box is deployed but does not " +
            "declare a valid posture.\n" +
            "Set PSICO_ENV=production or PSICO_ENV=staging on the RESOURCE, not " +
            "on the command. NODE_ENV is not accepted here — a build sets it for " +
            "reasons that say nothing about safety posture.\n" +
            "No authorization variable lifts this: a posture nobody declared " +
            "cannot be turned into staging by naming staging on the command line."
        : "Refusing to seed demo users: PSICO_ENV is set to a value this does " +
            "not recognize.\n" +
            "It must be one of production | staging | development | test. Check " +
            'it for a typo — "prod" and "stage" are not accepted, deliberately, ' +
            "because a value nobody can interpret must not be read as a " +
            "development machine while DATABASE_URL points somewhere real.",
    );
  }

  if (posture === "staging" && env.ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX !== "1") {
    // Exactly "1" — not "true", not "on", not "01". A loose check is how a
    // bypass ends up switched on by a value somebody typed for another reason.
    throw new Error(
      "Refusing to seed demo users against a deployed host without " +
        "authorization.\n" +
        "Seeding mints working logins on a host that answers to the internet, " +
        "staging included.\n" +
        "To do it deliberately, set ALLOW_QA_USER_SEED_ON_DEPLOYED_BOX=1 for " +
        "that single invocation. Never persist it as a service variable.",
    );
  }

  // Accept --password=… (a bare --password parses to boolean true → ignored)
  // or DEMO_USER_PASSWORD. There is NO default.
  const password =
    (typeof args.password === "string" && args.password) ||
    env.DEMO_USER_PASSWORD ||
    "";
  if (!password) {
    throw new Error(
      "A demo password is required and has no default. Pass --password=… or " +
        "set DEMO_USER_PASSWORD.",
    );
  }

  return {
    password,
    rotatePasswords: args["rotate-passwords"] === true,
    reset: args.reset === true,
  };
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
  // Resolve + validate the config BEFORE opening any connection — a missing
  // password or an unguarded production run aborts before touching the DB.
  const { password, rotatePasswords, reset } = resolveSeedConfig({
    argv: process.argv,
    env: process.env,
  });
  // Prisma 7 requires an explicit driver adapter (same as the app's
  // PrismaService). @prisma/adapter-pg + pg are runtime deps of the API.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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
          currentStreakDays: u.streak,
          // Never silently rotate an existing account's password. A fresh
          // account still receives `passwordHash` via `create` above.
          ...(rotatePasswords ? { passwordHash } : {}),
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
        const mood = moodForDay(u.pattern, i, u.days);
        rows.push({
          userId: user.id,
          mood,
          ...moodNorm(mood),
          createdAt: new Date(now - d * DAY - jitter),
        });
      }
      if (rows.length) await prisma.moodLog.createMany({ data: rows });

      // ── Daily checkin answers (Etapa 2) → Claridad/Compasión/Consciencia
      // as MEASURED axes. Rotating item catalog, scores follow the pattern.
      const CHECKIN_ITEM_KEYS = [
        "claridad_nombrar",
        "claridad_causa",
        "compasion_amable",
        "compasion_juicio",
        "consciencia_presente",
        "consciencia_pausa",
      ];
      await prisma.checkinResponse.deleteMany({
        where: { userId: user.id, createdAt: { gte: windowStart } },
      });
      const checkinRows = [];
      const checkinDays = Math.min(u.days, 30);
      if (u.days >= 14) {
        for (let d = checkinDays - 1; d >= 0; d--) {
          const itemKey =
            CHECKIN_ITEM_KEYS[(checkinDays - 1 - d) % CHECKIN_ITEM_KEYS.length];
          const base =
            u.pattern === "volatile" ? 1 + Math.floor(Math.random() * 3) : 3;
          const score = Math.min(4, base + (Math.random() < 0.4 ? 1 : 0));
          checkinRows.push({
            userId: user.id,
            itemKey,
            score,
            createdAt: new Date(
              now - d * DAY - Math.floor(Math.random() * DAY),
            ),
          });
        }
        await prisma.checkinResponse.createMany({ data: checkinRows });
      }

      // ── On-device text features (Etapa 6). In production the CLIENT
      // analyzes the decrypted reflection and uploads only these numbers;
      // for demo accounts we seed plausible densities per archetype so the
      // "analizado en tu dispositivo" source lights up. NUMBERS ONLY.
      await prisma.diaryTextFeature.deleteMany({
        where: { userId: user.id, createdAt: { gte: windowStart } },
      });
      if (u.days >= 14) {
        // Fase D (L4) — text analysis is opt-in; demo accounts consent so
        // the seeded features keep feeding their map.
        await prisma.privacySettings.upsert({
          where: { userId: user.id },
          create: { userId: user.id, localTextAnalysis: true },
          update: { localTextAnalysis: true },
        });
        const kind = u.pattern === "volatile" ? 0.005 : 0.02;
        const critic = u.pattern === "volatile" ? 0.02 : 0.002;
        const featureRows = [];
        const featureDays = Math.min(u.days, 30);
        for (let d = featureDays - 1; d >= 0; d -= 3) {
          featureRows.push({
            userId: user.id,
            wordCount: 60 + Math.floor(Math.random() * 80),
            selfFocus: 0.04 + Math.random() * 0.03,
            positive: u.pattern === "volatile" ? 0.01 : 0.03,
            negative: u.pattern === "volatile" ? 0.04 : 0.015,
            insight: 0.02 + Math.random() * 0.02,
            causal: 0.015 + Math.random() * 0.01,
            absolutist: u.pattern === "volatile" ? 0.02 : 0.005,
            social: 0.015,
            selfKind: kind,
            selfCritic: critic,
            createdAt: new Date(
              now - d * DAY - Math.floor(Math.random() * DAY),
            ),
          });
        }
        await prisma.diaryTextFeature.createMany({ data: featureRows });
      }

      // ── Confirmed resonances (Fase E, ARC cycle). Under the V2 contract
      // (default since Fase G) Conexión is fed EXCLUSIVELY by these explicit
      // confirmations — demo accounts with history confirm the curated
      // Parte I concepts so the axis lights up. Catalog metadata only.
      if (u.days >= 14) {
        const DEMO_RESONANCES = [
          {
            conceptKey: "eec-cuerpo-antes-que-mente",
            conceptLabel: "El cuerpo sabe antes que la mente",
            chapterOrder: 1,
          },
          {
            conceptKey: "eec-como-aprendiste-a-sentir",
            conceptLabel: "Cómo aprendiste a sentir",
            chapterOrder: 2,
          },
        ];
        for (const [i, r] of DEMO_RESONANCES.entries()) {
          await prisma.resonance.upsert({
            where: {
              userId_conceptKey: { userId: user.id, conceptKey: r.conceptKey },
            },
            create: {
              userId: user.id,
              conceptKey: r.conceptKey,
              conceptLabel: r.conceptLabel,
              bookSlug: "emociones-en-construccion",
              chapterOrder: r.chapterOrder,
              source: "HIGHLIGHT",
              confirmedAt: new Date(now - (3 + i * 4) * DAY),
            },
            update: {},
          });
        }
      }

      // ── A reading session → Conexión / Propósito axes
      if (u.reading && chapter) {
        await prisma.readingSession.upsert({
          where: {
            userId_chapterId: { userId: user.id, chapterId: chapter.id },
          },
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
    // NEVER print the password — it is a live credential.
    console.log(
      "\n✓ Cuentas demo listas. (La contraseña no se imprime; es la que pasaste.)\n",
    );
    for (const r of results) {
      console.log(`• ${r.email}`);
      console.log(
        `    datos:   ${r.days} días de ánimo (${r.moods} registros, patrón "${r.pattern}")${r.reading ? " + 1 lectura completada" : ""} · racha ${r.streak}d`,
      );
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
    await pool.end();
  }
}

// Only run when invoked directly (node scripts/seed-demo-users.mjs). On import
// (the guard tests import `resolveSeedConfig`) nothing runs — no connection, no
// process.exit.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
