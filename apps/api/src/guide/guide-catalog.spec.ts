import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GuideCatalogError,
  GuideCatalogRegistry,
  isValidGuideCatalogKey,
  PRODUCTION_GUIDE_DEFINITIONS,
  productionGuideRegistry,
  validateGuideDefinition,
} from "./guide-catalog";

/**
 * CC-7.4B — validator + registry unit suite AND the permanent catalog
 * contract ratchet (instruction §10): 4 V1 variants, SERVER_ACTION absent,
 * required always true, exact kind/policy, closed targets, exact version
 * lookup, no latest-fallback for sessions, no duplicate definitions, and an
 * EMPTY production registry (no approved content exists — none is invented).
 *
 * TEST-ONLY definitions live here, outside productive runtime.
 */

const conceptStep = (order: number, stepKey = `step-${order}`) => ({
  stepKey,
  order,
  required: true,
  kind: "CONCEPT_EXPLORATION",
  completionPolicy: "explicit_confirmation",
  conceptKey: "familia-ensamblada",
});

const validDefinition = () => ({
  guideKey: "guia-prueba",
  guideVersion: 1,
  steps: [
    conceptStep(1, "explora"),
    {
      stepKey: "recall",
      order: 2,
      required: true,
      kind: "ACTIVE_RECALL",
      completionPolicy: "objective_recall",
      itemKey: "quiz-1",
    },
    {
      stepKey: "practica",
      order: 3,
      required: true,
      kind: "CATALOG_PRACTICE",
      completionPolicy: "catalog_practice_confirmation",
      exerciseKey: "respiracion-1",
    },
    {
      stepKey: "confirma",
      order: 4,
      required: true,
      kind: "EXPLICIT_CONFIRMATION",
      completionPolicy: "explicit_confirmation",
      confirmationKey: "pausa-hecha",
    },
  ],
});

describe("guide catalog · key grammar", () => {
  it("accepts closed ASCII catalog keys", () => {
    for (const key of [
      "a",
      "guia-1",
      "cap.1:intro_x",
      "0abc",
      "a".repeat(200),
    ]) {
      expect(isValidGuideCatalogKey(key), key).toBe(true);
    }
  });

  it("rejects whitespace, controls, uppercase, empties and oversize — no silent casing change", () => {
    for (const key of [
      "",
      " ",
      "a b",
      "a\tb",
      "a\nb",
      "A-upper",
      "guiaÑ",
      "-starts-bad",
      ".starts-bad",
      "a".repeat(201),
      42,
      null,
      undefined,
    ]) {
      expect(isValidGuideCatalogKey(key), String(key)).toBe(false);
    }
    // Uppercase is REJECTED by the validator, never lowered:
    expect(() =>
      validateGuideDefinition({ ...validDefinition(), guideKey: "GUIA" }),
    ).toThrow(GuideCatalogError);
  });
});

describe("guide catalog · validator", () => {
  it("accepts a valid definition with the four V1 variants and freezes it", () => {
    const input = validDefinition();
    const def = validateGuideDefinition(input);
    expect(def.steps).toHaveLength(4);
    expect(def.steps.map((s) => s.kind)).toEqual([
      "CONCEPT_EXPLORATION",
      "ACTIVE_RECALL",
      "CATALOG_PRACTICE",
      "EXPLICIT_CONFIRMATION",
    ]);
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.steps)).toBe(true);
    expect(Object.isFrozen(def.steps[0])).toBe(true);
    // The INPUT was not mutated and is not aliased:
    expect(Object.isFrozen(input)).toBe(false);
    expect(def.steps[0]).not.toBe(input.steps[0]);
  });

  it("rejects SERVER_ACTION (deferred out of V1) and any unknown kind", () => {
    for (const kind of ["SERVER_ACTION", "MYSTERY", 42, null]) {
      const bad = validDefinition();
      (bad.steps[0] as Record<string, unknown>).kind = kind;
      expect(() => validateGuideDefinition(bad), String(kind)).toThrow(
        GuideCatalogError,
      );
    }
  });

  it("rejects required !== literal true (optional steps do not exist in V1)", () => {
    for (const required of [false, undefined, 1, "true"]) {
      const bad = validDefinition();
      (bad.steps[1] as Record<string, unknown>).required = required;
      expect(() => validateGuideDefinition(bad), String(required)).toThrow(
        GuideCatalogError,
      );
    }
  });

  it("rejects a kind coupled to the WRONG policy (the exact matrix)", () => {
    const wrongPolicies: Array<[number, string]> = [
      [0, "objective_recall"],
      [1, "explicit_confirmation"],
      [2, "explicit_confirmation"],
      [3, "catalog_practice_confirmation"],
    ];
    for (const [index, policy] of wrongPolicies) {
      const bad = validDefinition();
      (bad.steps[index] as Record<string, unknown>).completionPolicy = policy;
      expect(() => validateGuideDefinition(bad), `${index}:${policy}`).toThrow(
        GuideCatalogError,
      );
    }
  });

  it("rejects a wrong, missing or ADDITIONAL target per variant", () => {
    // Wrong target field for the variant:
    const wrongTarget = validDefinition();
    delete (wrongTarget.steps[0] as Record<string, unknown>).conceptKey;
    (wrongTarget.steps[0] as Record<string, unknown>).itemKey = "quiz-1";
    expect(() => validateGuideDefinition(wrongTarget)).toThrow(
      GuideCatalogError,
    );
    // Missing target:
    const missing = validDefinition();
    delete (missing.steps[1] as Record<string, unknown>).itemKey;
    expect(() => validateGuideDefinition(missing)).toThrow(GuideCatalogError);
    // ADDITIONAL target on top of the correct one (extra key):
    const extra = validDefinition();
    (extra.steps[2] as Record<string, unknown>).conceptKey = "extra";
    expect(() => validateGuideDefinition(extra)).toThrow(GuideCatalogError);
    // Arbitrary extra keys (metadata/payload smuggling):
    const smuggled = validDefinition();
    (smuggled.steps[3] as Record<string, unknown>).metadata = { x: 1 };
    expect(() => validateGuideDefinition(smuggled)).toThrow(GuideCatalogError);
  });

  it("rejects empty steps, duplicate stepKey, duplicate/non-contiguous/unordered order", () => {
    expect(() =>
      validateGuideDefinition({ guideKey: "g", guideVersion: 1, steps: [] }),
    ).toThrow(GuideCatalogError);

    const dupKey = validDefinition();
    (dupKey.steps[1] as Record<string, unknown>).stepKey = "explora";
    expect(() => validateGuideDefinition(dupKey)).toThrow(GuideCatalogError);

    const dupOrder = validDefinition();
    (dupOrder.steps[1] as Record<string, unknown>).order = 1;
    expect(() => validateGuideDefinition(dupOrder)).toThrow(GuideCatalogError);

    const gap = validDefinition();
    (gap.steps[3] as Record<string, unknown>).order = 9;
    expect(() => validateGuideDefinition(gap)).toThrow(GuideCatalogError);

    // Stored out of order (order values fine but array shuffled):
    const shuffled = validDefinition();
    shuffled.steps.reverse();
    expect(() => validateGuideDefinition(shuffled)).toThrow(GuideCatalogError);
  });

  it("rejects non-positive versions, non-plain objects and exotic prototypes", () => {
    for (const guideVersion of [0, -1, 1.5, "1", null]) {
      expect(() =>
        validateGuideDefinition({ ...validDefinition(), guideVersion }),
      ).toThrow(GuideCatalogError);
    }
    expect(() => validateGuideDefinition([])).toThrow(GuideCatalogError);
    expect(() => validateGuideDefinition("guia")).toThrow(GuideCatalogError);
    class Weird {}
    const weird = Object.assign(new Weird(), validDefinition());
    expect(() => validateGuideDefinition(weird)).toThrow(GuideCatalogError);
  });
});

describe("guide catalog · registry", () => {
  it("exact lookup by guideKey@guideVersion — no first-match, no fallback", () => {
    const v1 = validDefinition();
    const v2 = { ...validDefinition(), guideVersion: 2 };
    const registry = new GuideCatalogRegistry([v1, v2]);
    expect(registry.getExact("guia-prueba", 1).guideVersion).toBe(1);
    expect(registry.getExact("guia-prueba", 2).guideVersion).toBe(2);
    // A pinned session resolving a version that does not exist FAILS —
    // never "latest", never nearest:
    expect(() => registry.getExact("guia-prueba", 3)).toThrow(
      GuideCatalogError,
    );
    expect(() => registry.getExact("otra-guia", 1)).toThrow(GuideCatalogError);
  });

  it("latestStartableVersion is a START-only discovery helper, separate from getExact", () => {
    const registry = new GuideCatalogRegistry([
      validDefinition(),
      { ...validDefinition(), guideVersion: 2 },
    ]);
    expect(registry.latestStartableVersion("guia-prueba")).toBe(2);
    expect(registry.latestStartableVersion("no-existe")).toBeNull();
  });

  it("rejects duplicate guideKey@guideVersion definitions", () => {
    expect(
      () => new GuideCatalogRegistry([validDefinition(), validDefinition()]),
    ).toThrow(GuideCatalogError);
  });
});

describe("ratchet · guide catalog contract", () => {
  it("GUIDE_PRODUCTION_REGISTRY_ENTRIES=1 — exactly the approved definition", () => {
    expect(PRODUCTION_GUIDE_DEFINITIONS).toHaveLength(1);
    expect(productionGuideRegistry.size).toBe(1);
    // The EXACT approved content (CC-7.4B.3) — any drift is a new version.
    expect(PRODUCTION_GUIDE_DEFINITIONS[0]).toEqual({
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
      steps: [
        {
          stepKey: "explorar-cuerpo-antes-que-mente",
          order: 1,
          required: true,
          kind: "CONCEPT_EXPLORATION",
          completionPolicy: "explicit_confirmation",
          conceptKey: "eec-cuerpo-antes-que-mente",
        },
        {
          stepKey: "practicar-escucharte-por-dentro",
          order: 2,
          required: true,
          kind: "CATALOG_PRACTICE",
          completionPolicy: "catalog_practice_confirmation",
          exerciseKey: "eec-c1-practice-escucharte-por-dentro",
        },
        {
          stepKey: "recordar-cuerpo-antes-que-mente",
          order: 3,
          required: true,
          kind: "ACTIVE_RECALL",
          completionPolicy: "objective_recall",
          itemKey: "eec-c1-recall-cuerpo-antes-que-mente",
        },
      ],
    });
    // Exact lookup only — no fallback for a version that was never published.
    expect(
      productionGuideRegistry.latestStartableVersion(
        "eec-c1-cuerpo-antes-que-mente",
      ),
    ).toBe(1);
    expect(() =>
      productionGuideRegistry.getExact("eec-c1-cuerpo-antes-que-mente", 2),
    ).toThrow(GuideCatalogError);
    // Deeply frozen — the published definition cannot be mutated at runtime.
    expect(Object.isFrozen(PRODUCTION_GUIDE_DEFINITIONS[0])).toBe(true);
    expect(Object.isFrozen(PRODUCTION_GUIDE_DEFINITIONS[0].steps)).toBe(true);
    expect(Object.isFrozen(PRODUCTION_GUIDE_DEFINITIONS[0].steps[0])).toBe(
      true,
    );
  });

  it("the shared type surface has exactly 4 variants and no SERVER_ACTION / optional steps", () => {
    const source = readFileSync(
      join(__dirname, "../../../../packages/types/src/guide.ts"),
      "utf8",
    );
    for (const kind of [
      '"CONCEPT_EXPLORATION"',
      '"ACTIVE_RECALL"',
      '"CATALOG_PRACTICE"',
      '"EXPLICIT_CONFIRMATION"',
    ]) {
      expect(source).toContain(`kind: ${kind}`);
    }
    // Deliberately absent — adding either is a change to ADR 0019, not here:
    expect(source).not.toContain('"SERVER_ACTION"');
    expect(source).toContain("required: true;");
    expect(source).not.toContain("required: boolean");
    expect(source).not.toContain("required?:");
    expect(source).not.toContain("Record<string, unknown>");
  });
});
