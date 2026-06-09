import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

/**
 * Body for POST /api/terapia/sessions/:id/feedback — Sprint S65.
 *
 * Privacy (ADR 0007):
 *  - rating, tags: plaintext (analytics-safe categorical).
 *  - noteCiphertext + noteNonce: E2E. Pairing enforced in service.
 *
 * Only the owner can call. Session must be COMPLETED or IN_PROGRESS.
 */
export class SessionFeedbackDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 8192)
  noteCiphertext?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  noteNonce?: string;
}
