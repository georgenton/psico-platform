/**
 * IVoiceProvider — Sprint S8 strategy contract.
 *
 * Same pattern as IPaymentProvider (S4 PaymentPool): a small interface so we
 * can swap Whisper for Deepgram via env var without touching the controller
 * or service that depends on it. Both providers accept an audio buffer +
 * optional language hint and return the transcript with duration in seconds.
 *
 * Why include `durationSec` in the result:
 *   - Whisper returns it natively (`verbose_json` response format).
 *   - Deepgram returns it in `metadata.duration`.
 *   - We MUST trust the server-measured duration for quota enforcement —
 *     the client could lie about how many seconds it recorded.
 */
export interface VoiceTranscribeInput {
  /** Raw audio bytes. Format detected by the provider; webm/ogg/wav/mp3 work. */
  audio: Buffer;
  /** MIME type the client sent (passed through to the provider when useful). */
  mimeType: string;
  /**
   * Optional ISO-639 language hint. `null` lets the provider auto-detect.
   * Whisper supports `es`, `es-419`, `en`, etc. Deepgram uses `es-419` for
   * LATAM Spanish.
   */
  language?: string | null;
}

export interface VoiceTranscribeResult {
  transcript: string;
  durationSec: number;
  language: string;
}

export interface IVoiceProvider {
  /** Public identifier — also stored on each VoiceTranscription row. */
  readonly name: "whisper" | "deepgram";

  transcribe(input: VoiceTranscribeInput): Promise<VoiceTranscribeResult>;
}

/** Injection tokens — analog to provider-tokens.ts in SubscriptionModule. */
export const WHISPER_PROVIDER = Symbol("WHISPER_PROVIDER");
export const DEEPGRAM_PROVIDER = Symbol("DEEPGRAM_PROVIDER");
