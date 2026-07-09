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
  /** Aggregated counters the provider may want to short-circuit on. */
  stats: {
    entryCount: number;
    streakDays: number;
    /** Distinct days with at least 1 entry in the window. */
    activeDays: number;
    /** Eco USER messages in the window (conversation engagement). */
    ecoMessages: number;
    /** Distinct days with at least 1 Eco USER message. */
    ecoActiveDays: number;
    /** Voice transcriptions in the window (naming feelings out loud). */
    voiceCount: number;
    /** Reading sessions touched in the window. */
    readingSessions: number;
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

export interface IEmotionalMapProvider {
  readonly name: string;
  score(
    payload: EmotionalMapMetadataPayload,
  ): Promise<EmotionalMapProviderResult>;
}
