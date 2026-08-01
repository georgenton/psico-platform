import { describe, expect, it } from "vitest";
import { guidePinKey, isGuidePinShape, samePin } from "./guide-pin";
import {
  GuidePresentationRegistry,
  guidePresentationRegistry,
  isGuideOptionKey,
  isGuideStepKey,
  stepPresentationFor,
  type GuidePresentation,
} from "./guide-presentation";
import {
  GuideReaderCopyRegistry,
  guideReaderCopyRegistry,
} from "./guide-reader-copy";
import { resolveGuideWebBundle } from "./guide-web-bundle";
import {
  EEC_PIN,
  EEC_PRESENTATION,
  PQP_PIN,
  PQP_PRESENTATION,
} from "./guide-test-fixtures";

/**
 * GR-4 — the web knows more than one guide, and knows them EXACTLY.
 *
 * The property these tests defend is narrow and load-bearing: a pin resolves
 * to its own guide or to nothing. Never to a nearby version, never to the
 * first registered entry, and never to Emociones because it happens to be the
 * one that existed first.
 */

describe("guidePinKey", () => {
  it("builds the canonical key for a well-formed pin", () => {
    expect(guidePinKey(EEC_PIN)).toBe("eec-c1-cuerpo-antes-que-mente@1");
    expect(guidePinKey(PQP_PIN)).toBe("pqp-c1-contacto-sostenido@1");
  });

  it.each([
    ["a missing key", { guideVersion: 1 }],
    ["an empty key", { guideKey: "", guideVersion: 1 }],
    ["an uppercase key", { guideKey: "EEC-C1", guideVersion: 1 }],
    ["a key with spaces", { guideKey: "con espacios", guideVersion: 1 }],
    ["version zero", { guideKey: "una-guia", guideVersion: 0 }],
    ["a negative version", { guideKey: "una-guia", guideVersion: -1 }],
    ["a fractional version", { guideKey: "una-guia", guideVersion: 1.5 }],
    ["a string version", { guideKey: "una-guia", guideVersion: "1" }],
    ["null", null],
  ])("returns null for %s", (_why, value) => {
    expect(guidePinKey(value)).toBeNull();
    expect(isGuidePinShape(value)).toBe(false);
  });

  it("compares pins by both halves", () => {
    expect(samePin(EEC_PIN, { ...EEC_PIN })).toBe(true);
    expect(samePin(EEC_PIN, { ...EEC_PIN, guideVersion: 2 })).toBe(false);
    expect(samePin(EEC_PIN, PQP_PIN)).toBe(false);
  });
});

describe("GuidePresentationRegistry", () => {
  it("resolves the Emociones pin exactly", () => {
    const p = guidePresentationRegistry.getExact(EEC_PIN);
    expect(p?.guideKey).toBe("eec-c1-cuerpo-antes-que-mente");
    expect(p?.guideVersion).toBe(1);
    expect(p?.steps.map((s) => s.stepKey)).toEqual([
      "explorar-cuerpo-antes-que-mente",
      "practicar-escucharte-por-dentro",
      "recordar-cuerpo-antes-que-mente",
    ]);
  });

  it("resolves the Parejas pin exactly", () => {
    const p = guidePresentationRegistry.getExact(PQP_PIN);
    expect(p?.guideKey).toBe("pqp-c1-contacto-sostenido");
    expect(p?.guideVersion).toBe(1);
    expect(p?.steps.map((s) => s.stepKey)).toEqual([
      "explorar-contacto-sostenido",
      "practicar-diez-minutos-de-contacto",
      "recordar-contacto-sostenido",
    ]);
  });

  it("returns null for a pin it does not know", () => {
    expect(
      guidePresentationRegistry.getExact({
        guideKey: "guia-inexistente",
        guideVersion: 1,
      }),
    ).toBeNull();
  });

  it("returns null for a version it does not know — never the nearest one", () => {
    expect(
      guidePresentationRegistry.getExact({ ...EEC_PIN, guideVersion: 2 }),
    ).toBeNull();
    expect(
      guidePresentationRegistry.getExact({ ...PQP_PIN, guideVersion: 99 }),
    ).toBeNull();
  });

  it("declares an initial reader scene per step, coherent with its surface", () => {
    for (const p of [EEC_PRESENTATION, PQP_PRESENTATION]) {
      for (const step of p.steps) {
        if (step.surface === "recall") {
          expect(step.initialReaderScene, step.stepKey).toBe("recall");
        } else {
          expect(["cover", "practice"], step.stepKey).toContain(
            step.initialReaderScene,
          );
        }
      }
    }
  });

  // ── Construction-time validation ──────────────────────────────────────────
  const base: GuidePresentation = {
    guideKey: "una-guia",
    guideVersion: 1,
    title: "T",
    tag: "G",
    summary: "S",
    steps: [
      {
        surface: "confirm",
        stepKey: "paso-1",
        initialReaderScene: "cover",
        shortLabel: "1",
        title: "T1",
        body: [],
        actionLabel: "OK",
      },
    ],
    labels: {
      start: "",
      resume: "",
      restart: "",
      finish: "",
      exit: "",
      back: "",
      retry: "",
    },
  };

  it("refuses a duplicate pin", () => {
    expect(() => new GuidePresentationRegistry([base, { ...base }])).toThrow(
      /GUIDE_PRESENTATION_DUPLICATE_PIN/,
    );
  });

  it("refuses a duplicate step key inside one pin", () => {
    expect(
      () =>
        new GuidePresentationRegistry([
          { ...base, steps: [base.steps[0]!, base.steps[0]!] },
        ]),
    ).toThrow(/GUIDE_PRESENTATION_DUPLICATE_STEP/);
  });

  it("refuses a duplicate option key inside one pin", () => {
    const option = { optionKey: "opcion-a", label: "A" };
    expect(
      () =>
        new GuidePresentationRegistry([
          {
            ...base,
            steps: [
              {
                surface: "recall",
                stepKey: "paso-1",
                initialReaderScene: "recall",
                shortLabel: "1",
                title: "T",
                body: [],
                actionLabel: "OK",
                question: "Q",
                options: [option, option],
              },
            ],
          },
        ]),
    ).toThrow(/GUIDE_PRESENTATION_DUPLICATE_OPTION/);
  });

  it("refuses a scene that does not fit the step's surface", () => {
    expect(
      () =>
        new GuidePresentationRegistry([
          {
            ...base,
            steps: [{ ...base.steps[0]!, initialReaderScene: "recall" }],
          },
        ]),
    ).toThrow(/GUIDE_PRESENTATION_SCENE_MISMATCH/);
  });

  it("refuses an empty guide and an invalid pin", () => {
    expect(() => new GuidePresentationRegistry([{ ...base, steps: [] }])).toThrow(
      /GUIDE_PRESENTATION_NO_STEPS/,
    );
    expect(
      () => new GuidePresentationRegistry([{ ...base, guideVersion: 0 }]),
    ).toThrow(/GUIDE_PRESENTATION_INVALID_PIN/);
  });
});

describe("cross-pin lookups", () => {
  it("an Emociones step does not resolve under Parejas", () => {
    expect(
      stepPresentationFor(
        "explorar-cuerpo-antes-que-mente",
        PQP_PRESENTATION,
      ),
    ).toBeNull();
    expect(
      isGuideStepKey("explorar-cuerpo-antes-que-mente", PQP_PRESENTATION),
    ).toBe(false);
  });

  it("a Parejas step does not resolve under Emociones", () => {
    expect(
      stepPresentationFor("practicar-diez-minutos-de-contacto", EEC_PRESENTATION),
    ).toBeNull();
    expect(
      isGuideStepKey("practicar-diez-minutos-de-contacto", EEC_PRESENTATION),
    ).toBe(false);
  });

  it("rejects an option key borrowed from the other guide", () => {
    // Each option belongs to ONE recall step of ONE pin. Accepting the other
    // guide's key would let a stored command replay someone's answer into a
    // question they were never asked.
    expect(isGuideOptionKey("opcion-cuerpo-primero", EEC_PRESENTATION)).toBe(
      true,
    );
    expect(isGuideOptionKey("opcion-cuerpo-primero", PQP_PRESENTATION)).toBe(
      false,
    );
    expect(isGuideOptionKey("pqp-opcion-manos-y-mirada", PQP_PRESENTATION)).toBe(
      true,
    );
    expect(isGuideOptionKey("pqp-opcion-manos-y-mirada", EEC_PRESENTATION)).toBe(
      false,
    );
  });
});

describe("GuideReaderCopyRegistry", () => {
  it("resolves each pin to its own words", () => {
    expect(guideReaderCopyRegistry.getExact(EEC_PIN)?.cover.title).toBe(
      "El cuerpo sabe antes que la mente",
    );
    expect(guideReaderCopyRegistry.getExact(PQP_PIN)?.cover.title).toBe(
      "El contacto sostenido en silencio",
    );
  });

  it("returns null for an unknown pin or version", () => {
    expect(
      guideReaderCopyRegistry.getExact({ guideKey: "otra", guideVersion: 1 }),
    ).toBeNull();
    expect(
      guideReaderCopyRegistry.getExact({ ...PQP_PIN, guideVersion: 2 }),
    ).toBeNull();
  });

  it("carries a per-guide practice timer", () => {
    expect(guideReaderCopyRegistry.getExact(EEC_PIN)?.practice.timerSeconds).toBe(
      45,
    );
    expect(guideReaderCopyRegistry.getExact(PQP_PIN)?.practice.timerSeconds).toBe(
      600,
    );
  });

  it("refuses a duplicate pin at construction", () => {
    const copy = guideReaderCopyRegistry.getExact(EEC_PIN)!;
    expect(() => new GuideReaderCopyRegistry([copy, copy])).toThrow(
      /GUIDE_READER_COPY_DUPLICATE_PIN/,
    );
  });
});

describe("resolveGuideWebBundle", () => {
  it("resolves both published pins", () => {
    expect(resolveGuideWebBundle(EEC_PIN)?.pin).toEqual(EEC_PIN);
    expect(resolveGuideWebBundle(PQP_PIN)?.pin).toEqual(PQP_PIN);
  });

  it("returns null for an unknown pin — never the other guide", () => {
    expect(
      resolveGuideWebBundle({ guideKey: "no-existe", guideVersion: 1 }),
    ).toBeNull();
    expect(resolveGuideWebBundle({ ...EEC_PIN, guideVersion: 7 })).toBeNull();
  });

  it("returns null when only HALF the pin is registered", () => {
    // Presentation without copy would narrate the wrong chapter; copy without
    // presentation would render buttons that send no command.
    const onlyPresentation = {
      presentations: guidePresentationRegistry,
      copy: new GuideReaderCopyRegistry([]),
    };
    expect(resolveGuideWebBundle(EEC_PIN, onlyPresentation)).toBeNull();

    const onlyCopy = {
      presentations: new GuidePresentationRegistry([]),
      copy: guideReaderCopyRegistry,
    };
    expect(resolveGuideWebBundle(EEC_PIN, onlyCopy)).toBeNull();
  });

  it("pairs each bundle's halves under the SAME pin", () => {
    for (const pin of [EEC_PIN, PQP_PIN]) {
      const b = resolveGuideWebBundle(pin)!;
      expect(guidePinKey(b.presentation)).toBe(guidePinKey(pin));
      expect(guidePinKey(b.copy)).toBe(guidePinKey(pin));
    }
  });

  it("carries no correct answer anywhere in either bundle", () => {
    // `feedback.correct` is deliberately NOT forbidden: it is the copy shown
    // for the verdict the SERVER already returned. Re-showing a verdict is not
    // deciding one. What must be absent is anything that would let the browser
    // decide it — the catalog's answer, or a flag marking an option as right.
    for (const pin of [EEC_PIN, PQP_PIN]) {
      const bundle = resolveGuideWebBundle(pin)!;
      const serialized = JSON.stringify(bundle);
      for (const forbidden of [
        "correctOptionKey",
        "answerIndex",
        "evaluationSource",
        "isCorrect",
        "score",
      ]) {
        expect(
          serialized.includes(forbidden),
          `${pin.guideKey} → ${forbidden}`,
        ).toBe(false);
      }

      // …and no option carries anything beyond the key we send back and the
      // label we render, so none of them can be the marked one.
      for (const step of bundle.presentation.steps) {
        if (step.surface !== "recall") continue;
        for (const option of step.options) {
          expect(Object.keys(option).sort()).toEqual(["label", "optionKey"]);
        }
      }
    }
  });
});
