import { PrismaClient } from "@prisma/client";

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
 * reservations the existing rows already imply, and is NOT authorised by this
 * PR: it runs only once the previous binary is proven extinct by its boot
 * marker, because it excludes concurrent writers with a lock that binary never
 * takes.
 *
 * Neither mode changes an editorial binding. `definitionJson` is read and never
 * written.
 */

function render(report: BackfillReport): void {
  const lines = [
    `EXPERIENCE_RESERVATION_BACKFILL=${report.applied ? "applied" : "measured"}`,
    `ROWS_CONSIDERED=${report.rowsConsidered}`,
    `ROWS_LEGACY=${report.rowsLegacy}`,
    `ROWS_ALREADY_MATERIALISED=${report.rowsAlreadyMaterialised}`,
    `ROWS_WITH_POSITION_DRIFT=${report.rowsWithPositionDrift}`,
    // The number the C.3B gate exists to look at: legacy rows whose chapter is
    // being INFERRED from the position they carry. Once written it cannot be
    // told apart from an identity the CMS chose.
    `ROWS_ADOPTING_CURRENT_POSITION=${report.rowsAdoptingCurrentPosition}`,
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
  if (!report.applied && report.rowsAdoptingCurrentPosition > 0) {
    // Said out loud, because it is the one thing `--apply` does that cannot be
    // undone: those rows have no identity, so the command gives them the unit
    // that sits at their number TODAY, and after the cutover's CHECK that
    // becomes permanent and indistinguishable from a chosen one.
    lines.push(
      `  NOTE: ${report.rowsAdoptingCurrentPosition} legacy row(s) would ADOPT ` +
        `their current position as identity. That inference is irreversible.`,
    );
  }
  console.log(lines.join("\n"));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const measure = argv.includes("--measure");
  const apply = argv.includes("--apply");
  if (measure === apply) {
    console.error("Usage: content:experience:reserve --measure | --apply");
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const report = apply
      ? await applyReservations(prisma)
      : await measureReservations(prisma);
    render(report);
    // Measuring a set that cannot be applied is a successful measurement of a
    // blocked state, and the exit code says so without pretending it failed.
    if (!apply && report.anomalies.length > 0) process.exitCode = 3;
  } catch (err) {
    if (err instanceof BackfillAbort) {
      render({
        rowsConsidered: 0,
        rowsLegacy: 0,
        rowsAlreadyMaterialised: 0,
        rowsWithPositionDrift: 0,
        rowsAdoptingCurrentPosition: 0,
        groups: 0,
        reservationsExisting: 0,
        reservationsToCreate: 0,
        reservationsCreated: 0,
        reservationsReplayed: 0,
        columnsFilled: 0,
        anomalies: err.anomalies,
        applied: false,
      });
      console.error(
        "ABORTED — nothing was written. Fix the catalog and run again.",
      );
      process.exitCode = 3;
      return;
    }
    if (err instanceof BackfillFailure) {
      // A code and nothing else. A driver message can carry a connection
      // string or a row's contents, and this output gets pasted into tickets.
      console.error(`FAILED ${err.code} — nothing was written.`);
      process.exitCode = 4;
      return;
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
