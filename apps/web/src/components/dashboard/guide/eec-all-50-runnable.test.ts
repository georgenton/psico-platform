import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guideAnchorRegistry, resolveGuideAnchor } from "@psico/types";
import { resolveGuideWebBundle } from "./guide-web-bundle";
import { guidePresentationRegistry } from "./guide-presentation";
import { guideReaderCopyRegistry } from "./guide-reader-copy";
import { EEC_C01_MICROGUIDES } from "./eec-c01-microguides";
import { EEC_C02_MICROGUIDES } from "./eec-c02-microguides";
import { EEC_C03_MICROGUIDES } from "./eec-c03-microguides";
import { EEC_C04_MICROGUIDES } from "./eec-c04-microguides";
import { EEC_C05_MICROGUIDES } from "./eec-c05-microguides";
import { EEC_C06_MICROGUIDES } from "./eec-c06-microguides";
import { EEC_C07_MICROGUIDES } from "./eec-c07-microguides";
import { EEC_C08_MICROGUIDES } from "./eec-c08-microguides";
import { EEC_C09_MICROGUIDES } from "./eec-c09-microguides";
import { EEC_C10_MICROGUIDES } from "./eec-c10-microguides";

/**
 * All FIFTY guided readings of EEC, as the browser can run them.
 *
 * The per-chapter suites already prove their own five. This one exists because
 * the reader is about to be offered the whole book at once, so "every chapter
 * opens" became a single claim rather than ten separate ones.
 *
 * ── The defect this list used to carry ────────────────────────────────────
 *
 * `eec-c1-construida-no-significa-falsa` did not resolve: its locator named
 * «Lisa Feldman Barrett: la emoción como construcción», whose section ends
 * where «Un vaso que cambia la experiencia» begins, and the approved passage
 * sits after that boundary. `canRunPin` requires RESOLVED, so the card
 * rendered and its click returned early — visible, unopenable.
 *
 * Fixed by moving the LOCATOR, not the text. The set stays here, empty, so
 * that admitting a future exception is a deliberate edit rather than a silent
 * skip.
 */
const KNOWN_UNRESOLVED = new Set<string>();

const ROOT = join(__dirname, "..", "..", "..", "..", "..", "..");

const CHAPTERS = [
  { order: 1, version: "v1.0", table: EEC_C01_MICROGUIDES },
  { order: 2, version: "v1.0", table: EEC_C02_MICROGUIDES },
  { order: 3, version: "v1.0", table: EEC_C03_MICROGUIDES },
  { order: 4, version: "v1.0", table: EEC_C04_MICROGUIDES },
  { order: 5, version: "v1.0", table: EEC_C05_MICROGUIDES },
  { order: 6, version: "v1.1", table: EEC_C06_MICROGUIDES },
  { order: 7, version: "v1.0", table: EEC_C07_MICROGUIDES },
  { order: 8, version: "v1.0", table: EEC_C08_MICROGUIDES },
  { order: 9, version: "v1.0", table: EEC_C09_MICROGUIDES },
  { order: 10, version: "v1.0", table: EEC_C10_MICROGUIDES },
] as const;

type Block = { kind: string; content: string };

function blocksOf(order: number, version: string) {
  const code = `C${String(order).padStart(2, "0")}`;
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

describe("EEC · the fifty the reader is now offered", () => {
  it("there are fifty, five in each of ten chapters", () => {
    expect(CHAPTERS).toHaveLength(10);
    for (const c of CHAPTERS) expect(c.table, `C${c.order}`).toHaveLength(5);
    expect(CHAPTERS.reduce((n, c) => n + c.table.length, 0)).toBe(50);
  });

  it("all fifty are runnable, with no exceptions carried", () => {
    // The number somebody would have to change deliberately to reintroduce a
    // card that renders and does not open.
    expect(KNOWN_UNRESOLVED.size).toBe(0);
    expect(50 - KNOWN_UNRESOLVED.size).toBe(50);
  });

  for (const chapter of CHAPTERS) {
    it(`C${String(chapter.order).padStart(2, "0")} · all five can run`, () => {
      const blocks = blocksOf(chapter.order, chapter.version);
      for (const m of chapter.table) {
        const pin = {
          guideKey: `eec-c${chapter.order}-${m.slug}`,
          guideVersion: 1,
        };
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

        const locator = guideAnchorRegistry.getExact(pin);
        expect(locator, pin.guideKey).not.toBeNull();
        const status = resolveGuideAnchor(blocks, locator!).status;
        expect(status, pin.guideKey).toBe(
          KNOWN_UNRESOLVED.has(pin.guideKey) ? "UNRESOLVED" : "RESOLVED",
        );

        const recall = bundle!.presentation.steps.find(
          (s) => s.surface === "recall",
        );
        expect(recall, pin.guideKey).toBeDefined();
        if (recall?.surface !== "recall") throw new Error("no recall step");
        expect(recall.options, pin.guideKey).toHaveLength(3);
        // The one thing that must never reach a browser.
        expect(JSON.stringify(bundle)).not.toContain("correctOptionKey");
      }
    });
  }
});
