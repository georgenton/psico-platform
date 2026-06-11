import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { THERAPY_MOOD_IDS } from "@psico/types";
import type { TherapyMoodId } from "@psico/types";

/**
 * Body for PATCH /api/terapia/sessions/:id/prep — Sprint S64.
 *
 * Privacy: `intentionCiphertext + intentionNonce` follows ADR 0007 —
 * client encrypts the intention text with their per-user E2E key before
 * sending. The server NEVER sees plaintext. Pairing of ciphertext+nonce
 * is enforced in the service layer (both or neither).
 *
 * `checkInMood` is plaintext metadata (token like "ansioso", "tranquilo")
 * because it's categorical and analytics-safe — same treatment as
 * `DiaryEntry.mood`.
 *
 * `sharedEntryIds` are IDs of `DiaryEntry` rows the user chose to share
 * with the therapist for this session. The actual re-encrypted ciphertext
 * lives in `SharedDiaryEntry` (created by the diario flow), not here.
 */
export class UpdateSessionPrepDto {
  @IsOptional()
  @IsString()
  @Length(0, 8192)
  intentionCiphertext?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  intentionNonce?: string;

  // Narrowed to the shared THERAPY_MOODS catalog (calmo / ansioso / triste / ...).
  // Plugin CLI surfaces el enum en OpenAPI desde el @IsIn.
  @IsOptional()
  @IsIn(THERAPY_MOOD_IDS)
  checkInMood?: TherapyMoodId;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  sharedEntryIds?: string[];
}
