import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { DIARY_MOOD_IDS } from "@psico/types";
import type { DiaryMoodId } from "@psico/types";

/**
 * GET /diario/entries query.
 *
 * `from` / `to` are inclusive ISO dates (YYYY-MM-DD). The mood and tag
 * filters operate on the plain metadata; the server cannot filter the
 * ciphertext.
 */
export class ListDiaryEntriesQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(DIARY_MOOD_IDS)
  mood?: DiaryMoodId;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;
}
