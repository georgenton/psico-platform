import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { DIARY_MOOD_IDS } from "@psico/types";
import type { DiaryMoodId } from "@psico/types";
import { IsBase64UrlCipher, IsBase64UrlNonce } from "./ciphertext-validators";

/**
 * PATCH /diario/entries/:id body. All fields optional.
 *
 * When editing the text, BOTH textCiphertext AND textNonce must change
 * together — a new nonce per write is mandatory to avoid nonce reuse
 * under the same key. Server enforces the pairing.
 */
export class UpdateDiaryEntryDto {
  // Mood token narrowed to the shared DIARY_MOODS catalog.
  @IsOptional()
  @IsIn(DIARY_MOOD_IDS)
  mood?: DiaryMoodId;

  @IsOptional()
  @IsBase64UrlCipher()
  textCiphertext?: string;

  @IsOptional()
  @IsBase64UrlNonce()
  textNonce?: string;

  @IsOptional()
  @IsBase64UrlCipher()
  excerptCiphertext?: string;

  @IsOptional()
  @IsBase64UrlNonce()
  excerptNonce?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(1, 32, { each: true })
  tags?: string[];
}
