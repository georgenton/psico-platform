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
  it("MOOD_LOG canonical + mood-log-v1 → eligible, reason null (an eligible shape)", () => {
    const n = deriveMoodNormalization({
      raw: "good",
      source: "MOOD_LOG",
      selectionVersion: "mood-log-v1",
    });
    expect(n).toMatchObject({
      moodNormalized: "good",
      moodProvenance: "MOOD_LOG",
      moodExplicitlySelected: true,
      moodSelectionVersion: "mood-log-v1",
      moodEligibleForDynamics: true,
      moodExclusionReason: null,
      moodVocabularyVersion: "diary-v1",
      moodNormalizerVersion: "norm-1",
    });
  });

  it("SEED canonical + seed-v1 → eligible, seed-v1 attestation", () => {
    const n = deriveMoodNormalization({
      raw: "great",
      source: "SEED",
      selectionVersion: "seed-v1",
    });
    expect(n.moodEligibleForDynamics).toBe(true);
    expect(n.moodExplicitlySelected).toBe(true);
    expect(n.moodSelectionVersion).toBe("seed-v1");
    expect(n.moodExclusionReason).toBeNull();
  });

  it("DIARY canonical + explicit-v1 → eligible (the client-attested shape)", () => {
    const n = deriveMoodNormalization({
      raw: "low",
      source: "DIARY",
      selectionVersion: "explicit-v1",
    });
    expect(n.moodNormalized).toBe("low");
    expect(n.moodEligibleForDynamics).toBe(true);
    expect(n.moodSelectionVersion).toBe("explicit-v1");
    expect(n.moodExclusionReason).toBeNull();
  });

  it("DIARY canonical 'ok' without an attestation → ambiguous_default, not eligible", () => {
    const n = deriveMoodNormalization({
      raw: "ok",
      source: "DIARY",
      selectionVersion: null,
    });
    expect(n.moodNormalized).toBe("ok");
    expect(n.moodSelectionVersion).toBeNull();
    expect(n.moodEligibleForDynamics).toBe(false);
    expect(n.moodExclusionReason).toBe("ambiguous_default");
  });

  it("DIARY canonical non-'ok' without an attestation → pre_normalizer_review, not eligible", () => {
    const n = deriveMoodNormalization({
      raw: "good",
      source: "DIARY",
    });
    expect(n.moodEligibleForDynamics).toBe(false);
    expect(n.moodExclusionReason).toBe("pre_normalizer_review");
  });

  it("absent mood → not_selected, normalized null, not eligible", () => {
    const n = deriveMoodNormalization({
      raw: null,
      source: "DIARY",
    });
    expect(n).toMatchObject({
      moodNormalized: null,
      moodSelectionVersion: null,
      moodEligibleForDynamics: false,
      moodExclusionReason: "not_selected",
    });
  });

  it("legacy token → legacy_vocabulary, normalized null, NEVER 0", () => {
    const n = deriveMoodNormalization({
      raw: "calma",
      source: "DIARY",
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
    });
    expect(n.moodNormalized).toBeNull();
    expect(n.moodExclusionReason).toBe("unknown_token");
    expect(n.moodEligibleForDynamics).toBe(false);
  });

  it("throws on an UNKNOWN selection attestation (fail-loud, never silently degrade)", () => {
    expect(() =>
      deriveMoodNormalization({
        raw: "good",
        source: "DIARY",
        selectionVersion: "forged-v9",
      }),
    ).toThrow(/MOOD_SELECTION_VERSION_UNKNOWN/);
  });

  it("throws when a KNOWN attestation carries no canonical mood (version without mood)", () => {
    expect(() =>
      deriveMoodNormalization({
        raw: null,
        source: "DIARY",
        selectionVersion: "explicit-v1",
      }),
    ).toThrow(/MOOD_SELECTION_WITHOUT_MOOD/);
    // A legacy raw is non-canonical → same guard fires.
    expect(() =>
      deriveMoodNormalization({
        raw: "calma",
        source: "DIARY",
        selectionVersion: "explicit-v1",
      }),
    ).toThrow(/MOOD_SELECTION_WITHOUT_MOOD/);
  });

  it("INV-1: eligible ⇒ normalized != null ∧ explicit = true ∧ reason = null; never a numeric normalized", () => {
    const cases = [
      { raw: "great", source: "MOOD_LOG", selectionVersion: "mood-log-v1" },
      { raw: "ok", source: "DIARY", selectionVersion: null },
      { raw: "calma", source: "DIARY", selectionVersion: null },
      { raw: null, source: "MOOD_LOG", selectionVersion: null },
      { raw: "good", source: "MOOD_LOG", selectionVersion: null },
      { raw: "low", source: "DIARY", selectionVersion: "explicit-v1" },
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
