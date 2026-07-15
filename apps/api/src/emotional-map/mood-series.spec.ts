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

describe("buildMoodSeries — momento eligibility (PR-2B)", () => {
  it("B: a legacy/ineligible DiaryEntry 'ok' (most recent) is excluded; the eligible MoodLog 'good' (older) becomes momento", () => {
    const diaryRows = [
      // Most recent, but ineligible (e.g. an ambiguous default) → NOT vouched.
      {
        mood: "ok",
        moodNormalized: "ok",
        moodEligibleForDynamics: false,
        createdAt: recent,
      },
    ];
    const moodLogRows = [
      // Older, but an explicit eligible check-in → the only real observation.
      {
        mood: "good",
        moodNormalized: "good",
        moodEligibleForDynamics: true,
        createdAt: older,
      },
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
      [
        {
          mood: "great",
          moodNormalized: "great",
          moodEligibleForDynamics: true,
          createdAt: recent,
        },
      ],
      [],
    );
    expect(series).toEqual([{ mood: "great", createdAt: recent }]);
  });

  it("temporal fallback: a historical MoodLog with no normalization columns but a canonical raw is included", () => {
    const series = buildMoodSeries(
      [],
      [
        {
          mood: "low",
          moodNormalized: null, // pre-PR-2A row — never normalized
          moodEligibleForDynamics: false,
          createdAt: older,
        },
      ],
    );
    expect(series).toEqual([{ mood: "low", createdAt: older }]);
  });

  it("excludes a null-mood DiaryEntry and a non-canonical ineligible MoodLog", () => {
    const series = buildMoodSeries(
      [
        {
          mood: null,
          moodNormalized: null,
          moodEligibleForDynamics: false,
          createdAt: recent,
        },
      ],
      [
        {
          mood: "garbage",
          moodNormalized: null,
          moodEligibleForDynamics: false,
          createdAt: older,
        },
      ],
    );
    expect(series).toEqual([]);
  });
});
