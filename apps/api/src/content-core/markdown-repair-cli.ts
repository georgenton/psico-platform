/**
 * Plan, then apply, the emphasis repair — two commands, never one.
 *
 *   pnpm --filter @psico/api content:eec:emphasis:plan  -- --plan-out=<ruta>
 *   pnpm --filter @psico/api content:eec:emphasis:apply -- --plan=<ruta> \
 *     --expect-database=<nombre>
 *
 * The split is the point. Planning never opens a write transaction, so it can
 * be run as often as anybody likes; applying consumes a plan somebody read, and
 * refuses the moment the database stopped matching it.
 *
 * ── Why the plan is frozen to a file ───────────────────────────────────────
 *
 * Because the review happens between the two commands. A plan recomputed at
 * apply time would be a different plan — possibly a correct one, but not the
 * one that was approved, and "it recalculated and went ahead" is how a review
 * becomes decoration. So apply re-reads the database, re-plans, and compares
 * the hash with the frozen file: equal means the approved write is still the
 * right write, different means stop and plan again.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import {
  computeEmphasisPlanHash,
  describeEmphasisPlan,
  planEmphasisRepair,
  EMPHASIS_PLAN_FORMAT,
  type EmphasisPlan,
  type EmphasisSnapshot,
} from "./markdown-repair";
import {
  applyEmphasisRepair,
  readEmphasisSnapshot,
  type Preimage,
  type SnapshotClient,
} from "./markdown-repair-db";

export const STAGING_TOKEN = "ALLOW_STAGING_EEC_EMPHASIS_REPAIR";
export const DEFAULT_BOOK = "emociones-en-construccion";

export interface CliArgs {
  apply: boolean;
  book: string;
  planPath?: string;
  planOut?: string;
  expectDatabase?: string;
  /**
   * Plan from a snapshot exported read-only, instead of connecting.
   *
   * Not a convenience: a Coolify database is reachable only from inside its own
   * network, so planning against staging from a laptop would mean a tunnel and
   * a password for a job that writes nothing. The planner is pure — snapshot in,
   * plan out — so a snapshot read with `BEGIN READ ONLY` gives the identical
   * plan with no credential anywhere near it.
   *
   * Planning only. `--apply` re-reads the live database itself and compares
   * hashes, which is the check that makes the plan safe; an apply that trusted
   * a file for its "current" state would have no check at all.
   */
  snapshotPath?: string;
}

export class CliUsageError extends Error {}

/**
 * Flags of the two modes are kept apart deliberately.
 *
 * A dry run that accepts `--expect-database` looks like it applied something,
 * and an apply that accepts `--plan-out` looks like it froze a file it never
 * wrote. Both readings are wrong in the direction that matters.
 */
export function parseArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = { apply: false, book: DEFAULT_BOOK };
  const seen = new Set<string>();

  for (const token of argv) {
    const [flag, ...rest] = token.split("=");
    const value = rest.join("=");
    if (seen.has(flag!)) {
      throw new CliUsageError(`BANDERA REPETIDA: ${flag} aparece dos veces.`);
    }
    seen.add(flag!);

    switch (flag) {
      case "--apply":
        out.apply = true;
        break;
      case "--book":
        out.book = requireValue(flag, value);
        break;
      case "--plan":
        out.planPath = requireValue(flag, value);
        break;
      case "--plan-out":
        out.planOut = requireValue(flag, value);
        break;
      case "--expect-database":
        out.expectDatabase = requireValue(flag, value);
        break;
      case "--snapshot":
        out.snapshotPath = requireValue(flag, value);
        break;
      default:
        throw new CliUsageError(`BANDERA DESCONOCIDA: ${flag}`);
    }
  }

  if (out.apply) {
    if (!out.planPath) {
      throw new CliUsageError(
        "PLAN AUSENTE: --apply consume un plan congelado y revisado. Pasa --plan=<ruta>.",
      );
    }
    if (!out.expectDatabase) {
      throw new CliUsageError(
        "DESTINO NO DECLARADO: --apply exige --expect-database. Aplicar sin declarar la base es cómo una orden copiada acaba en otra.",
      );
    }
    if (out.planOut) {
      throw new CliUsageError(
        "MODOS INCOMPATIBLES: --plan-out congela un plan nuevo y --apply consume uno revisado. Son dos pasos.",
      );
    }
    if (out.snapshotPath) {
      throw new CliUsageError(
        "SNAPSHOT CON --apply: aplicar lee la base en vivo y compara hashes; confiar en un archivo para el estado actual es quedarse sin esa comprobación.",
      );
    }
  } else if (out.expectDatabase || out.planPath) {
    throw new CliUsageError(
      "ARGUMENTOS DE APLICACIÓN SIN --apply: la planificación no escribe nada, así que no declara destino ni consume un plan.",
    );
  }

  return out;
}

function requireValue(flag: string, value: string): string {
  if (value === "") throw new CliUsageError(`${flag} necesita un valor.`);
  return value;
}

export interface FrozenEmphasisPlan {
  format: typeof EMPHASIS_PLAN_FORMAT;
  planId: string;
  planHash: string;
  createdAt: string;
  database: string;
  bookSlug: string;
  ops: EmphasisPlan["ops"];
  blockers: EmphasisPlan["blockers"];
  untouched: number;
  stats: EmphasisPlan["stats"];
}

export function freezeEmphasisPlan(
  plan: EmphasisPlan,
  database: string,
): FrozenEmphasisPlan {
  return {
    format: EMPHASIS_PLAN_FORMAT,
    planId: randomUUID(),
    planHash: computeEmphasisPlanHash(plan),
    createdAt: new Date().toISOString(),
    database,
    bookSlug: plan.bookSlug,
    ops: plan.ops,
    blockers: plan.blockers,
    untouched: plan.untouched,
    stats: plan.stats,
  };
}

/**
 * The frozen plan and the database must still agree.
 *
 * Three separate checks, because they fail for three different reasons: a plan
 * for another book, a plan for another database, and a plan for a state that
 * has since moved.
 */
export function assertPlanStillValid(
  frozen: FrozenEmphasisPlan,
  fresh: EmphasisPlan,
  expectDatabase: string,
): void {
  if (frozen.format !== EMPHASIS_PLAN_FORMAT) {
    throw new Error(`FORMATO DESCONOCIDO: ${frozen.format}`);
  }
  if (frozen.bookSlug !== fresh.bookSlug) {
    throw new Error(
      `LIBRO DISTINTO: el plan es de "${frozen.bookSlug}" y se está planificando "${fresh.bookSlug}".`,
    );
  }
  if (frozen.database !== expectDatabase) {
    throw new Error(
      `BASE DISTINTA: el plan se construyó contra "${frozen.database}" y se declara "${expectDatabase}".`,
    );
  }
  const freshHash = computeEmphasisPlanHash(fresh);
  if (freshHash !== frozen.planHash) {
    throw new Error(
      "CAMBIO CONCURRENTE: la base ya no produce el plan aprobado. " +
        `Congelado ${frozen.planHash}, ahora ${freshHash}. Vuelve a planificar y a revisar.`,
    );
  }
}

/** A preimage belongs outside the repository: it names rows of real content. */
export function assertPrivatePath(path: string, repoRoot: string): void {
  const absolute = resolve(path);
  if (absolute.startsWith(resolve(repoRoot))) {
    throw new Error(
      `RUTA DENTRO DEL REPOSITORIO: ${absolute}. La preimagen y el plan no se commitean; usa una ruta privada (p. ej. ~/.psico-ops/).`,
    );
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export const preimagePathFor = (planPath: string): string =>
  planPath.replace(/\.json$/, "") + ".preimage.json";

/* c8 ignore start — the orchestration shell; its parts are tested separately. */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.snapshotPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const file = require(resolve(args.snapshotPath)) as EmphasisSnapshot & {
      database?: string;
      exportedAt?: string;
    };
    const plan = planEmphasisRepair(file);
    console.log(describeEmphasisPlan(plan));
    console.log(
      `\nbase (declarada por el snapshot): ${file.database ?? "(no declarada)"}`,
    );
    console.log(`snapshot exportado: ${file.exportedAt ?? "(sin fecha)"}`);
    if (args.planOut) {
      if (!file.database) {
        throw new Error(
          "SNAPSHOT SIN BASE: no se congela un plan cuyo destino no consta. Vuelve a exportar incluyendo current_database().",
        );
      }
      assertPrivatePath(args.planOut, resolve(__dirname, "../../../.."));
      const frozen = freezeEmphasisPlan(plan, file.database);
      writeJson(args.planOut, frozen);
      console.log(`plan congelado: ${resolve(args.planOut)}`);
      console.log(`planId: ${frozen.planId}`);
    } else {
      console.log("\n(sin --plan-out: nada se congeló; nada se escribió)");
    }
    return;
  }

  const connection = process.env.DATABASE_URL;
  if (!connection) {
    throw new Error(
      "CONEXIÓN AUSENTE: DATABASE_URL no está definida. No se usa un destino por defecto.",
    );
  }
  const database = new URL(connection).pathname.replace(/^\//, "");

  if (args.apply && process.env[STAGING_TOKEN] !== "on") {
    throw new Error(
      `APLICACIÓN NO AUTORIZADA: exporta ${STAGING_TOKEN}=on para escribir. La planificación no lo necesita.`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require("@prisma/client");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaPg } = require("@prisma/adapter-pg");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require("pg");

  const pool = new Pool({ connectionString: connection });
  pool.on("error", () => undefined);
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const snapshot = await readEmphasisSnapshot(
      prisma as unknown as SnapshotClient,
      args.book,
    );
    const plan = planEmphasisRepair(snapshot);

    if (!args.apply) {
      console.log(describeEmphasisPlan(plan));
      console.log(`\nbase: ${database}`);
      if (args.planOut) {
        assertPrivatePath(args.planOut, resolve(__dirname, "../../../.."));
        const frozen = freezeEmphasisPlan(plan, database);
        writeJson(args.planOut, frozen);
        console.log(`plan congelado: ${resolve(args.planOut)}`);
        console.log(`planId: ${frozen.planId}`);
      } else {
        console.log(
          "\n(sin --plan-out: nada se congeló y nada se escribió en la base)",
        );
      }
      return;
    }

    if (!existsSync(resolve(args.planPath!))) {
      throw new Error(`PLAN NO ENCONTRADO: ${args.planPath}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const frozen = require(resolve(args.planPath!)) as FrozenEmphasisPlan;
    assertPlanStillValid(frozen, plan, args.expectDatabase!);

    const preimagePath = preimagePathFor(args.planPath!);
    assertPrivatePath(preimagePath, resolve(__dirname, "../../../.."));

    const preimages: Preimage[] = [];
    const result = await prisma.$transaction(async (tx: unknown) => {
      return applyEmphasisRepair(tx as never, plan, (pre) => {
        preimages.push(pre);
        // Flushed on every op so a reversal exists even if this dies midway.
        writeJson(preimagePath, {
          format: "feelverse.content-core-emphasis-preimage/v1",
          planId: frozen.planId,
          planHash: frozen.planHash,
          database,
          recordedAt: new Date().toISOString(),
          preimages,
        });
      });
    });

    console.log(`aplicado: ${result.opsApplied} bloque(s)`);
    console.log(`preimagen: ${resolve(preimagePath)}`);
    const after = planEmphasisRepair(
      await readEmphasisSnapshot(
        prisma as unknown as SnapshotClient,
        args.book,
      ),
    );
    console.log(
      `comprobación posterior: ${after.ops.length} operación(es) pendientes` +
        (after.ops.length === 0 ? " — convergió" : " — NO convergió"),
    );
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
/* c8 ignore stop */
