import { describe, expect, it } from "vitest";
import { buildMoodSeries } from "./emotional-map.service";

/**
 * PR-2B · "Mi momento" + the OU fit read the mood SERIES, which admits only
 * observations the server vouches for. `momento` is the latest observation in
 * the series (`scoreEmotionalMap` reduces by createdAt), so what lands in the
 * series is what can become the momento.
 */

const recent = new Date("2026-07-10T12:00:00.000Z");
const older = new Date("2026-07-01T09:00:00.000Z");

function diaryRow(
  over: Partial<{
    moodNormalized: string | null;
    moodEligibleForDynamics: boolean;
    createdAt: Date;
  }> = {},
) {
  return {
    moodNormalized: null,
    moodEligibleForDynamics: false,
    createdAt: recent,
    ...over,
  };
}

function moodLogRow(
  over: Partial<{
    mood: string | null;
    moodNormalized: string | null;
    moodEligibleForDynamics: boolean;
    moodProvenance: string | null;
    moodExplicitlySelected: boolean | null;
    moodVocabularyVersion: string | null;
    moodNormalizerVersion: string | null;
    moodClientVersion: string | null;
    moodSelectionVersion: string | null;
    moodExclusionReason: string | null;
    createdAt: Date;
  }> = {},
) {
  return {
    mood: null,
    moodNormalized: null,
    moodEligibleForDynamics: false,
    moodProvenance: null,
    moodExplicitlySelected: null,
    moodVocabularyVersion: null,
    moodNormalizerVersion: null,
    moodClientVersion: null,
    moodSelectionVersion: null,
    moodExclusionReason: null,
    createdAt: older,
    ...over,
  };
}

describe("buildMoodSeries — momento eligibility (PR-2B)", () => {
  it("B: a legacy/ineligible DiaryEntry 'ok' (most recent) is excluded; the eligible MoodLog 'good' (older) becomes momento", () => {
    const diaryRows = [
      // Most recent, but ineligible (e.g. an ambiguous default) → NOT vouched.
      diaryRow({
        moodNormalized: "ok",
        moodEligibleForDynamics: false,
        createdAt: recent,
      }),
    ];
    const moodLogRows = [
      // Older, but an explicit eligible check-in → the only real observation.
      moodLogRow({
        mood: "good",
        moodNormalized: "good",
        moodEligibleForDynamics: true,
        moodProvenance: "MOOD_LOG",
        moodExplicitlySelected: true,
        moodNormalizerVersion: "norm-1",
        createdAt: older,
      }),
    ];

    const series = buildMoodSeries(diaryRows, moodLogRows);

    // Only the eligible good observation survives — the recent legacy ok never
    // enters the series (so it can never win the momento).
    expect(series).toEqual([{ mood: "good", createdAt: older }]);

    // Momento = latest of the series. With only `good`, momento is good.
    const momento = series.reduce<{ mood: string; createdAt: Date } | null>(
      (acc, r) => (!acc || r.createdAt > acc.createdAt ? r : acc),
      null,
    );
    expect(momento?.mood).toBe("good");
  });

  it("includes an eligible+normalized DiaryEntry mood via moodNormalized", () => {
    const series = buildMoodSeries(
      [diaryRow({ moodNormalized: "great", moodEligibleForDynamics: true })],
      [],
    );
    expect(series).toEqual([{ mood: "great", createdAt: recent }]);
  });

  it("temporal fallback: a genuinely pre-normalization MoodLog (ALL metadata null) with a canonical raw is INCLUDED", () => {
    const series = buildMoodSeries(
      [],
      [moodLogRow({ mood: "low" })], // every server-owned column null, raw canonical
    );
    expect(series).toEqual([{ mood: "low", createdAt: older }]);
  });

  it("#1: a stale-normalizer MoodLog (normalizerVersion set, normalized null) with raw 'good' is EXCLUDED — never resurrected by the fallback", () => {
    const series = buildMoodSeries(
      [],
      [
        moodLogRow({
          mood: "good",
          moodNormalized: null,
          moodNormalizerVersion: "norm-0", // was processed → NOT pre-normalization
        }),
      ],
    );
    expect(series).toEqual([]);
  });

  it("#1: an explicitly-EXCLUDED MoodLog (reason + provenance set) with raw 'good' is discarded", () => {
    const series = buildMoodSeries(
      [],
      [
        moodLogRow({
          mood: "good",
          moodNormalized: null,
          moodProvenance: "MOOD_LOG",
          moodExplicitlySelected: false,
          moodNormalizerVersion: "norm-1",
          moodExclusionReason: "ambiguous_default",
        }),
      ],
    );
    expect(series).toEqual([]);
  });

  it("excludes a null-mood DiaryEntry and a non-canonical pre-normalization MoodLog", () => {
    const series = buildMoodSeries(
      [diaryRow({ moodNormalized: null, moodEligibleForDynamics: false })],
      [moodLogRow({ mood: "garbage" })], // pre-normalization but raw non-canonical
    );
    expect(series).toEqual([]);
  });

  // #1 · ANY single server-owned column set → the row was touched by the
  // normalizer → the raw fallback is forbidden, even with a canonical raw.
  it.each([
    ["moodProvenance", { moodProvenance: "MOOD_LOG" }],
    ["moodExplicitlySelected", { moodExplicitlySelected: false }],
    ["moodVocabularyVersion", { moodVocabularyVersion: "diary-v1" }],
    ["moodNormalizerVersion", { moodNormalizerVersion: "norm-1" }],
    ["moodClientVersion", { moodClientVersion: "seed" }],
    ["moodSelectionVersion", { moodSelectionVersion: "mood-log-v1" }],
    ["moodExclusionReason", { moodExclusionReason: "ambiguous_default" }],
  ] as const)(
    "#1: a MoodLog with ONLY %s set (raw 'good', normalized null) is EXCLUDED",
    (_label, field) => {
      const series = buildMoodSeries(
        [],
        [moodLogRow({ mood: "good", moodNormalized: null, ...field })],
      );
      expect(series).toEqual([]);
    },
  );
});
