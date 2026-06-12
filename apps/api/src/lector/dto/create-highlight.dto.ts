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

/**
 * Body for `POST /api/highlights` — create a highlight over a span of
 * text in a `ChapterBlock`.
 *
 * Highlights anchor by `(blockId, startOffset, endOffset)` rather than
 * by a string range, so editorial edits to the book content don't
 * orphan them when blocks are rewritten (they stay attached to the
 * block ID; renders may simply show "rango no disponible" if the offsets
 * fall out of bounds after the edit).
 */
export class CreateHighlightDto {
  /**
   * Stable ID of the `ChapterBlock` the highlight anchors to. Server
   * verifies the block exists and belongs to a book the user has
   * access to (FREE plan can highlight in free chapters; PRO is
   * unrestricted).
   */
  @IsString()
  @Length(1, 64)
  blockId!: string;

  /**
   * UTF-16 code-unit offset into the block's `content` where the
   * highlight starts. Inclusive. The service rejects with 400 if
   * `startOffset >= endOffset` or if `endOffset` exceeds the actual
   * block length (the block is loaded server-side for verification).
   */
  @IsInt()
  @Min(0)
  @Max(100_000)
  startOffset!: number;

  /**
   * UTF-16 code-unit offset into the block's `content` where the
   * highlight ends. Exclusive. Must satisfy `startOffset < endOffset`
   * and be `≤ block.content.length`.
   */
  @IsInt()
  @Min(0)
  @Max(100_000)
  endOffset!: number;

  /**
   * Highlight color: `"YELLOW"` (default), `"BLUE"`, or `"PINK"`. The
   * UI uses color to let users categorize visually (e.g. yellow = key
   * passages, blue = quotes, pink = action items). Plugin emits the
   * enum in OpenAPI.
   */
  @IsOptional()
  @IsEnum(HIGHLIGHT_COLORS)
  color?: HighlightColorEnum;

  /**
   * Optional one-line note attached to the highlight (up to 280 chars).
   * For longer commentary, use the Annotations API instead — annotations
   * are the right model for paragraph-length reflection.
   */
  @IsOptional()
  @IsString()
  @Length(0, 280)
  note?: string;
}
