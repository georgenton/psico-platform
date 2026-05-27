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
  // Mood token from OnboardingMood catalog (calma / foco / energia / …).
  @IsString()
  @Length(1, 32)
  mood!: string;

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
