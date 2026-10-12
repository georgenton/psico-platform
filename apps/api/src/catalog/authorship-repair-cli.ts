import { writeFileSync } from "node:fs";

import { resolveEnvironment } from "../shared/psico-environment";
import {
  describePlan,
  planAuthorshipRepair,
  type CatalogSnapshot,
} from "./authorship-repair";
import {
  freezePlan,
  loadFrozenPlan,
  persistReversal,
  sanitizedPlanSummary,
  settleReversal,
  targetIdentityFromUrl,
  type FrozenPlan,
  type TargetIdentity,
} from "./authorship-plan-file";
import {
  applyAuthorshipRepair,
  collectReversal,
  RepairPreconditionError,
} from "./authorship-repair-apply";

/**
 * Catalogue authorship repair — the operator entry point.
 *
 *   pnpm --filter @psico/api catalog:authorship:plan  -- --plan-out=<ruta>
 *   pnpm --filter @psico/api catalog:authorship:apply -- --plan=<ruta> \
 *        --reversal-out=<ruta> --expect-database=<nombre> --expect-posture=<p>
 *
 * ── Why the target needs checks of its own ────────────────────────────────
 *
 * `resolveEnvironment()` classifies the PROCESS. On a laptop with no platform
 * markers it returns `development` without throwing, while `DATABASE_URL`
 * decides the target independently — so "unclassified always throws" held only
 * on a recognised deployed box. A `development` label must not authorise
 * writing to a hosted database.
 *
 * Hence target checks that belong to this tool and do not touch the shared
 * resolver:
 *
 *   · the connection must be given explicitly; no implicit default
 *   · `--expect-database` and `--expect-posture` must match what we actually
 *     connected to, so a copied command cannot land on another box
 *   · a non-loopback host counts as hosted whatever the label says, and needs
 *     staging posture plus this procedure's own token, passed per invocation
 *   · production is refused in this version, with no token that lifts it
 *
 * ── Importable without side effects ───────────────────────────────────────
 *
 * Everything here is exported and pure except `main`, which runs only when
 * this file is the entry point. Importing it connects to nothing, so the
 * parsing and the gate are unit-testable without a database.
 */

export const STAGING_TOKEN = "ALLOW_STAGING_CATALOG_AUTHORSHIP_REPAIR";

export interface CliArgs {
  apply: boolean;
  planPath?: string;
  planOut?: string;
  reversalOut?: string;
  expectDatabase?: string;
  expectPosture?: string;
  json: boolean;
}

const KNOWN_FLAGS = new Set([
  "--apply",
  "--json",
  "--plan",
  "--plan-out",
  "--reversal-out",
  "--expect-database",
  "--expect-posture",
]);

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

/** Parse argv strictly: an unknown flag is a mistake, not something to ignore. */
export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { apply: false, json: false };
  for (const raw of argv) {
    const eq = raw.indexOf("=");
    const flag = eq === -1 ? raw : raw.slice(0, eq);
    const value = eq === -1 ? undefined : raw.slice(eq + 1);
    if (!KNOWN_FLAGS.has(flag)) {
      throw new CliUsageError(
        `ARGUMENTO DESCONOCIDO: ${JSON.stringify(raw)}. Se rechaza en vez de ignorarlo: una bandera mal escrita no debe convertirse en silencio en otro modo.`,
      );
    }
    switch (flag) {
      case "--apply":
        out.apply = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--plan":
        out.planPath = value;
        break;
      case "--plan-out":
        out.planOut = value;
        break;
      case "--reversal-out":
        out.reversalOut = value;
        break;
      case "--expect-database":
        out.expectDatabase = value;
        break;
      case "--expect-posture":
        out.expectPosture = value;
        break;
    }
  }
  for (const [flag, v] of [
    ["--plan", out.planPath],
    ["--plan-out", out.planOut],
    ["--reversal-out", out.reversalOut],
    ["--expect-database", out.expectDatabase],
    ["--expect-posture", out.expectPosture],
  ] as const) {
    if (v !== undefined && v.trim() === "") {
      throw new CliUsageError(`${flag} necesita un valor.`);
    }
  }
  return out;
}

/**
 * Decide whether this invocation may write, and to what.
 *
 * Pure: connection string and environment in, target out or throw. No client,
 * no filesystem.
 */
export function resolveTarget(
  args: CliArgs,
  env: Record<string, string | undefined>,
  posture: string,
): TargetIdentity {
  const connection = env.DATABASE_URL;
  if (!connection || connection.trim() === "") {
    throw new CliUsageError(
      "CONEXIÓN AUSENTE: DATABASE_URL no está definida. No se usa un destino por defecto — elegir una base implícitamente es cómo se repara la equivocada.",
    );
  }

  const target = targetIdentityFromUrl(connection, posture);

  if (!args.apply) return target; // A dry run writes nothing anywhere.

  if (!args.expectDatabase || !args.expectPosture) {
    throw new CliUsageError(
      "DESTINO NO DECLARADO: --apply exige --expect-database y --expect-posture. Aplicar sin declarar el destino es cómo una orden copiada acaba en otra base.",
    );
  }
  if (args.expectDatabase !== target.database) {
    throw new CliUsageError(
      `DESTINO DISCORDANTE: se declaró ${args.expectDatabase} y la conexión apunta a ${target.database}.`,
    );
  }
  if (args.expectPosture !== posture) {
    throw new CliUsageError(
      `POSTURA DISCORDANTE: se declaró ${args.expectPosture} y el proceso resuelve ${posture}.`,
    );
  }

  if (posture === "production") {
    throw new CliUsageError(
      "RECHAZADO: postura production. Esta versión no aplica reparaciones en producción y no hay token que lo habilite.",
    );
  }

  // The host decides, not the label.
  if (!target.isLoopback) {
    if (posture !== "staging") {
      throw new CliUsageError(
        `RECHAZADO: la conexión apunta a ${target.host}, que no es loopback, mientras el proceso se declara ${posture}. Una etiqueta local no autoriza escribir en una base alojada.`,
      );
    }
    if (env[STAGING_TOKEN] !== "1") {
      throw new CliUsageError(
        `RECHAZADO: una base alojada en postura staging exige ${STAGING_TOKEN}=1 en ESTA invocación. El token del seed no sirve, y no debe quedar fijado en las variables del servicio: eso convierte un permiso puntual en un bypass permanente.`,
      );
    }
  }

  return target;
}

/** Catalogue metadata only. No users, diary, personal answers or finances. */
export async function readSnapshot(prisma: {
  bookAuthor: { findMany: (a: unknown) => Promise<unknown> };
  book: { findMany: (a: unknown) => Promise<unknown> };
}): Promise<CatalogSnapshot> {
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
    }) as Promise<CatalogSnapshot["authors"]>,
    prisma.book.findMany({
      select: { id: true, slug: true, title: true, authorId: true },
      orderBy: { slug: "asc" },
    }) as Promise<CatalogSnapshot["books"]>,
  ]);
  return { authors, books };
}

/** Everything printed to a terminal or a shareable JSON goes through here. */
export function sanitizedReport(
  target: TargetIdentity,
  plan: FrozenPlan,
  result?: {
    dryRun: boolean;
    rowsWritten: number;
    applied: Array<Record<string, unknown>>;
  },
): Record<string, unknown> {
  return {
    target: {
      host: target.host,
      database: target.database,
      posture: target.posture,
      isLoopback: target.isLoopback,
    },
    plan: sanitizedPlanSummary(plan),
    ...(result ? { result } : {}),
  };
}

async function main() {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

  const args = parseArgs(process.argv.slice(2));
  const env = process.env as Record<string, string | undefined>;
  const posture = resolveEnvironment();
  const target = resolveTarget(args, env, posture);

  if (args.apply && !args.planPath) {
    throw new CliUsageError(
      "PLAN AUSENTE: --apply exige --plan=<ruta> con el plan congelado que se revisó. Apply no recalcula el plan.",
    );
  }
  if (args.apply && !args.reversalOut) {
    throw new CliUsageError(
      "RESPALDO NO DECLARADO: --apply exige --reversal-out=<ruta> fuera del árbol del producto. Sin respaldo persistido y verificado no se modifica la base.",
    );
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // The server must really be the database the connection string names.
    const rows = (await prisma.$queryRawUnsafe(
      "select current_database() as db",
    )) as Array<{ db: string }>;
    const live = rows[0]?.db;
    if (live !== target.database) {
      throw new CliUsageError(
        `IDENTIDAD CONTRADICTORIA: la cadena de conexión dice ${target.database} y el servidor responde ${String(live)}.`,
      );
    }

    console.log("══ reparación de autoría del catálogo ══");
    console.log(
      `  destino   : ${target.database}@${target.host} (loopback=${target.isLoopback})`,
    );
    console.log(`  postura   : ${posture}`);
    console.log(
      `  modo      : ${args.apply ? "APLICAR (escribe)" : "DRY-RUN (no escribe)"}`,
    );

    const frozen: FrozenPlan = args.apply
      ? loadFrozenPlan(args.planPath as string, target)
      : freezePlan(planAuthorshipRepair(await readSnapshot(prisma)), target);

    console.log(
      `  plan      : ${frozen.planId}${args.apply ? "" : " (nuevo)"}`,
    );
    console.log(`  hash      : ${frozen.planHash}`);
    console.log("");
    console.log(describePlan(frozen));
    console.log("");

    if (frozen.blockers.length > 0) {
      console.error(
        `DETENIDO: ${frozen.blockers.length} bloqueo(s). No se aplica nada mientras exista una ambigüedad.`,
      );
      process.exitCode = 2;
      return;
    }

    if (!args.apply) {
      if (args.planOut) {
        writeFileSync(args.planOut, `${JSON.stringify(frozen, null, 2)}\n`, {
          mode: 0o600,
        });
        console.log(`  plan congelado escrito en ${args.planOut}`);
        console.log(
          "  revísalo y pásalo con --plan=<esa ruta>; apply no recalcula.",
        );
      } else {
        console.log(
          "  (sin --plan-out no se congela nada, y --apply exigirá un plan en disco)",
        );
      }
      // A dry run checks every precondition it can, including for a book whose
      // target author does not exist yet, and records the reversal it would
      // need.
      const entries = await collectReversal(prisma as never, frozen);
      console.log("");
      console.log(`  reversión prevista: ${entries.length} entrada(s)`);
      for (const e of entries) console.log(`    · ${e.subject}`);
      console.log("");
      console.log("DRY-RUN: no se escribió nada.");
      if (args.json) {
        console.log(JSON.stringify(sanitizedReport(target, frozen), null, 2));
      }
      return;
    }

    // ── apply ───────────────────────────────────────────────────────────────
    const entries = await collectReversal(prisma as never, frozen);
    persistReversal(args.reversalOut as string, {
      format: "feelverse.catalog-authorship-reversal/v1",
      planId: frozen.planId,
      planHash: frozen.planHash,
      state: "intended",
      target: frozen.target,
      preparedAt: new Date().toISOString(),
      entries,
      note: "Valores previos literales. Archivo privado, permisos 600, fuera del árbol del producto. Un archivo en estado 'intended' NO acredita que se haya aplicado nada.",
    });
    console.log(`  respaldo de reversión verificado en ${args.reversalOut}`);

    let result;
    try {
      result = await prisma.$transaction(async (tx: unknown) =>
        applyAuthorshipRepair(tx as never, frozen, { apply: true }),
      );
    } catch (err) {
      settleReversal(args.reversalOut as string, "aborted");
      throw err;
    }
    settleReversal(args.reversalOut as string, "applied");

    console.log("");
    console.log("══ resultado ══");
    console.log(`  filas escritas: ${result.rowsWritten}`);
    for (const a of result.applied) {
      console.log(
        `  · ${a.subject} — ${a.op} — ${a.wrote ? "escrito" : "sin cambio"}`,
      );
    }
    if (args.json) {
      console.log(
        JSON.stringify(
          sanitizedReport(target, frozen, {
            dryRun: result.dryRun,
            rowsWritten: result.rowsWritten,
            applied: result.applied as unknown as Array<
              Record<string, unknown>
            >,
          }),
          null,
          2,
        ),
      );
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

/* Only runs as an entry point — importing this file connects to nothing. */
if (require.main === module) {
  main().catch((err: unknown) => {
    if (err instanceof RepairPreconditionError) {
      console.error(`PRECONDICIÓN FALLIDA — ${err.message}`);
      console.error(
        "No se escribió nada. Revisa el estado real antes de reintentar.",
      );
      process.exit(3);
    }
    if (err instanceof CliUsageError) {
      console.error(err.message);
      process.exit(4);
    }
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
