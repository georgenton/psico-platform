import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";

const HIGHLIGHT_COLORS = ["YELLOW", "BLUE", "PINK"] as const;
export type HighlightColorEnum = (typeof HIGHLIGHT_COLORS)[number];

export class CreateHighlightDto {
  @IsString()
  @Length(1, 64)
  blockId!: string;

  /**
   * UTF-16 code-unit offsets into the block's `content`. The service rejects
   * with 400 if `startOffset >= endOffset` or if `endOffset` exceeds the
   * actual block length (the block is loaded server-side for verification).
   */
  @IsInt()
  @Min(0)
  @Max(100_000)
  startOffset!: number;

  @IsInt()
  @Min(0)
  @Max(100_000)
  endOffset!: number;

  @IsOptional()
  @IsEnum(HIGHLIGHT_COLORS)
  color?: HighlightColorEnum;

  /** Optional one-line note. Reject long blobs — annotations are the right model for that. */
  @IsOptional()
  @IsString()
  @Length(0, 280)
  note?: string;
}
