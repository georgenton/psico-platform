import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  QA_FIXTURE_DATABASE_LOOKS_REAL,
  QA_FIXTURE_FORBIDDEN_IN_PRODUCTION,
  QA_FIXTURE_NOT_AUTHORIZED,
  applyVisualFixture,
  assertDatabaseIsNotReal,
  assertVisualFixtureAllowed,
  isSyntheticEmailDomain,
  parseExtraDomains,
  sanitizeFixtureError,
} from "./visual-fixture";
import { FIXTURE_BOOKS } from "./visual-fixture-content";
import { ACHIEVEMENT_CATALOG } from "../evolucion/achievement-catalog";

// The bootstrap is exercised by its own suite; here it is a spy, so these tests
// measure the fixture's decisions rather than re-testing Content Core.
const bootstrapBook = vi.hoisted(() => vi.fn());
vi.mock("../content-core/bootstrap-book", () => ({ bootstrapBook }));

/**
 * `resolveEnvironment()` reads process.env directly and refuses to guess on a
 * deployed box, which is exactly the behaviour we want to lean on. These tests
 * drive it through the real variables instead of stubbing the resolver, so a
 * change that weakened it would break them.
 */
function setPosture(vars: Record<string, string | undefined>): void {
  for (const key of [
    "PSICO_ENV",
    "NODE_ENV",
    // The three the resolver actually reads to decide "this box is deployed".
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_PROJECT_ID",
    "RAILWAY_SERVICE_ID",
  ]) {
    delete process.env[key];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v;
  }
}

/** Minimal in-memory stand-in: enough surface for the fixture's writes. */
function makePrisma(users: string[], existingBookSlugs: string[] = []) {
  const books = new Set(existingBookSlugs);
  const upserts: Record<string, number> = {};
  const count = (table: string) => {
    upserts[table] = (upserts[table] ?? 0) + 1;
  };
  const delegate = (table: string) => ({
    upsert: vi.fn(async () => {
      count(table);
      return {};
    }),
  });
  return {
    upserts,
    books,
    client: {
      user: { findMany: vi.fn(async () => users.map((email) => ({ email }))) },
      book: {
        findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
          books.has(where.slug) ? { id: `book-${where.slug}` } : null,
        ),
        update: vi.fn(async () => {
          count("book.update");
          return {};
        }),
      },
      edition: {
        update: vi.fn(async () => {
          count("edition.update");
          return {};
        }),
      },
      bookCategory: delegate("bookCategory"),
      achievement: delegate("achievement"),
      onboardingMotivo: delegate("onboardingMotivo"),
      onboardingMood: delegate("onboardingMood"),
      reflectionPrompt: delegate("reflectionPrompt"),
      diaryPrompt: delegate("diaryPrompt"),
    } as unknown as PrismaClient,
  };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  bootstrapBook.mockReset();
  bootstrapBook.mockImplementation(async (_p: unknown, input: never) => {
    const { chapters } = input as { chapters: { blocks: unknown[] }[] };
    return {
      bookId: "book-new",
      editionId: "edition-new",
      revisionId: "revision-new",
      chapters: chapters.length,
      blocks: chapters.reduce((n, c) => n + c.blocks.length, 0),
      units: chapters.length,
      blockVersions: 0,
      revisionUnits: chapters.length,
    };
  });
});

// ── Barrier 1 + 2 · posture ──────────────────────────────────────────────────

describe("assertVisualFixtureAllowed", () => {
  it("refuses outright on a production box, opt-in or not", () => {
    setPosture({ PSICO_ENV: "production", RAILWAY_PROJECT_ID: "qa-box" });
    expect(() =>
      assertVisualFixtureAllowed({ ALLOW_QA_VISUAL_FIXTURE: "on" }),
    ).toThrow(QA_FIXTURE_FORBIDDEN_IN_PRODUCTION);
  });

  it("refuses on staging without the explicit opt-in", () => {
    setPosture({ PSICO_ENV: "staging", RAILWAY_PROJECT_ID: "qa-box" });
    expect(() => assertVisualFixtureAllowed({})).toThrow(
      QA_FIXTURE_NOT_AUTHORIZED,
    );
  });

  it("allows staging once the opt-in is set", () => {
    setPosture({ PSICO_ENV: "staging", RAILWAY_PROJECT_ID: "qa-box" });
    expect(assertVisualFixtureAllowed({ ALLOW_QA_VISUAL_FIXTURE: "on" })).toBe(
      "staging",
    );
  });

  it("refuses to boot on a deployed box that does not declare its posture", () => {
    // The canonical resolver throws rather than passing for a dev machine.
    setPosture({ NODE_ENV: "production", RAILWAY_PROJECT_ID: "qa-box" });
    expect(() => assertVisualFixtureAllowed({})).toThrow(/PSICO_ENV/);
  });

  it("allows a local machine without an opt-in", () => {
    setPosture({ NODE_ENV: "test" });
    expect(assertVisualFixtureAllowed({})).toBe("test");
  });
});

// ── Barrier 3 · the database ────────────────────────────────────────────────

describe("database shape barrier", () => {
  it("treats RFC-reserved names as synthetic and everything else as real", () => {
    for (const d of [
      "example.test",
      "psico.test",
      "a.example",
      "x.invalid",
      "localhost",
    ]) {
      expect(isSyntheticEmailDomain(d)).toBe(true);
    }
    for (const d of ["gmail.com", "feelverse.app", "", "  "]) {
      expect(isSyntheticEmailDomain(d)).toBe(false);
    }
  });

  it("widens only through the explicit allow-list variable", () => {
    expect(isSyntheticEmailDomain("qa.feelverse.app")).toBe(false);
    expect(
      isSyntheticEmailDomain(
        "qa.feelverse.app",
        parseExtraDomains("qa.feelverse.app, other.dev"),
      ),
    ).toBe(true);
  });

  it("refuses a database holding a single routable address", async () => {
    const { client } = makePrisma(["a@example.test", "real@gmail.com"]);
    await expect(assertDatabaseIsNotReal(client, {})).rejects.toThrow(
      QA_FIXTURE_DATABASE_LOOKS_REAL,
    );
  });

  it("accepts an all-synthetic database, and an empty one", async () => {
    await expect(
      assertDatabaseIsNotReal(
        makePrisma(["a@example.test", "b@psico.test"]).client,
        {},
      ),
    ).resolves.toEqual({ users: 2, syntheticDomains: 2 });
    await expect(
      assertDatabaseIsNotReal(makePrisma([]).client, {}),
    ).resolves.toEqual({ users: 0, syntheticDomains: 0 });
  });
});

// ── Dry-run ─────────────────────────────────────────────────────────────────

describe("dry run", () => {
  it("writes nothing and still reports what a real run would do", async () => {
    setPosture({ NODE_ENV: "test" });
    const { client, upserts } = makePrisma(["a@example.test"]);
    const report = await applyVisualFixture(client, { apply: false, env: {} });

    expect(report.applied).toBe(false);
    expect(Object.keys(upserts)).toEqual([]);
    expect(bootstrapBook).not.toHaveBeenCalled();
    expect(report.books.map((b) => b.outcome)).toEqual(["created", "created"]);
    expect(report.catalogs.achievements).toBe(ACHIEVEMENT_CATALOG.length);
  });
});

// ── Apply · idempotence ─────────────────────────────────────────────────────

describe("apply", () => {
  it("creates both books and sets the entitlement only on the reserved one", async () => {
    setPosture({ NODE_ENV: "test" });
    const { client, upserts } = makePrisma(["a@example.test"]);
    const report = await applyVisualFixture(client, { apply: true, env: {} });

    expect(report.books.map((b) => b.outcome)).toEqual(["created", "created"]);
    expect(bootstrapBook).toHaveBeenCalledTimes(FIXTURE_BOOKS.length);
    // Exactly one book is reserved, so exactly one plan update on each side.
    expect(upserts["book.update"]).toBe(1);
    expect(upserts["edition.update"]).toBe(1);
    expect(upserts.achievement).toBe(ACHIEVEMENT_CATALOG.length);
    expect(upserts.bookCategory).toBe(1);
  });

  it("is idempotent: a second run creates no book and no duplicate", async () => {
    setPosture({ NODE_ENV: "test" });
    const first = makePrisma(["a@example.test"]);
    await applyVisualFixture(first.client, { apply: true, env: {} });

    // Second run against a database that now holds both slugs.
    bootstrapBook.mockClear();
    const second = makePrisma(
      ["a@example.test"],
      FIXTURE_BOOKS.map((b) => b.slug),
    );
    const report = await applyVisualFixture(second.client, {
      apply: true,
      env: {},
    });

    expect(bootstrapBook).not.toHaveBeenCalled();
    expect(report.books.every((b) => b.outcome === "already-present")).toBe(
      true,
    );
    expect(second.upserts["book.update"]).toBeUndefined();
    expect(second.upserts["edition.update"]).toBeUndefined();
    // Catalogues are still upserted — by stable id, so they rewrite in place.
    expect(second.upserts.achievement).toBe(ACHIEVEMENT_CATALOG.length);
  });

  it("does not write when a barrier refuses", async () => {
    setPosture({ PSICO_ENV: "production", RAILWAY_PROJECT_ID: "qa-box" });
    const { client, upserts } = makePrisma(["a@example.test"]);
    await expect(
      applyVisualFixture(client, { apply: true, env: {} }),
    ).rejects.toThrow(QA_FIXTURE_FORBIDDEN_IN_PRODUCTION);
    expect(Object.keys(upserts)).toEqual([]);
    expect(bootstrapBook).not.toHaveBeenCalled();
  });
});

// ── Output hygiene ──────────────────────────────────────────────────────────

describe("sanitizeFixtureError", () => {
  it("passes machine codes through and swallows everything else", () => {
    expect(sanitizeFixtureError(new Error(QA_FIXTURE_NOT_AUTHORIZED))).toBe(
      QA_FIXTURE_NOT_AUTHORIZED,
    );
    expect(sanitizeFixtureError(new Error("BOOK_SLUG_ALREADY_EXISTS"))).toBe(
      "BOOK_SLUG_ALREADY_EXISTS",
    );
    expect(
      sanitizeFixtureError(
        new Error('duplicate key value "someone@gmail.com"'),
      ),
    ).toBe("UNEXPECTED_ERROR");
  });

  it("never reports a report that contains an email address", async () => {
    setPosture({ NODE_ENV: "test" });
    const { client } = makePrisma(["a@example.test", "b@example.test"]);
    const report = await applyVisualFixture(client, { apply: false, env: {} });
    expect(JSON.stringify(report)).not.toContain("@");
    expect(report.accounts).toEqual({ users: 2, syntheticDomains: 1 });
  });
});
