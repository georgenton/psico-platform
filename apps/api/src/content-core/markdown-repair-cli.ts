/**
 * Plan, then apply, the emphasis repair — two commands, never one.
 *
 *   pnpm --filter @psico/api content:eec:emphasis:plan  -- --plan-out=<ruta>
 *   pnpm --filter @psico/api content:eec:emphasis:apply -- --plan=<ruta> \
 *     --expect-database=<nombre> --expect-posture=<p> \
 *     --expect-plan-id=<uuid> --expect-plan-hash=<sha256:…>
 *
 * The split is the point. Planning never opens a write transaction, so it can
 * be run as often as anybody likes; applying consumes a plan somebody read, and
 * refuses the moment the database stopped matching it.
 *
 * ── Why the plan is frozen to a file, and why the file is not the permission ─
 *
 * The review happens between the two commands, so apply re-reads the database,
 * re-plans, and compares the hash with the frozen file: equal means the approved
 * write is still the right write. But the FILE cannot answer "is this the plan a
 * person approved" — a substituted file would answer it about itself. So the
 * plan's identity comes from the invocation (`--expect-plan-id`,
 * `--expect-plan-hash`), exactly as `catalog/authorship-plan-file.ts` puts it:
 * the hash binds, it is not the permission.
 *
 * ── And the destination is proven, not declared ────────────────────────────
 *
 * A previous version of this file compared the frozen plan's database with
 * `--expect-database` and never contrasted either with the database it was
 * connected to. Two agreeing labels are not a destination: a plan built against
 * staging, declared as staging, could be applied to any database whose contents
 * happened to produce the same hash — which, for a repair whose hash is derived
 * from the content, is exactly what a restored copy of staging would do. So the
 * connection is parsed, the posture is resolved from the PROCESS, and
 * `current_database()` is asked of the server itself.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import {
  targetIdentityFromUrl,
  type TargetIdentity,
} from "../catalog/authorship-plan-file";
import { resolveEnvironment } from "../shared/psico-environment";
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
  revertEmphasisRepair,
  type Preimage,
  type SnapshotClient,
} from "./markdown-repair-db";

/**
 * This repair's own one-off authorization.
 *
 * Deliberately not shared with the catalogue repair: a token that permits two
 * procedures is a token somebody exports once and forgets. `=1` matches the
 * house convention so the muscle memory is the same.
 */
export const STAGING_TOKEN = "ALLOW_STAGING_EEC_EMPHASIS_REPAIR";
export const DEFAULT_BOOK = "emociones-en-construccion";

export interface CliArgs {
  apply: boolean;
  /** Undo a run, from its own plan and its own preimage file. */
  revert: boolean;
  preimagePath?: string;
  book: string;
  planPath?: string;
  planOut?: string;
  expectDatabase?: string;
  expectPosture?: string;
  expectPlanId?: string;
  expectPlanHash?: string;
  /**
   * Plan from a snapshot exported read-only, instead of connecting.
   *
   * Not a convenience: a Coolify database is reachable only from inside its own
   * network, so planning against staging from a laptop would mean a tunnel and
   * a password for a job that writes nothing. The planner is pure — snapshot in,
   * plan out — so a snapshot read with `BEGIN READ ONLY` gives the identical
   * plan with no credential anywhere near it.
   *
   * Planning only. `--apply` re-reads the live database itself, which is the
   * check that makes the plan safe.
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
  const out: CliArgs = { apply: false, revert: false, book: DEFAULT_BOOK };
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
      case "--revert":
        out.revert = true;
        break;
      case "--preimage":
        out.preimagePath = requireValue(flag, value);
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
      case "--expect-posture":
        out.expectPosture = requireValue(flag, value);
        break;
      case "--expect-plan-id":
        out.expectPlanId = requireValue(flag, value);
        break;
      case "--expect-plan-hash":
        out.expectPlanHash = requireValue(flag, value);
        break;
      case "--snapshot":
        out.snapshotPath = requireValue(flag, value);
        break;
      default:
        throw new CliUsageError(`BANDERA DESCONOCIDA: ${flag}`);
    }
  }

  const applyOnly: [string, string | undefined][] = [
    ["--plan", out.planPath],
    ["--expect-database", out.expectDatabase],
    ["--expect-posture", out.expectPosture],
    ["--expect-plan-id", out.expectPlanId],
    ["--expect-plan-hash", out.expectPlanHash],
  ];

  if (out.apply && out.revert) {
    throw new CliUsageError(
      "MODOS INCOMPATIBLES: --apply escribe la reparación y --revert la deshace. Son dos invocaciones.",
    );
  }

  const writing = out.apply || out.revert;
  if (out.revert && !out.preimagePath) {
    throw new CliUsageError(
      "PREIMAGEN AUSENTE: --revert necesita --preimage=<ruta>. Sin ella no hay nada que restaurar.",
    );
  }
  if (!out.revert && out.preimagePath) {
    throw new CliUsageError(
      "PREIMAGEN SIN --revert: ni la planificación ni la aplicación la leen; la aplicación la ESCRIBE.",
    );
  }

  if (writing) {
    const missing = applyOnly.filter(([, v]) => !v).map(([f]) => f);
    if (missing.length > 0) {
      throw new CliUsageError(
        `DECLARACIÓN INCOMPLETA: ${out.apply ? "--apply" : "--revert"} exige ${missing.join(", ")}. ` +
          "Aplicar sin declarar el destino y el plan aprobado es cómo una orden copiada acaba en otra base o aplica otro plan.",
      );
    }
    if (out.planOut) {
      throw new CliUsageError(
        "MODOS INCOMPATIBLES: --plan-out congela un plan nuevo y --apply consume uno revisado. Son dos pasos.",
      );
    }
    if (out.snapshotPath) {
      throw new CliUsageError(
        "SNAPSHOT AL ESCRIBIR: aplicar y revertir leen la base en vivo y comparan; confiar en un archivo para el estado actual es quedarse sin esa comprobación.",
      );
    }
  } else {
    const stray = applyOnly.filter(([, v]) => v).map(([f]) => f);
    if (stray.length > 0) {
      throw new CliUsageError(
        `ARGUMENTOS DE ESCRITURA SIN --apply NI --revert: ${stray.join(", ")}. La planificación no escribe nada, así que no declara destino ni consume un plan.`,
      );
    }
  }

  return out;
}

function requireValue(flag: string, value: string): string {
  if (value === "") throw new CliUsageError(`${flag} necesita un valor.`);
  return value;
}

/**
 * The destination, resolved from the process and the connection.
 *
 * Mirrors `catalog/authorship-repair-cli.ts#resolveTarget`, including the rules
 * that are easy to get wrong: production is refused outright and no token
 * enables it; staging needs this procedure's token in THIS invocation, also over
 * loopback, because a tunnel or a local proxy does not prove there is no other
 * database behind it; and a local posture never reaches a non-loopback host.
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
  if (!args.apply && !args.revert) return target; // A dry run writes nothing anywhere.

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
      "RECHAZADO: postura production. Esta reparación no se aplica en producción y no hay token que lo habilite.",
    );
  }
  if (posture === "staging" && env[STAGING_TOKEN] !== "1") {
    throw new CliUsageError(
      `RECHAZADO: escribir en postura staging exige ${STAGING_TOKEN}=1 en ESTA invocación, también por loopback — un túnel o un proxy local no demuestran que detrás no haya otra base. No debe quedar fijado en las variables del servicio: eso convierte un permiso puntual en un bypass permanente.`,
    );
  }
  if (!target.isLoopback && posture !== "staging") {
    throw new CliUsageError(
      `RECHAZADO: la conexión apunta a ${target.host}, que no es loopback, mientras el proceso se declara ${posture}. Una etiqueta local no autoriza escribir en una base alojada.`,
    );
  }
  return target;
}

/**
 * And finally: ask the SERVER which database this is.
 *
 * The connection string is what we asked for; `current_database()` is what we
 * got. They can differ — a proxy, a `?options=-c search_path`, a pooler pointed
 * elsewhere, a copy restored under another name — and the whole point of the
 * previous checks is lost if nobody closes the gap between the label and the
 * server.
 */
export function assertConnectedDatabase(
  target: TargetIdentity,
  currentDatabase: string,
): void {
  if (currentDatabase !== target.database) {
    throw new CliUsageError(
      `BASE CONECTADA DISTINTA: la conexión declara "${target.database}" y el servidor responde "${currentDatabase}". ` +
        "Dos etiquetas de acuerdo no son un destino.",
    );
  }
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

export interface ExpectedPlanIdentity {
  planId: string;
  planHash: string;
}

/**
 * Five separate questions, because they fail for five different reasons.
 *
 * A plan of an unknown format · a plan for another book · a plan for another
 * database · a plan for a state that has since moved · and a plan that is not
 * the one approved. Only the last one cannot come from the file.
 */
export function assertPlanStillValid(
  frozen: FrozenEmphasisPlan,
  fresh: EmphasisPlan,
  target: TargetIdentity,
  expected: ExpectedPlanIdentity,
): void {
  if (frozen.format !== EMPHASIS_PLAN_FORMAT) {
    throw new Error(`FORMATO DESCONOCIDO: ${frozen.format}`);
  }
  if (frozen.bookSlug !== fresh.bookSlug) {
    throw new Error(
      `LIBRO DISTINTO: el plan es de "${frozen.bookSlug}" y se está planificando "${fresh.bookSlug}".`,
    );
  }
  if (frozen.database !== target.database) {
    throw new Error(
      `BASE DISTINTA: el plan se construyó contra "${frozen.database}" y la conexión apunta a "${target.database}".`,
    );
  }
  if (frozen.planId !== expected.planId) {
    throw new Error(
      `PLAN NO APROBADO: el archivo dice ${frozen.planId} y se declaró ${expected.planId}. ` +
        "Un archivo sustituido respondería por sí mismo; por eso la identidad viene de la invocación.",
    );
  }
  if (frozen.planHash !== expected.planHash) {
    throw new Error(
      `HASH NO APROBADO: el archivo dice ${frozen.planHash} y se declaró ${expected.planHash}.`,
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

export const PREIMAGE_FORMAT =
  "feelverse.content-core-emphasis-preimage/v1" as const;

export interface PreimageFile {
  format: typeof PREIMAGE_FORMAT;
  planId: string;
  planHash: string;
  database: string;
  recordedAt: string;
  preimages: Preimage[];
}

/**
 * The preimage on disk, rewritten after every op.
 *
 * Accumulated-and-rewritten rather than appended, deliberately: the file is
 * either a complete, parseable reversal or it is the previous complete one.
 * An append-per-line file truncated mid-write by a killed process is neither,
 * and a reversal you cannot parse is not a reversal.
 *
 * The cost of rewriting is real and measured rather than waved at — see the
 * volume rehearsal in `markdown-repair.pg-spec.ts`, which drives this exact
 * function 732 times inside the transaction, because an operational limit
 * measured without the I/O it will actually do is not a limit.
 */
export function writePreimageFile(
  path: string,
  identity: { planId: string; planHash: string; database: string },
  preimages: readonly Preimage[],
): void {
  const file: PreimageFile = {
    format: PREIMAGE_FORMAT,
    planId: identity.planId,
    planHash: identity.planHash,
    database: identity.database,
    recordedAt: new Date().toISOString(),
    preimages: [...preimages],
  };
  writeJson(path, file);
}

export function loadPreimageFile(path: string): PreimageFile {
  if (!existsSync(resolve(path))) {
    throw new Error(`PREIMAGEN NO ENCONTRADA: ${path}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const file = require(resolve(path)) as PreimageFile;
  if (file.format !== PREIMAGE_FORMAT) {
    throw new Error(`FORMATO DE PREIMAGEN DESCONOCIDO: ${file.format}`);
  }
  if (!Array.isArray(file.preimages) || file.preimages.length === 0) {
    throw new Error(
      "PREIMAGEN VACÍA: no describe ninguna fila, así que no revierte nada.",
    );
  }
  return file;
}

/**
 * The preimage and the plan have to be two halves of the same operation.
 *
 * Checked separately from identity: a preimage of ANOTHER run of the same plan
 * would carry the right `planHash` and the wrong rows, and a preimage of the
 * right run would carry the right rows under a different `planId`. Both are
 * refusals, and they are not the same mistake.
 */
export function assertPreimageMatchesPlan(
  frozen: FrozenEmphasisPlan,
  file: PreimageFile,
): void {
  if (file.planId !== frozen.planId) {
    throw new Error(
      `PREIMAGEN DE OTRO PLAN: el plan es ${frozen.planId} y la preimagen dice ${file.planId}.`,
    );
  }
  if (file.planHash !== frozen.planHash) {
    throw new Error(
      `PREIMAGEN DE OTRO HASH: el plan es ${frozen.planHash} y la preimagen dice ${file.planHash}.`,
    );
  }
  if (file.database !== frozen.database) {
    throw new Error(
      `PREIMAGEN DE OTRA BASE: el plan es de ${frozen.database} y la preimagen de ${file.database}.`,
    );
  }
  const planned = new Set(frozen.ops.map((o) => o.chapterBlockId));
  const recorded = new Set(file.preimages.map((p) => p.chapterBlockId));
  const missing = [...planned].filter((id) => !recorded.has(id));
  const extra = [...recorded].filter((id) => !planned.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `PREIMAGEN INCOMPLETA: ${missing.length} bloque(s) del plan sin preimagen y ${extra.length} sin plan. ` +
        "Una reversión parcial no se ejecuta a ciegas.",
    );
  }
}

/**
 * How long the write transaction may take.
 *
 * Explicit, bounded, and taken from the volume rehearsal rather than from
 * optimism. The rehearsal drives the real persistence — 732 accumulating
 * rewrites of a 328 KiB preimage file, inside the transaction — and measured:
 *
 *   · apply, 732 bloques, preimage on disk: **2,6 s** local · **3,4 s** in CI
 *   · revert, from the file: **2,1 s** local
 *
 * 60 s is about twenty times the measured apply: room for a VPS disk several
 * times slower than CI's, and still nowhere near long enough for a hung
 * transaction to sit on row locks unnoticed.
 *
 * NOT Prisma's 5 s default. The measured path would fit on a good day and not
 * on a slow one, which is the worst property a limit can have — and an earlier
 * version of this work claimed the volume revert had run "under the default"
 * while the rehearsal was in fact passing `120000`. That claim was false; this
 * constant, and the measurements above it, are the correction.
 */
export const TRANSACTION_TIMEOUT_MS = 60_000;
/** Time to wait for a connection before giving up. Prisma's default is 2 s. */
export const TRANSACTION_MAX_WAIT_MS = 10_000;

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
      console.log(`planHash: ${frozen.planHash}`);
    } else {
      console.log("\n(sin --plan-out: nada se congeló; nada se escribió)");
    }
    return;
  }

  const posture = resolveEnvironment();
  const target = resolveTarget(args, process.env, posture);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require("@prisma/client");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaPg } = require("@prisma/adapter-pg");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require("pg");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on("error", () => undefined);
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const [{ current_database: connected }] = (await prisma.$queryRawUnsafe(
      "SELECT current_database()",
    )) as { current_database: string }[];
    assertConnectedDatabase(target, connected);

    const snapshot = await readEmphasisSnapshot(
      prisma as unknown as SnapshotClient,
      args.book,
    );
    const plan = planEmphasisRepair(snapshot);

    if (!args.apply && !args.revert) {
      console.log(describeEmphasisPlan(plan));
      console.log(
        `\nbase: ${connected} · host ${target.host}:${target.port} · postura ${posture}`,
      );
      if (args.planOut) {
        assertPrivatePath(args.planOut, resolve(__dirname, "../../../.."));
        const frozen = freezeEmphasisPlan(plan, connected);
        writeJson(args.planOut, frozen);
        console.log(`plan congelado: ${resolve(args.planOut)}`);
        console.log(`planId: ${frozen.planId}`);
        console.log(`planHash: ${frozen.planHash}`);
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

    if (args.revert) {
      /**
       * Recovery. Three questions before a single row moves: is this the plan
       * that was approved (identity, from the invocation), is this preimage the
       * other half of THAT run (correspondence), and is this the database it
       * ran against.
       *
       * Note what is NOT checked: that the live database still produces the
       * plan. It does not, and should not — the repair has been applied. What
       * `revertOp` checks instead is the POSTIMAGE, derived from the plan and
       * the preimage, which is the state the apply left.
       */
      if (frozen.format !== EMPHASIS_PLAN_FORMAT) {
        throw new Error(`FORMATO DESCONOCIDO: ${frozen.format}`);
      }
      if (frozen.planId !== args.expectPlanId) {
        throw new Error(
          `PLAN NO APROBADO: el archivo dice ${frozen.planId} y se declaró ${args.expectPlanId}.`,
        );
      }
      if (frozen.planHash !== args.expectPlanHash) {
        throw new Error(
          `HASH NO APROBADO: el archivo dice ${frozen.planHash} y se declaró ${args.expectPlanHash}.`,
        );
      }
      if (frozen.database !== connected) {
        throw new Error(
          `BASE DISTINTA: el plan es de "${frozen.database}" y el servidor responde "${connected}".`,
        );
      }
      const file = loadPreimageFile(args.preimagePath!);
      assertPreimageMatchesPlan(frozen, file);

      const reverted = await prisma.$transaction(
        async (tx: unknown) =>
          revertEmphasisRepair(
            tx as never,
            { ...plan, ops: frozen.ops, blockers: frozen.blockers },
            file.preimages,
          ),
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
      );
      console.log(`revertido: ${reverted.opsReverted} bloque(s)`);
      const again = planEmphasisRepair(
        await readEmphasisSnapshot(
          prisma as unknown as SnapshotClient,
          args.book,
        ),
      );
      console.log(
        `comprobación posterior: ${again.ops.length} operación(es) propuestas` +
          (again.ops.length === frozen.ops.length
            ? " — volvió al estado inicial"
            : " — NO coincide con el plan original, revísalo"),
      );
      return;
    }

    assertPlanStillValid(frozen, plan, target, {
      planId: args.expectPlanId!,
      planHash: args.expectPlanHash!,
    });

    const preimagePath = preimagePathFor(args.planPath!);
    assertPrivatePath(preimagePath, resolve(__dirname, "../../../.."));

    const preimages: Preimage[] = [];
    const identity = {
      planId: frozen.planId,
      planHash: frozen.planHash,
      database: connected,
    };
    const result = await prisma.$transaction(
      async (tx: unknown) =>
        applyEmphasisRepair(tx as never, plan, (pre) => {
          preimages.push(pre);
          // Flushed on every op so a reversal exists on DISK even if this
          // process dies between statements — the recovery command reads that
          // file and nothing from this process's memory.
          writePreimageFile(preimagePath, identity, preimages);
        }),
      { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_MAX_WAIT_MS },
    );

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
