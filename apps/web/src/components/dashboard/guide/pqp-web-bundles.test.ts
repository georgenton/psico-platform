import { describe, expect, it } from "vitest";
import {
  PQP_C01_MICROGUIDES,
  PQP_C01_PRESENTATIONS,
  PQP_C01_READER_COPY,
} from "./pqp-c01-microguides";
import {
  PQP_C02_MICROGUIDES,
  PQP_C02_PRESENTATIONS,
  PQP_C02_READER_COPY,
} from "./pqp-c02-microguides";
import {
  PQP_C03_MICROGUIDES,
  PQP_C03_PRESENTATIONS,
  PQP_C03_READER_COPY,
} from "./pqp-c03-microguides";
import {
  PQP_C04_MICROGUIDES,
  PQP_C04_PRESENTATIONS,
  PQP_C04_READER_COPY,
} from "./pqp-c04-microguides";
import {
  PQP_C05_MICROGUIDES,
  PQP_C05_PRESENTATIONS,
  PQP_C05_READER_COPY,
} from "./pqp-c05-microguides";
import {
  PQP_C06_MICROGUIDES,
  PQP_C06_PRESENTATIONS,
  PQP_C06_READER_COPY,
} from "./pqp-c06-microguides";
import {
  PQP_C07_MICROGUIDES,
  PQP_C07_PRESENTATIONS,
  PQP_C07_READER_COPY,
} from "./pqp-c07-microguides";
import {
  PQP_C08_MICROGUIDES,
  PQP_C08_PRESENTATIONS,
  PQP_C08_READER_COPY,
} from "./pqp-c08-microguides";
import { PRODUCTION_GUIDE_PRESENTATIONS } from "./guide-presentation";
import { PRODUCTION_GUIDE_READER_COPY } from "./guide-reader-copy";
import type { MicroguideEntry } from "./guide-microguide-bundle";
import type { GuidePresentation } from "./guide-presentation";
import type { GuideReaderCopy } from "./guide-reader-copy";

/**
 * PQP — every chapter's browser bundle, checked against the same invariants.
 *
 * The assertion these exist for is the negative one: the bundle a reader
 * downloads carries the three recall labels and nothing that says which of them
 * is correct. The correct key lives only in the server-side catalog, and the
 * generated bundles are built from a data module that does not contain it.
 *
 * Adding a chapter is one row in `CHAPTERS`.
 */

const PILOT = "pqp-c1-contacto-sostenido";

interface BundleUnderTest {
  readonly code: string;
  readonly keyPrefix: string;
  readonly entries: readonly MicroguideEntry[];
  readonly presentations: readonly GuidePresentation[];
  readonly readerCopy: readonly GuideReaderCopy[];
}

const CHAPTERS: readonly BundleUnderTest[] = [
  {
    code: "C01",
    keyPrefix: "pqp-c1",
    entries: PQP_C01_MICROGUIDES,
    presentations: PQP_C01_PRESENTATIONS,
    readerCopy: PQP_C01_READER_COPY,
  },
  {
    code: "C02",
    keyPrefix: "pqp-c2",
    entries: PQP_C02_MICROGUIDES,
    presentations: PQP_C02_PRESENTATIONS,
    readerCopy: PQP_C02_READER_COPY,
  },
  {
    code: "C03",
    keyPrefix: "pqp-c3",
    entries: PQP_C03_MICROGUIDES,
    presentations: PQP_C03_PRESENTATIONS,
    readerCopy: PQP_C03_READER_COPY,
  },
  {
    code: "C04",
    keyPrefix: "pqp-c4",
    entries: PQP_C04_MICROGUIDES,
    presentations: PQP_C04_PRESENTATIONS,
    readerCopy: PQP_C04_READER_COPY,
  },
  {
    code: "C05",
    keyPrefix: "pqp-c5",
    entries: PQP_C05_MICROGUIDES,
    presentations: PQP_C05_PRESENTATIONS,
    readerCopy: PQP_C05_READER_COPY,
  },
  {
    code: "C06",
    keyPrefix: "pqp-c6",
    entries: PQP_C06_MICROGUIDES,
    presentations: PQP_C06_PRESENTATIONS,
    readerCopy: PQP_C06_READER_COPY,
  },
  {
    code: "C07",
    keyPrefix: "pqp-c7",
    entries: PQP_C07_MICROGUIDES,
    presentations: PQP_C07_PRESENTATIONS,
    readerCopy: PQP_C07_READER_COPY,
  },
  {
    code: "C08",
    keyPrefix: "pqp-c8",
    entries: PQP_C08_MICROGUIDES,
    presentations: PQP_C08_PRESENTATIONS,
    readerCopy: PQP_C08_READER_COPY,
  },
];

describe.each(CHAPTERS)("PQP-$code · web bundle", (chapter) => {
  const keys = chapter.entries.map((m) => `${chapter.keyPrefix}-${m.slug}`);

  it("keeps presentation and reader copy in the same route order", () => {
    expect(chapter.presentations.map((p) => p.guideKey)).toEqual(keys);
    expect(chapter.readerCopy.map((c) => c.guideKey)).toEqual(keys);
  });

  it("never leaks which recall option is correct", () => {
    const serialized = JSON.stringify({
      entries: chapter.entries,
      presentations: chapter.presentations,
      readerCopy: chapter.readerCopy,
    });
    expect(serialized).not.toContain("correctOptionKey");
    expect(serialized).not.toContain("correctOption");
    for (const m of chapter.entries) {
      for (const o of m.recall.options) {
        expect(Object.keys(o).sort()).toEqual(["label", "optionKey"]);
      }
    }
    // The reader copy DOES carry a `feedback.correct` branch: that is fallback
    // wording for a verdict the server already decided, not a marker. It must
    // never name an option key.
    const optionKeys = chapter.entries.flatMap((m) =>
      m.recall.options.map((o) => o.optionKey),
    );
    const feedback = JSON.stringify(chapter.readerCopy.map((c) => c.feedback));
    for (const key of optionKeys) expect(feedback).not.toContain(key);
  });

  it("offers exactly three options per recall, with distinct keys", () => {
    for (const m of chapter.entries) {
      expect(m.recall.options).toHaveLength(3);
      expect(new Set(m.recall.options.map((o) => o.optionKey)).size).toBe(3);
      expect(m.recall.question.trim()).not.toBe("");
    }
  });

  it("joins the production registries beside the pilot, not instead of it", () => {
    const presented = PRODUCTION_GUIDE_PRESENTATIONS.map((p) => p.guideKey);
    const copy = PRODUCTION_GUIDE_READER_COPY.map((c) => c.guideKey);
    for (const key of keys) {
      expect(presented).toContain(key);
      expect(copy).toContain(key);
    }
    expect(presented).toContain(PILOT);
  });

  it("states its scope honestly on every route card", () => {
    for (const m of chapter.entries) {
      expect(m.title.trim()).not.toBe("");
      expect(m.summary.trim()).not.toBe("");
      expect(m.duration).toBe("8–10 minutos");
      expect(m.intro.note).toMatch(/salir y volver/i);
    }
  });

  it("does not promise a physiological result in its own voice", () => {
    // The PASSAGE scene shows the author's text as printed; the derived copy is
    // deliberately more cautious.
    const derived = chapter.entries
      .flatMap((m) => [
        ...m.concept.body,
        m.concept.note,
        ...m.summaryScene.body,
        ...m.practice.body,
      ])
      .join(" ");
    expect(derived).not.toMatch(/oxitocina|dopamina|cortisol|hormona/i);
    expect(derived).not.toMatch(/\b\d+\s*%/);
    expect(derived).not.toMatch(/el cerebro (hace|produce|libera)/i);
    expect(derived).not.toMatch(/\bcura\b|\bgarantiza\b|\bdemuestra que\b/i);
  });

  it("never diagnoses a person or forecasts a relationship", () => {
    const all = JSON.stringify(chapter.entries);
    expect(all).not.toMatch(/tu relación (está|va a|fracasar)/i);
    expect(all).not.toMatch(/\beres (un|una) \w+ (persona )?(tóxic|narcis)/i);
    expect(all).not.toMatch(/\btienes (apego|un patrón)\b/i);
    // «diagnóstico» is allowed — and wanted — when it is being DENIED
    // («no es un diagnóstico»). What must never appear is the word making a
    // claim, so the denials are removed before looking for what is left.
    const withoutDisclaimers = all.replace(
      /\b(no|ni|nunca)\b[^.!?"]{0,60}diagnóstic\w*/gi,
      "",
    );
    expect(withoutDisclaimers).not.toMatch(/diagnóstic/i);
  });

  it("keeps concept notes free of scoring language", () => {
    const notes = chapter.entries.map((m) => m.concept.note).join(" ");
    expect(notes).toMatch(/no evalúa|no infiere|no interpreta/i);
    expect(notes).not.toMatch(/puntaje|puntuación|nivel de tu relación/i);
  });
});

describe("PQP · bundles across chapters", () => {
  it("keeps every guide key unique", () => {
    const all = CHAPTERS.flatMap((c) =>
      c.entries.map((m) => `${c.keyPrefix}-${m.slug}`),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps every recall option key unique across the book", () => {
    const all = CHAPTERS.flatMap((c) =>
      c.entries.flatMap((m) => m.recall.options.map((o) => o.optionKey)),
    );
    expect(new Set(all).size).toBe(all.length);
  });
});
