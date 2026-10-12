import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { resolveEnvironment } from "../shared/psico-environment";
import {
  describePlan,
  planAuthorshipRepair,
  type CatalogSnapshot,
} from "./authorship-repair";
import {
  applyAuthorshipRepair,
  RepairPreconditionError,
} from "./authorship-repair-apply";

/**
 * Catalogue authorship repair — the operator entry point.
 *
 *   pnpm --filter @psico/api catalog:authorship:plan           # dry-run
 *   pnpm --filter @psico/api catalog:authorship:apply          # writes
 *
 * ── The gate ──────────────────────────────────────────────────────────────
 *
 * Posture comes from `resolveEnvironment`, reached through the neutral
 * `shared/psico-environment` path. That is the repository's declared semantic
 * authority for `PSICO_ENV` — `prisma/seed-guard` says so in its own comments
 * — so this tool cannot disagree with the seeds about what box it is on. It is
 * reused, not re-derived and not relaxed; in particular, a deployed box that
 * does not declare `PSICO_ENV` makes that function THROW, and this command
 * then refuses rather than guessing.
 *
 *   production  → refused in this version, with no token that lifts it. A
 *                 production repair is a separate decision with separate
 *                 evidence, not a flag on this command.
 *   staging     → needs `ALLOW_STAGING_CATALOG_AUTHORSHIP_REPAIR=1`, its own
 *                 token for its own hazard. The staging SEED token must not
 *                 authorize a data repair: different blast radius, different
 *                 decision.
 *   development
 *   / test      → `--apply` is enough.
 *   unclassified→ refused (the resolver throws before we get here).
 *
 * Dry-run is the default everywhere. `--apply` is the only way to write, and
 * on a deployed box it is not sufficient on its own.
 */

const STAGING_TOKEN = "ALLOW_STAGING_CATALOG_AUTHORSHIP_REPAIR";

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
    json: argv.includes("--json"),
  };
}

async function readSnapshot(prisma: PrismaClient): Promise<CatalogSnapshot> {
  // Only catalogue metadata. No users, no diary, no personal answers, no
  // financial rows — none of which this repair has any reason to see.
  const [authors, books] = await Promise.all([
    prisma.bookAuthor.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        title: true,
        licenseNumber: true,
        isVerified: true,
      },
      orderBy: { slug: "asc" },
    }),
    prisma.book.findMany({
      select: { id: true, slug: true, title: true, authorId: true },
      orderBy: { slug: "asc" },
    }),
  ]);
  return { authors, books };
}

export function assertAllowed(
  env: Record<string, string | undefined>,
  apply: boolean,
  posture: string,
): string {
  if (!apply) return posture; // A dry run writes nothing anywhere.

  if (posture === "production") {
    throw new Error(
      "REFUSED: posture=production. Esta versión no aplica reparaciones en producción y no hay token que lo habilite. Es una decisión aparte.",
    );
  }
  if (posture === "staging" && env[STAGING_TOKEN] !== "1") {
    throw new Error(
      `REFUSED: posture=staging requiere ${STAGING_TOKEN}=1 en esta invocación. ` +
        "El token del seed de staging no sirve: sembrar catálogo y reparar atribuciones son decisiones distintas.",
    );
  }
  return posture;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env as Record<string, string | undefined>;

  // Throws on a deployed box that does not declare PSICO_ENV.
  const posture = resolveEnvironment();
  assertAllowed(env, args.apply, posture);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const snapshot = await readSnapshot(prisma);
    const plan = planAuthorshipRepair(snapshot);

    console.log("══ reparación de autoría del catálogo ══");
    console.log(`  posture      : ${posture}`);
    console.log(
      `  modo         : ${args.apply ? "APLICAR (escribe)" : "DRY-RUN (no escribe)"}`,
    );
    console.log(`  autores      : ${snapshot.authors.length}`);
    console.log(`  libros       : ${snapshot.books.length}`);
    console.log("");
    console.log(describePlan(plan));
    console.log("");

    if (plan.blockers.length > 0) {
      console.error(
        `DETENIDO: ${plan.blockers.length} bloqueo(s). No se aplica nada mientras exista una ambigüedad.`,
      );
      process.exitCode = 2;
      return;
    }

    // One transaction for the whole plan: a failure in the second operation
    // must not leave the first applied.
    const result = await prisma.$transaction(async (tx) =>
      applyAuthorshipRepair(tx as never, plan, { apply: args.apply }),
    );

    console.log("══ resultado ══");
    console.log(`  dry-run      : ${result.dryRun}`);
    console.log(`  filas escritas: ${result.rowsWritten}`);
    for (const a of result.applied) {
      const mark = a.wrote ? "escrito" : "sin cambio";
      console.log(`  · ${a.subject} — ${a.op} — ${mark}`);
      if (a.before) console.log(`      antes: ${JSON.stringify(a.before)}`);
      if (a.after) console.log(`      después: ${JSON.stringify(a.after)}`);
    }

    if (result.reversal.length > 0) {
      console.log("");
      console.log("══ metadatos de reversión (guárdalos antes de aplicar) ══");
      console.log(JSON.stringify(result.reversal, null, 2));
    }

    if (args.json) {
      console.log("");
      console.log(JSON.stringify({ posture, plan, result }, null, 2));
    }

    if (result.dryRun) {
      console.log("");
      console.log(
        "DRY-RUN: no se escribió nada. Añade --apply (y el token si la caja es staging) para aplicar.",
      );
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

main().catch((err) => {
  if (err instanceof RepairPreconditionError) {
    console.error(`PRECONDICIÓN FALLIDA — ${err.message}`);
    console.error(
      "No se escribió nada. Revisa el estado real antes de reintentar.",
    );
    process.exit(3);
  }
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
