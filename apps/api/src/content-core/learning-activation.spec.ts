import { describe, expect, it } from "vitest";
import {
  ACTIVATION_FORBIDDEN,
  ACTIVATION_INPUT_INVALID,
  ACTIVATION_INTERNAL_ERROR,
  assertLearningActivationAllowed,
  sanitizeActivationError,
  serializeActivationPlan,
  type LearningActivationPlan,
} from "./learning-activation";
import { parseActivationArgs } from "./learning-activation-cli";

/**
 * Pure coverage: argument parsing, the allow-flag posture, error sanitization
 * and the metrics-only serialization. Database behaviour (atomicity, idempotent
 * replay, drift rollback) lives in the PostgreSQL spec.
 */

describe("parseActivationArgs", () => {
  it("defaults to a dry-run", () => {
    expect(parseActivationArgs(["--book-slug=x"])).toEqual({
      bookSlug: "x",
      apply: false,
    });
  });

  it("accepts the space-separated form", () => {
    expect(parseActivationArgs(["--book-slug", "x"]).bookSlug).toBe("x");
  });

  it("turns on apply only with the bare --apply flag", () => {
    expect(parseActivationArgs(["--book-slug=x", "--apply"]).apply).toBe(true);
  });

  it("lets an explicit --dry-run win when it comes last", () => {
    expect(
      parseActivationArgs(["--book-slug=x", "--apply", "--dry-run"]).apply,
    ).toBe(false);
  });

  it.each([
    ["a missing slug", []],
    ["a blank slug", ["--book-slug="]],
    ["a whitespace slug", ["--book-slug=   "]],
    // `--apply=false` reads as "do not apply" but is not a flag we parse — it
    // must be rejected, never silently ignored into a dry-run.
    ["--apply=false", ["--book-slug=x", "--apply=false"]],
    ["an unknown flag", ["--book-slug=x", "--force"]],
    ["a bare positional", ["x"]],
  ])("rejects %s", (_why, argv) => {
    expect(() => parseActivationArgs(argv)).toThrow(ACTIVATION_INPUT_INVALID);
  });
});

describe("assertLearningActivationAllowed", () => {
  it("allows a local run without any flag", () => {
    expect(() =>
      assertLearningActivationAllowed({ NODE_ENV: "development" }),
    ).not.toThrow();
  });

  it.each([
    ["PSICO_ENV", { PSICO_ENV: "production" }],
    ["RAILWAY_ENVIRONMENT_NAME", { RAILWAY_ENVIRONMENT_NAME: "production" }],
    ["NODE_ENV", { NODE_ENV: "production" }],
    ["staging", { PSICO_ENV: "staging" }],
  ])("refuses a deployed run via %s without the allow flag", (_src, env) => {
    expect(() => assertLearningActivationAllowed(env)).toThrow(
      ACTIVATION_FORBIDDEN,
    );
  });

  it("allows a deployed run when the flag is exactly 'on'", () => {
    expect(() =>
      assertLearningActivationAllowed({
        PSICO_ENV: "production",
        ALLOW_BOOK_LEARNING_ACTIVATION: "on",
      }),
    ).not.toThrow();
  });

  it.each(["ON", "true", "1", "yes", ""])(
    "refuses the near-miss allow value %p",
    (value) => {
      expect(() =>
        assertLearningActivationAllowed({
          PSICO_ENV: "production",
          ALLOW_BOOK_LEARNING_ACTIVATION: value,
        }),
      ).toThrow(ACTIVATION_FORBIDDEN);
    },
  );
});

describe("sanitizeActivationError", () => {
  it("passes through its own whitelisted codes", () => {
    expect(sanitizeActivationError(new Error(ACTIVATION_FORBIDDEN))).toBe(
      ACTIVATION_FORBIDDEN,
    );
  });

  it("passes through the ingestion codes it re-raises", () => {
    for (const code of [
      "CONCEPT_INGEST_DRIFT_DETECTED",
      "CONCEPT_INGEST_UNIT_MISSING",
      "EXERCISE_INGEST_SOURCE_AMBIGUOUS",
      "EXERCISE_INGEST_SOURCE_MISSING",
    ]) {
      expect(sanitizeActivationError(new Error(code))).toBe(code);
    }
  });

  it("collapses anything else — a Prisma message can quote book text", () => {
    const leaky = new Error(
      'Unique constraint failed on ChapterBlock (content: "…manuscrito…")',
    );
    expect(sanitizeActivationError(leaky)).toBe(ACTIVATION_INTERNAL_ERROR);
    expect(sanitizeActivationError("plain string")).toBe(
      ACTIVATION_INTERNAL_ERROR,
    );
    expect(sanitizeActivationError(null)).toBe(ACTIVATION_INTERNAL_ERROR);
  });
});

describe("serializeActivationPlan", () => {
  const plan: LearningActivationPlan = {
    book_exists: true,
    edition_exists: true,
    published_revision_exists: true,
    catalog_concept_count: 1,
    catalog_exercise_count: 2,
    chapter_order: 2,
    chapter_exists: true,
    unit_exists: true,
    source_heading_match_count: 1,
    concept_action: "CREATE",
    concept_link_action: "CREATE",
    practice_action: "CREATE",
    recall_action: "CREATE",
    activation_safe: true,
    writes: 0,
  };

  it("emits key=value metrics only", () => {
    const out = serializeActivationPlan(plan);
    expect(out).toContain("chapter_order=2");
    expect(out).toContain("source_heading_match_count=1");
    expect(out).toContain("activation_safe=true");
    expect(out).toContain("writes=0");
    for (const line of out.split("\n")) {
      expect(line).toMatch(/^[a-z_]+=[A-Za-z0-9_-]+$/);
    }
  });

  it("never carries a question, an option or the correct answer", () => {
    const out = serializeActivationPlan(plan).toLowerCase();
    for (const leak of [
      "según el capítulo",
      "manos",
      "mirada",
      "correctoptionkey",
      "pqp-opcion",
    ]) {
      expect(out).not.toContain(leak);
    }
  });
});
