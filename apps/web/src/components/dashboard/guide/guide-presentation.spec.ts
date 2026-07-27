import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GUIDE_KEY,
  GUIDE_PRESENTATION,
  GUIDE_VERSION,
  isGuideOptionKey,
  isGuideStepKey,
  stepPresentationFor,
} from "./guide-presentation";

/**
 * CC-7.5 — the presentation catalog is COPY, and these tests pin that it
 * never became domain. What the server owns (kind, policy, target keys,
 * editorial context, the correct option) must be absent, not merely unused:
 * a field that exists is a field someone will read.
 */

const SOURCE = readFileSync(join(__dirname, "guide-presentation.ts"), "utf8");

/** Drop comments so prose explaining an absence never trips a check. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("guide presentation", () => {
  it("publishes exactly one guide, pinned to an exact version", () => {
    // GUIDE_WEB_PRESENTATION_COUNT=1
    expect(GUIDE_KEY).toBe("eec-c1-cuerpo-antes-que-mente");
    expect(GUIDE_VERSION).toBe(1);
    expect(GUIDE_PRESENTATION.guideKey).toBe(GUIDE_KEY);
    expect(GUIDE_PRESENTATION.guideVersion).toBe(1);
    expect(GUIDE_PRESENTATION.href).toBe(
      "/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente",
    );
  });

  it("declares the three steps, in order, with the exact keys", () => {
    // GUIDE_WEB_STEP_COUNT=3 · GUIDE_WEB_STEP_KEYS_EXACT=true
    expect(GUIDE_PRESENTATION.steps).toHaveLength(3);
    expect(GUIDE_PRESENTATION.steps.map((s) => s.stepKey)).toEqual([
      "explorar-cuerpo-antes-que-mente",
      "practicar-escucharte-por-dentro",
      "recordar-cuerpo-antes-que-mente",
    ]);
  });

  it("carries the approved recall question and its three options", () => {
    const recall = GUIDE_PRESENTATION.steps.find((s) => s.surface === "recall");
    expect(recall).toBeDefined();
    if (!recall || recall.surface !== "recall") throw new Error("no recall");

    expect(recall.question).toBe(
      "Según el capítulo 1, ¿cómo describe el libro la relación temporal " +
        "entre la reacción del cuerpo y la comprensión consciente de una " +
        "emoción?",
    );
    expect(recall.options.map((o) => o.optionKey)).toEqual([
      "opcion-cuerpo-primero",
      "opcion-mente-primero",
      "opcion-simultanea",
    ]);
    // Every option carries real copy — no placeholder ever ships.
    for (const option of recall.options) {
      expect(option.label.length).toBeGreaterThan(40);
    }
  });

  it("never names the correct option, a target key or editorial context", () => {
    // GUIDE_WEB_CORRECT_OPTION_PRESENT=false
    // GUIDE_WEB_TARGET_KEYS_PRESENT=false
    // GUIDE_WEB_CONTEXT_FIELDS_PRESENT=false
    const source = stripComments(SOURCE);
    for (const forbidden of [
      "correctOptionKey",
      "conceptKey",
      "exerciseKey",
      "itemKey",
      "confirmationKey",
      "completionPolicy",
      "editionId",
      "unitId",
      "bookId",
      "revisionId",
      "editionKey",
      "unitKey",
      "userId",
      "result",
      "score",
      "metadata",
      "payload",
    ]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
    // The serialized catalog is equally clean — nothing hides in a value.
    const serialized = JSON.stringify(GUIDE_PRESENTATION);
    expect(serialized).not.toContain("correcta");
    expect(serialized).not.toContain("correctOption");
  });

  it("recognises only its own step and option keys", () => {
    expect(isGuideStepKey("explorar-cuerpo-antes-que-mente")).toBe(true);
    expect(isGuideStepKey("un-paso-inventado")).toBe(false);
    expect(isGuideStepKey(42)).toBe(false);
    expect(isGuideOptionKey("opcion-simultanea")).toBe(true);
    expect(isGuideOptionKey("opcion-inventada")).toBe(false);
  });

  it("returns null for a step this build does not know", () => {
    expect(stepPresentationFor(null)).toBeNull();
    expect(stepPresentationFor("paso-del-futuro")).toBeNull();
    expect(
      stepPresentationFor("practicar-escucharte-por-dentro")?.surface,
    ).toBe("confirm");
  });
});
