import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guideAnchorRegistry, resolveGuideAnchor } from "@psico/types";
import { resolveGuideWebBundle } from "./guide-web-bundle";
import { guidePresentationRegistry } from "./guide-presentation";
import { guideReaderCopyRegistry } from "./guide-reader-copy";
import { EEC_C02_MICROGUIDES } from "./eec-c02-microguides";
import { EEC_C01_MICROGUIDES } from "./eec-c01-microguides";

/**
 * EEC-C02's five guided readings, as the BROWSER can use them.
 *
 * The five Experiences exist in production as DRAFT. Whether anybody can OPEN
 * one is a separate question the web answers on its own: it needs a bundle —
 * presentation and reader copy — plus an anchor that resolves against the
 * blocks the reader was served. C01 shipped once without the bundles and the
 * cards did nothing. These are the assertions that make that impossible twice.
 */

const ROOT = join(__dirname, "..", "..", "..", "..", "..", "..");
const BLOCKS = (
  JSON.parse(
    readFileSync(
      join(ROOT, "artifacts/eec/C02/v1.0/feelverse/unit-payload.json"),
      "utf8",
    ),
  ) as { blocks: { kind: string; content: string }[] }
).blocks.map((b, i) => ({
  id: `blk-${i}`,
  kind: b.kind,
  content: b.content,
  blockKey: `key-${i}`,
  blockVersionId: `ver-${i}`,
}));

const PINS = EEC_C02_MICROGUIDES.map((m) => ({
  guideKey: `eec-c2-${m.slug}`,
  guideVersion: 1,
}));
const PILOT = { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 };
const PAREJAS = { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 };

/**
 * The three conditions `LectorShell.canRunPin` requires, checked here against
 * the chapter production actually serves. It is not the component's code, but
 * it is the component's contract — and it is the half that was missing.
 */
function canRunPin(pin: { guideKey: string; guideVersion: number }): boolean {
  if (!resolveGuideWebBundle(pin)) return false;
  const locator = guideAnchorRegistry.getExact(pin);
  if (!locator) return false;
  return resolveGuideAnchor(BLOCKS, locator).status === "RESOLVED";
}

describe("EEC-C02 · the five web bundles", () => {
  it("there are five, one per microguide, in route order", () => {
    expect(PINS.map((p) => p.guideKey)).toEqual([
      "eec-c2-universal-no-significa-uniforme",
      "eec-c2-cultura-gramatica-no-destino",
      "eec-c2-gesto-necesita-contexto",
      "eec-c2-palabras-dan-contorno",
      "eec-c2-rituales-dan-marco-no-guion",
    ]);
  });

  it("every one resolves a presentation, a reader copy and a bundle", () => {
    for (const pin of PINS) {
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
    for (const pin of PINS) {
      expect(canRunPin(pin), pin.guideKey).toBe(true);
    }
  });

  it("a pin this chapter never approved resolves nothing", () => {
    const unknown = { guideKey: "eec-c2-sentimos-con-acento", guideVersion: 1 };
    expect(resolveGuideWebBundle(unknown)).toBeNull();
    expect(canRunPin(unknown)).toBe(false);
    // …and neither does a version that was never published.
    expect(resolveGuideWebBundle({ ...PINS[0], guideVersion: 2 })).toBeNull();
  });

  it("C01's five, the pilot and Parejas still resolve", () => {
    for (const m of EEC_C01_MICROGUIDES) {
      const pin = { guideKey: `eec-c1-${m.slug}`, guideVersion: 1 };
      expect(resolveGuideWebBundle(pin), pin.guideKey).not.toBeNull();
    }
    expect(resolveGuideWebBundle(PILOT)).not.toBeNull();
    expect(resolveGuideWebBundle(PAREJAS)).not.toBeNull();
  });
});

describe("EEC-C02 · what each bundle offers", () => {
  it("declares the three obligatory steps, in the order the guide runs them", () => {
    for (const [i, pin] of PINS.entries()) {
      const m = EEC_C02_MICROGUIDES[i];
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

  it("the practice step names the target the server materialised", () => {
    // The player reaches the practice through this key; a typo here is a step
    // that renders a button and loads nothing.
    expect(
      PINS.map((p) => resolveGuideWebBundle(p)!.presentation.steps[1].stepKey),
    ).toEqual([
      "practicar-seis-cajones",
      "practicar-de-etiqueta-a-contexto",
      "practicar-del-gesto-a-la-pregunta",
      "practicar-la-palabra-no-basta",
      "practicar-acompanar-sin-imponer",
    ]);
  });

  it("the recall carries its question and three options, never an answer", () => {
    for (const pin of PINS) {
      const recall = resolveGuideWebBundle(pin)!.presentation.steps.find(
        (s) => s.surface === "recall",
      );
      expect(recall).toBeDefined();
      if (recall?.surface !== "recall") throw new Error("no recall step");
      expect(recall.question.length).toBeGreaterThan(20);
      expect(recall.options).toHaveLength(3);
      for (const option of recall.options) {
        expect(Object.keys(option).sort()).toEqual(["label", "optionKey"]);
      }
      expect(JSON.stringify(resolveGuideWebBundle(pin))).not.toContain(
        "correctOptionKey",
      );
    }
  });

  it("MG02's reflection is not a fourth step", () => {
    // It is an optional scene of the Experience, drawn from the stored
    // definition. Promoting it to a guide step would make an invitation a
    // requirement for finishing the reading.
    const mg02 = resolveGuideWebBundle(PINS[1])!;
    expect(mg02.presentation.steps).toHaveLength(3);
    expect(JSON.stringify(mg02.presentation.steps)).not.toContain("reflexion");
  });

  it("the reader panel says which chapter it is asking about", () => {
    // The recall step's body is chapter-scoped copy; C01's said «capítulo 1»
    // and a copied factory would have said it here too.
    const step = resolveGuideWebBundle(PINS[0])!.presentation.steps[2];
    expect(step.body.join(" ")).toContain("capítulo 2");
  });
});
