/**
 * QA visual fixture — the minimum a QA environment needs before anyone can
 * look at the product.
 *
 * WHY THIS EXISTS. The QA database has accounts but no catalogue: zero books,
 * zero chapters, zero achievements, zero onboarding options, zero prompts. A
 * visual audit run there reviews empty states and error screens, which is not
 * the product. This writes a small, entirely synthetic catalogue so the real
 * screens have something to draw.
 *
 * WHAT IT WILL NOT DO.
 *   · It never runs in production. Three independent barriers, below.
 *   · It never deletes, truncates or resets anything.
 *   · It never copies production data, and contains no personal content: no
 *     diary entries, no Eco threads, no reflections, no map or pattern data,
 *     no invitations, no Dúo/Círculos activity. It writes catalogue rows only.
 *   · It never creates accounts and never touches an existing one, so it
 *     cannot grant anybody a plan, a role or an entitlement.
 *
 * IDEMPOTENCE. Catalogue rows are upserted by their stable id. Books are
 * created only when their slug is absent — `bootstrapBook` fails closed on an
 * existing slug, and re-creating one would orphan the reader marks hanging off
 * its block ids. A second run therefore reports `skipped`, not `created`, and
 * changes nothing.
 */
import type { PrismaClient } from "@prisma/client";
import {
  resolveEnvironment,
  type PsicoEnvironment,
} from "../shared/psico-environment";
import { ACHIEVEMENT_CATALOG } from "../evolucion/achievement-catalog";
import {
  MOOD_SEED_CATALOG,
  MOTIVO_SEED_CATALOG,
} from "../onboarding/constants";
import { REFLECTION_PROMPT_CATALOG } from "../home/reflection-prompt-catalog";
import { DIARY_PROMPT_CATALOG } from "../reflexiones/diary-prompt-catalog";
import { bootstrapBook } from "../content-core/bootstrap-book";
import {
  FIXTURE_BOOKS,
  FIXTURE_CATEGORY_SLUG,
  buildBootstrapInput,
} from "./visual-fixture-content";

// ── Machine codes ───────────────────────────────────────────────────────────
// stdout carries codes and counts, never row contents.

export const QA_FIXTURE_FORBIDDEN_IN_PRODUCTION =
  "QA_FIXTURE_FORBIDDEN_IN_PRODUCTION";
export const QA_FIXTURE_NOT_AUTHORIZED = "QA_FIXTURE_NOT_AUTHORIZED";
export const QA_FIXTURE_DATABASE_LOOKS_REAL = "QA_FIXTURE_DATABASE_LOOKS_REAL";

export const QA_FIXTURE_AUTHORIZATION_VAR = "ALLOW_QA_VISUAL_FIXTURE";
export const QA_FIXTURE_EXTRA_DOMAINS_VAR = "QA_FIXTURE_EXTRA_EMAIL_DOMAINS";

// ── Barrier 1 + 2: process posture ──────────────────────────────────────────

/**
 * `resolveEnvironment()` is the canonical resolver and it is deliberately
 * strict: on a deployed box only PSICO_ENV=production|staging are accepted and
 * NODE_ENV is not, so a Railway service that forgot to declare itself throws
 * instead of quietly passing for a development machine. We do not add a second
 * detection scheme next to it — we ask it and obey the answer.
 *
 * Barrier 2 is an explicit opt-in on any deployed box, mirroring
 * `ALLOW_CONTENT_CORE_BOOK_INGEST`: reaching staging by accident should still
 * not be enough to write to it.
 */
export function assertVisualFixtureAllowed(
  env: NodeJS.ProcessEnv = process.env,
): PsicoEnvironment {
  const environment = resolveEnvironment(); // throws on a misconfigured box
  if (environment === "production") {
    throw new Error(QA_FIXTURE_FORBIDDEN_IN_PRODUCTION);
  }
  if (environment === "staging" && env[QA_FIXTURE_AUTHORIZATION_VAR] !== "on") {
    throw new Error(QA_FIXTURE_NOT_AUTHORIZED);
  }
  return environment;
}

// ── Barrier 3: the database itself ──────────────────────────────────────────

/**
 * Posture describes the PROCESS, not the connection. A laptop pointed at the
 * production DATABASE_URL resolves as "development" and would sail past the
 * two barriers above — that is the accident this third one exists for.
 *
 * The test is the accounts. RFC 2606 and RFC 6761 reserve `.test`, `.example`,
 * `.invalid` and `.localhost` for exactly this purpose: no real person can
 * receive mail at one. A database whose users all live in those names is a
 * test database. One that holds a single address outside them is treated as
 * real and refused. An empty database has no real users and passes.
 *
 * `QA_FIXTURE_EXTRA_EMAIL_DOMAINS` (comma-separated) widens the allow-list for
 * a QA environment that legitimately uses a routable domain. Widening it is a
 * deliberate act by whoever runs the fixture, which is the point.
 */
const RESERVED_TEST_TLDS = ["test", "example", "invalid", "localhost"];

export function isSyntheticEmailDomain(
  domain: string,
  extraDomains: readonly string[] = [],
): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  if (extraDomains.includes(d)) return true;
  const tld = d.split(".").pop() ?? "";
  return RESERVED_TEST_TLDS.includes(tld);
}

export function parseExtraDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function assertDatabaseIsNotReal(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ users: number; syntheticDomains: number }> {
  const extra = parseExtraDomains(env[QA_FIXTURE_EXTRA_DOMAINS_VAR]);
  // Emails are read to classify their DOMAIN and are never printed or stored.
  const rows = await prisma.user.findMany({ select: { email: true } });
  const domains = new Set<string>();
  for (const { email } of rows) {
    const domain = String(email).split("@").pop() ?? "";
    if (!isSyntheticEmailDomain(domain, extra)) {
      throw new Error(QA_FIXTURE_DATABASE_LOOKS_REAL);
    }
    domains.add(domain.toLowerCase());
  }
  return { users: rows.length, syntheticDomains: domains.size };
}

// ── Report ──────────────────────────────────────────────────────────────────

export interface VisualFixtureReport {
  environment: PsicoEnvironment;
  applied: boolean;
  accounts: { users: number; syntheticDomains: number };
  catalogs: {
    categories: number;
    achievements: number;
    motivos: number;
    moods: number;
    reflectionPrompts: number;
    diaryPrompts: number;
  };
  books: {
    slug: string;
    plan: "FREE" | "PRO";
    outcome: "created" | "already-present";
    chapters: number;
    blocks: number;
    units: number;
  }[];
}

// ── Apply ───────────────────────────────────────────────────────────────────

/**
 * Runs every barrier, then writes. `apply: false` (the default) stops after the
 * barriers and reports what a real run would do without touching a row.
 */
export async function applyVisualFixture(
  prisma: PrismaClient,
  opts: { apply?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<VisualFixtureReport> {
  const env = opts.env ?? process.env;
  const apply = opts.apply ?? false;

  const environment = assertVisualFixtureAllowed(env);
  const accounts = await assertDatabaseIsNotReal(prisma, env);

  const report: VisualFixtureReport = {
    environment,
    applied: apply,
    accounts,
    catalogs: {
      categories: 1,
      achievements: ACHIEVEMENT_CATALOG.length,
      motivos: MOTIVO_SEED_CATALOG.length,
      moods: MOOD_SEED_CATALOG.length,
      reflectionPrompts: REFLECTION_PROMPT_CATALOG.length,
      diaryPrompts: DIARY_PROMPT_CATALOG.length,
    },
    books: [],
  };

  if (!apply) {
    for (const spec of FIXTURE_BOOKS) {
      const present = await prisma.book.findUnique({
        where: { slug: spec.slug },
        select: { id: true },
      });
      report.books.push({
        slug: spec.slug,
        plan: spec.plan,
        outcome: present ? "already-present" : "created",
        chapters: spec.chapters.length,
        blocks: spec.chapters.reduce((n, c) => n + c.blocks.length, 0),
        units: spec.chapters.length,
      });
    }
    return report;
  }

  // ── Catalogues ────────────────────────────────────────────────────────────
  // Upsert by stable id: a second run rewrites the same values.

  // The books' category must exist before the bootstrap — that helper resolves
  // categories and refuses to invent one, because a missing category in the
  // real catalogue is an editorial error, not a row to guess.
  await prisma.bookCategory.upsert({
    where: { slug: FIXTURE_CATEGORY_SLUG },
    create: {
      id: "cat-qa-visual",
      slug: FIXTURE_CATEGORY_SLUG,
      label: "Pruebas visuales",
      order: 99,
      isActive: true,
    },
    update: { label: "Pruebas visuales", order: 99, isActive: true },
  });

  for (const a of ACHIEVEMENT_CATALOG) {
    const data = {
      label: a.label,
      description: a.description,
      icon: a.icon,
      progressTarget: a.progressTarget,
      category: a.category,
    };
    await prisma.achievement.upsert({
      where: { id: a.id },
      create: { id: a.id, ...data },
      update: data,
    });
  }

  for (const m of MOTIVO_SEED_CATALOG) {
    await prisma.onboardingMotivo.upsert({
      where: { id: m.id },
      create: { ...m, isActive: true },
      update: { label: m.label, icon: m.icon, order: m.order, isActive: true },
    });
  }

  for (const mo of MOOD_SEED_CATALOG) {
    await prisma.onboardingMood.upsert({
      where: { id: mo.id },
      create: { ...mo, isActive: true },
      update: {
        label: mo.label,
        swatch: mo.swatch,
        order: mo.order,
        isActive: true,
      },
    });
  }

  for (const p of REFLECTION_PROMPT_CATALOG) {
    await prisma.reflectionPrompt.upsert({
      where: { id: p.id },
      create: { ...p, audience: "all", isActive: true },
      update: { text: p.text, isActive: true },
    });
  }

  for (const p of DIARY_PROMPT_CATALOG) {
    await prisma.diaryPrompt.upsert({
      where: { id: p.id },
      create: { ...p, audience: "all", isActive: true },
      update: { text: p.text, isActive: true },
    });
  }

  // ── Books ─────────────────────────────────────────────────────────────────

  for (const spec of FIXTURE_BOOKS) {
    const present = await prisma.book.findUnique({
      where: { slug: spec.slug },
      select: { id: true },
    });
    if (present) {
      report.books.push({
        slug: spec.slug,
        plan: spec.plan,
        outcome: "already-present",
        chapters: 0,
        blocks: 0,
        units: 0,
      });
      continue;
    }

    const stats = await bootstrapBook(
      prisma,
      buildBootstrapInput(spec),
      // Pass the ambient environment straight through rather than forging an
      // authorization: the bootstrap's own opt-in stays a real control, and an
      // operator on a deployed box sets both variables deliberately.
      { env },
    );

    // `bootstrapBook` always writes a FREE book — it has no plan parameter, by
    // design. The reserved-access book needs its entitlement set afterwards, on
    // the two rows this run just created and on nothing else.
    if (spec.plan !== "FREE") {
      await prisma.book.update({
        where: { id: stats.bookId },
        data: { plan: spec.plan },
      });
      await prisma.edition.update({
        where: { id: stats.editionId },
        data: { accessPlan: spec.plan },
      });
    }

    report.books.push({
      slug: spec.slug,
      plan: spec.plan,
      outcome: "created",
      chapters: stats.chapters,
      blocks: stats.blocks,
      units: stats.units,
    });
  }

  return report;
}

/** Codes safe to print. Anything else surfaces as UNEXPECTED_ERROR. */
const PUBLIC_ERROR_CODES = [
  QA_FIXTURE_FORBIDDEN_IN_PRODUCTION,
  QA_FIXTURE_NOT_AUTHORIZED,
  QA_FIXTURE_DATABASE_LOOKS_REAL,
];

export function sanitizeFixtureError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (PUBLIC_ERROR_CODES.includes(msg)) return msg;
  // A bootstrap refusal is already a bare machine code with no row content.
  if (/^[A-Z][A-Z0-9_]{4,}$/.test(msg)) return msg;
  return "UNEXPECTED_ERROR";
}
