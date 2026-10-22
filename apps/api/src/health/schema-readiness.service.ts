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
 * Migration directory names, or null when no VALID inventory can be read.
 *
 * Null is not «zero migrations», and the difference is the whole point: an
 * empty list diffs clean against any database and would report ready. Three
 * distinct ways of having no inventory therefore all answer null:
 *
 *   - no candidate path exists;
 *   - a path exists but holds no migration directories at all;
 *   - a path holds migration directories, but at least one has lost its
 *     `migration.sql`.
 *
 * The third is the one worth spelling out. A real Prisma folder always pairs
 * each directory with its SQL, so a directory without one means the build
 * pruned files this probe depends on — and a probe that silently reports on a
 * partial inventory is worse than one that says it cannot tell.
 */
export function readShippedMigrations(
  dirs: readonly string[] = defaultMigrationDirs(),
): string[] | null {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    let names: string[];
    try {
      names = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // Unreadable is not absent: stop rather than fall through to a path
      // that might answer differently and hide this one.
      return null;
    }

    // An existing-but-empty folder is the false-200 case. It is not evidence
    // of a database with nothing to apply; it is evidence of an image we
    // cannot interrogate.
    if (names.length === 0) return null;

    const withSql = names.filter((name) =>
      existsSync(join(dir, name, "migration.sql")),
    );
    if (withSql.length !== names.length) return null;

    return withSql;
  }
  return null;
}

/**
 * How long a verdict is reused.
 *
 * The endpoint is public and un-throttled by inheritance, so without this a
 * stranger could turn each request into a Postgres query plus a directory
 * walk. Five seconds collapses any burst into one read while staying short
 * enough that a gate polling every few seconds sees a stale answer at most
 * once — including on the way back to healthy.
 */
export const READINESS_CACHE_MS = 5_000;

@Injectable()
export class SchemaReadinessService {
  private readonly logger = new Logger(SchemaReadinessService.name);
  private cached: { at: number; value: SchemaReadiness } | null = null;
  /** The last reason written to the log, so repeats stay quiet. */
  private lastLogged: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async report(
    dirs: readonly string[] = defaultMigrationDirs(),
  ): Promise<SchemaReadiness> {
    const now = Date.now();
    if (this.cached !== null && now - this.cached.at < READINESS_CACHE_MS) {
      return this.cached.value;
    }

    const value = await this.compute(dirs);
    this.cached = { at: now, value };

    // Log on TRANSITION, not per request. A public endpoint being polled
    // while the schema is behind would otherwise write the same error line
    // forever, which buries the one occurrence that mattered.
    if (value.reason !== this.lastLogged) {
      this.lastLogged = value.reason;
      if (value.ready) {
        this.logger.log("Schema readiness: ready.");
      } else if (value.reason === "migrations-unreadable") {
        this.logger.error(
          "Schema readiness: no valid migrations inventory in this image.",
        );
      } else if (value.reason === "database-unreachable") {
        this.logger.error(
          "Schema readiness: the migration ledger could not be read.",
        );
      } else {
        this.logger.error(
          `Schema readiness: NOT ready (${value.reason}) — pending=[${value.pending.join(
            ", ",
          )}] failed=[${value.failed.join(", ")}]`,
        );
      }
    }
    return value;
  }

  private async compute(
    dirs: readonly string[],
  ): Promise<SchemaReadiness> {
    const shipped = readShippedMigrations(dirs);
    if (shipped === null) return unreadable("migrations-unreadable");

    try {
      const applied = await this.prisma.$queryRaw<AppliedMigrationRow[]>`
        SELECT "migration_name", "finished_at", "rolled_back_at"
          FROM "_prisma_migrations"
      `;
      return diffMigrations({ shipped, applied });
    } catch {
      // Includes the case where `_prisma_migrations` does not exist at all,
      // which is precisely the empty-database failure of 2026-10-01. The
      // driver's message is deliberately not logged or returned: it can carry
      // the connection target, and this verdict travels to a public endpoint.
      return unreadable("database-unreachable", shipped.length);
    }
  }
}
