import { describe, expect, it } from "vitest";
import { validateGuideDefinition } from "./guide-catalog";
import {
  canAcceptStep,
  canCompleteSession,
  deriveGuideProjection,
  GuideStateError,
  nextExpectedStepKey,
} from "./guide-state-machine";

/**
 * CC-7.4B — pure state machine (instruction §12 "Máquina"): projection from
 * an EMPTY ledger, sequential advance, out-of-order rejection, the four
 * variants, completed/cancelled projections, definition/version mismatch,
 * ledger rows outside the definition — and the structural proof that NO
 * LearningEvent is read to derive counters (the input type cannot carry one).
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

const row = (stepKey: string, order: number) => ({ stepKey, order });

describe("guide state machine · projection", () => {
  it("empty ledger → 0/4, cursor on the first step", () => {
    expect(deriveGuideProjection(definition, [], "ACTIVE")).toEqual({
      stepsCompleted: 0,
      totalSteps: 4,
      currentStepKey: "explora",
    });
  });

  it("sequential advance moves the cursor across the four variants", () => {
    const ledger = [row("explora", 1)];
    expect(deriveGuideProjection(definition, ledger, "ACTIVE")).toEqual({
      stepsCompleted: 1,
      totalSteps: 4,
      currentStepKey: "recall",
    });
    ledger.push(row("recall", 2), row("practica", 3));
    expect(deriveGuideProjection(definition, ledger, "ACTIVE")).toEqual({
      stepsCompleted: 3,
      totalSteps: 4,
      currentStepKey: "confirma",
    });
    // All accepted, still ACTIVE: cursor null, WAITING for the explicit
    // session-complete command (never auto-completes).
    ledger.push(row("confirma", 4));
    expect(deriveGuideProjection(definition, ledger, "ACTIVE")).toEqual({
      stepsCompleted: 4,
      totalSteps: 4,
      currentStepKey: null,
    });
  });

  it("canAcceptStep only accepts the CURRENT expected step of an ACTIVE session", () => {
    const ledger = [row("explora", 1)];
    expect(canAcceptStep(definition, ledger, "recall", "ACTIVE")).toBe(true);
    // A future step, an already-accepted step, and a closed session all say no:
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
    const partial = [row("explora", 1), row("recall", 2)];
    expect(canCompleteSession(definition, partial, "ACTIVE")).toBe(false);
    const full = [
      row("explora", 1),
      row("recall", 2),
      row("practica", 3),
      row("confirma", 4),
    ];
    expect(canCompleteSession(definition, full, "ACTIVE")).toBe(true);
    expect(canCompleteSession(definition, full, "COMPLETED")).toBe(false);
  });

  it("COMPLETED projection: full ledger, cursor null; incomplete ledger is an invariant violation", () => {
    const full = [
      row("explora", 1),
      row("recall", 2),
      row("practica", 3),
      row("confirma", 4),
    ];
    expect(deriveGuideProjection(definition, full, "COMPLETED")).toEqual({
      stepsCompleted: 4,
      totalSteps: 4,
      currentStepKey: null,
    });
    expect(() =>
      deriveGuideProjection(definition, [row("explora", 1)], "COMPLETED"),
    ).toThrow(GuideStateError);
  });

  it("CANCELLED projection keeps accepted steps but has no cursor", () => {
    expect(
      deriveGuideProjection(definition, [row("explora", 1)], "CANCELLED"),
    ).toEqual({ stepsCompleted: 1, totalSteps: 4, currentStepKey: null });
  });
});

describe("guide state machine · invariants", () => {
  it("rejects an out-of-order ledger (gap in the sequential prefix)", () => {
    expect(() => nextExpectedStepKey(definition, [row("recall", 2)])).toThrow(
      GuideStateError,
    );
  });

  it("rejects a ledger row whose step does not exist in the pinned version", () => {
    expect(() =>
      deriveGuideProjection(definition, [row("fantasma", 1)], "ACTIVE"),
    ).toThrow(GuideStateError);
  });

  it("rejects duplicates and order mismatches against the catalog", () => {
    expect(() =>
      deriveGuideProjection(
        definition,
        [row("explora", 1), row("explora", 1)],
        "ACTIVE",
      ),
    ).toThrow(GuideStateError);
    // Stored order drifts from the catalog's order for that step:
    expect(() =>
      deriveGuideProjection(definition, [row("explora", 2)], "ACTIVE"),
    ).toThrow(GuideStateError);
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
    // A ledger accepted under v1 does not project under v2 — sessions pin
    // their exact version for exactly this reason:
    expect(() =>
      deriveGuideProjection(v2, [row("explora", 1)], "ACTIVE"),
    ).toThrow(GuideStateError);
  });

  it("counters derive ONLY from ledger rows — the input type carries no LearningEvent", () => {
    // Structural proof: an AcceptedStepRow is {stepKey, order} and nothing
    // else; extra fields (e.g. a smuggled event) are not read.
    const ledger = [
      { stepKey: "explora", order: 1, kind: "unused", payload: { x: 1 } },
    ] as unknown as Array<{ stepKey: string; order: number }>;
    expect(deriveGuideProjection(definition, ledger, "ACTIVE")).toEqual({
      stepsCompleted: 1,
      totalSteps: 4,
      currentStepKey: "recall",
    });
  });
});
