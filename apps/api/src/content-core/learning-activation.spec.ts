import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  ACTIVATION_FORBIDDEN,
  ACTIVATION_INPUT_INVALID,
  ACTIVATION_INTERNAL_ERROR,
  assertLearningActivationAllowed,
  catalogChapterOrders,
  classifyConceptLink,
  type StoredConceptLink,
  sanitizeActivationError,
  serializeActivationPlan,
  type LearningActivationPlan,
} from "./learning-activation";
import {
  parseActivationArgs,
  runActivationCli,
  type ActivationCliDeps,
} from "./learning-activation-cli";

/**
 * Pure coverage: argument parsing, the CANONICAL environment posture, the
 * guard-before-connect ordering, error sanitization and metrics-only output.
 * Database behaviour lives in the PostgreSQL spec.
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

// ─────────────────────────────────────────────────────────────────────────────
describe("assertLearningActivationAllowed — canonical environment posture", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.PSICO_ENV;
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.RAILWAY_PROJECT_ID;
    delete process.env.RAILWAY_SERVICE_ID;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  /** What the canonical resolver treats as "this box is deployed". */
  function onRailway(): void {
    process.env.RAILWAY_ENVIRONMENT = "production";
  }

  it("allows a local run without any flag", () => {
    expect(() => assertLearningActivationAllowed({})).not.toThrow();
  });

  it("allows a local run that declares PSICO_ENV=test", () => {
    process.env.PSICO_ENV = "test";
    expect(() => assertLearningActivationAllowed({})).not.toThrow();
  });

  it("refuses a Railway box that does not declare PSICO_ENV", () => {
    onRailway();
    expect(() => assertLearningActivationAllowed({})).toThrow(
      ACTIVATION_FORBIDDEN,
    );
  });

  it.each(["development", "test"])(
    "refuses a Railway box claiming PSICO_ENV=%s — it cannot opt out",
    (value) => {
      onRailway();
      process.env.PSICO_ENV = value;
      expect(() =>
        // Even WITH the allow flag: the box is misconfigured, not authorized.
        assertLearningActivationAllowed({
          ALLOW_BOOK_LEARNING_ACTIVATION: "on",
        }),
      ).toThrow(ACTIVATION_FORBIDDEN);
    },
  );

  it.each(["production", "staging"])(
    "refuses PSICO_ENV=%s without the allow flag",
    (value) => {
      onRailway();
      process.env.PSICO_ENV = value;
      expect(() => assertLearningActivationAllowed({})).toThrow(
        ACTIVATION_FORBIDDEN,
      );
    },
  );

  it.each(["production", "staging"])(
    "allows PSICO_ENV=%s when the flag is exactly 'on'",
    (value) => {
      onRailway();
      process.env.PSICO_ENV = value;
      expect(() =>
        assertLearningActivationAllowed({
          ALLOW_BOOK_LEARNING_ACTIVATION: "on",
        }),
      ).not.toThrow();
    },
  );

  it.each(["ON", "true", "1", "yes", ""])(
    "refuses the near-miss allow value %p",
    (value) => {
      onRailway();
      process.env.PSICO_ENV = "production";
      expect(() =>
        assertLearningActivationAllowed({
          ALLOW_BOOK_LEARNING_ACTIVATION: value,
        }),
      ).toThrow(ACTIVATION_FORBIDDEN);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe("runActivationCli — authorization precedes any connection", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function deps(env: NodeJS.ProcessEnv = {}) {
    const connect = vi.fn(() => ({
      prisma: {} as PrismaClient,
      close: vi.fn(async () => undefined),
    }));
    const plan = vi.fn(async () => ({ activation_safe: true }) as never);
    const apply = vi.fn(async () => ({ conceptsCreated: 1 }) as never);
    const log = vi.fn();
    return {
      d: { env, connect, plan, apply, log } as unknown as ActivationCliDeps,
      connect,
      plan,
      apply,
      log,
    };
  }

  it("refuses an unauthorized apply without opening a connection", async () => {
    process.env.RAILWAY_ENVIRONMENT = "production";
    process.env.PSICO_ENV = "production";
    const { d, connect, plan, apply } = deps({}); // no allow flag

    await expect(
      runActivationCli(["--book-slug=x", "--apply"], d),
    ).rejects.toThrow(ACTIVATION_FORBIDDEN);

    expect(connect).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("lets a dry-run connect without the allow flag", async () => {
    process.env.RAILWAY_ENVIRONMENT = "production";
    process.env.PSICO_ENV = "production";
    const { d, connect, plan, apply, log } = deps({});

    const r = await runActivationCli(["--book-slug=x"], d);

    expect(r).toEqual({ mode: "dry-run", exitCode: 0 });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(plan).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("mode=dry-run");
  });

  it("refuses an authorized apply when the plan is unsafe", async () => {
    const { d, plan, apply, log } = deps({});
    (
      plan as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({ activation_safe: false });

    const r = await runActivationCli(["--book-slug=x", "--apply"], d);

    expect(r).toEqual({ mode: "apply-refused", exitCode: 1 });
    expect(apply).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("mode=apply-refused");
  });

  it("applies when authorized and the plan is safe", async () => {
    const { d, apply, log } = deps({});
    const r = await runActivationCli(["--book-slug=x", "--apply"], d);

    expect(r).toEqual({ mode: "apply", exitCode: 0 });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("mode=apply");
  });

  it("closes the connection even when the plan throws", async () => {
    const { d, connect, plan } = deps({});
    (
      plan as unknown as { mockRejectedValue: (v: unknown) => void }
    ).mockRejectedValue(new Error("boom"));

    await expect(runActivationCli(["--book-slug=x"], d)).rejects.toThrow();
    const handle = connect.mock.results[0].value as { close: () => void };
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("catalogChapterOrders", () => {
  it("returns the union the two catalogs declare, sorted", () => {
    expect(catalogChapterOrders("parejas-que-perduran")).toEqual([2]);
    expect(catalogChapterOrders("emociones-en-construccion")).toEqual([
      1, 2, 3,
    ]);
  });

  it("is empty for a book nobody catalogued", () => {
    expect(catalogChapterOrders("libro-inexistente")).toEqual([]);
  });
});

describe("classifyConceptLink", () => {
  const UNIT = "unit-1";
  const CONCEPT = { id: "concept-1" };
  const sound: StoredConceptLink = {
    conceptId: CONCEPT.id,
    unitId: UNIT,
    contentBlockId: null,
    role: "PRIMARY",
  };

  it("creates when no link exists", () => {
    expect(classifyConceptLink(null, CONCEPT, UNIT)).toBe("create");
    expect(classifyConceptLink(null, null, UNIT)).toBe("create");
  });

  it("verifies an exact match", () => {
    expect(classifyConceptLink(sound, CONCEPT, UNIT)).toBe("verify");
  });

  it("conflicts when the deterministic link id is taken by a FOREIGN concept", () => {
    // The concept the catalog declares does not exist yet, but its derived link
    // id is already occupied — necessarily by some other concept. A link cannot
    // be verified against a concept that does not exist.
    expect(
      classifyConceptLink({ ...sound, conceptId: "otro-concepto" }, null, UNIT),
    ).toBe("conflict");
  });

  it("conflicts when the link points at another concept that DOES exist", () => {
    expect(
      classifyConceptLink({ ...sound, conceptId: "otro" }, CONCEPT, UNIT),
    ).toBe("conflict");
  });

  it.each([
    ["another unit", { ...sound, unitId: "unit-999" }],
    ["a null unit", { ...sound, unitId: null }],
    ["a block binding", { ...sound, contentBlockId: "block-1" }],
    ["another role", { ...sound, role: "RELATED" }],
  ])("conflicts on %s", (_why, link) => {
    expect(classifyConceptLink(link, CONCEPT, UNIT)).toBe("conflict");
  });

  it("conflicts when the expected unit could not be resolved", () => {
    expect(classifyConceptLink(sound, CONCEPT, undefined)).toBe("conflict");
  });
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
      "CONCEPT_INGEST_CATALOG_INVALID",
      "EXERCISE_INGEST_SOURCE_AMBIGUOUS",
      "EXERCISE_INGEST_SOURCE_MISSING",
      "EXERCISE_INGEST_CATALOG_INVALID",
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
    catalog_valid: true,
    catalog_concept_count: 1,
    catalog_exercise_count: 2,
    catalog_chapter_orders: "2",
    chapter_missing_count: 0,
    unit_missing_count: 0,
    unit_not_in_revision_count: 0,
    source_pair_count: 1,
    source_exact_match_pair_count: 1,
    source_missing_pair_count: 0,
    source_ambiguous_pair_count: 0,
    source_heading_match_count: 1,
    concept_create_count: 1,
    concept_verify_count: 0,
    concept_conflict_count: 0,
    concept_link_create_count: 1,
    concept_link_verify_count: 0,
    concept_link_conflict_count: 0,
    practice_create_count: 1,
    practice_verify_count: 0,
    practice_conflict_count: 0,
    recall_create_count: 1,
    recall_verify_count: 0,
    recall_conflict_count: 0,
    activation_safe: true,
    writes: 0,
  };

  it("emits key=value metrics only", () => {
    const out = serializeActivationPlan(plan);
    expect(out).toContain("catalog_chapter_orders=2");
    expect(out).toContain("source_exact_match_pair_count=1");
    expect(out).toContain("activation_safe=true");
    expect(out).toContain("writes=0");
    for (const line of out.split("\n")) {
      expect(line).toMatch(/^[a-z_]+=[A-Za-z0-9_|-]+$/);
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
