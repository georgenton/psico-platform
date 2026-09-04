import { describe, expect, it } from "vitest";
import {
  recallFeedbackMessage,
  recallItemKeysWithFeedback,
} from "./recall-feedback";
import {
  EXERCISE_INGESTION_CATALOG,
  type UnitExerciseDefinitions,
} from "./exercise-ingestion-catalog";
import {
  assertBookExerciseCatalogValid,
  recallContentFor,
} from "./exercise-ingestion";

/**
 * The recall's public sentence.
 *
 * Two properties carry the whole design: the copy is APPROVED (it comes from
 * the catalog, never composed), and only the branch that happened crosses the
 * wire. A client holding both messages holds the answer.
 */

const ALL: UnitExerciseDefinitions[] = Object.values(
  EXERCISE_INGESTION_CATALOG,
).flat();

const MG03 = "eec-c1-recall-alarma-antes-del-relato";

describe("the approved copy", () => {
  it("every recall the build ships has both branches", () => {
    expect(recallItemKeysWithFeedback()).toHaveLength(ALL.length);
    for (const pair of ALL) {
      expect(
        recallFeedbackMessage(pair.recall.exerciseKey, "CORRECT"),
      ).toBeTruthy();
      expect(
        recallFeedbackMessage(pair.recall.exerciseKey, "REVIEW"),
      ).toBeTruthy();
    }
  });

  it("MG03 says exactly what the approved design says", () => {
    expect(recallFeedbackMessage(MG03, "CORRECT")).toBe(
      "Exacto. Una defensa puede comenzar antes de comprender lo ocurrido, pero el sentimiento consciente integra más información que esa primera respuesta.",
    );
    expect(recallFeedbackMessage(MG03, "REVIEW")).toBe(
      "Revisa la diferencia central: reaccionar ante una señal no demuestra todavía qué emoción consciente existe ni que haya un peligro real.",
    );
  });

  it("the two branches are different words, per recall", () => {
    for (const pair of ALL) {
      const key = pair.recall.exerciseKey;
      expect(recallFeedbackMessage(key, "CORRECT")).not.toBe(
        recallFeedbackMessage(key, "REVIEW"),
      );
    }
  });

  it("no message contains the correct option's key", () => {
    for (const pair of ALL) {
      const correctKey = pair.recall.content.correctOptionKey;
      for (const outcome of ["CORRECT", "REVIEW"] as const) {
        expect(
          recallFeedbackMessage(pair.recall.exerciseKey, outcome),
        ).not.toContain(correctKey);
      }
    }
  });

  it("an item this build does not know gets no invented sentence", () => {
    // null, not a generic reassurance. The caller fails closed on it.
    expect(recallFeedbackMessage("not-a-real-item", "CORRECT")).toBeNull();
    expect(recallFeedbackMessage("not-a-real-item", "REVIEW")).toBeNull();
  });

  it("resolving is a lookup, so the same item always returns the same words", () => {
    const a = recallFeedbackMessage(MG03, "CORRECT");
    const b = recallFeedbackMessage(MG03, "CORRECT");
    expect(a).toBe(b);
  });
});

describe("what the copy must not disturb", () => {
  it("the stored recall content is byte-identical to before", () => {
    // The ingestion compares stored bytes and THROWS on any difference. If
    // `feedback` ever reaches this shape, the next apply-targets refuses every
    // recall already in production.
    for (const pair of ALL) {
      const stored = recallContentFor(pair.recall);
      expect(Object.keys(stored).sort()).toEqual([
        "conceptKey",
        "correctOptionKey",
        "options",
        "recallMode",
      ]);
      expect(JSON.stringify(stored)).not.toContain("feedback");
    }
  });

  it("catalog validation refuses a recall with no words to say", () => {
    for (const slug of Object.keys(EXERCISE_INGESTION_CATALOG)) {
      expect(() => assertBookExerciseCatalogValid(slug)).not.toThrow();
    }
  });
});
