import { describe, expect, it } from "vitest";
import { DIARY_MOODS } from "@psico/types";
import { MOOD_SEED_CATALOG } from "./constants";

/**
 * Enforces that the seed catalog (server-side, persisted into OnboardingMood)
 * stays aligned with DIARY_MOODS (client-side UI catalog in @psico/types).
 *
 * The two arrays are intentionally separate:
 *   - SEED has `swatch` + `order` (used by the Inicio mood picker on mobile).
 *   - DIARY_MOODS has `emoji` (used by the Diario composer / detail edit).
 *
 * What MUST stay in lockstep: `id` (the wire token stored in DiaryEntry.mood
 * and User.mood) and `label` (so categorical analytics in Pulso line up).
 *
 * If this test fails, you forgot one side of the catalog. Update both:
 *   - SEED catalog: apps/api/src/onboarding/constants.ts (MOOD_SEED_CATALOG).
 *   - UI catalog:   packages/types/src/index.ts (DIARY_MOODS).
 */
describe("moods seed ↔ DIARY_MOODS alignment", () => {
  it("has the same count on both sides", () => {
    expect(MOOD_SEED_CATALOG).toHaveLength(DIARY_MOODS.length);
  });

  it("has the same ids in the same order", () => {
    const seedIds = MOOD_SEED_CATALOG.map((m) => m.id);
    const uiIds = DIARY_MOODS.map((m) => m.id);
    expect(seedIds).toEqual(uiIds);
  });

  it("has matching labels per id", () => {
    const seedById = new Map(MOOD_SEED_CATALOG.map((m) => [m.id, m.label]));
    for (const ui of DIARY_MOODS) {
      const seedLabel = seedById.get(ui.id);
      expect(seedLabel, `seed has no entry for id '${ui.id}'`).toBeDefined();
      expect(seedLabel, `label mismatch for mood '${ui.id}'`).toBe(ui.label);
    }
  });

  it("seed `order` is 1-indexed contiguous", () => {
    const orders = MOOD_SEED_CATALOG.map((m) => m.order).sort((a, b) => a - b);
    expect(orders).toEqual(
      Array.from({ length: MOOD_SEED_CATALOG.length }, (_, i) => i + 1),
    );
  });

  it("seed ids are unique", () => {
    const ids = MOOD_SEED_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("seed swatches are hex colors", () => {
    for (const m of MOOD_SEED_CATALOG) {
      expect(m.swatch).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
