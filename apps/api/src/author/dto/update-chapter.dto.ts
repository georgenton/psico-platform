import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class ChapterBlockDto {
  @IsString()
  @MaxLength(32)
  kind!: string; // paragraph | heading | quote | pause | exercise

  @IsString()
  @MaxLength(8000)
  content!: string;

  @IsOptional()
  meta?: Record<string, unknown>;
}

export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ChapterBlockDto)
  blocks?: ChapterBlockDto[];

  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  /**
   * Optimistic concurrency: client sends the version it loaded with. If the
   * server sees a newer version, returns 409 with the latest version so the
   * editor can show a conflict modal.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
