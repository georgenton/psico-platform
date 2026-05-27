import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Optional language hint sent alongside the audio. Whisper/Deepgram both
 * accept ISO-639-1 plus a few extended tags ("es-419" for LATAM Spanish).
 * Capped at 16 chars so we don't accidentally pass arbitrary attacker input
 * through to a third-party API.
 */
export class TranscribeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;
}
