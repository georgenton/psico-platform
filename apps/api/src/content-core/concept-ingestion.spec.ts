import { describe, expect, it, vi } from "vitest";
import { CHAPTER_CONCEPTS } from "@psico/types";
import {
  assertConceptCatalogValid,
  conceptLinkId,
  ConceptIngestError,
  ingestBookConcepts,
  type ConceptIngestDb,
} from "./concept-ingestion";

/**
 * Pure/unit coverage for the extracted concept ingestion. The DB is a spy
 * double here — real PostgreSQL behaviour (atomicity, rollback, byte stability)
 * lives in `content-core-learning-activation.pg-spec.ts`.
 */

const BOOK = "emociones-en-construccion";

interface Row {
  id: string;
  label: string;
}
interface LinkRow {
  conceptId: string;
  unitId: string | null;
  contentBlockId: string | null;
  role: string;
}

/** Minimal in-memory stand-in that records every write. */
function makeDb(opts: {
  concepts?: Record<string, Row>;
  links?: Record<string, LinkRow>;
}) {
  const concepts = opts.concepts ?? {};
  const links = opts.links ?? {};
  const created: string[] = [];
  const db = {
    concept: {
      findUnique: vi.fn(
        async ({ where }: { where: { conceptKey: string } }) =>
          concepts[where.conceptKey] ?? null,
      ),
      create: vi.fn(
        async ({ data }: { data: { conceptKey: string; label: string } }) => {
          created.push(`concept:${data.conceptKey}`);
          const row = { id: `c-${data.conceptKey}`, label: data.label };
          concepts[data.conceptKey] = row;
          return row;
        },
      ),
    },
    conceptLink: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => links[where.id] ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { id: string } }) => {
        created.push(`link:${data.id}`);
        return data;
      }),
    },
  };
  return { db: db as unknown as ConceptIngestDb, created, raw: db };
}

/** Units for every chapter the catalog declares for `book`. */
function unitsFor(book: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const order of Object.keys(CHAPTER_CONCEPTS[book] ?? {})) {
    m.set(Number(order), `u-${order}`);
  }
  return m;
}

describe("assertConceptCatalogValid", () => {
  it("accepts the shipped catalog", () => {
    expect(() => assertConceptCatalogValid()).not.toThrow();
  });

  it("rejects a duplicated conceptKey across books", () => {
    const dup = {
      a: { 1: { key: "same-key", label: "A" } },
      b: { 1: { key: "same-key", label: "B" } },
    };
    expect(() => assertConceptCatalogValid(dup)).toThrow(ConceptIngestError);
  });

  it.each([
    ["a blank label", { a: { 1: { key: "k", label: "  " } } }],
    ["a blank key", { a: { 1: { key: "", label: "L" } } }],
    ["a non-positive order", { a: { 0: { key: "k", label: "L" } } }],
  ])("rejects %s", (_why, catalog) => {
    expect(() => assertConceptCatalogValid(catalog)).toThrow(
      /CONCEPT_INGEST_CATALOG_INVALID/,
    );
  });
});

describe("ingestBookConcepts", () => {
  it("is a no-op for a book absent from the catalog", async () => {
    const { db, created } = makeDb({});
    const stats = await ingestBookConcepts(db, "not-catalogued", new Map());
    expect(created).toEqual([]);
    expect(stats).toEqual({
      conceptsCreated: 0,
      conceptsVerified: 0,
      conceptLinksCreated: 0,
      conceptLinksVerified: 0,
      conceptsSkippedMissingUnit: 0,
    });
  });

  it("creates the concept and its PRIMARY link on a first run", async () => {
    const { db, created, raw } = makeDb({});
    const stats = await ingestBookConcepts(db, BOOK, unitsFor(BOOK));

    const declared = Object.keys(CHAPTER_CONCEPTS[BOOK]).length;
    expect(stats.conceptsCreated).toBe(declared);
    expect(stats.conceptLinksCreated).toBe(declared);
    expect(stats.conceptsVerified).toBe(0);
    expect(created).toHaveLength(declared * 2);

    const firstKey = CHAPTER_CONCEPTS[BOOK][1].key;
    expect(raw.conceptLink.create).toHaveBeenCalledWith({
      data: {
        id: conceptLinkId(firstKey),
        conceptId: `c-${firstKey}`,
        unitId: "u-1",
        role: "PRIMARY",
      },
    });
  });

  it("writes nothing on an identical replay", async () => {
    const concepts: Record<string, Row> = {};
    const links: Record<string, LinkRow> = {};
    for (const [order, c] of Object.entries(CHAPTER_CONCEPTS[BOOK])) {
      concepts[c.key] = { id: `c-${c.key}`, label: c.label };
      links[conceptLinkId(c.key)] = {
        conceptId: `c-${c.key}`,
        unitId: `u-${order}`,
        contentBlockId: null,
        role: "PRIMARY",
      };
    }
    const { db, created } = makeDb({ concepts, links });
    const stats = await ingestBookConcepts(db, BOOK, unitsFor(BOOK));

    expect(created).toEqual([]);
    expect(stats.conceptsCreated).toBe(0);
    expect(stats.conceptLinksCreated).toBe(0);
    expect(stats.conceptsVerified).toBeGreaterThan(0);
  });

  it("fails closed when a stored label drifts — never a silent relabel", async () => {
    const first = CHAPTER_CONCEPTS[BOOK][1];
    const { db, created } = makeDb({
      concepts: { [first.key]: { id: "c-1", label: "Otro significado" } },
    });
    await expect(ingestBookConcepts(db, BOOK, unitsFor(BOOK))).rejects.toThrow(
      /CONCEPT_INGEST_DRIFT_DETECTED/,
    );
    expect(created).toEqual([]);
  });

  it.each([
    [
      "a link pointing at another unit",
      {
        conceptId: "c-K",
        unitId: "u-999",
        contentBlockId: null,
        role: "PRIMARY",
      },
    ],
    [
      "a link with a different role",
      {
        conceptId: "c-K",
        unitId: "u-1",
        contentBlockId: null,
        role: "RELATED",
      },
    ],
    [
      "a link bound to a block",
      {
        conceptId: "c-K",
        unitId: "u-1",
        contentBlockId: "b-1",
        role: "PRIMARY",
      },
    ],
  ])("fails closed on %s", async (_why, link) => {
    const first = CHAPTER_CONCEPTS[BOOK][1];
    const { db } = makeDb({
      concepts: { [first.key]: { id: "c-K", label: first.label } },
      links: { [conceptLinkId(first.key)]: link as LinkRow },
    });
    await expect(ingestBookConcepts(db, BOOK, unitsFor(BOOK))).rejects.toThrow(
      /CONCEPT_INGEST_DRIFT_DETECTED/,
    );
  });

  it("fails closed by default when a catalogued chapter has no unit", async () => {
    const { db, created } = makeDb({});
    await expect(ingestBookConcepts(db, BOOK, new Map())).rejects.toThrow(
      /CONCEPT_INGEST_UNIT_MISSING/,
    );
    expect(created).toEqual([]);
  });

  it("under the skip policy, counts the gap instead of hiding it", async () => {
    const { db, created } = makeDb({});
    const declared = Object.keys(CHAPTER_CONCEPTS[BOOK]).length;
    const stats = await ingestBookConcepts(db, BOOK, new Map(), "skip");

    expect(stats.conceptsSkippedMissingUnit).toBe(declared);
    expect(stats.conceptsCreated).toBe(0);
    expect(created).toEqual([]);
  });

  it("under the skip policy, still writes the chapters that DO have a unit", async () => {
    const { db, created } = makeDb({});
    const partial = new Map([[1, "u-1"]]); // only the first chapter is ingested
    const stats = await ingestBookConcepts(db, BOOK, partial, "skip");

    expect(stats.conceptsCreated).toBe(1);
    expect(stats.conceptLinksCreated).toBe(1);
    expect(stats.conceptsSkippedMissingUnit).toBe(
      Object.keys(CHAPTER_CONCEPTS[BOOK]).length - 1,
    );
    expect(created).toEqual([
      `concept:${CHAPTER_CONCEPTS[BOOK][1].key}`,
      `link:${conceptLinkId(CHAPTER_CONCEPTS[BOOK][1].key)}`,
    ]);
  });

  it("keeps errors value-free — the message is exactly the code", async () => {
    const { db } = makeDb({});
    await ingestBookConcepts(db, BOOK, new Map()).catch((e: unknown) => {
      const err = e as ConceptIngestError;
      expect(err.message).toBe(err.code);
      expect(err.message).not.toContain(BOOK);
    });
    expect.assertions(2);
  });
});
