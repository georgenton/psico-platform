import { describe, expect, it } from "vitest";
import {
  CHAPTER_CONCEPTS,
  guidedChapterConcepts,
  guidedConceptByKey,
} from "@psico/types";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";
import { assertPairValid } from "./exercise-ingestion";

/**
 * Pins the shape of the editorial catalogs so an approved definition cannot
 * drift into an unusable state without a test failing first. Deliberately
 * asserts KEYS and INVARIANTS, never the question stem or the option labels —
 * a diff of this file must not leak the recall answer in plain sight.
 */

const PAREJAS = "parejas-que-perduran";
/** The book's chapter 1 lives at platform order 2 (order 1 is the preface). */
const PAREJAS_CHAPTER_ORDER = 2;

describe("EXERCISE_INGESTION_CATALOG — global invariants", () => {
  it("passes the pure coherence guard for every declared pair", () => {
    for (const [slug, pairs] of Object.entries(EXERCISE_INGESTION_CATALOG)) {
      for (const pair of pairs) {
        expect(() => assertPairValid(slug, pair)).not.toThrow();
      }
    }
  });

  it("keeps every exercise id unique across the whole catalog", () => {
    const ids = Object.values(EXERCISE_INGESTION_CATALOG)
      .flat()
      .flatMap((p) => [p.practice.exerciseKey, p.recall.exerciseKey]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every recall at a concept some shared catalog declares", () => {
    // Two catalogs, both shared and both authoritative: `CHAPTER_CONCEPTS`
    // holds the chapter's ARC default (one per chapter, keys persisted on
    // Resonance) and `GUIDED_CHAPTER_CONCEPTS` holds the concepts a guided
    // route teaches (several per chapter). A recall may name either — what it
    // may NOT do is name a key nothing declares, which would ship a quiz
    // pointing at a concept no surface can label.
    for (const [slug, pairs] of Object.entries(EXERCISE_INGESTION_CATALOG)) {
      for (const pair of pairs) {
        const key = pair.recall.content.conceptKey;
        const inChapterCatalog = Object.values(CHAPTER_CONCEPTS[slug] ?? {})
          .map((c) => c.key)
          .includes(key);
        const guided = guidedConceptByKey(key);
        expect(
          inChapterCatalog || (guided !== null && guided.bookSlug === slug),
        ).toBe(true);
      }
    }
  });

  it("gives every guided concept of C01 exactly one recall", () => {
    // The route promises five ideas; five recalls is what makes that checkable.
    const c01 = guidedChapterConcepts("emociones-en-construccion", 1);
    expect(c01).toHaveLength(5);
    const recallConcepts = (
      EXERCISE_INGESTION_CATALOG["emociones-en-construccion"] ?? []
    ).map((p) => p.recall.content.conceptKey);
    for (const concept of c01) {
      expect(recallConcepts.filter((k) => k === concept.key)).toHaveLength(1);
    }
  });
});

describe("Parejas que perduran — demo Guide catalog", () => {
  const pairs = EXERCISE_INGESTION_CATALOG[PAREJAS];

  it("declares exactly one pair", () => {
    expect(pairs).toHaveLength(1);
  });

  it("targets platform chapter order 2, not the preface", () => {
    expect(pairs[0].practice.chapterOrder).toBe(PAREJAS_CHAPTER_ORDER);
    expect(pairs[0].recall.chapterOrder).toBe(PAREJAS_CHAPTER_ORDER);
    expect(CHAPTER_CONCEPTS[PAREJAS][PAREJAS_CHAPTER_ORDER]).toBeDefined();
    expect(CHAPTER_CONCEPTS[PAREJAS][1]).toBeUndefined();
  });

  it("uses the approved stable keys", () => {
    expect(CHAPTER_CONCEPTS[PAREJAS][PAREJAS_CHAPTER_ORDER].key).toBe(
      "pqp-c1-contacto-sostenido",
    );
    expect(pairs[0].practice.exerciseKey).toBe(
      "pqp-c1-practice-diez-minutos-de-contacto",
    );
    expect(pairs[0].recall.exerciseKey).toBe(
      "pqp-c1-recall-contacto-sostenido",
    );
  });

  it("anchors the practice to a single editorial heading", () => {
    expect(pairs[0].practice.sourceHeading).toBe(
      "Ejercicio 3: El Mapa de las Miradas",
    );
  });

  it("offers three pqp-prefixed options with the correct one among them", () => {
    const { options, correctOptionKey } = pairs[0].recall.content;
    const keys = options.map((o) => o.key);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
    expect(keys.every((k) => k.startsWith("pqp-"))).toBe(true);
    expect(keys).toContain(correctOptionKey);
  });

  it("keeps the practice and the recall in the same chapter, in order", () => {
    expect(pairs[0].practice.order).toBe(1);
    expect(pairs[0].recall.order).toBe(2);
    expect(pairs[0].practice.chapterOrder).toBe(pairs[0].recall.chapterOrder);
  });
});
