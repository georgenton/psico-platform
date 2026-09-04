import { describe, expect, it } from "vitest";
import { guideAnchorRegistry } from "@psico/types";
import { resolveGuideWebBundle } from "./guide-web-bundle";
import {
  belongsInLegacyExperienceList,
  guideDiscoverySurface,
} from "./guide-discovery-surface";
import { EEC_C01_MICROGUIDES } from "./eec-c01-microguides";

/**
 * The five guided readings, as the BROWSER can use them.
 *
 * Publishing them made the server serve five cards whose buttons opened
 * nothing: the web decides whether it can run a pin with
 * `resolveGuideWebBundle`, and that registry held only the pilot and Parejas.
 * These are the assertions that would have caught it.
 */

const PINS = EEC_C01_MICROGUIDES.map((m) => ({
  guideKey: `eec-c1-${m.slug}`,
  guideVersion: 1,
}));
const PILOT = { guideKey: "eec-c1-cuerpo-antes-que-mente", guideVersion: 1 };
const PAREJAS = { guideKey: "pqp-c1-contacto-sostenido", guideVersion: 1 };

describe("the five web bundles", () => {
  it("there are five, one per microguide", () => {
    expect(PINS.map((p) => p.guideKey)).toEqual([
      "eec-c1-teorias-como-lentes",
      "eec-c1-rostro-como-pista",
      "eec-c1-alarma-antes-del-relato",
      "eec-c1-emocion-informa-no-manda",
      "eec-c1-construida-no-significa-falsa",
    ]);
  });

  it("every one resolves a bundle — presentation and reader copy", () => {
    for (const pin of PINS) {
      const bundle = resolveGuideWebBundle(pin);
      expect(bundle, pin.guideKey).not.toBeNull();
      expect(bundle?.presentation.guideKey).toBe(pin.guideKey);
      expect(bundle?.copy.guideKey).toBe(pin.guideKey);
    }
  });

  it("every one also has its anchor, which is what makes it runnable here", () => {
    // `canRunPin` is the bundle AND the anchor; a bundle alone would still
    // leave the card unopenable, which is the failure this closes.
    for (const pin of PINS) {
      expect(guideAnchorRegistry.getExact(pin), pin.guideKey).toBeTruthy();
    }
  });

  it("each declares its three steps, in the order the guide runs them", () => {
    for (const [i, pin] of PINS.entries()) {
      const steps = resolveGuideWebBundle(pin)!.presentation.steps;
      const m = EEC_C01_MICROGUIDES[i];
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

  it("the recall carries the question and three options, never an answer", () => {
    for (const pin of PINS) {
      const recall = resolveGuideWebBundle(pin)!.presentation.steps.find(
        (s) => s.surface === "recall",
      );
      expect(recall).toBeDefined();
      if (recall?.surface !== "recall") throw new Error("no recall step");
      expect(recall.question.length).toBeGreaterThan(20);
      expect(recall.options).toHaveLength(3);
      const serialized = JSON.stringify(resolveGuideWebBundle(pin));
      expect(serialized).not.toContain("correctOptionKey");
    }
  });

  it("the pilot still resolves — an open session must still run", () => {
    const bundle = resolveGuideWebBundle(PILOT);
    expect(bundle).not.toBeNull();
    expect(bundle?.presentation.guideKey).toBe(PILOT.guideKey);
  });

  it("Parejas still resolves, unchanged", () => {
    expect(resolveGuideWebBundle(PAREJAS)).not.toBeNull();
  });
});

describe("one surface per reading", () => {
  it("the five belong to the route, not to the legacy list", () => {
    for (const pin of PINS) {
      expect(guideDiscoverySurface(pin), pin.guideKey).toBe("route");
      expect(belongsInLegacyExperienceList(pin), pin.guideKey).toBe(false);
    }
  });

  it("the pilot is runnable but never offered as a card", () => {
    expect(guideDiscoverySurface(PILOT)).toBe("hidden");
    expect(belongsInLegacyExperienceList(PILOT)).toBe(false);
    // Hidden is about the OFFER, not about the run.
    expect(resolveGuideWebBundle(PILOT)).not.toBeNull();
  });

  it("Parejas keeps the legacy list, exactly as today", () => {
    expect(guideDiscoverySurface(PAREJAS)).toBe("legacy");
    expect(belongsInLegacyExperienceList(PAREJAS)).toBe(true);
  });

  it("a pin nobody classified keeps today's behaviour", () => {
    const unknown = { guideKey: "some-future-guide", guideVersion: 1 };
    expect(guideDiscoverySurface(unknown)).toBe("legacy");
    expect(belongsInLegacyExperienceList(unknown)).toBe(true);
  });
});
