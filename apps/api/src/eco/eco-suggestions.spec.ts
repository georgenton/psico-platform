import { describe, expect, it } from "vitest";

import {
  buildEcoSuggestions,
  type EcoSuggestionSignals,
} from "./eco-suggestions";

const NOW = new Date("2026-07-12T12:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function base(over: Partial<EcoSuggestionSignals> = {}): EcoSuggestionSignals {
  return {
    reading: null,
    latestMood: null,
    lastReflectionAt: null,
    hasEcoHistory: false,
    now: NOW,
    ...over,
  };
}

const reading = (
  over: Partial<NonNullable<EcoSuggestionSignals["reading"]>> = {},
) => ({
  bookSlug: "emociones-en-construccion",
  bookTitle: "Emociones en Construcción",
  chapterOrder: 2,
  chapterTitle: "Cómo aprendiste a sentir",
  progressPct: 40,
  completedAt: null,
  lastActivityAt: daysAgo(0),
  ...over,
});

describe("buildEcoSuggestions", () => {
  it("always returns at least one opener (cold-start fallback)", () => {
    const out = buildEcoSuggestions(base());
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("cold-start");
    expect(out[0].scope).toBeNull();
    expect(out[0].reason).toBe("Un buen momento para empezar");
  });

  it("cold-start copy adapts to whether the user has chatted before", () => {
    const returning = buildEcoSuggestions(base({ hasEcoHistory: true }));
    expect(returning[0].reason).toBe("Retomemos la conversación");
  });

  it("continue-chapter fires for an in-progress reading session, with scope", () => {
    const out = buildEcoSuggestions(base({ reading: reading() }));
    const s = out.find((x) => x.id === "continue-chapter")!;
    expect(s).toBeDefined();
    expect(s.scope).toEqual({
      bookSlug: "emociones-en-construccion",
      chapterOrder: 2,
    });
    expect(s.reason).toContain("Cómo aprendiste a sentir");
    // Reuses the curated chapter opener as the composer seed.
    expect(s.prompt.length).toBeGreaterThan(0);
    // Mutually exclusive with after-chapter.
    expect(out.some((x) => x.id === "after-chapter")).toBe(false);
  });

  it("after-chapter fires for a recently completed chapter (within 3d)", () => {
    const out = buildEcoSuggestions(
      base({ reading: reading({ completedAt: daysAgo(1), progressPct: 100 }) }),
    );
    expect(out.some((x) => x.id === "after-chapter")).toBe(true);
    expect(out.some((x) => x.id === "continue-chapter")).toBe(false);
  });

  it("a chapter completed long ago does not resurface", () => {
    const out = buildEcoSuggestions(
      base({
        reading: reading({ completedAt: daysAgo(10), progressPct: 100 }),
      }),
    );
    expect(out.some((x) => x.id.startsWith("after"))).toBe(false);
    // Falls back to cold-start since nothing else fires.
    expect(out[0].id).toBe("cold-start");
  });

  it("a low self-reported mood yields a gentle, supportive opener", () => {
    const out = buildEcoSuggestions(
      base({ latestMood: { mood: "hard", at: daysAgo(0) } }),
    );
    const s = out.find((x) => x.id === "mood-supportive")!;
    expect(s).toBeDefined();
    expect(s.reason).toBe("Marcaste un día difícil");
    expect(s.scope).toBeNull();
  });

  it("a good self-reported mood yields a savoring opener", () => {
    const out = buildEcoSuggestions(
      base({ latestMood: { mood: "good", at: daysAgo(1) } }),
    );
    expect(out.some((x) => x.id === "mood-savoring")).toBe(true);
  });

  it("a neutral mood ('ok') produces no mood opener", () => {
    const out = buildEcoSuggestions(
      base({ latestMood: { mood: "ok", at: daysAgo(0) } }),
    );
    expect(out.some((x) => x.id.startsWith("mood"))).toBe(false);
  });

  it("a stale mood (older than the window) produces no mood opener", () => {
    const out = buildEcoSuggestions(
      base({ latestMood: { mood: "hard", at: daysAgo(5) } }),
    );
    expect(out.some((x) => x.id.startsWith("mood"))).toBe(false);
  });

  it("a recent reflection yields a deepen opener (no text, just the fact)", () => {
    const out = buildEcoSuggestions(base({ lastReflectionAt: daysAgo(1) }));
    const s = out.find((x) => x.id === "after-reflection")!;
    expect(s).toBeDefined();
    expect(s.reason).toBe("Escribiste una reflexión hace poco");
  });

  it("priority-orders reading → mood → reflection and caps at the limit", () => {
    const out = buildEcoSuggestions(
      base({
        reading: reading(),
        latestMood: { mood: "hard", at: daysAgo(0) },
        lastReflectionAt: daysAgo(0),
      }),
      3,
    );
    expect(out.map((x) => x.id)).toEqual([
      "continue-chapter",
      "mood-supportive",
      "after-reflection",
    ]);
    // The Home surface asks for only the top 2.
    const top2 = buildEcoSuggestions(
      base({
        reading: reading(),
        latestMood: { mood: "hard", at: daysAgo(0) },
        lastReflectionAt: daysAgo(0),
      }),
      2,
    );
    expect(top2.map((x) => x.id)).toEqual([
      "continue-chapter",
      "mood-supportive",
    ]);
  });
});
