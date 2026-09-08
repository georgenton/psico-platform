import { describe, expect, it } from "vitest";
import {
  PQP_C01_MICROGUIDES,
  PQP_C01_PRESENTATIONS,
  PQP_C01_READER_COPY,
} from "./pqp-c01-microguides";
import { PRODUCTION_GUIDE_PRESENTATIONS } from "./guide-presentation";
import { PRODUCTION_GUIDE_READER_COPY } from "./guide-reader-copy";

/**
 * PQP-C01's browser bundle — the PUBLIC half of the four microguides.
 *
 * The assertion this file exists for is the negative one: the bundle a reader
 * downloads carries the three recall labels and nothing that says which of them
 * is correct. The correct key lives only in the server-side catalog.
 */

const ROUTE = [
  "pqp-c1-amor-como-practica",
  "pqp-c1-presencia-sin-acuerdo",
  "pqp-c1-clima-que-aprenden",
  "pqp-c1-reinventar-el-vinculo",
] as const;

const PILOT = "pqp-c1-contacto-sostenido";

describe("PQP-C01 · web bundle", () => {
  it("ships four microguides, in route order", () => {
    expect(PQP_C01_MICROGUIDES).toHaveLength(4);
    expect(PQP_C01_PRESENTATIONS.map((p) => p.guideKey)).toEqual([...ROUTE]);
    expect(PQP_C01_READER_COPY.map((c) => c.guideKey)).toEqual([...ROUTE]);
  });

  it("never leaks which recall option is correct", () => {
    const serialized = JSON.stringify({
      PQP_C01_MICROGUIDES,
      PQP_C01_PRESENTATIONS,
      PQP_C01_READER_COPY,
    });
    expect(serialized).not.toContain("correctOptionKey");
    expect(serialized).not.toContain("correctOption");
    // No field marks an option, either — the shape itself cannot express it.
    for (const m of PQP_C01_MICROGUIDES) {
      for (const o of m.recall.options) {
        expect(Object.keys(o).sort()).toEqual(["label", "optionKey"]);
      }
    }
    // The reader copy DOES carry a `feedback.correct` branch. That is the
    // fallback wording for a verdict the server already decided, not a marker:
    // it must never name an option key.
    const optionKeys = PQP_C01_MICROGUIDES.flatMap((m) =>
      m.recall.options.map((o) => o.optionKey),
    );
    const feedback = JSON.stringify(PQP_C01_READER_COPY.map((c) => c.feedback));
    for (const key of optionKeys) expect(feedback).not.toContain(key);
  });

  it("offers exactly three options per recall, with distinct keys", () => {
    for (const m of PQP_C01_MICROGUIDES) {
      expect(m.recall.options).toHaveLength(3);
      expect(new Set(m.recall.options.map((o) => o.optionKey)).size).toBe(3);
      expect(m.recall.question.trim()).not.toBe("");
    }
  });

  it("joins the production registries beside the pilot, not instead of it", () => {
    const presented = PRODUCTION_GUIDE_PRESENTATIONS.map((p) => p.guideKey);
    for (const key of ROUTE) expect(presented).toContain(key);
    // The V1 pilot's presentation is still registered: a session pinned to it
    // must still be drawable.
    expect(presented).toContain(PILOT);
    const copy = PRODUCTION_GUIDE_READER_COPY.map((c) => c.guideKey);
    for (const key of ROUTE) expect(copy).toContain(key);
  });

  it("states its scope honestly on every route card", () => {
    for (const m of PQP_C01_MICROGUIDES) {
      expect(m.title.trim()).not.toBe("");
      expect(m.summary.trim()).not.toBe("");
      expect(m.duration).toBe("8–10 minutos");
      // Each intro names the safe exit and says the work is on editorial
      // material, not on the reader's own relationship.
      expect(m.intro.note).toMatch(/salir y volver/i);
    }
  });

  it("does not promise a physiological result in its own voice", () => {
    // The PASSAGE scene shows the author's text as printed; the derived copy
    // is deliberately more cautious (DERIVED_COPY_MAY_BE_MORE_CAUTIOUS_THAN_BOOK).
    const derived = PQP_C01_MICROGUIDES.flatMap((m) => [
      ...m.concept.body,
      m.concept.note,
      ...m.summaryScene.body,
      ...m.practice.body,
    ]).join(" ");
    expect(derived).not.toMatch(/oxitocina|dopamina|cortisol|hormona/i);
    expect(derived).not.toMatch(/\b\d+\s*%/);
    expect(derived).not.toMatch(/el cerebro (hace|produce|libera)/i);
    expect(derived).not.toMatch(/\bcura\b|\bgarantiza\b|\bdemuestra que\b/i);
  });

  it("keeps reflection copy private, optional and unscored", () => {
    // The reflection scenes live in the stored definition, but the notes the
    // bundle carries must never suggest a reading is recorded or judged.
    const notes = PQP_C01_MICROGUIDES.map((m) => m.concept.note).join(" ");
    expect(notes).toMatch(/no evalúa|no infiere/i);
    expect(notes).not.toMatch(/puntaje|puntuación|nivel de tu relación/i);
  });
});
