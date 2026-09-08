import { describe, expect, it } from "vitest";
import { guideAnchorRegistry, guidedChapterConcepts } from "@psico/types";
import { productionGuideRegistry } from "../guide/guide-catalog";
import { productionGuideDiscoveryCatalog } from "../guide/guide-discovery-catalog";
import { EXERCISE_INGESTION_CATALOG } from "./exercise-ingestion-catalog";

/**
 * PQP — the invariants every chapter's guided route must satisfy.
 *
 * Data-driven over a table so a new chapter is one row, not a copy of this
 * file. What each chapter contributes is its keys; what the assertions check is
 * the same for all of them: unique lineages, three obligatory steps, targets
 * that exist, anchors registered against the right platform order, three-option
 * recalls whose correct key stays server-side, practices built from editorial
 * material, and a route that is still dark.
 *
 * The chapter-specific reasoning (why THESE microguides) lives in the chapter's
 * data module; what lives here is what must be true regardless.
 */

const BOOK = "parejas-que-perduran";
const EDITION = "parejas-que-perduran-1e";
const PILOT_GUIDE_KEY = "pqp-c1-contacto-sostenido";

interface ChapterUnderTest {
  readonly code: string;
  /** PLATFORM order: the book's chapter N is unit N+1. */
  readonly chapterOrder: number;
  readonly keyPrefix: string;
  readonly unitKey: string;
  readonly slugs: readonly string[];
  /** Practice slugs, in route order. */
  readonly practiceSlugs: readonly string[];
  /** First order this chapter's exercise pairs occupy. */
  readonly firstExerciseOrder: number;
}

const CHAPTERS: readonly ChapterUnderTest[] = [
  {
    code: "C01",
    chapterOrder: 2,
    keyPrefix: "pqp-c1",
    unitKey: "a8f009c0-1660-5f1e-a435-b8bc4ebbb7d4",
    slugs: [
      "amor-como-practica",
      "presencia-sin-acuerdo",
      "clima-que-aprenden",
      "reinventar-el-vinculo",
    ],
    practiceSlugs: [
      "orden-de-lo-cotidiano",
      "lo-que-se-y-lo-que-supongo",
      "misma-escena-dos-lecturas",
      "lo-que-dejo-de-funcionar",
    ],
    firstExerciseOrder: 3,
  },
  {
    code: "C02",
    chapterOrder: 3,
    keyPrefix: "pqp-c2",
    unitKey: "9f291999-9a47-5fec-b791-0d17aa5a8c74",
    slugs: [
      "queja-no-es-critica",
      "lo-pequeno-es-grande",
      "aceptar-influencia",
      "desacuerdos-perpetuos",
      "sueno-detras-del-desacuerdo",
    ],
    practiceSlugs: [
      "sobre-el-hecho-o-sobre-la-persona",
      "una-invitacion-y-tres-respuestas",
      "una-decision-tomada-entre-dos",
      "resoluble-o-recurrente",
      "lo-que-hay-debajo",
    ],
    firstExerciseOrder: 11,
  },
  {
    code: "C03",
    chapterOrder: 4,
    keyPrefix: "pqp-c3",
    unitKey: "83a96f4b-b9af-52a0-8c76-5e0cce6e6455",
    slugs: [
      "elegir-cada-dia",
      "priorizar-es-agenda",
      "aceptar-sin-coincidir",
      "apoyar-el-crecimiento",
    ],
    practiceSlugs: [
      "eleccion-o-inercia",
      "lo-que-se-mueve-y-lo-que-no",
      "diferencia-o-desacuerdo",
      "acompanar-un-proyecto",
    ],
    firstExerciseOrder: 21,
  },
  {
    code: "C04",
    chapterOrder: 5,
    keyPrefix: "pqp-c4",
    unitKey: "39d09b0d-98a0-5b53-9844-364eaae4d0dc",
    slugs: [
      "hablar-no-es-comunicarse",
      "armonia-no-es-salud",
      "pensar-distinto-sin-dividirse",
      "validar-no-es-dar-la-razon",
    ],
    practiceSlugs: [
      "en-que-nivel-ocurre",
      "armonia-o-distancia",
      "el-miedo-debajo-de-la-opinion",
      "validar-o-ceder",
    ],
    firstExerciseOrder: 29,
  },
  {
    code: "C05",
    chapterOrder: 6,
    keyPrefix: "pqp-c5",
    unitKey: "c96b9981-e319-57de-a290-8214caaa38f4",
    slugs: [
      "conflicto-no-es-control",
      "una-cosa-a-la-vez",
      "el-momento-importa",
      "acuerdo-no-es-victoria",
    ],
    practiceSlugs: [
      "desacuerdo-o-senales-de-control",
      "hoy-o-el-historial",
      "cuando-abrir-la-conversacion",
      "de-la-postura-al-acuerdo",
    ],
    firstExerciseOrder: 37,
  },
];

/** The generic catalog shapes. The other two carry EEC-bound field keys. */
const GENERIC_PRACTICE_KINDS = [
  "sequence_ordering",
  "context_plausibility",
  "signal_context_compare",
];

/**
 * A chapter's OWN pairs. Scoped by key prefix rather than by chapter order,
 * because the V1 pilot's pair also sits at platform order 2 and is not part of
 * any canonical route — it keeps its own keys, its own orders (1–2) and its own
 * `guided_reflection` shape.
 */
const pairsOf = (chapter: ChapterUnderTest) => {
  const own = new Set(
    chapter.practiceSlugs.map((s) => `${chapter.keyPrefix}-practice-${s}`),
  );
  return (EXERCISE_INGESTION_CATALOG[BOOK] ?? []).filter((p) =>
    own.has(p.practice.exerciseKey),
  );
};

describe.each(CHAPTERS)("PQP-$code · guided route", (chapter) => {
  const guideKeys = chapter.slugs.map((s) => `${chapter.keyPrefix}-${s}`);

  it("registers one guide per microguide, each at version 1", () => {
    for (const key of guideKeys) {
      const def = productionGuideRegistry.getExact(key, 1);
      expect(def.guideKey).toBe(key);
      expect(def.guideVersion).toBe(1);
    }
    expect(new Set(guideKeys).size).toBe(chapter.slugs.length);
  });

  it("never reuses the historical pilot's lineage", () => {
    expect(guideKeys).not.toContain(PILOT_GUIDE_KEY);
  });

  it("gives every microguide the same three obligatory steps, in order", () => {
    for (const key of guideKeys) {
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

  it("points every step at a target the catalogs define", () => {
    const pairs = pairsOf(chapter);
    const practiceKeys = new Set(pairs.map((p) => p.practice.exerciseKey));
    const recallKeys = new Set(pairs.map((p) => p.recall.exerciseKey));
    const conceptKeys = new Set(
      guidedChapterConcepts(BOOK, chapter.chapterOrder).map((c) => c.key),
    );
    for (const key of guideKeys) {
      const [concept, practice, recall] = productionGuideRegistry.getExact(
        key,
        1,
      ).steps;
      expect(conceptKeys.has(concept.conceptKey)).toBe(true);
      expect(practiceKeys.has(practice.exerciseKey)).toBe(true);
      expect(recallKeys.has(recall.itemKey)).toBe(true);
    }
  });

  it("registers one anchor per microguide, at this chapter's platform order", () => {
    for (const guideKey of guideKeys) {
      const anchor = guideAnchorRegistry.getExact({
        guideKey,
        guideVersion: 1,
      });
      expect(anchor).not.toBeNull();
      expect(anchor?.bookSlug).toBe(BOOK);
      // Keying by the editorial number would search the wrong unit entirely.
      expect(anchor?.chapterOrder).toBe(chapter.chapterOrder);
      expect(anchor?.expectedMatchCount).toBe(1);
      expect(anchor?.sourceHeading.trim()).not.toBe("");
      expect(anchor?.passageLastSentence.trim()).not.toBe("");
    }
  });

  it("mints one concept per microguide, bound to this unit", () => {
    const concepts = guidedChapterConcepts(BOOK, chapter.chapterOrder);
    expect(concepts.map((c) => c.key)).toEqual(guideKeys);
    for (const c of concepts) {
      expect(c.editionKey).toBe(EDITION);
      expect(c.unitKey).toBe(chapter.unitKey);
    }
    // The pilot's concept is never reused: it may already sit on Resonance rows.
    expect(concepts.map((c) => c.key)).not.toContain(PILOT_GUIDE_KEY);
  });

  it("offers exactly three recall options with one correct key", () => {
    const pairs = pairsOf(chapter);
    expect(pairs).toHaveLength(chapter.slugs.length);
    for (const pair of pairs) {
      const { content } = pair.recall;
      expect(content.options).toHaveLength(3);
      expect(new Set(content.options.map((o) => o.key)).size).toBe(3);
      expect(content.options.map((o) => o.key)).toContain(
        content.correctOptionKey,
      );
      expect(content.recallMode).toBe("objective");
    }
  });

  it("gives both recall outcomes copy, and never a score or a verdict", () => {
    for (const pair of pairsOf(chapter)) {
      const both = `${pair.recall.feedback.correct} ${pair.recall.feedback.review}`;
      expect(pair.recall.feedback.correct.trim()).not.toBe("");
      expect(pair.recall.feedback.review.trim()).not.toBe("");
      expect(both).not.toMatch(/\b\d+\s*%|\bpuntaje\b|\bpuntuación\b/i);
      expect(both).not.toMatch(
        /\bte equivocaste\b|\bestás mal\b|\bfallaste\b|\bfracasar/i,
      );
    }
  });

  it("uses only the generic practice shapes", () => {
    for (const pair of pairsOf(chapter)) {
      expect(GENERIC_PRACTICE_KINDS).toContain(pair.practice.practiceKind);
      expect(pair.practice.interaction).toBeDefined();
    }
  });

  it("builds every practice from editorial material, never the reader's own", () => {
    for (const pair of pairsOf(chapter)) {
      const serialized = JSON.stringify(pair.practice.interaction);
      expect(serialized).not.toMatch(/tu pareja|tu relación|tu familia/i);
      // Nor does any practice ask for a rating of the bond.
      expect(serialized).not.toMatch(/del 1 al \d|puntúa|califica tu/i);
    }
  });

  it("numbers its exercise pairs contiguously, after the previous chapter's", () => {
    const pairs = pairsOf(chapter);
    const orders = pairs.flatMap((p) => [p.practice.order, p.recall.order]);
    const expected = Array.from(
      { length: chapter.slugs.length * 2 },
      (_, i) => chapter.firstExerciseOrder + i,
    );
    expect(orders).toEqual(expected);
  });

  it("anchors every practice to a heading of its own chapter", () => {
    for (const pair of pairsOf(chapter)) {
      expect(pair.practice.bookSlug).toBe(BOOK);
      expect(pair.practice.sourceHeading.trim()).not.toBe("");
      expect(pair.recall.chapterOrder).toBe(chapter.chapterOrder);
    }
  });

  it("stays out of the discovery catalog until somebody publishes it", () => {
    const offered = productionGuideDiscoveryCatalog
      .listContext(BOOK, chapter.chapterOrder)
      .map((i) => i.pin.guideKey);
    for (const key of guideKeys) expect(offered).not.toContain(key);
  });
});

describe("PQP · book-wide invariants", () => {
  it("keeps every guide key unique across chapters", () => {
    const all = CHAPTERS.flatMap((c) =>
      c.slugs.map((s) => `${c.keyPrefix}-${s}`),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps every exercise order unique across the whole book", () => {
    const orders = (EXERCISE_INGESTION_CATALOG[BOOK] ?? []).flatMap((p) => [
      p.practice.order,
      p.recall.order,
    ]);
    expect(new Set(orders).size).toBe(orders.length);
    // Contiguous from 1: the pilot holds 1–2 and each chapter follows on.
    expect([...orders].sort((a, b) => a - b)).toEqual(
      Array.from({ length: orders.length }, (_, i) => i + 1),
    );
  });

  it("leaves the historical pilot registered, startable and unclaimed", () => {
    const pilot = productionGuideRegistry.getExact(PILOT_GUIDE_KEY, 1);
    expect(pilot.steps).toHaveLength(3);
    expect(
      productionGuideRegistry.latestStartableVersion(PILOT_GUIDE_KEY),
    ).toBe(1);
    // And it is still what chapter 1 offers today.
    const offered = productionGuideDiscoveryCatalog
      .listContext(BOOK, 2)
      .map((i) => i.pin.guideKey);
    expect(offered).toEqual([PILOT_GUIDE_KEY]);
  });
});
