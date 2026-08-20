import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import {
  applyReservations,
  BackfillAbort,
  BackfillFailure,
  measureReservations,
  type BackfillReport,
} from "./experience-reservation-backfill";

/**
 * C.3B (#639) — the operator entry point.
 *
 *   pnpm --filter @psico/api content:experience:reserve -- --measure
 *   pnpm --filter @psico/api content:experience:reserve -- --apply
 *
 * `--measure` is read-only and safe to run at any time. `--apply` writes the
 * reservations the existing rows already imply, and runs only once the previous
 * binary is proven extinct by its boot marker, because it excludes concurrent
 * writers with a lock that binary never takes.
 *
 * Neither mode changes an editorial binding. `definitionJson` is read and never
 * written.
 *
 * ── Why the client is a parameter ───────────────────────────────────────────
 *
 * The first version of this file did `new PrismaClient()` with no arguments and
 * could never run: this project uses driver adapters, so Prisma 7 throws before
 * a single statement executes. It shipped anyway, because the only test that
 * mentioned this file read its SOURCE — the entry point itself was never
 * executed by anything, in any suite.
 *
 * So construction is now a seam with a real default, and `runReservationBackfillCli`
 * is an ordinary async function returning an exit code. A test can drive the
 * real argument parsing, the real dispatch and the real disposal without a
 * database, and a pg-spec can run the literal npm command end to end.
 *
 * Nothing here is constructed at module load. Importing this file opens no pool
 * and no connection, which is what makes it importable from a test at all.
 */

export function renderReport(report: BackfillReport): string {
  const lines = [
    `EXPERIENCE_RESERVATION_BACKFILL=${report.applied ? "applied" : "measured"}`,
    `ROWS_CONSIDERED=${report.rowsConsidered}`,
    `ROWS_LEGACY=${report.rowsLegacy}`,
    `ROWS_ALREADY_MATERIALISED=${report.rowsAlreadyMaterialised}`,
    // Identity, and where it came from. Every row's chapter is established from
    // the exact guide its definition pins — never from the number it carries.
    `ROWS_IDENTITY_FROM_GUIDE_CONTEXT=${report.rowsIdentityFromGuideContext}`,
    // The three position counters are OBSERVATIONS. They say what the old
    // locator would have answered; none of them decided anything.
    `ROWS_POSITION_CORROBORATED=${report.rowsPositionCorroborated}`,
    `ROWS_WITH_POSITION_DRIFT=${report.rowsWithPositionDrift}`,
    `ROWS_WITH_UNRESOLVED_POSITION=${report.rowsWithUnresolvedPosition}`,
    `POSITION_USED_AS_IDENTITY=false`,
    `GROUPS=${report.groups}`,
    `RESERVATIONS_EXISTING=${report.reservationsExisting}`,
    `RESERVATIONS_TO_CREATE=${report.reservationsToCreate}`,
    `RESERVATIONS_CREATED=${report.reservationsCreated}`,
    `RESERVATIONS_REPLAYED=${report.reservationsReplayed}`,
    `COLUMNS_FILLED=${report.columnsFilled}`,
    `ANOMALIES=${report.anomalies.length}`,
  ];
  for (const a of report.anomalies) {
    // Catalog coordinates only — never a row id, a definition or driver text.
    lines.push(
      `  ${a.kind} book=${a.bookSlug} chapter=${a.chapterOrder}` +
        (a.experienceKey ? ` experience=${a.experienceKey}` : "") +
        (a.guideKey ? ` guide=${a.guideKey}` : ""),
    );
  }
  if (report.rowsWithPositionDrift > 0) {
    // Worth seeing, and no longer worth fearing: the row's identity came from
    // its guide, so drift means the NUMBER moved, not that anything was guessed.
    lines.push(
      `  NOTE: ${report.rowsWithPositionDrift} row(s) sit at a chapterOrder that ` +
        `no longer points at their unit. Identity is unaffected.`,
    );
  }
  return lines.join("\n");
}

const EMPTY_REPORT: BackfillReport = {
  rowsConsidered: 0,
  rowsLegacy: 0,
  rowsAlreadyMaterialised: 0,
  rowsWithPositionDrift: 0,
  rowsIdentityFromGuideContext: 0,
  rowsPositionCorroborated: 0,
  rowsWithUnresolvedPosition: 0,
  groups: 0,
  reservationsExisting: 0,
  reservationsToCreate: 0,
  reservationsCreated: 0,
  reservationsReplayed: 0,
  columnsFilled: 0,
  anomalies: [],
  applied: false,
};

/**
 * A client and the way to let go of it.
 *
 * `dispose` ends the pool as well as the client. `$disconnect()` alone leaves
 * the pg pool's sockets open and the process hanging — which in a CLI reads as
 * "it finished but did not exit".
 */
export interface BackfillClientHandle {
  prisma: PrismaClient;
  dispose(): Promise<void>;
}

export type BackfillClientFactory = () => BackfillClientHandle;

/** The real one: pool → adapter → client, exactly as `PrismaService` does it. */
export const createBackfillClient: BackfillClientFactory = () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    prisma,
    async dispose() {
      await prisma.$disconnect().catch(() => undefined);
      await pool.end().catch(() => undefined);
    },
  };
};

const USAGE = "Usage: content:experience:reserve --measure | --apply";

export interface CliDeps {
  argv: readonly string[];
  createClient?: BackfillClientFactory;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
}

/**
 * The whole command, as a function that returns its exit code.
 *
 * Exit codes: 0 clean · 2 bad arguments · 3 measured a blocked state or aborted
 * · 4 a failure with a canonical code.
 *
 * `process.exit()` is never called: it would kill the process before the pool
 * drained, and it would make this untestable in-process.
 */
export async function runReservationBackfillCli(
  deps: CliDeps,
): Promise<number> {
  const out = deps.stdout ?? ((l: string) => console.log(l));
  const err = deps.stderr ?? ((l: string) => console.error(l));

  // Arguments are validated BEFORE anything is constructed. A pool opened for a
  // command that was never going to run is a connection nobody asked for, and
  // on a bad flag it would be opened and closed for nothing.
  const flags = deps.argv.filter((a) => a.startsWith("--") && a !== "--");
  const unknown = flags.filter((f) => f !== "--measure" && f !== "--apply");
  const measure = flags.filter((f) => f === "--measure").length;
  const apply = flags.filter((f) => f === "--apply").length;
  if (unknown.length > 0 || measure + apply !== 1) {
    // Repeated, simultaneous, absent and unrecognised all land here: each of
    // them means the operator did not say one unambiguous thing.
    err(USAGE);
    return 2;
  }

  const handle = (deps.createClient ?? createBackfillClient)();
  try {
    const report =
      apply === 1
        ? await applyReservations(handle.prisma)
        : await measureReservations(handle.prisma);
    out(renderReport(report));
    // Measuring a set that cannot be applied is a successful measurement of a
    // blocked state, and the exit code says so without pretending it failed.
    return apply === 0 && report.anomalies.length > 0 ? 3 : 0;
  } catch (e) {
    if (e instanceof BackfillAbort) {
      out(renderReport({ ...EMPTY_REPORT, anomalies: e.anomalies }));
      err("ABORTED — nothing was written. Fix the catalog and run again.");
      return 3;
    }
    if (e instanceof BackfillFailure) {
      // A code and nothing else. A driver message can carry a connection
      // string or a row's contents, and this output gets pasted into tickets.
      err(`FAILED ${e.code} — nothing was written.`);
      return 4;
    }
    // Anything else that names itself with a canonical code is reported the
    // same way. `CodeOwnedIdentityError` is the one that reaches here in
    // practice — a shipped definition that cannot be placed refuses the whole
    // run, which is the fail-closed rule working — and letting it escape would
    // print a stack trace with absolute paths where a code belongs.
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]+$/.test(code)) {
      err(`FAILED ${code} — nothing was written.`);
      return 4;
    }
    // A genuinely unexpected error is a bug, and a bug should be loud in a
    // test. The process wrapper below is what keeps it out of an operator's
    // terminal.
    throw e;
  } finally {
    // Runs on every path, including the rethrow above.
    await handle.dispose();
  }
}

/* c8 ignore start — the process wrapper, exercised by the pg-spec end to end */
if (require.main === module) {
  void runReservationBackfillCli({ argv: process.argv.slice(2) }).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      // No stack, no paths, no driver text. The runner already released the
      // client; all that is left is to say the run did not happen.
      console.error(
        "FAILED EXPERIENCE_RESERVATION_UNEXPECTED — nothing was written.",
      );
      process.exitCode = 4;
    },
  );
}
/* c8 ignore stop */
