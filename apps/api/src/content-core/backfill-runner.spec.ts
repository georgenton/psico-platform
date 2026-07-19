import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BACKFILL_FORBIDDEN,
  BACKFILL_INTERNAL_ERROR,
  MISSING_BOOK_SLUG,
  assertBackfillAllowed,
  parseRunnerArgs,
  sanitizeErrorCode,
  serializeDryRunReport,
  type DryRunReport,
} from "./backfill-runner";

/**
 * CC-6F — operational-surface unit tests (no DB). The DB-backed guarantees
 * (dry-run zero writes, only-requested-slug, idempotence, per-field drift,
 * marks untouched, mid-failure rollback) live in backfill-runner.pg-spec.ts.
 */

// The gate resolves the environment through the canonical PSICO_ENV/Railway
// resolver, which reads process.env — snapshot & restore around each test.
const ENV_KEYS = [
  "PSICO_ENV",
  "NODE_ENV",
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

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

  it("a missing, empty or whitespace-only --book-slug refuses to run", () => {
    expect(() => parseRunnerArgs(["--apply"])).toThrow(MISSING_BOOK_SLUG);
    expect(() => parseRunnerArgs(["--book-slug="])).toThrow(MISSING_BOOK_SLUG);
    expect(() => parseRunnerArgs(["--book-slug=   "])).toThrow(
      MISSING_BOOK_SLUG,
    );
  });

  it("rejects unknown arguments", () => {
    expect(() => parseRunnerArgs(["--book-slug=x", "--force"])).toThrow(
      "UNKNOWN_ARGUMENT",
    );
    expect(() => parseRunnerArgs(["--book-slug=x", "extra"])).toThrow(
      "UNKNOWN_ARGUMENT",
    );
  });

  it("rejects more than one --book-slug", () => {
    expect(() => parseRunnerArgs(["--book-slug=a", "--book-slug=b"])).toThrow(
      "DUPLICATE_BOOK_SLUG",
    );
  });

  it("rejects --apply together with --dry-run", () => {
    expect(() =>
      parseRunnerArgs(["--book-slug=x", "--apply", "--dry-run"]),
    ).toThrow("CONFLICTING_MODE_FLAGS");
  });
});

describe("assertBackfillAllowed (CC-6F) — fail-closed environment gate", () => {
  it("production (PSICO_ENV) WITHOUT the flag → BACKFILL_FORBIDDEN; with on → allowed", () => {
    process.env.PSICO_ENV = "production";
    expect(() => assertBackfillAllowed({})).toThrow(BACKFILL_FORBIDDEN);
    expect(() =>
      assertBackfillAllowed({ ALLOW_CONTENT_CORE_BACKFILL: "off" }),
    ).toThrow(BACKFILL_FORBIDDEN);
    expect(() =>
      assertBackfillAllowed({ ALLOW_CONTENT_CORE_BACKFILL: "on" }),
    ).not.toThrow();
  });

  it("staging requires the flag exactly like production", () => {
    process.env.PSICO_ENV = "staging";
    expect(() => assertBackfillAllowed({})).toThrow(BACKFILL_FORBIDDEN);
    expect(() =>
      assertBackfillAllowed({ ALLOW_CONTENT_CORE_BACKFILL: "on" }),
    ).not.toThrow();
  });

  it("a Railway box WITHOUT PSICO_ENV fails closed (resolver throws)", () => {
    process.env.RAILWAY_PROJECT_ID = "some-project";
    expect(() =>
      assertBackfillAllowed({ ALLOW_CONTENT_CORE_BACKFILL: "on" }),
    ).toThrow(/PSICO_ENV/);
  });

  it("a Railway box claiming development fails closed (NODE_ENV never decides)", () => {
    process.env.RAILWAY_PROJECT_ID = "some-project";
    process.env.PSICO_ENV = "development";
    process.env.NODE_ENV = "development";
    expect(() =>
      assertBackfillAllowed({ ALLOW_CONTENT_CORE_BACKFILL: "on" }),
    ).toThrow();
  });

  it("an invalid PSICO_ENV fails closed", () => {
    process.env.PSICO_ENV = "weird-env";
    expect(() =>
      assertBackfillAllowed({ ALLOW_CONTENT_CORE_BACKFILL: "on" }),
    ).toThrow(/PSICO_ENV/);
  });

  it("local development → allowed without the flag", () => {
    process.env.PSICO_ENV = "development";
    expect(() => assertBackfillAllowed({})).not.toThrow();
    delete process.env.PSICO_ENV;
    process.env.NODE_ENV = "test";
    expect(() => assertBackfillAllowed({})).not.toThrow();
  });
});

describe("sanitizeErrorCode (CC-6F) — nothing but the whitelist escapes", () => {
  it("passes the whitelisted machine codes through", () => {
    for (const code of [
      "BOOK_NOT_FOUND",
      "BACKFILL_FORBIDDEN",
      "BACKFILL_DRIFT_DETECTED",
      "MISSING_BOOK_SLUG",
    ]) {
      expect(sanitizeErrorCode(new Error(code))).toBe(code);
    }
  });

  it("a Prisma-style error with sensitive text becomes BACKFILL_INTERNAL_ERROR", () => {
    const prismaish = new Error(
      "Invalid `prisma.user.findUnique()` invocation: connection to " +
        "postgresql://psico:supersecret@db.internal:5432/psico failed — " +
        'row {email: "someone@private.example"} not reachable',
    );
    const out = sanitizeErrorCode(prismaish);
    expect(out).toBe(BACKFILL_INTERNAL_ERROR);
    expect(out).not.toContain("supersecret");
    expect(out).not.toContain("someone@private.example");
    expect(out).not.toContain("postgresql://");
  });

  it("non-Error values also collapse to BACKFILL_INTERNAL_ERROR", () => {
    expect(sanitizeErrorCode("raw string with secrets")).toBe(
      BACKFILL_INTERNAL_ERROR,
    );
    expect(sanitizeErrorCode(undefined)).toBe(BACKFILL_INTERNAL_ERROR);
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
