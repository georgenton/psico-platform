/**
 * IEmotionalMapProvider — Sprint D adapter contract.
 *
 * Same pattern as IPaymentProvider / IVoiceProvider: keeps the orchestrator
 * agnostic so we can swap the LLM later (today: Anthropic Claude; later:
 * user's own LLM-ops trained model, Ollama for cost, etc.).
 *
 * Privacy invariant (ADR 0007): implementations receive ONLY plaintext
 * metadata — mood tokens, tag frequencies, entry counts, week-of-day
 * patterns. Body ciphertext and excerpts NEVER reach this layer. A privacy
 * spec test enforces this at CI time.
 */

export interface EmotionalMapMetadataPayload {
  /** Last 30 days of plaintext entry metadata. */
  entries: ReadonlyArray<{
    mood: string;
    /** Plaintext categorical tags (e.g. "trabajo", "familia", "sueño"). */
    tags: ReadonlyArray<string>;
    /** ISO timestamp — used for time-of-week patterns. */
    createdAtIso: string;
  }>;
  /**
   * Aggregated counters the provider may want to short-circuit on.
   *
   * Fase C (V2 contract): the engagement counters are OPTIONAL — under the
   * EMOTIONAL_MAP_V2 flag the scoring omits them entirely, so usage activity
   * never reaches the LLM (learning-vs-emotional-map.md). Only explicit
   * self-report aggregates (entryCount, activeDays) are always present.
   */
  stats: {
    entryCount: number;
    streakDays?: number;
    /** Distinct days with at least 1 entry in the window. */
    activeDays: number;
    /** Eco USER messages in the window (conversation engagement). */
    ecoMessages?: number;
    /** Distinct days with at least 1 Eco USER message. */
    ecoActiveDays?: number;
    /** Voice transcriptions in the window (naming feelings out loud). */
    voiceCount?: number;
    /** Reading sessions touched in the window. */
    readingSessions?: number;
  };
}

/** Output: 4 LLM-driven axes in [0, 1]. Mechanical axes are computed
 *  rule-based outside the provider. */
export interface EmotionalMapProviderResult {
  calma: number;
  claridad: number;
  compasion: number;
  consciencia: number;
}

/**
 * Fase F (decision L3) — the facts the Narrator may describe. Every field is
 * ALREADY COMPUTED by the scoring: the narrator receives numbers and turns
 * them into copy; it can never create or alter a score (facts/narrator
 * separation, V2 principle 3). Privacy (ADR 0007): categorical mood tokens +
 * counts only — never text.
 */
export interface EmotionalMapNarratorFacts {
  momento: { mood: string; atIso: string } | null;
  entryCount: number;
  activeDays: number;
  /** Check-in axes that actually have answers (CHK-S1). */
  selfReport: ReadonlyArray<{ axis: string; value: number; n: number }>;
  dynamics: {
    status: "active" | "gathering";
    nObs: number;
    baseline: number | null;
    stability: number | null;
    trend: "up" | "down" | null;
  } | null;
  /** Distinct confirmed resonance concepts (ARC-C1). */
  resonanceCount: number;
  /** Reflections analyzed on-device (TXT-L1, descriptive only). */
  lenguajeN: number;
}

/** Narrator output — copy only, no numbers the scoring didn't provide. */
export interface EmotionalMapNarrativeResult {
  headline: string;
  body: string;
}

export interface IEmotionalMapProvider {
  readonly name: string;
  score(
    payload: EmotionalMapMetadataPayload,
  ): Promise<EmotionalMapProviderResult>;
  /**
   * Fase F (L3) — optional narrative over computed facts (NAR-L1). Providers
   * without it simply produce maps with `narrative: null`. Must throw on
   * failure; the scoring swallows and renders the map without narrative.
   */
  narrate?(
    facts: EmotionalMapNarratorFacts,
  ): Promise<EmotionalMapNarrativeResult>;
}
