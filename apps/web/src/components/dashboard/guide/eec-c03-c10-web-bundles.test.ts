import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guideAnchorRegistry, resolveGuideAnchor } from "@psico/types";
import { resolveGuideWebBundle } from "./guide-web-bundle";
import { guidePresentationRegistry } from "./guide-presentation";
import { guideReaderCopyRegistry } from "./guide-reader-copy";
import { EEC_C03_MICROGUIDES } from "./eec-c03-microguides";
import { EEC_C04_MICROGUIDES } from "./eec-c04-microguides";
import { EEC_C05_MICROGUIDES } from "./eec-c05-microguides";
import { EEC_C06_MICROGUIDES } from "./eec-c06-microguides";
import { EEC_C07_MICROGUIDES } from "./eec-c07-microguides";
import { EEC_C08_MICROGUIDES } from "./eec-c08-microguides";
import { EEC_C09_MICROGUIDES } from "./eec-c09-microguides";
import { EEC_C10_MICROGUIDES } from "./eec-c10-microguides";
import { EEC_C01_MICROGUIDES } from "./eec-c01-microguides";
import { EEC_C02_MICROGUIDES } from "./eec-c02-microguides";

/**
 * The forty guided readings of EEC-C03 → C10, as the BROWSER can use them.
 *
 * Whether a card OPENS is a question the web answers on its own: it needs a
 * bundle — presentation and reader copy — plus an anchor that resolves against
 * the blocks production actually served. C01 shipped once without the bundles
 * and five cards did nothing; C02 added them in the same change. These are the
 * assertions that make a third occurrence impossible.
 *
 * The blocks come from each chapter's built `unit-payload.json`, which was
 * verified block by block against production at publication.
 */

const ROOT = join(__dirname, "..", "..", "..", "..", "..", "..");

const CHAPTERS = [
  { code: "C03", order: 3, version: "v1.0", table: EEC_C03_MICROGUIDES },
  { code: "C04", order: 4, version: "v1.0", table: EEC_C04_MICROGUIDES },
  { code: "C05", order: 5, version: "v1.0", table: EEC_C05_MICROGUIDES },
  { code: "C06", order: 6, version: "v1.1", table: EEC_C06_MICROGUIDES },
  { code: "C07", order: 7, version: "v1.0", table: EEC_C07_MICROGUIDES },
  { code: "C08", order: 8, version: "v1.0", table: EEC_C08_MICROGUIDES },
  { code: "C09", order: 9, version: "v1.0", table: EEC_C09_MICROGUIDES },
  { code: "C10", order: 10, version: "v1.0", table: EEC_C10_MICROGUIDES },
] as const;

type Block = { kind: string; content: string };

function blocksOf(code: string, version: string) {
  const raw = JSON.parse(
    readFileSync(
      join(
        ROOT,
        `artifacts/eec/${code}/${version}/feelverse/unit-payload.json`,
      ),
      "utf8",
    ),
  ) as { blocks: Block[] };
  return raw.blocks.map((b, i) => ({
    id: `blk-${i}`,
    kind: b.kind,
    content: b.content,
    blockKey: `key-${i}`,
    blockVersionId: `ver-${i}`,
  }));
}

/** The three conditions `LectorShell.canRunPin` requires, checked here. */
function canRunPin(
  pin: { guideKey: string; guideVersion: number },
  blocks: ReturnType<typeof blocksOf>,
): boolean {
  if (!resolveGuideWebBundle(pin)) return false;
  const locator = guideAnchorRegistry.getExact(pin);
  if (!locator) return false;
  return resolveGuideAnchor(blocks, locator).status === "RESOLVED";
}

describe("EEC-C03 → C10 · the forty web bundles", () => {
  it("there are forty, five per chapter", () => {
    expect(CHAPTERS).toHaveLength(8);
    for (const c of CHAPTERS) expect(c.table, c.code).toHaveLength(5);
    expect(CHAPTERS.reduce((n, c) => n + c.table.length, 0)).toBe(40);
  });

  for (const chapter of CHAPTERS) {
    describe(chapter.code, () => {
      const blocks = blocksOf(chapter.code, chapter.version);
      const pins = chapter.table.map((m) => ({
        guideKey: `eec-c${chapter.order}-${m.slug}`,
        guideVersion: 1,
      }));

      it("every one resolves a presentation, a reader copy and a bundle", () => {
        for (const pin of pins) {
          expect(
            guidePresentationRegistry.getExact(pin),
            pin.guideKey,
          ).not.toBeNull();
          expect(
            guideReaderCopyRegistry.getExact(pin),
            pin.guideKey,
          ).not.toBeNull();
          const bundle = resolveGuideWebBundle(pin);
          expect(bundle, pin.guideKey).not.toBeNull();
          expect(bundle?.presentation.guideKey).toBe(pin.guideKey);
          expect(bundle?.copy.guideKey).toBe(pin.guideKey);
        }
      });

      it("every one can actually run: bundle, anchor and a passage in the text", () => {
        for (const pin of pins) {
          expect(canRunPin(pin, blocks), pin.guideKey).toBe(true);
        }
      });

      it("declares the three obligatory steps, in order", () => {
        for (const [i, pin] of pins.entries()) {
          const m = chapter.table[i];
          const steps = resolveGuideWebBundle(pin)!.presentation.steps;
          expect(steps.map((s) => s.stepKey)).toEqual([
            `explorar-${m.slug}`,
            `practicar-${m.practiceSlug}`,
            `recordar-${m.slug}`,
          ]);
          expect(steps.map((s) => s.surface)).toEqual([
            "confirm",
            "confirm",
            "recall",
          ]);
        }
      });

      it("the recall carries its question and three options, never an answer", () => {
        for (const pin of pins) {
          const bundle = resolveGuideWebBundle(pin)!;
          const recall = bundle.presentation.steps.find(
            (s) => s.surface === "recall",
          );
          expect(recall).toBeDefined();
          if (recall?.surface !== "recall") throw new Error("no recall step");
          expect(recall.question.length).toBeGreaterThan(20);
          expect(recall.options).toHaveLength(3);
          for (const option of recall.options) {
            expect(Object.keys(option).sort()).toEqual(["label", "optionKey"]);
          }
          expect(JSON.stringify(bundle)).not.toContain("correctOptionKey");
        }
      });

      it("the reader panel names its own chapter", () => {
        // C01's copy said «capítulo 1»; a copied factory would have said it here.
        const step = resolveGuideWebBundle(pins[0])!.presentation.steps[2];
        expect(step.body.join(" ")).toContain(`capítulo ${chapter.order}`);
      });
    });
  }
});

describe("EEC-C03 → C10 · what must NOT change", () => {
  it("C01's five and C02's five still resolve", () => {
    for (const m of EEC_C01_MICROGUIDES) {
      const pin = { guideKey: `eec-c1-${m.slug}`, guideVersion: 1 };
      expect(resolveGuideWebBundle(pin), pin.guideKey).not.toBeNull();
    }
    for (const m of EEC_C02_MICROGUIDES) {
      const pin = { guideKey: `eec-c2-${m.slug}`, guideVersion: 1 };
      expect(resolveGuideWebBundle(pin), pin.guideKey).not.toBeNull();
    }
  });

  it("the retired C01 pilot and Parejas still resolve by exact pin", () => {
    expect(
      resolveGuideWebBundle({
        guideKey: "eec-c1-cuerpo-antes-que-mente",
        guideVersion: 1,
      }),
    ).not.toBeNull();
    expect(
      resolveGuideWebBundle({
        guideKey: "pqp-c1-contacto-sostenido",
        guideVersion: 1,
      }),
    ).not.toBeNull();
  });

  it("an unknown pin still fails closed", () => {
    expect(
      resolveGuideWebBundle({
        guideKey: "eec-c3-una-guia-que-nadie-aprobo",
        guideVersion: 1,
      }),
    ).toBeNull();
    // …and so does a version that was never published.
    expect(
      resolveGuideWebBundle({
        guideKey: "eec-c3-predecir-no-es-adivinar",
        guideVersion: 2,
      }),
    ).toBeNull();
  });
});
