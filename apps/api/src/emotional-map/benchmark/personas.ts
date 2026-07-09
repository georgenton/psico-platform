import type { EmotionalMapScoringInput } from "../emotional-map.scoring";
import { mulberry32 } from "../dynamics/synthetic";
import { CHECKIN_ITEMS } from "@psico/types";

/**
 * Persona benchmark — synthetic user archetypes for the offline Stage-0 test
 * bed. Each persona defines an interaction pattern; `buildPersonaInput` turns
 * it into the exact metadata the real scoring consumes (mood series, diary
 * entries, activity counts), deterministically, so we can answer "a user who
 * behaves like X for N days → what does the map show?".
 *
 * Privacy (ADR 0007): only ordinal mood + timestamps + counts. No text.
 */

export type MoodPattern =
  | "stable"
  | "volatile"
  | "improving"
  | "declining"
  | "flat";
export type Engagement = "low" | "medium" | "high";

export interface Persona {
  id: string;
  label: string;
  /** Days the account has been active. */
  days: number;
  moodPattern: MoodPattern;
  /** Mood check-ins per week (cadence). */
  moodsPerWeek: number;
  engagement: Engagement;
  /**
   * Etapa 2 — answers the daily micro-checkin (one rotating question/day).
   * Scores follow the mood pattern (stable → 3-4, volatile → swings).
   */
  answersCheckins?: boolean;
}

const MOODS = ["hard", "low", "ok", "good", "great"] as const;

/** Fixed reference "now" so the benchmark is reproducible over time. */
const NOW_REF = Date.UTC(2026, 6, 1, 12, 0, 0); // 2026-07-01T12:00:00Z
const DAY_MS = 86400_000;

export const PERSONAS: Persona[] = [
  { id: "nuevo-3d", label: "Nuevo · 3 días", days: 3, moodPattern: "stable", moodsPerWeek: 5, engagement: "low" }, // prettier-ignore
  { id: "semana-casual", label: "Semana · casual", days: 7, moodPattern: "stable", moodsPerWeek: 4, engagement: "medium" }, // prettier-ignore
  { id: "dos-semanas", label: "Dos semanas", days: 14, moodPattern: "stable", moodsPerWeek: 5, engagement: "medium" }, // prettier-ignore
  { id: "mes-constante", label: "Un mes · constante", days: 30, moodPattern: "stable", moodsPerWeek: 5, engagement: "medium" }, // prettier-ignore
  { id: "trimestre-disciplinado", label: "Trimestre · disciplinado", days: 90, moodPattern: "stable", moodsPerWeek: 6, engagement: "high" }, // prettier-ignore
  { id: "volatil-mes", label: "Un mes · volátil", days: 30, moodPattern: "volatile", moodsPerWeek: 6, engagement: "medium" }, // prettier-ignore
  { id: "recuperandose-2m", label: "Dos meses · recuperándose", days: 60, moodPattern: "improving", moodsPerWeek: 5, engagement: "medium" }, // prettier-ignore
  { id: "declive-mes", label: "Un mes · en declive", days: 30, moodPattern: "declining", moodsPerWeek: 5, engagement: "medium" }, // prettier-ignore
  { id: "esporadico-2m", label: "Dos meses · esporádico", days: 60, moodPattern: "stable", moodsPerWeek: 1, engagement: "low" }, // prettier-ignore
  { id: "casi-plano-mes", label: "Un mes · casi plano", days: 30, moodPattern: "flat", moodsPerWeek: 5, engagement: "medium" }, // prettier-ignore
  { id: "checkin-3sem", label: "Tres semanas · checkin diario", days: 21, moodPattern: "stable", moodsPerWeek: 7, engagement: "low", answersCheckins: true }, // prettier-ignore
];

function seedFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h >>> 0;
}

function moodForPattern(
  pattern: MoodPattern,
  frac: number,
  rng: () => number,
): string {
  const noise = () => Math.floor(rng() * 3) - 1; // -1,0,1
  const clampIdx = (n: number) => Math.max(0, Math.min(MOODS.length - 1, n));
  switch (pattern) {
    case "flat":
      return MOODS[2]; // always "ok"
    case "stable":
      return MOODS[clampIdx(3 + noise())];
    case "improving":
      return MOODS[clampIdx(Math.round(frac * 4) + noise())];
    case "declining":
      return MOODS[clampIdx(Math.round((1 - frac) * 4) + noise())];
    case "volatile":
    default:
      return MOODS[clampIdx((rng() < 0.5 ? 4 : 0) + noise())];
  }
}

const ENGAGEMENT_COUNTS: Record<
  Engagement,
  {
    readingSessions: number;
    completedFrac: number;
    ecoMessages: number;
    voiceCount: number;
    highlightCount: number;
    annotationCount: number;
    diaryFrac: number;
    taggedFrac: number;
  }
> = {
  low: { readingSessions: 0, completedFrac: 0, ecoMessages: 1, voiceCount: 0, highlightCount: 0, annotationCount: 0, diaryFrac: 0.3, taggedFrac: 0.1 }, // prettier-ignore
  medium: { readingSessions: 3, completedFrac: 0.33, ecoMessages: 6, voiceCount: 1, highlightCount: 2, annotationCount: 1, diaryFrac: 0.5, taggedFrac: 0.4 }, // prettier-ignore
  high: { readingSessions: 6, completedFrac: 0.5, ecoMessages: 15, voiceCount: 3, highlightCount: 5, annotationCount: 3, diaryFrac: 0.6, taggedFrac: 0.7 }, // prettier-ignore
};

/** Turn a persona into the metadata the real scoring consumes. */
export function buildPersonaInput(persona: Persona): EmotionalMapScoringInput {
  const rng = mulberry32(seedFor(persona.id));
  const eng = ENGAGEMENT_COUNTS[persona.engagement];

  // ── Mood series over the whole window (drives the OU fit). ────────────────
  const count = Math.max(
    1,
    Math.round((persona.days / 7) * persona.moodsPerWeek),
  );
  const moodSeries: Array<{ mood: string; createdAt: Date }> = [];
  const entries: Array<{ mood: string; tags: string[]; createdAt: Date }> = [];
  for (let i = 0; i < count; i++) {
    const frac = count <= 1 ? 1 : i / (count - 1); // 0 (oldest) → 1 (newest)
    // Evenly spread across the window, with sub-day jitter for irregular Δt.
    const dayOffset = persona.days * (1 - frac) + (rng() - 0.5);
    const createdAt = new Date(NOW_REF - Math.max(dayOffset, 0) * DAY_MS);
    const mood = moodForPattern(persona.moodPattern, frac, rng);
    moodSeries.push({ mood, createdAt });

    // A fraction of recent (≤30d) mood check-ins are diary entries.
    const ageDays = (NOW_REF - createdAt.getTime()) / DAY_MS;
    if (ageDays <= 30 && rng() < eng.diaryFrac) {
      entries.push({
        mood,
        tags: rng() < eng.taggedFrac ? ["trabajo"] : [],
        createdAt,
      });
    }
  }

  // ── Activity within the 30-day window (drives Tier-1 axes). ───────────────
  const recentDays = Math.min(persona.days, 30);
  const readingSessions = Array.from(
    { length: eng.readingSessions },
    (_, i) => ({
      progressPct: 40 + Math.round(rng() * 60),
      completedAt:
        i < Math.round(eng.readingSessions * eng.completedFrac)
          ? new Date(NOW_REF - rng() * recentDays * DAY_MS)
          : null,
      timeSpentSec: 600 + Math.round(rng() * 2400),
    }),
  );
  const ecoMessages = Array.from({ length: eng.ecoMessages }, () => ({
    createdAt: new Date(NOW_REF - rng() * recentDays * DAY_MS),
  }));

  // ── Etapa 2: one rotating checkin answer per day (last 30d window). ───────
  // Stable/flat personas answer high (3-4); volatile swings 1-4; trending
  // patterns follow their direction loosely. Deterministic via the same rng.
  const checkins: Array<{ itemKey: string; score: number; createdAt: Date }> =
    [];
  if (persona.answersCheckins) {
    const days = Math.min(persona.days, 30);
    for (let d = days - 1; d >= 0; d--) {
      const item = CHECKIN_ITEMS[(days - 1 - d) % CHECKIN_ITEMS.length];
      const base =
        persona.moodPattern === "volatile"
          ? 1 + Math.floor(rng() * 4)
          : persona.moodPattern === "declining"
            ? 2
            : 3;
      const score = Math.min(4, Math.max(0, base + (rng() < 0.4 ? 1 : 0)));
      checkins.push({
        itemKey: item.key,
        score,
        createdAt: new Date(NOW_REF - d * DAY_MS - Math.floor(rng() * DAY_MS)),
      });
    }
  }

  return {
    entries,
    readingSessions,
    ecoMessages,
    voiceCount: eng.voiceCount,
    highlightCount: eng.highlightCount,
    annotationCount: eng.annotationCount,
    currentStreakDays:
      persona.moodsPerWeek >= 5 ? Math.min(persona.days, 7) : 2,
    moodSeries,
    checkins,
    ouEnabled: true,
  };
}
