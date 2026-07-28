import { describe, expect, it } from "vitest";
import {
  computeSemanticFingerprint,
  part,
  type ValidatedGuideCommandSemantics,
  type ValidatedGuideStartSemantics,
  type ValidatedGuideStepCompleteSemantics,
} from "./guide-command-semantics";

/**
 * CC-7.4B — fingerprint + semantics-union unit suite (PR #590 closure):
 * deterministic encoding, unambiguous `part` segments, drift on EVERY
 * semantic component, START structurally WITHOUT a sessionId, and the
 * type-level proof that kind/target mismatches are inexpressible.
 */

const KEY = "cccccccc-cccc-4ccc-8ccc-000000000101";

const start = (
  over: Partial<Omit<ValidatedGuideStartSemantics, "commandType">> = {},
): ValidatedGuideStartSemantics => ({
  commandType: "START",
  userId: "u-fp",
  idempotencyKey: KEY,
  guideKey: over.guideKey ?? "guia-prueba",
  guideVersion: over.guideVersion ?? 1,
  editionId: over.editionId !== undefined ? over.editionId : "ed-1",
  unitId: over.unitId !== undefined ? over.unitId : "cu-1",
});

describe("guide command semantics · part()", () => {
  it("distinguishes null, empty string, and delimiter-bearing values", () => {
    expect(part("x", null)).toBe("x;n");
    expect(part("x", "")).toBe("x;s0;");
    expect(part("x", "a|b")).toBe("x;s3;a|b");
    expect(part("x", "a;n")).toBe("x;s3;a;n");
    // The length prefix makes collisions impossible: a value that LOOKS like
    // a null marker still encodes differently from an actual null.
    expect(part("x", "n")).toBe("x;s1;n");
    expect(part("x", "n")).not.toBe(part("x", null));
  });
});

describe("guide command semantics · type-level contracts", () => {
  it("START cannot carry a sessionId; kind/target mismatches are inexpressible", () => {
    // @ts-expect-error START semantics has NO sessionId — result linkage is server-owned
    const startWithSession: ValidatedGuideStartSemantics = {
      commandType: "START",
      userId: "u",
      idempotencyKey: KEY,
      guideKey: "g",
      guideVersion: 1,
      editionId: null,
      unitId: null,
      sessionId: "s",
    };
    // @ts-expect-error concept cannot carry exerciseKey
    const conceptWithExercise: ValidatedGuideStepCompleteSemantics = {
      commandType: "STEP_COMPLETE",
      userId: "u",
      idempotencyKey: KEY,
      sessionId: "s",
      stepKey: "k",
      kind: "CONCEPT_EXPLORATION",
      exerciseKey: "e",
    };
    // @ts-expect-error practice cannot carry confirmationKey
    const practiceWithConfirmation: ValidatedGuideStepCompleteSemantics = {
      commandType: "STEP_COMPLETE",
      userId: "u",
      idempotencyKey: KEY,
      sessionId: "s",
      stepKey: "k",
      kind: "CATALOG_PRACTICE",
      confirmationKey: "c",
    };
    // @ts-expect-error confirmation cannot carry conceptKey
    const confirmationWithConcept: ValidatedGuideStepCompleteSemantics = {
      commandType: "STEP_COMPLETE",
      userId: "u",
      idempotencyKey: KEY,
      sessionId: "s",
      stepKey: "k",
      kind: "EXPLICIT_CONFIRMATION",
      conceptKey: "c",
    };
    // The variables exist only to host the @ts-expect-error assertions:
    expect([
      startWithSession,
      conceptWithExercise,
      practiceWithConfirmation,
      confirmationWithConcept,
    ]).toHaveLength(4);
  });
});

describe("guide command semantics · fingerprint", () => {
  it("is deterministic: same semantics, same fingerprint, always", () => {
    const a = computeSemanticFingerprint(start());
    const b = computeSemanticFingerprint(start());
    expect(a).toBe(b);
    expect(a.startsWith("v1|")).toBe(true);
  });

  it("START drifts on every SEMANTIC component (guideKey, version, edition, unit, null↔value)", () => {
    const base = computeSemanticFingerprint(start());
    expect(computeSemanticFingerprint(start({ guideKey: "otra" }))).not.toBe(
      base,
    );
    expect(computeSemanticFingerprint(start({ guideVersion: 2 }))).not.toBe(
      base,
    );
    expect(computeSemanticFingerprint(start({ editionId: "ed-2" }))).not.toBe(
      base,
    );
    expect(computeSemanticFingerprint(start({ unitId: "cu-2" }))).not.toBe(
      base,
    );
    expect(
      computeSemanticFingerprint(start({ editionId: null, unitId: null })),
    ).not.toBe(base);
  });

  it("STEP_COMPLETE drifts on sessionId, stepKey, kind and the exact target key", () => {
    const cmd = (
      over: Partial<{
        sessionId: string;
        stepKey: string;
        conceptKey: string;
      }> = {},
    ): ValidatedGuideCommandSemantics => ({
      commandType: "STEP_COMPLETE",
      userId: "u-fp",
      idempotencyKey: KEY,
      sessionId: over.sessionId ?? "sess-1",
      stepKey: over.stepKey ?? "explora",
      kind: "CONCEPT_EXPLORATION",
      conceptKey: over.conceptKey ?? "familia-ensamblada",
    });
    const base = computeSemanticFingerprint(cmd());
    expect(computeSemanticFingerprint(cmd({ sessionId: "s2" }))).not.toBe(base);
    expect(computeSemanticFingerprint(cmd({ stepKey: "otro" }))).not.toBe(base);
    expect(computeSemanticFingerprint(cmd({ conceptKey: "otro" }))).not.toBe(
      base,
    );
    // Same target VALUE under a different kind still drifts (kind is a
    // component):
    const practice: ValidatedGuideCommandSemantics = {
      commandType: "STEP_COMPLETE",
      userId: "u-fp",
      idempotencyKey: KEY,
      sessionId: "sess-1",
      stepKey: "explora",
      kind: "CATALOG_PRACTICE",
      exerciseKey: "familia-ensamblada",
    };
    expect(computeSemanticFingerprint(practice)).not.toBe(base);
  });

  it("STEP_RECALL includes the selected option — same item, different option, different fingerprint", () => {
    const recall = (option: string): ValidatedGuideCommandSemantics => ({
      commandType: "STEP_RECALL",
      userId: "u-fp",
      idempotencyKey: KEY,
      sessionId: "sess-1",
      stepKey: "recall",
      itemKey: "quiz-1",
      selectedOptionKey: option,
    });
    expect(computeSemanticFingerprint(recall("opt-a"))).not.toBe(
      computeSemanticFingerprint(recall("opt-b")),
    );
  });

  it("CANCEL and SESSION_COMPLETE differ from each other and across sessions", () => {
    const make = (
      commandType: "CANCEL" | "SESSION_COMPLETE",
      sessionId: string,
    ): ValidatedGuideCommandSemantics => ({
      commandType,
      userId: "u-fp",
      idempotencyKey: KEY,
      sessionId,
    });
    expect(computeSemanticFingerprint(make("CANCEL", "s1"))).not.toBe(
      computeSemanticFingerprint(make("SESSION_COMPLETE", "s1")),
    );
    expect(computeSemanticFingerprint(make("CANCEL", "s1"))).not.toBe(
      computeSemanticFingerprint(make("CANCEL", "s2")),
    );
  });
});
