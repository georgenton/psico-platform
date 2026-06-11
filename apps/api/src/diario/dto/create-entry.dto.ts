import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from "class-validator";
import { DIARY_MOOD_IDS } from "@psico/types";
import type { DiaryMoodId } from "@psico/types";
import { IsBase64UrlCipher, IsBase64UrlNonce } from "./ciphertext-validators";

const KINDS = ["free", "prompted", "voz"] as const;

/**
 * POST /diario/entries body.
 *
 * The server validates shape, bounds, and that the metadata (mood/tags) is
 * plain. It NEVER inspects the contents of `textCiphertext`. The audio URL
 * is plain because the design (07-voz.md) commits to destroying transcripts
 * once extracted — only the file URL travels.
 */
export class CreateDiaryEntryDto {
  // Mood token from the shared DIARY_MOODS catalog (calma / foco / energia / …).
  // @IsIn narrows at runtime (400 on unknown); the @nestjs/swagger CLI plugin
  // surfaces the enum in OpenAPI automatically (no manual @ApiProperty needed).
  @IsIn(DIARY_MOOD_IDS)
  mood!: DiaryMoodId;

  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @IsOptional()
  @IsString()
  @Length(1, 64)
  promptId?: string;

  @IsBase64UrlCipher()
  textCiphertext!: string;

  @IsBase64UrlNonce()
  textNonce!: string;

  // Preview cipher is optional — short entries may omit it.
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

  @IsOptional()
  @IsUrl()
  audioUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  audioDurationSec?: number;
}
