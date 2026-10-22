import { Injectable, Logger } from "@nestjs/common";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaService } from "../prisma";
import {
  type AppliedMigrationRow,
  type SchemaReadiness,
  diffMigrations,
  unreadable,
} from "./schema-readiness";

/**
 * Reads the two inventories `diffMigrations` compares.
 *
 * The I/O lives here and the verdict lives in `schema-readiness.ts`, so the
 * rules can be tested without a database or a filesystem — and so this file
 * stays small enough to audit.
 */

/**
 * Where a migration folder can be, in the order worth trying.
 *
 * `/app/apps/api` is the container's working directory (it is the path the
 * deploy log shows `pnpm --filter @psico/api` resolving to), and the repo root
 * is what a local `pnpm --filter @psico/api start` uses. `__dirname` covers
 * the compiled layout, where this file sits in `dist/health`.
 */
export function defaultMigrationDirs(): string[] {
  const dirs = [
    join(process.cwd(), "prisma", "migrations"),
    join(process.cwd(), "apps", "api", "prisma", "migrations"),
  ];
  if (typeof __dirname === "string") {
    dirs.push(join(__dirname, "..", "..", "prisma", "migrations"));
    dirs.push(join(__dirname, "..", "..", "..", "prisma", "migrations"));
  }
  return dirs;
}

/**
 * Migration directory names, or null when none of the candidates exists.
 *
 * Null is NOT an empty list. An empty list would diff clean against any
 * database and report ready; null routes to the fail-closed verdict.
 */
export function readShippedMigrations(
  dirs: readonly string[] = defaultMigrationDirs(),
): string[] | null {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // Unreadable is not absent: stop rather than fall through to a path
      // that might answer differently and hide this one.
      return null;
    }
  }
  return null;
}

@Injectable()
export class SchemaReadinessService {
  private readonly logger = new Logger(SchemaReadinessService.name);

  constructor(private readonly prisma: PrismaService) {}

  async report(
    dirs: readonly string[] = defaultMigrationDirs(),
  ): Promise<SchemaReadiness> {
    const shipped = readShippedMigrations(dirs);
    if (shipped === null) {
      this.logger.error(
        "Schema readiness: no migrations directory found in this image.",
      );
      return unreadable("migrations-unreadable");
    }

    let applied: AppliedMigrationRow[];
    try {
      applied = await this.prisma.$queryRaw<AppliedMigrationRow[]>`
        SELECT "migration_name", "finished_at", "rolled_back_at"
          FROM "_prisma_migrations"
      `;
    } catch (error) {
      // Includes the case where `_prisma_migrations` does not exist at all,
      // which is precisely the empty-database failure of 2026-10-01.
      this.logger.error(
        `Schema readiness: could not read _prisma_migrations — ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return unreadable("database-unreachable", shipped.length);
    }

    const verdict = diffMigrations({ shipped, applied });
    if (!verdict.ready) {
      // Worth a log line of its own: the endpoint may be polled by something
      // that only records the status code.
      this.logger.error(
        `Schema readiness: NOT ready (${verdict.reason}) — pending=[${verdict.pending.join(
          ", ",
        )}] failed=[${verdict.failed.join(", ")}]`,
      );
    }
    return verdict;
  }
}
