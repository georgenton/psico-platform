import { describe, expect, it } from "vitest";
import { MOOD_CANONICAL_IDS } from "@psico/types";

import {
  deriveMoodNormalization,
  parseCanonicalMood,
} from "./mood-normalization";

describe("parseCanonicalMood", () => {
  it("maps each canonical token to itself", () => {
    for (const m of MOOD_CANONICAL_IDS) expect(parseCanonicalMood(m)).toBe(m);
  });

  it("returns null for legacy / unknown / empty / null — and NEVER a number", () => {
    for (const t of [
      "calma",
      "foco",
      "energia",
      "xxx",
      "",
      "   ",
      null,
      undefined,
    ]) {
      const r = parseCanonicalMood(t);
      expect(r).toBeNull();
      // The landmine PR-2 removes: unknown must never coerce to a neutral 0.
      expect(typeof r).not.toBe("number");
    }
  });

  it("trims surrounding whitespace before matching", () => {
    expect(parseCanonicalMood("  good  ")).toBe("good");
  });
});

describe("deriveMoodNormalization", () => {
  it("MOOD_LOG canonical + explicit → eligible, reason null (the only eligible shape)", () => {
    const n = deriveMoodNormalization({
      raw: "good",
      source: "MOOD_LOG",
      explicitlySelected: true,
    });
    expect(n).toMatchObject({
      moodNormalized: "good",
      moodProvenance: "MOOD_LOG",
      moodExplicitlySelected: true,
      moodEligibleForDynamics: true,
      moodExclusionReason: null,
      moodVocabularyVersion: "diary-v1",
      moodNormalizerVersion: "norm-1",
    });
  });

  it("DIARY canonical 'ok' without an explicit signal → ambiguous_default, not eligible", () => {
    const n = deriveMoodNormalization({
      raw: "ok",
      source: "DIARY",
      explicitlySelected: false,
    });
    expect(n.moodNormalized).toBe("ok");
    expect(n.moodEligibleForDynamics).toBe(false);
    expect(n.moodExclusionReason).toBe("ambiguous_default");
  });

  it("DIARY canonical non-'ok' without an explicit signal → pre_normalizer_review, not eligible", () => {
    const n = deriveMoodNormalization({
      raw: "good",
      source: "DIARY",
      explicitlySelected: false,
    });
    expect(n.moodEligibleForDynamics).toBe(false);
    expect(n.moodExclusionReason).toBe("pre_normalizer_review");
  });

  it("absent mood → not_selected, normalized null, not eligible", () => {
    const n = deriveMoodNormalization({
      raw: null,
      source: "DIARY",
      explicitlySelected: false,
    });
    expect(n).toMatchObject({
      moodNormalized: null,
      moodEligibleForDynamics: false,
      moodExclusionReason: "not_selected",
    });
  });

  it("legacy token → legacy_vocabulary, normalized null, NEVER 0", () => {
    const n = deriveMoodNormalization({
      raw: "calma",
      source: "DIARY",
      explicitlySelected: false,
    });
    expect(n.moodNormalized).toBeNull();
    expect(n.moodExclusionReason).toBe("legacy_vocabulary");
    expect(n.moodVocabularyVersion).toBe("onboarding-legacy");
    expect(n.moodEligibleForDynamics).toBe(false);
  });

  it("unknown token → unknown_token, normalized null, NEVER 0", () => {
    const n = deriveMoodNormalization({
      raw: "zzz",
      source: "DIARY",
      explicitlySelected: false,
    });
    expect(n.moodNormalized).toBeNull();
    expect(n.moodExclusionReason).toBe("unknown_token");
    expect(n.moodEligibleForDynamics).toBe(false);
  });

  it("INV-1: eligible ⇒ normalized != null ∧ explicit = true ∧ reason = null; never a numeric normalized", () => {
    const cases = [
      { raw: "great", source: "MOOD_LOG", explicitlySelected: true },
      { raw: "ok", source: "DIARY", explicitlySelected: false },
      { raw: "calma", source: "DIARY", explicitlySelected: false },
      { raw: null, source: "MOOD_LOG", explicitlySelected: true },
      { raw: "good", source: "MOOD_LOG", explicitlySelected: false },
      { raw: "zzz", source: "MOOD_LOG", explicitlySelected: true },
    ] as const;
    for (const c of cases) {
      const n = deriveMoodNormalization(c);
      if (n.moodEligibleForDynamics) {
        expect(n.moodNormalized).not.toBeNull();
        expect(n.moodExplicitlySelected).toBe(true);
        expect(n.moodExclusionReason).toBeNull();
      }
      expect(typeof n.moodNormalized === "number").toBe(false);
    }
  });
});
