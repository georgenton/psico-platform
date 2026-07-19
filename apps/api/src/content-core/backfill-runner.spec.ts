import { describe, expect, it } from "vitest";
import {
  BACKFILL_FORBIDDEN,
  assertBackfillAllowed,
  parseRunnerArgs,
  serializeDryRunReport,
  type DryRunReport,
} from "./backfill-runner";

/**
 * CC-6F — operational-surface unit tests (no DB). The DB-backed guarantees
 * (dry-run zero writes, only-requested-slug, idempotence, drift rollback,
 * marks untouched, mid-failure rollback) live in backfill-runner.pg-spec.ts.
 */

describe("parseRunnerArgs (CC-6F)", () => {
  it("--apply absent → dry-run (apply=false is the DEFAULT)", () => {
    expect(parseRunnerArgs(["--book-slug=familias-ensambladas"])).toEqual({
      bookSlug: "familias-ensambladas",
      apply: false,
    });
  });

  it("--dry-run is accepted and stays a dry-run", () => {
    expect(
      parseRunnerArgs(["--book-slug=familias-ensambladas", "--dry-run"]).apply,
    ).toBe(false);
  });

  it("--apply must be explicit", () => {
    expect(
      parseRunnerArgs(["--book-slug=familias-ensambladas", "--apply"]).apply,
    ).toBe(true);
  });

  it("a missing --book-slug refuses to run (never the whole catalog)", () => {
    expect(() => parseRunnerArgs(["--apply"])).toThrow("MISSING_BOOK_SLUG");
  });
});

describe("assertBackfillAllowed (CC-6F)", () => {
  it("production WITHOUT ALLOW_CONTENT_CORE_BACKFILL=on → BACKFILL_FORBIDDEN", () => {
    expect(() => assertBackfillAllowed({ NODE_ENV: "production" })).toThrow(
      BACKFILL_FORBIDDEN,
    );
    expect(() =>
      assertBackfillAllowed({
        NODE_ENV: "production",
        ALLOW_CONTENT_CORE_BACKFILL: "off",
      }),
    ).toThrow(BACKFILL_FORBIDDEN);
  });

  it("production WITH the flag on → allowed", () => {
    expect(() =>
      assertBackfillAllowed({
        NODE_ENV: "production",
        ALLOW_CONTENT_CORE_BACKFILL: "on",
      }),
    ).not.toThrow();
  });

  it("non-production → allowed without the flag", () => {
    expect(() =>
      assertBackfillAllowed({ NODE_ENV: "development" }),
    ).not.toThrow();
    expect(() => assertBackfillAllowed({})).not.toThrow();
  });
});

describe("serializeDryRunReport (CC-6F) — metrics only, never content", () => {
  const report: DryRunReport = {
    book_slug: "familias-ensambladas",
    book_found: true,
    current_manifest_source: "legacy",
    chapters_found: 2,
    legacy_blocks_found: 2,
    concepts_found: 0,
    highlights_found: 0,
    annotations_found: 0,
    existing_works: 0,
    existing_editions: 0,
    existing_revisions: 0,
    existing_content_units: 0,
    existing_content_blocks: 0,
    planned_works_created: 1,
    planned_editions_created: 1,
    planned_revisions_created: 1,
    planned_content_units_created: 2,
    planned_unit_versions_created: 2,
    planned_content_blocks_created: 2,
    planned_block_versions_created: 2,
    planned_concepts_created: 0,
    planned_concept_links_created: 0,
    drift_conflicts: 0,
    unresolved_blocks: 0,
    destructive_operations: 0,
    database_writes: 0,
    backfill_safe: true,
  };

  it("emits every contract key as key=value lines", () => {
    const out = serializeDryRunReport(report);
    for (const k of [
      "book_slug=familias-ensambladas",
      "current_manifest_source=legacy",
      "planned_content_blocks_created=2",
      "drift_conflicts=0",
      "destructive_operations=0",
      "database_writes=0",
      "backfill_safe=true",
    ]) {
      expect(out).toContain(k);
    }
  });

  it("stdout never includes content: a smuggled text field is NOT emitted", () => {
    const sneaky = {
      ...report,
      blockText: "TEXTO PRIVADO DEL CAPÍTULO",
      email: "someone@example.com",
    } as unknown as DryRunReport;
    const out = serializeDryRunReport(sneaky);
    expect(out).not.toContain("TEXTO PRIVADO");
    expect(out).not.toContain("someone@example.com");
    expect(out).not.toContain("blockText");
    // Only whitelisted metric keys appear.
    for (const line of out.split("\n")) {
      expect(line).toMatch(
        /^[a-z_]+=(true|false|legacy|content-core|[a-z0-9-]+|\d+)$/,
      );
    }
  });
});
