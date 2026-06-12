import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Query params for `POST /api/voz/transcribe` (audio body is multipart;
 * this is the side-channel).
 *
 * Throttled to 10 / min / user. Pro-only — FREE returns 403
 * `PRO_REQUIRED`. Over-quota returns 402 `QUOTA_EXCEEDED` (Pro has
 * 120 min / billing period). Audio is processed and discarded — the
 * server never stores the file (07-voz.md privacy contract).
 */
export class TranscribeQueryDto {
  /**
   * Optional language hint sent to the speech-to-text provider. Both
   * Whisper and Deepgram accept ISO-639-1 codes (`"es"`, `"en"`) plus a
   * few extended tags (`"es-419"` for LATAM Spanish, recommended for
   * Ecuador users).
   *
   * Capped at 16 chars — defense against arbitrary attacker input
   * reaching the third-party API. When omitted, the provider
   * auto-detects (less accurate for short clips).
   */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;
}
