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
  PlanFileError,
  PREIMAGE_FORMAT,
  recordOutcome,
  sanitizedPlanSummary,
  targetIdentityFromUrl,
  type FrozenPlan,
  type TargetIdentity,
} from "./authorship-plan-file";
import {
  applyAuthorshipRepair,
  collectReversal,
  RepairConflictError,
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
  expectPlanId?: string;
  expectPlanHash?: string;
  json: boolean;
}

/** Flags that are a switch: present or absent, never carrying a value. */
const BOOLEAN_FLAGS = ["--apply", "--json"] as const;

/** Flags that need a value, mapped to where it lands. */
const VALUE_FLAGS: Record<string, keyof CliArgs> = {
  "--plan": "planPath",
  "--plan-out": "planOut",
  "--reversal-out": "reversalOut",
  "--expect-database": "expectDatabase",
  "--expect-posture": "expectPosture",
  "--expect-plan-id": "expectPlanId",
  "--expect-plan-hash": "expectPlanHash",
};

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

/**
 * Parse argv strictly.
 *
 * Three ways this was wrong, each of which turns a careful command into a
 * different one:
 *
 *   · `--apply=false` set `apply: true`. The value was read off the flag name
 *     and then discarded, so the most natural way to express "don't write"
 *     was the way to write. A boolean flag now REFUSES a value rather than
 *     guessing which truthiness the operator meant.
 *   · a repeated flag silently took the last value, so `--plan=a --plan=b`
 *     applied `b` while the operator read `a` in their scrollback.
 *   · flags belonging to the other mode were ignored in silence: `--plan`
 *     without `--apply` looked like an application that did nothing, and
 *     `--plan-out` with `--apply` looked like it froze a file it never wrote.
 */
export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { apply: false, json: false };
  const seen = new Set<string>();

  for (const raw of argv) {
    // A bare `--` is the POSIX end-of-options separator, not an argument, and
    // `pnpm run <script> -- --flag` forwards it verbatim. Rejecting it made the
    // documented invocation fail. Strictness is about unknown FLAGS; dropping
    // the separator does not let a misspelling through.
    if (raw === "--") continue;
    const eq = raw.indexOf("=");
    const flag = eq === -1 ? raw : raw.slice(0, eq);
    const value = eq === -1 ? undefined : raw.slice(eq + 1);

    const isBoolean = (BOOLEAN_FLAGS as readonly string[]).includes(flag);
    const target = VALUE_FLAGS[flag];
    if (!isBoolean && !target) {
      throw new CliUsageError(
        `ARGUMENTO DESCONOCIDO: ${JSON.stringify(raw)}. Se rechaza en vez de ignorarlo: una bandera mal escrita no debe convertirse en silencio en otro modo.`,
      );
    }

    if (seen.has(flag)) {
      throw new CliUsageError(
        `ARGUMENTO REPETIDO: ${flag} aparece más de una vez. No se elige el último en silencio — eso aplica un valor distinto del que se leyó.`,
      );
    }
    seen.add(flag);

    if (isBoolean) {
      if (value !== undefined) {
        throw new CliUsageError(
          `${flag} NO LLEVA VALOR: se recibió ${JSON.stringify(
            `${flag}=${value}`,
          )}. Para no escribir, omite ${flag}; interpretar «false» como activación es exactamente el error que se evita.`,
        );
      }
      if (flag === "--apply") out.apply = true;
      else out.json = true;
      continue;
    }

    if (value === undefined || value.trim() === "") {
      throw new CliUsageError(`${flag} necesita un valor.`);
    }
    (out as unknown as Record<string, unknown>)[target!] = value;
  }

  // Modes that would be silently ignored are a mistake, not a preference.
  if (out.apply) {
    if (out.planOut) {
      throw new CliUsageError(
        "MODOS INCOMPATIBLES: --plan-out congela un plan nuevo y --apply consume uno revisado. Ejecuta los dos pasos por separado.",
      );
    }
  } else {
    const applyOnly = (
      [
        ["--plan", out.planPath],
        ["--reversal-out", out.reversalOut],
        ["--expect-database", out.expectDatabase],
        ["--expect-posture", out.expectPosture],
        ["--expect-plan-id", out.expectPlanId],
        ["--expect-plan-hash", out.expectPlanHash],
      ] as const
    ).filter(([, v]) => v !== undefined);
    if (applyOnly.length > 0) {
      throw new CliUsageError(
        `ARGUMENTO SIN EFECTO: ${applyOnly
          .map(([f]) => f)
          .join(
            ", ",
          )} sólo cuenta con --apply. Un dry-run que acepta argumentos de aplicación parece haber aplicado algo.`,
      );
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

  /**
   * Staging needs the token, whatever the host.
   *
   * It used to need it only for a non-loopback host, which treated `localhost`
   * as proof that nothing else could be behind it. It is not: a tunnel, a
   * proxy, or a staging box whose database is local all present as loopback.
   * The permission belongs to the POSTURE — "this is the staging catalogue" —
   * and the host cannot grant it.
   */
  if (posture === "staging" && env[STAGING_TOKEN] !== "1") {
    throw new CliUsageError(
      `RECHAZADO: aplicar en postura staging exige ${STAGING_TOKEN}=1 en ESTA invocación, también por loopback — un túnel o un proxy local no demuestran que detrás no haya otra base. El token del seed no sirve, y no debe quedar fijado en las variables del servicio: eso convierte un permiso puntual en un bypass permanente.`,
    );
  }

  // And a local label never reaches a hosted database, token or not.
  if (!target.isLoopback && posture !== "staging") {
    throw new CliUsageError(
      `RECHAZADO: la conexión apunta a ${target.host}, que no es loopback, mientras el proceso se declara ${posture}. Una etiqueta local no autoriza escribir en una base alojada.`,
    );
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
    /** applied | aborted | uncertain — never inferred from the preimage. */
    outcome?: string;
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

/* ── Bounded error reporting ────────────────────────────────────────────── */

/**
 * What an operator is told when something fails.
 *
 * The generic handler printed `err.message` verbatim, and the messages it
 * might print are not all ours: a driver error can carry the connection
 * string, a failing statement's parameters, or a row's values — including the
 * very credential this tool exists to withdraw. So the message is only passed
 * through for the error types WE raise and whose text we wrote. Anything else
 * is reported by its class and code, which is what actually helps, with a
 * pointer to the private files for the rest.
 */
export function describeError(err: unknown): {
  kind: string;
  code?: string;
  message: string;
  exitCode: number;
} {
  if (err instanceof RepairConflictError) {
    return {
      kind: "RepairConflictError",
      message: err.message,
      exitCode: 3,
    };
  }
  if (err instanceof RepairPreconditionError) {
    return {
      kind: "RepairPreconditionError",
      message: err.message,
      exitCode: 3,
    };
  }
  if (err instanceof PlanFileError) {
    return { kind: "PlanFileError", message: err.message, exitCode: 5 };
  }
  if (err instanceof CliUsageError) {
    return { kind: "CliUsageError", message: err.message, exitCode: 4 };
  }
  // Foreign error: keep the useful identity, drop the payload.
  const e = err as { name?: string; code?: string | number };
  const kind =
    typeof e?.name === "string" && e.name.trim() !== "" ? e.name : "Error";
  const code = e?.code === undefined ? undefined : String(e.code);
  return {
    kind,
    ...(code ? { code } : {}),
    message:
      "fallo no previsto por esta herramienta; su detalle no se imprime porque puede contener valores, cadenas de conexión o argumentos de consulta. Revisa el archivo de resultado y el de preimagen.",
    exitCode: 1,
  };
}

/* ── The orchestration, invocable ──────────────────────────────────────── */

/**
 * Everything `main` needs from the outside world.
 *
 * Injected rather than imported so the journey — freeze a plan, load it back,
 * apply it with a persisted backup, re-run it — can be exercised against a
 * real disposable database without spawning a process. Asserting where a call
 * sits in the source is not evidence that the command works.
 */
export interface RepairDeps {
  argv: string[];
  env: Record<string, string | undefined>;
  posture: string;
  prisma: {
    $queryRawUnsafe(sql: string): Promise<unknown>;
    $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
    bookAuthor: { findMany: (a: unknown) => Promise<unknown> };
    book: { findMany: (a: unknown) => Promise<unknown> };
  };
  /** Narrative sink. Stdout/stderr routing is the caller's business. */
  say?: (line: string) => void;
}

export interface RepairRun {
  mode: "dry-run" | "apply";
  target: TargetIdentity;
  plan: FrozenPlan;
  reversalEntries: number;
  /** Absolute path of the preimage, when one was written. */
  preimage?: string;
  /** Absolute path of the outcome record, when one was written. */
  outcome?: string;
  outcomeState?: "applied" | "aborted" | "uncertain";
  rowsWritten: number;
  report: Record<string, unknown>;
  /** Set when blockers stopped the run before anything else happened. */
  stopped?: "blockers";
}

export async function runRepair(deps: RepairDeps): Promise<RepairRun> {
  const say = deps.say ?? (() => undefined);
  const args = parseArgs(deps.argv);
  const target = resolveTarget(args, deps.env, deps.posture);

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

  // The server must really be the database the connection string names.
  const rows = (await deps.prisma.$queryRawUnsafe(
    "select current_database() as db",
  )) as Array<{ db: string }>;
  const live = rows[0]?.db;
  if (live !== target.database) {
    throw new CliUsageError(
      `IDENTIDAD CONTRADICTORIA: la cadena de conexión dice ${target.database} y el servidor responde ${String(live)}.`,
    );
  }

  say("══ reparación de autoría del catálogo ══");
  say(
    `  destino   : ${target.database}@${target.host} (loopback=${target.isLoopback})`,
  );
  say(`  postura   : ${deps.posture}`);
  say(
    `  modo      : ${args.apply ? "APLICAR (escribe)" : "DRY-RUN (no escribe)"}`,
  );

  const frozen: FrozenPlan = args.apply
    ? loadFrozenPlan(args.planPath as string, target, {
        planId: args.expectPlanId,
        planHash: args.expectPlanHash,
      })
    : freezePlan(planAuthorshipRepair(await readSnapshot(deps.prisma)), target);

  say(`  plan      : ${frozen.planId}${args.apply ? "" : " (nuevo)"}`);
  say(`  hash      : ${frozen.planHash}`);
  say("");
  say(describePlan(frozen));
  say("");

  if (frozen.blockers.length > 0) {
    say(
      `DETENIDO: ${frozen.blockers.length} bloqueo(s). No se aplica nada mientras exista una ambigüedad.`,
    );
    return {
      mode: args.apply ? "apply" : "dry-run",
      target,
      plan: frozen,
      reversalEntries: 0,
      rowsWritten: 0,
      stopped: "blockers",
      report: sanitizedReport(target, frozen),
    };
  }

  if (!args.apply) {
    if (args.planOut) {
      writeFileSync(args.planOut, `${JSON.stringify(frozen, null, 2)}\n`, {
        mode: 0o600,
      });
      say(`  plan congelado escrito en ${args.planOut}`);
      say(
        `  revísalo y pásalo con --plan=<esa ruta> --expect-plan-id=${frozen.planId}; apply no recalcula.`,
      );
    } else {
      say(
        "  (sin --plan-out no se congela nada, y --apply exigirá un plan en disco)",
      );
    }
    // A dry run checks every precondition it can, including for a book whose
    // target author does not exist yet, and records the reversal it would need.
    const entries = await collectReversal(deps.prisma as never, frozen);
    say("");
    say(`  reversión prevista: ${entries.length} entrada(s)`);
    for (const e of entries) say(`    · ${e.subject}`);
    say("");
    say("DRY-RUN: no se escribió nada.");
    return {
      mode: "dry-run",
      target,
      plan: frozen,
      reversalEntries: entries.length,
      rowsWritten: 0,
      report: sanitizedReport(target, frozen),
    };
  }

  // ── apply ──────────────────────────────────────────────────────────────
  const preimage = args.reversalOut as string;
  const entries = await collectReversal(deps.prisma as never, frozen);
  persistReversal(preimage, {
    format: PREIMAGE_FORMAT,
    planId: frozen.planId,
    planHash: frozen.planHash,
    state: "intended",
    target: frozen.target,
    preparedAt: new Date().toISOString(),
    entries,
    note: "Valores previos literales. Archivo privado, permisos 600, fuera del árbol del producto, escrito una sola vez y nunca reabierto para escribir. Un archivo sin su resultado al lado NO acredita que se haya aplicado nada.",
  });
  say(`  preimagen verificada en ${preimage}`);

  let result;
  try {
    result = await deps.prisma.$transaction(async (tx: unknown) =>
      applyAuthorshipRepair(tx as never, frozen, { apply: true }),
    );
  } catch (err) {
    // The transaction rolled back, so the database is untouched. Record that
    // beside the preimage, never onto it.
    const outcome = recordOutcome(preimage, "aborted", describeError(err).kind);
    say(`  resultado: abortado · registrado en ${outcome}`);
    throw err;
  }

  // Committed. If recording that fails, the outcome is UNCERTAIN as far as
  // any later reader is concerned — and saying "nothing changed" would be a
  // lie. The preimage is intact either way, because nothing rewrites it.
  let outcomePath: string | undefined;
  let outcomeState: RepairRun["outcomeState"] = "applied";
  try {
    outcomePath = recordOutcome(preimage, "applied");
  } catch (err) {
    outcomeState = "uncertain";
    say(
      `  ATENCIÓN: la transacción se confirmó y el registro del resultado falló (${describeError(err).kind}).`,
    );
    say(
      "  La base SÍ cambió. La preimagen sigue intacta en su ruta; no se informa que nada cambió.",
    );
  }

  say("");
  say("══ resultado ══");
  say(`  filas escritas: ${result.rowsWritten}`);
  for (const a of result.applied) {
    say(`  · ${a.subject} — ${a.op} — ${a.wrote ? "escrito" : "sin cambio"}`);
  }

  return {
    mode: "apply",
    target,
    plan: frozen,
    reversalEntries: entries.length,
    preimage,
    ...(outcomePath ? { outcome: outcomePath } : {}),
    outcomeState,
    rowsWritten: result.rowsWritten,
    report: sanitizedReport(target, frozen, {
      dryRun: result.dryRun,
      rowsWritten: result.rowsWritten,
      applied: result.applied as unknown as Array<Record<string, unknown>>,
      outcome: outcomeState,
    }),
  };
}

async function main() {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

  const argv = process.argv.slice(2);
  const env = process.env as Record<string, string | undefined>;
  // Parsed once here only to know where the narrative goes; runRepair parses
  // it again and is the single authority on what the arguments mean.
  const json = argv.includes("--json");

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const run = await runRepair({
      argv,
      env,
      posture: resolveEnvironment(),
      prisma,
      // With --json, stdout carries ONLY the sanitized report so a caller can
      // pipe it. The narrative still has to be visible, so it goes to stderr
      // rather than being suppressed: an operator reading along loses nothing.
      say: (line) => process[json ? "stderr" : "stdout"].write(`${line}\n`),
    });
    if (run.stopped === "blockers") process.exitCode = 2;
    if (json) console.log(JSON.stringify(run.report, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

/* Only runs as an entry point — importing this file connects to nothing. */
if (require.main === module) {
  main().catch((err: unknown) => {
    const described = describeError(err);
    process.stderr.write(
      `${described.kind}${described.code ? ` [${described.code}]` : ""} — ${described.message}\n`,
    );
    if (described.exitCode === 3) {
      process.stderr.write(
        "No se escribió nada. Revisa el estado real antes de reintentar.\n",
      );
    }
    process.exit(described.exitCode);
  });
}
