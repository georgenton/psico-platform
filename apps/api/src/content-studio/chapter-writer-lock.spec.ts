import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every writer that can change a book's `Chapter` structure, and why each one
 * cannot race a reorder.
 *
 * Content Studio's reorder decides — inside the edition row lock, against an
 * exact revision — whether a book's legacy structure is fully adopted. That
 * answer is only trustworthy if nothing can add or remove a `Chapter` row
 * between the check and the commit. A `Chapter` with no `ContentUnit` is an
 * UNADOPTED chapter, and an unadopted chapter is precisely what makes a book
 * ineligible to be reordered.
 *
 * Two of these are proved behaviourally against real PostgreSQL in
 * `draft-reorder.pg-spec.ts` — the admin chapter endpoint and the manuscript
 * ingest script both block on a held edition lock and proceed once it is
 * released. This file is the ratchet around the rest: it fails when a NEW
 * writer appears, so the audit cannot silently go stale.
 */

const API_DIR = process.cwd();

/**
 * `chapter.<write>` — case-sensitive, so `chapterBlock.create` and
 * `authorBookChapter.create` are not mistaken for it.
 */
const CHAPTER_WRITE =
  /(?<![A-Za-z])chapter\.(create|createMany|upsert|update|updateMany|delete|deleteMany)\b/;

function sourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === "migrations"
      ) {
        continue;
      }
      const full = join(d, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      // Tests write chapters constantly; they are not production writers.
      if (/\.(spec|e2e-spec|pg-spec)\.ts$/.test(entry)) continue;
      if (exts.some((e) => entry.endsWith(e))) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const read = (rel: string) => readFileSync(join(API_DIR, rel), "utf8");

describe("Chapter structural writers", () => {
  /**
   * The complete audited set. A writer added without appearing here fails the
   * test below — which is the point: the safety argument is per-writer, so a
   * new one has to be argued for rather than inherited.
   */
  const AUDITED = [
    "src/chapters/chapters.service.ts",
    "src/pulso/author-review.service.ts",
    "src/content-core/bootstrap-book.ts",
    "prisma/seed.ts",
    "scripts/ingest-chapter-md.mjs",
    "src/content-core/eec-c01-e2e-seed.ts",
    "src/content-core/test-support/seed-practice-headings.ts",
  ];

  it("is a closed set — no unaudited writer exists", () => {
    const found = [
      ...sourceFiles(join(API_DIR, "src"), [".ts"]),
      ...sourceFiles(join(API_DIR, "prisma"), [".ts"]),
      ...sourceFiles(join(API_DIR, "scripts"), [".mjs", ".ts"]),
    ]
      .filter((f) => CHAPTER_WRITE.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(API_DIR.length + 1))
      .sort();

    expect(found).toEqual([...AUDITED].sort());
  });

  it("the admin chapter endpoint takes the edition lock", () => {
    // Behaviourally proved in draft-reorder.pg-spec.ts; pinned here so the
    // call cannot be dropped without a failure that names the reason.
    expect(read("src/chapters/chapters.service.ts")).toContain(
      "lockEditionForBookSlugTx(tx, slug)",
    );
  });

  it("the author-book republish takes it before wiping chapters", () => {
    const src = read("src/pulso/author-review.service.ts");
    const lock = src.indexOf("lockEditionForBookSlugTx(tx, book.slug)");
    const wipe = src.indexOf("tx.chapter.deleteMany");
    expect(lock).toBeGreaterThan(-1);
    // Order matters: locking after the wipe would serialise nothing.
    expect(lock).toBeLessThan(wipe);
  });

  it("the seed writes chapters only through the locked helper", () => {
    const src = read("prisma/seed.ts");
    expect(src).toContain("lockEditionForBookSlugTx");
    // `prisma.chapter.upsert` survives once, as the helper's parameter type.
    const bare = src.match(/await prisma\.chapter\.upsert\(/g) ?? [];
    expect(bare).toHaveLength(0);
    expect(src).toContain("upsertChapterLocked(");
  });

  it("the manuscript ingest script locks the edition in the same transaction", () => {
    const src = read("scripts/ingest-chapter-md.mjs");
    const tx = src.indexOf("prisma.$transaction");
    const lock = src.indexOf('FROM "Edition"');
    const upsert = src.indexOf("tx.chapter.upsert(");
    expect(tx).toBeGreaterThan(-1);
    expect(tx).toBeLessThan(lock);
    expect(lock).toBeLessThan(upsert);
    expect(src).toContain("FOR UPDATE");
  });

  it("the E2E seeder cannot run anywhere a reader exists", () => {
    // No lock, and it needs none for a different reason than bootstrap's: it
    // refuses production and staging BEFORE it opens a connection, so the only
    // chapters it can create are in a database somebody made to throw away.
    const src = read("src/content-core/eec-c01-e2e-seed.ts");
    expect(src).toContain("SEED_REFUSED_ON_DEPLOYED");
    // The refusal precedes the client, not the other way round.
    expect(src.indexOf("SEED_REFUSED_ON_DEPLOYED")).toBeLessThan(
      src.indexOf("new PrismaClient"),
    );
  });

  it("the fixture helper can only ever run inside a test", () => {
    // No lock, and it needs none for a third reason: it lives under
    // `test-support/`, nothing in the running application imports it, and the
    // chapters it creates are the ones the exercise catalog declares — filler
    // for a database a spec built and will drop. The argument is the import
    // graph, so that is what is asserted.
    const helper = "src/content-core/test-support/seed-practice-headings.ts";
    expect(helper.startsWith("src/content-core/test-support/")).toBe(true);
    const importers = [
      ...sourceFiles(join(API_DIR, "src"), [".ts"]),
      ...sourceFiles(join(API_DIR, "prisma"), [".ts"]),
      ...sourceFiles(join(API_DIR, "scripts"), [".mjs", ".ts"]),
    ]
      .filter((f) => !f.endsWith("seed-practice-headings.ts"))
      .filter((f) => /seed-practice-headings/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(API_DIR.length + 1))
      .sort();
    // `sourceFiles` already skips specs, so anything left is runtime code.
    // The E2E seeder is the one non-spec importer, and it refuses a deployed
    // box before it opens a connection (asserted above).
    expect(importers).toEqual(["src/content-core/eec-c01-e2e-seed.ts"]);
  });

  it("bootstrap is safe by construction — it refuses an existing book", () => {
    // The only writer with no lock, and it needs none: it creates the `Book`
    // itself and fails closed inside its own transaction if the slug is taken,
    // so it can never touch a book that something could be reordering.
    const src = read("src/content-core/bootstrap-book.ts");
    expect(src).toContain("BOOK_SLUG_TAKEN");
    expect(src).toContain("tx.book.findUnique");
  });
});
