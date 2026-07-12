import type { EcoSuggestion } from "@psico/types";
import { ecoChapterPrompt } from "@psico/types";

/**
 * Adaptive Eco suggestions — pure rule-based selector.
 *
 * Given a snapshot of categorical signals (what the user has been reading,
 * their latest self-reported mood, whether they reflected recently), produce
 * up to `limit` curated conversation openers, priority-ordered.
 *
 * Design invariants (mirrors the doc on the shared type):
 *   - READ-ONLY: this proposes conversations; it never writes to the map.
 *   - Deterministic + curated: no LLM, no randomness — same signals → same
 *     openers. Testable in isolation (this is the function the spec exercises).
 *   - Honest copy: every `reason` reflects an EXPLICIT user signal (a chapter
 *     you opened, a mood YOU logged). We never imply the AI inferred a feeling
 *     from your private text.
 *   - Privacy: signals carry only public content metadata (book/chapter),
 *     timestamps, and the self-reported mood token — never diary/Eco text.
 */

/** Latest reading position, from the most recent ReadingSession. */
export interface ReadingSignal {
  bookSlug: string;
  bookTitle: string;
  chapterOrder: number;
  chapterTitle: string;
  progressPct: number;
  completedAt: Date | null;
  lastActivityAt: Date;
}

export interface EcoSuggestionSignals {
  /** Most recent reading session, or null if the user hasn't read anything. */
  reading: ReadingSignal | null;
  /** The Emotional-Map "momento": the user's latest self-reported mood. */
  latestMood: { mood: string; at: Date } | null;
  /** Timestamp of the most recent reflection (diary entry) — NO text. */
  lastReflectionAt: Date | null;
  /** Whether the user has ever sent an Eco message (tunes the cold-start copy). */
  hasEcoHistory: boolean;
  /** "Now" — injectable so recency windows are deterministic in tests. */
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A completed chapter stays "fresh to process" for this many days. */
const CHAPTER_FRESH_DAYS = 3;
/** A logged mood / reflection stays actionable for this many days. */
const RECENT_SIGNAL_DAYS = 2;

/** Ordinal mood tokens (OU scale) that warrant a gentle, supportive opener. */
const LOW_MOODS = new Set(["hard", "low"]);
/** Ordinal mood tokens worth savoring. "ok" is neutral → no opener. */
const HIGH_MOODS = new Set(["good", "great"]);

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

/**
 * Build the ordered list of suggestions. Rules are evaluated in priority
 * order; the reading branch is mutually exclusive (a session is either
 * in-progress or completed), so no de-dup is needed. Always returns at least
 * one opener (the cold-start fallback) and never more than `limit`.
 */
export function buildEcoSuggestions(
  signals: EcoSuggestionSignals,
  limit = 3,
): EcoSuggestion[] {
  const out: EcoSuggestion[] = [];
  const { reading, latestMood, lastReflectionAt, hasEcoHistory, now } = signals;

  // 1 & 2 — reading-anchored openers (mutually exclusive).
  if (reading) {
    const scope = {
      bookSlug: reading.bookSlug,
      chapterOrder: reading.chapterOrder,
    };
    const opener = ecoChapterPrompt(
      reading.bookSlug,
      reading.chapterOrder,
      reading.chapterTitle,
    ).prompt;

    if (reading.completedAt) {
      if (daysBetween(now, reading.completedAt) <= CHAPTER_FRESH_DAYS) {
        out.push({
          id: "after-chapter",
          title: "Cierra el capítulo",
          prompt: opener,
          reason: `Terminaste “${reading.chapterTitle}”`,
          scope,
        });
      }
    } else if (reading.progressPct > 0 && reading.progressPct < 100) {
      out.push({
        id: "continue-chapter",
        title: "Sigue tu lectura",
        prompt: opener,
        reason: `Vas por “${reading.chapterTitle}”`,
        scope,
      });
    }
  }

  // 3 — mood-anchored opener (from the user's own self-report).
  if (latestMood && daysBetween(now, latestMood.at) <= RECENT_SIGNAL_DAYS) {
    if (LOW_MOODS.has(latestMood.mood)) {
      out.push({
        id: "mood-supportive",
        title: "Estoy aquí",
        prompt:
          "Hoy no ha sido un día fácil. Me gustaría hablar de cómo me siento.",
        reason: "Marcaste un día difícil",
        scope: null,
      });
    } else if (HIGH_MOODS.has(latestMood.mood)) {
      out.push({
        id: "mood-savoring",
        title: "Saborea el momento",
        prompt:
          "Hoy me sentí bien. Me gustaría entender qué ayudó a que fuera así.",
        reason: "Marcaste un buen día",
        scope: null,
      });
    }
  }

  // 4 — deepen a recent reflection (fact of writing only, never its text).
  if (
    lastReflectionAt &&
    daysBetween(now, lastReflectionAt) <= RECENT_SIGNAL_DAYS
  ) {
    out.push({
      id: "after-reflection",
      title: "Lleva tu reflexión más lejos",
      prompt:
        "Escribí una reflexión hace poco y me gustaría profundizar en eso.",
      reason: "Escribiste una reflexión hace poco",
      scope: null,
    });
  }

  // 5 — cold-start fallback, appended only if nothing else fired (or to pad
  // the very first suggestion for a brand-new user).
  if (out.length === 0) {
    out.push({
      id: "cold-start",
      title: "Empecemos por hoy",
      prompt: "¿Cómo me encontró este día?",
      reason: hasEcoHistory
        ? "Retomemos la conversación"
        : "Un buen momento para empezar",
      scope: null,
    });
  }

  return out.slice(0, limit);
}
