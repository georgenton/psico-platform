import { describe, expect, it } from "vitest";
import {
  guideAnchorRegistry,
  guidedChapterConcepts,
  PQP_C1_MG01_ANCHOR,
  PQP_C1_MG02_ANCHOR,
  PQP_C1_MG03_ANCHOR,
  PQP_C1_MG04_ANCHOR,
} from "@psico/types";
import { productionGuideRegistry } from "../guide/guide-catalog";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";
import { EXERCISE_CATALOG_PQP_C01 } from "./exercise-catalog-pqp-c01";
import { productionGuideDiscoveryCatalog } from "../guide/guide-discovery-catalog";

/**
 * PQP-C01 — the four canonical microguides, as data.
 *
 * These are the invariants that must not drift between the catalogs, the
 * anchors and the manifests. Everything asserted here is checkable without a
 * database: what needs one (the anchors resolving against published revision
 * #10) is measured by the CLI's `plan` command against the real text.
 */

const BOOK = "parejas-que-perduran";
/** PLATFORM order. The book's chapter 1 is unit 2; unit 1 is the front matter. */
const CHAPTER_ORDER = 2;
const PILOT_GUIDE_KEY = "pqp-c1-contacto-sostenido";

const ROUTE = [
  "pqp-c1-amor-como-practica",
  "pqp-c1-presencia-sin-acuerdo",
  "pqp-c1-clima-que-aprenden",
  "pqp-c1-reinventar-el-vinculo",
] as const;

describe("PQP-C01 · guide catalog", () => {
  it("registers exactly four new guides, each at version 1", () => {
    for (const key of ROUTE) {
      const def = productionGuideRegistry.getExact(key, 1);
      expect(def.guideKey).toBe(key);
      expect(def.guideVersion).toBe(1);
    }
    expect(new Set(ROUTE).size).toBe(4);
  });

  it("does not reuse the historical pilot's lineage", () => {
    expect(ROUTE).not.toContain(PILOT_GUIDE_KEY);
    // And the pilot itself is still registered and startable, untouched.
    const pilot = productionGuideRegistry.getExact(PILOT_GUIDE_KEY, 1);
    expect(pilot.steps).toHaveLength(3);
    expect(
      productionGuideRegistry.latestStartableVersion(PILOT_GUIDE_KEY),
    ).toBe(1);
  });

  it("gives every microguide the same three obligatory steps, in order", () => {
    for (const key of ROUTE) {
      const def = productionGuideRegistry.getExact(key, 1);
      expect(def.steps.map((s) => s.kind)).toEqual([
        "CONCEPT_EXPLORATION",
        "CATALOG_PRACTICE",
        "ACTIVE_RECALL",
      ]);
      expect(def.steps.map((s) => s.order)).toEqual([1, 2, 3]);
      expect(def.steps.every((s) => s.required)).toBe(true);
    }
  });

  it("points every step at a target the catalogs actually define", () => {
    const pairs = EXERCISE_INGESTION_CATALOG[BOOK] ?? [];
    const practiceKeys = new Set(pairs.map((p) => p.practice.exerciseKey));
    const recallKeys = new Set(pairs.map((p) => p.recall.exerciseKey));
    const conceptKeys = new Set(
      guidedChapterConcepts(BOOK, CHAPTER_ORDER).map((c) => c.key),
    );
    for (const key of ROUTE) {
      const def = productionGuideRegistry.getExact(key, 1);
      const [concept, practice, recall] = def.steps;
      expect(conceptKeys.has(concept.conceptKey)).toBe(true);
      expect(practiceKeys.has(practice.exerciseKey)).toBe(true);
      expect(recallKeys.has(recall.itemKey)).toBe(true);
    }
  });
});

describe("PQP-C01 · anchors", () => {
  const ANCHORS = [
    PQP_C1_MG01_ANCHOR,
    PQP_C1_MG02_ANCHOR,
    PQP_C1_MG03_ANCHOR,
    PQP_C1_MG04_ANCHOR,
  ];

  it("registers one anchor per microguide, in route order", () => {
    expect(ANCHORS.map((a) => a.guideKey)).toEqual([...ROUTE]);
    for (const a of ANCHORS) {
      expect(guideAnchorRegistry.getExact(a)).toEqual(a);
      expect(a.bookSlug).toBe(BOOK);
      // PLATFORM order — keying this by 1 would search the front matter.
      expect(a.chapterOrder).toBe(CHAPTER_ORDER);
      expect(a.expectedMatchCount).toBe(1);
      expect(a.sourceHeading.trim()).not.toBe("");
      expect(a.passageLastSentence.trim()).not.toBe("");
    }
  });

  it("keeps MG04's heading complete rather than truncated", () => {
    // Measured against published revision #10: with the heading shortened to
    // «Un Testimonio Personal» the exact match count is 0, because the resolver
    // compares whole normalized headings. This pins the full line so a tidy-up
    // cannot silently unresolve the anchor.
    expect(PQP_C1_MG04_ANCHOR.sourceHeading).toBe(
      "Un Testimonio Personal: Mireya y Yo – Los Abrazos que Cruzaron el Dolor",
    );
    expect(PQP_C1_MG04_ANCHOR.sourceHeading).not.toBe("Un Testimonio Personal");
  });

  it("leaves the pilot's anchor registered and distinct", () => {
    const pilot = guideAnchorRegistry.getExact({
      guideKey: PILOT_GUIDE_KEY,
      guideVersion: 1,
    });
    expect(pilot).not.toBeNull();
    expect(ANCHORS.map((a) => a.sourceHeading)).not.toContain(
      pilot?.sourceHeading,
    );
  });
});

describe("PQP-C01 · recalls", () => {
  it("offers exactly three options with one correct key, server-side", () => {
    for (const pair of EXERCISE_CATALOG_PQP_C01) {
      const { content } = pair.recall;
      expect(content.options).toHaveLength(3);
      expect(new Set(content.options.map((o) => o.key)).size).toBe(3);
      expect(content.options.map((o) => o.key)).toContain(
        content.correctOptionKey,
      );
      expect(content.recallMode).toBe("objective");
    }
  });

  it("gives both outcomes editorial copy and never a score", () => {
    for (const pair of EXERCISE_CATALOG_PQP_C01) {
      expect(pair.recall.feedback.correct.trim()).not.toBe("");
      expect(pair.recall.feedback.review.trim()).not.toBe("");
      const both = `${pair.recall.feedback.correct} ${pair.recall.feedback.review}`;
      // No score, no percentage, no verdict about the person.
      expect(both).not.toMatch(/\b\d+\s*%|\bpuntaje\b|\bpuntuación\b/i);
      expect(both).not.toMatch(
        /\bte equivocaste\b|\bestás mal\b|\bfallaste\b/i,
      );
    }
  });

  it("keeps the correct key on the server side only", () => {
    // This module is server-side and never shipped to a browser, so the key
    // living here is exactly right. The mirror assertion — that the web bundle
    // carries the three labels and nothing that says which is correct — is made
    // where that bundle lives, in `pqp-c01-microguides.test.ts`. Importing the
    // web app from an API spec would drag Next's module graph into this
    // process, which is not a thing a catalog test should do.
    const serialized = JSON.stringify(EXERCISE_CATALOG_PQP_C01);
    expect(serialized).toContain("correctOptionKey");
    for (const pair of EXERCISE_CATALOG_PQP_C01) {
      expect(pair.recall.content.correctOptionKey).toMatch(/^pqp-opcion-/);
    }
  });
});

describe("PQP-C01 · practices", () => {
  it("uses only the generic catalog shapes, never an EEC-bound one", () => {
    const kinds = EXERCISE_CATALOG_PQP_C01.map((p) => p.practice.practiceKind);
    expect(kinds).toEqual([
      "sequence_ordering",
      "context_plausibility",
      "signal_context_compare",
      "sequence_ordering",
    ]);
    // `belief_lens` and `four_part_distinction` carry zone/field keys written
    // for EEC's chapters. Borrowing them here to save work would put this
    // book's content under another book's semantics.
    expect(kinds).not.toContain("belief_lens");
    expect(kinds).not.toContain("four_part_distinction");
  });

  it("works on editorial material and never on the reader's own relationship", () => {
    for (const pair of EXERCISE_CATALOG_PQP_C01) {
      const i = pair.practice.interaction;
      expect(i).toBeDefined();
      const serialized = JSON.stringify(i);
      // Every scenario is a named, invented couple. None of the shapes asks a
      // reader to classify their own partner.
      expect(serialized).not.toMatch(/tu pareja|tu relación|tu familia/i);
    }
  });

  it("anchors each practice to a heading of this chapter", () => {
    const headings = EXERCISE_CATALOG_PQP_C01.map(
      (p) => p.practice.sourceHeading,
    );
    expect(headings).toEqual([
      "El Amor como Medicina",
      "El Cerebro Enamorado",
      "Los Hijos",
      "Un Testimonio Personal: Mireya y Yo – Los Abrazos que Cruzaron el Dolor",
    ]);
    for (const p of EXERCISE_CATALOG_PQP_C01) {
      expect(p.practice.bookSlug).toBe(BOOK);
      expect(p.practice.chapterOrder).toBe(CHAPTER_ORDER);
      expect(p.recall.chapterOrder).toBe(CHAPTER_ORDER);
    }
  });

  it("numbers the new pairs after the pilot's, without renumbering it", () => {
    const all = EXERCISE_INGESTION_CATALOG[BOOK] ?? [];
    const orders = all.flatMap((p) => [p.practice.order, p.recall.order]);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // The pilot keeps 1–2 and its keys.
    expect(all[0].practice.exerciseKey).toBe(
      "pqp-c1-practice-diez-minutos-de-contacto",
    );
    expect(all[0].recall.exerciseKey).toBe("pqp-c1-recall-contacto-sostenido");
  });
});

describe("PQP-C01 · concepts and resonance", () => {
  it("mints four new concept keys and does not reuse the pilot's", () => {
    const concepts = guidedChapterConcepts(BOOK, CHAPTER_ORDER);
    expect(concepts.map((c) => c.key)).toEqual([...ROUTE]);
    // The pilot's concept is NOT among them: it may already sit on Resonance
    // rows a reader confirmed against the OCR edition.
    expect(concepts.map((c) => c.key)).not.toContain(PILOT_GUIDE_KEY);
    for (const c of concepts) {
      expect(c.editionKey).toBe("parejas-que-perduran-1e");
      expect(c.unitKey).toBe("a8f009c0-1660-5f1e-a435-b8bc4ebbb7d4");
    }
  });
});

describe("PQP-C01 · the route stays dark until somebody publishes it", () => {
  it("is absent from the discovery catalog, which still answers with the pilot", () => {
    const offered = productionGuideDiscoveryCatalog
      .listContext(BOOK, CHAPTER_ORDER)
      .map((i) => i.pin.guideKey);
    for (const key of ROUTE) expect(offered).not.toContain(key);
    // Unchanged: the pilot is what this chapter offers today. Publication is a
    // separate, human decision.
    expect(offered).toEqual([PILOT_GUIDE_KEY]);
  });
});
