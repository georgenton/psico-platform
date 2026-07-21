import { describe, expect, it } from "vitest";
import { validateGuideDefinition } from "./guide-catalog";
import {
  canAcceptStep,
  canCompleteSession,
  deriveGuideProjection,
  GuideStateError,
  nextExpectedStepKey,
  parseAcceptedGuideStepRow,
  type AcceptedGuideStep,
  type StoredGuideStepRow,
} from "./guide-state-machine";

/**
 * CC-7.4B — pure state machine over FULL ledger semantics (PR #590 closure
 * §4): a row only counts toward `stepsCompleted` after stepKey, order, kind,
 * completionPolicy and the EXACT target matched the pinned definition.
 * Recall's option/result are accepted evidence whose SHAPE the parser
 * validates. No LearningEvent can enter — the input type cannot carry one.
 */

const definition = validateGuideDefinition({
  guideKey: "guia-prueba",
  guideVersion: 1,
  steps: [
    {
      stepKey: "explora",
      order: 1,
      required: true,
      kind: "CONCEPT_EXPLORATION",
      completionPolicy: "explicit_confirmation",
      conceptKey: "familia-ensamblada",
    },
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

// Exact catalog-matched rows, one per variant:
const conceptRow = (): AcceptedGuideStep => ({
  stepKey: "explora",
  order: 1,
  kind: "CONCEPT_EXPLORATION",
  completionPolicy: "EXPLICIT_CONFIRMATION",
  conceptKey: "familia-ensamblada",
});
const recallRow = (): AcceptedGuideStep => ({
  stepKey: "recall",
  order: 2,
  kind: "ACTIVE_RECALL",
  completionPolicy: "OBJECTIVE_RECALL",
  itemKey: "quiz-1",
  selectedOptionKey: "opt-b",
  recallResult: "CORRECT",
});
const practiceRow = (): AcceptedGuideStep => ({
  stepKey: "practica",
  order: 3,
  kind: "CATALOG_PRACTICE",
  completionPolicy: "CATALOG_PRACTICE_CONFIRMATION",
  exerciseKey: "respiracion-1",
});
const confirmationRow = (): AcceptedGuideStep => ({
  stepKey: "confirma",
  order: 4,
  kind: "EXPLICIT_CONFIRMATION",
  completionPolicy: "EXPLICIT_CONFIRMATION",
  confirmationKey: "pausa-hecha",
});
const fullLedger = () => [
  conceptRow(),
  recallRow(),
  practiceRow(),
  confirmationRow(),
];

describe("guide state machine · projection", () => {
  it("empty ledger → 0/4, cursor on the first step", () => {
    expect(deriveGuideProjection(definition, [], "ACTIVE")).toEqual({
      stepsCompleted: 0,
      totalSteps: 4,
      currentStepKey: "explora",
    });
  });

  it("sequential advance across the four FULLY-MATCHED variants moves the cursor", () => {
    expect(deriveGuideProjection(definition, [conceptRow()], "ACTIVE")).toEqual(
      { stepsCompleted: 1, totalSteps: 4, currentStepKey: "recall" },
    );
    expect(
      deriveGuideProjection(
        definition,
        [conceptRow(), recallRow(), practiceRow()],
        "ACTIVE",
      ),
    ).toEqual({ stepsCompleted: 3, totalSteps: 4, currentStepKey: "confirma" });
    // All accepted, still ACTIVE: cursor null, WAITING for the explicit
    // session-complete command (never auto-completes).
    expect(deriveGuideProjection(definition, fullLedger(), "ACTIVE")).toEqual({
      stepsCompleted: 4,
      totalSteps: 4,
      currentStepKey: null,
    });
  });

  it("canAcceptStep only accepts the CURRENT expected step of an ACTIVE session", () => {
    const ledger = [conceptRow()];
    expect(canAcceptStep(definition, ledger, "recall", "ACTIVE")).toBe(true);
    expect(canAcceptStep(definition, ledger, "practica", "ACTIVE")).toBe(false);
    expect(canAcceptStep(definition, ledger, "explora", "ACTIVE")).toBe(false);
    expect(canAcceptStep(definition, ledger, "recall", "COMPLETED")).toBe(
      false,
    );
    expect(canAcceptStep(definition, ledger, "recall", "CANCELLED")).toBe(
      false,
    );
  });

  it("canCompleteSession requires ALL steps accepted and an ACTIVE session", () => {
    expect(
      canCompleteSession(definition, [conceptRow(), recallRow()], "ACTIVE"),
    ).toBe(false);
    expect(canCompleteSession(definition, fullLedger(), "ACTIVE")).toBe(true);
    expect(canCompleteSession(definition, fullLedger(), "COMPLETED")).toBe(
      false,
    );
  });

  it("COMPLETED requires a full ledger; CANCELLED retains the accepted count with no cursor", () => {
    expect(
      deriveGuideProjection(definition, fullLedger(), "COMPLETED"),
    ).toEqual({ stepsCompleted: 4, totalSteps: 4, currentStepKey: null });
    expect(() =>
      deriveGuideProjection(definition, [conceptRow()], "COMPLETED"),
    ).toThrow(GuideStateError);
    expect(
      deriveGuideProjection(definition, [conceptRow()], "CANCELLED"),
    ).toEqual({ stepsCompleted: 1, totalSteps: 4, currentStepKey: null });
  });
});

describe("guide state machine · FULL semantic validation against the pinned definition", () => {
  it("same stepKey/order but the WRONG kind is rejected", () => {
    // A structurally-valid union member claiming step "recall" with a
    // concept variant — kind drifts from the catalog:
    const wrongKind: AcceptedGuideStep = {
      stepKey: "recall",
      order: 2,
      kind: "CONCEPT_EXPLORATION",
      completionPolicy: "EXPLICIT_CONFIRMATION",
      conceptKey: "familia-ensamblada",
    };
    expect(() =>
      deriveGuideProjection(definition, [conceptRow(), wrongKind], "ACTIVE"),
    ).toThrow(/GUIDE_STATE_KIND_MISMATCH/);
  });

  it("same stepKey/order + kind but the WRONG policy (malicious cast) is rejected", () => {
    const wrongPolicy = {
      ...conceptRow(),
      completionPolicy: "OBJECTIVE_RECALL",
    } as unknown as AcceptedGuideStep;
    expect(() =>
      deriveGuideProjection(definition, [wrongPolicy], "ACTIVE"),
    ).toThrow(/GUIDE_STATE_POLICY_MISMATCH/);
  });

  it("a DIFFERENT target than the definition's is rejected, per variant", () => {
    const cases: Array<[string, AcceptedGuideStep[]]> = [
      ["concept: otro conceptKey", [{ ...conceptRow(), conceptKey: "otro" }]],
      [
        "recall: otro itemKey",
        [conceptRow(), { ...recallRow(), itemKey: "quiz-99" }],
      ],
      [
        "practice: otro exerciseKey",
        [
          conceptRow(),
          recallRow(),
          { ...practiceRow(), exerciseKey: "otra-practica" },
        ],
      ],
      [
        "confirmation: otro confirmationKey",
        [
          conceptRow(),
          recallRow(),
          practiceRow(),
          { ...confirmationRow(), confirmationKey: "otra-pausa" },
        ],
      ],
    ];
    for (const [label, ledger] of cases) {
      expect(
        () => deriveGuideProjection(definition, ledger, "ACTIVE"),
        label,
      ).toThrow(/GUIDE_STATE_TARGET_MISMATCH/);
    }
  });

  it("a full EXACT row is counted; recall's option/result are evidence, not targets", () => {
    // Two recall rows differing only in evidence both match the catalog —
    // evidence shape is validated, its VALUE is the accepted attempt:
    const incorrectAttempt: AcceptedGuideStep = {
      ...recallRow(),
      selectedOptionKey: "opt-a",
      recallResult: "INCORRECT",
    };
    expect(
      deriveGuideProjection(
        definition,
        [conceptRow(), incorrectAttempt],
        "ACTIVE",
      ),
    ).toEqual({ stepsCompleted: 2, totalSteps: 4, currentStepKey: "practica" });
  });
});

describe("guide state machine · structural invariants", () => {
  it("rejects out-of-order, unknown steps, duplicates and order drift", () => {
    expect(() => nextExpectedStepKey(definition, [recallRow()])).toThrow(
      /GUIDE_STATE_OUT_OF_ORDER/,
    );
    expect(() =>
      deriveGuideProjection(
        definition,
        [{ ...conceptRow(), stepKey: "fantasma" }],
        "ACTIVE",
      ),
    ).toThrow(/GUIDE_STATE_STEP_NOT_IN_DEFINITION/);
    expect(() =>
      deriveGuideProjection(definition, [conceptRow(), conceptRow()], "ACTIVE"),
    ).toThrow(/GUIDE_STATE_DUPLICATE_STEP/);
    expect(() =>
      deriveGuideProjection(
        definition,
        [{ ...conceptRow(), order: 2 }],
        "ACTIVE",
      ),
    ).toThrow(/GUIDE_STATE_ORDER_MISMATCH/);
  });

  it("definition/version mismatch: the SAME ledger is invalid under another version's catalog", () => {
    const v2 = validateGuideDefinition({
      guideKey: "guia-prueba",
      guideVersion: 2,
      steps: [
        {
          stepKey: "otro-paso",
          order: 1,
          required: true,
          kind: "EXPLICIT_CONFIRMATION",
          completionPolicy: "explicit_confirmation",
          confirmationKey: "pausa-hecha",
        },
      ],
    });
    expect(() => deriveGuideProjection(v2, [conceptRow()], "ACTIVE")).toThrow(
      GuideStateError,
    );
  });

  it("counters derive ONLY from ledger rows — the input type carries no LearningEvent", () => {
    // Structural proof: extra fields (e.g. a smuggled event) are not read.
    const ledger = [
      { ...conceptRow(), payload: { smuggled: true }, eventKind: "unused" },
    ] as unknown as AcceptedGuideStep[];
    expect(deriveGuideProjection(definition, ledger, "ACTIVE")).toEqual({
      stepsCompleted: 1,
      totalSteps: 4,
      currentStepKey: "recall",
    });
  });
});

describe("guide state machine · stored-row parser", () => {
  const storedBase: StoredGuideStepRow = {
    stepKey: "explora",
    order: 1,
    kind: "CONCEPT_EXPLORATION",
    completionPolicy: "EXPLICIT_CONFIRMATION",
    conceptKey: "familia-ensamblada",
    itemKey: null,
    exerciseKey: null,
    confirmationKey: null,
    selectedOptionKey: null,
    recallResult: null,
  };

  it("parses one valid stored row per variant into the closed union", () => {
    expect(parseAcceptedGuideStepRow(storedBase).kind).toBe(
      "CONCEPT_EXPLORATION",
    );
    expect(
      parseAcceptedGuideStepRow({
        ...storedBase,
        stepKey: "recall",
        order: 2,
        kind: "ACTIVE_RECALL",
        completionPolicy: "OBJECTIVE_RECALL",
        conceptKey: null,
        itemKey: "quiz-1",
        selectedOptionKey: "opt-b",
        recallResult: "CORRECT",
      }).kind,
    ).toBe("ACTIVE_RECALL");
    expect(
      parseAcceptedGuideStepRow({
        ...storedBase,
        stepKey: "practica",
        order: 3,
        kind: "CATALOG_PRACTICE",
        completionPolicy: "CATALOG_PRACTICE_CONFIRMATION",
        conceptKey: null,
        exerciseKey: "respiracion-1",
      }).kind,
    ).toBe("CATALOG_PRACTICE");
    expect(
      parseAcceptedGuideStepRow({
        ...storedBase,
        stepKey: "confirma",
        order: 4,
        kind: "EXPLICIT_CONFIRMATION",
        conceptKey: null,
        confirmationKey: "pausa-hecha",
      }).kind,
    ).toBe("EXPLICIT_CONFIRMATION");
  });

  it("rejects stored rows whose columns drifted from their variant", () => {
    const bad: Array<[string, StoredGuideStepRow]> = [
      ["policy drift", { ...storedBase, completionPolicy: "OBJECTIVE_RECALL" }],
      ["missing target", { ...storedBase, conceptKey: null }],
      ["extra target", { ...storedBase, exerciseKey: "extra" }],
      [
        "recall fields on a non-recall row",
        { ...storedBase, selectedOptionKey: "opt-a" },
      ],
      ["unknown kind", { ...storedBase, kind: "SERVER_ACTION" }],
      [
        "recall with an invalid result",
        {
          ...storedBase,
          kind: "ACTIVE_RECALL",
          completionPolicy: "OBJECTIVE_RECALL",
          conceptKey: null,
          itemKey: "quiz-1",
          selectedOptionKey: "opt-a",
          recallResult: "MAYBE",
        },
      ],
    ];
    for (const [label, row] of bad) {
      expect(() => parseAcceptedGuideStepRow(row), label).toThrow(
        /GUIDE_STATE_INVALID_ROW/,
      );
    }
  });
});
