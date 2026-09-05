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
 * lookup, no latest-fallback for sessions, no duplicate definitions, and a
 * production registry holding EXACTLY the approved definitions (CC-7.4B.3:
 * one — `eec-c1-cuerpo-antes-que-mente@1`; content is never invented).
 *
 * TEST-ONLY definitions live here, outside productive runtime — the fixtures
 * below (`guia-prueba`, `quiz-1`, `respiracion-1`) never reach the registry.
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
  it("GUIDE_PRODUCTION_REGISTRY_ENTRIES=52 — exactly the approved definitions", () => {
    // 2 → 7 with the EEC-C01 five-microguide route (author decision 2026-09-03),
    // 7 → 12 with the EEC-C02 five (author decision 2026-09-04), and 12 → 52
    // with the forty of EEC-C03 → C10 (`APROBAR ARQUITECTURA C03-C10`, same
    // day). The count is a ratchet on purpose: registering a guide is an
    // editorial act, so growth has to be typed here by whoever approved it.
    // The V1 pilot stays in the registry although discovery retired it: a
    // session pinned to it must keep resolving.
    expect(PRODUCTION_GUIDE_DEFINITIONS).toHaveLength(52);
    expect(productionGuideRegistry.size).toBe(52);
    expect(PRODUCTION_GUIDE_DEFINITIONS.map((d) => d.guideKey)).toEqual([
      "eec-c1-cuerpo-antes-que-mente",
      "eec-c1-teorias-como-lentes",
      "eec-c1-rostro-como-pista",
      "eec-c1-alarma-antes-del-relato",
      "eec-c1-emocion-informa-no-manda",
      "eec-c1-construida-no-significa-falsa",
      "eec-c2-universal-no-significa-uniforme",
      "eec-c2-cultura-gramatica-no-destino",
      "eec-c2-gesto-necesita-contexto",
      "eec-c2-palabras-dan-contorno",
      "eec-c2-rituales-dan-marco-no-guion",
      "eec-c3-predecir-no-es-adivinar",
      "eec-c3-senal-corporal-sin-etiqueta",
      "eec-c3-contexto-para-categorizar",
      "eec-c3-no-hay-boton-de-miedo",
      "eec-c3-modelo-puede-actualizarse",
      "eec-c4-cuerpo-datos-no-veredictos",
      "eec-c4-notar-interpretar-nombrar",
      "eec-c4-cuerpo-y-cerebro-no-hacen-fila",
      "eec-c4-metafora-teoria-evidencia",
      "eec-c4-observar-requiere-eleccion",
      "eec-c5-emocion-no-es-historia",
      "eec-c5-silencio-sin-subtitulos",
      "eec-c5-historia-dominante-no-es-identidad",
      "eec-c5-recordar-reconstruye",
      "eec-c5-reescribir-abre-opciones",
      "eec-c6-sentir-se-aprende-con-otros",
      "eec-c6-regular-juntos-no-es-controlar",
      "eec-c6-ciclo-no-es-culpa-compartida",
      "eec-c6-parecidos-que-no-son-sinonimos",
      "eec-c6-influencia-no-es-destino",
      "eec-c7-suspender-equivalencias",
      "eec-c7-expectativa-cambia-la-lectura",
      "eec-c7-diferencia-no-es-excusa",
      "eec-c7-muchos-repertorios-dentro",
      "eec-c7-preguntar-es-traducir",
      "eec-c8-sentirlo-no-lo-vuelve-verdad",
      "eec-c8-muestra-lo-que-importa-no-que-hacer",
      "eec-c8-pista-evidencia-veredicto",
      "eec-c8-validar-no-es-dar-la-razon",
      "eec-c8-antes-de-actuar-amplia-el-examen",
      "eec-c9-construido-no-significa-elegido",
      "eec-c9-tecnica-util-no-es-universal",
      "eec-c9-define-que-quieres-cambiar",
      "eec-c9-cuatro-puertas",
      "eec-c9-repensar-ocurre-despues",
      "eec-c10-hacer-espacio-no-es-confirmar",
      "eec-c10-no-narrador-de-la-mente-ajena",
      "eec-c10-emocion-si-conducta-con-limites",
      "eec-c10-ayudar-sin-borrar-la-agencia",
      "eec-c10-cambiar-el-escenario",
      "pqp-c1-contacto-sostenido",
    ]);
    // No chapter's guide may target another chapter's teaching rows: a session
    // on C02 completing a C01 step would merge two readings' progress. Checked
    // for all ten chapters, not just the two that first needed it.
    for (let n = 2; n <= 10; n++) {
      const prefix = `eec-c${n}-`;
      for (const d of PRODUCTION_GUIDE_DEFINITIONS.filter((g) =>
        g.guideKey.startsWith(prefix),
      )) {
        const targets = JSON.stringify(d.steps);
        for (let other = 1; other <= 10; other++) {
          if (other === n) continue;
          expect(targets, d.guideKey).not.toContain(`eec-c${other}-`);
        }
        expect(targets, d.guideKey).toContain(`${prefix}practice-`);
        expect(targets, d.guideKey).toContain(`${prefix}recall-`);
      }
    }
    // Every microguide carries the same three obligatory steps, in order.
    for (const d of PRODUCTION_GUIDE_DEFINITIONS) {
      expect(d.guideVersion).toBe(1);
      expect(d.steps.map((s) => s.kind)).toEqual([
        "CONCEPT_EXPLORATION",
        "CATALOG_PRACTICE",
        "ACTIVE_RECALL",
      ]);
      expect(d.steps.map((s) => s.order)).toEqual([1, 2, 3]);
      expect(d.steps.every((s) => s.required)).toBe(true);
    }
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

    // The Parejas definition — chapter 1 of that book (platform chapterOrder
    // 2). Same immutability rule. Looked up by key rather than by index: it
    // sits last, and pinning a position would make every new chapter's five
    // rewrite an assertion about a definition they do not touch.
    expect(
      PRODUCTION_GUIDE_DEFINITIONS.find(
        (d) => d.guideKey === "pqp-c1-contacto-sostenido",
      ),
    ).toEqual({
      guideKey: "pqp-c1-contacto-sostenido",
      guideVersion: 1,
      steps: [
        {
          stepKey: "explorar-contacto-sostenido",
          order: 1,
          required: true,
          kind: "CONCEPT_EXPLORATION",
          completionPolicy: "explicit_confirmation",
          conceptKey: "pqp-c1-contacto-sostenido",
        },
        {
          stepKey: "practicar-diez-minutos-de-contacto",
          order: 2,
          required: true,
          kind: "CATALOG_PRACTICE",
          completionPolicy: "catalog_practice_confirmation",
          exerciseKey: "pqp-c1-practice-diez-minutos-de-contacto",
        },
        {
          stepKey: "recordar-contacto-sostenido",
          order: 3,
          required: true,
          kind: "ACTIVE_RECALL",
          completionPolicy: "objective_recall",
          itemKey: "pqp-c1-recall-contacto-sostenido",
        },
      ],
    });

    // Both pins resolve exactly; an unknown pin fails closed.
    expect(
      productionGuideRegistry.getExact("eec-c1-cuerpo-antes-que-mente", 1)
        .guideKey,
    ).toBe("eec-c1-cuerpo-antes-que-mente");
    expect(
      productionGuideRegistry.getExact("pqp-c1-contacto-sostenido", 1).guideKey,
    ).toBe("pqp-c1-contacto-sostenido");
    expect(() =>
      productionGuideRegistry.getExact("pqp-c1-contacto-sostenido", 2),
    ).toThrow(/GUIDE_CATALOG_UNKNOWN_DEFINITION/);
    expect(() => productionGuideRegistry.getExact("no-existe", 1)).toThrow(
      /GUIDE_CATALOG_UNKNOWN_DEFINITION/,
    );
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
