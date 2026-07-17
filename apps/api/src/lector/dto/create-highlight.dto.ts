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
   * Public stable block identity (Content Core, CC-6B). Preferred anchor for
   * new clients. Resolved server-side to the legacy binding; if `blockId` is
   * also sent they must correspond (else ANCHOR_IDENTITY_MISMATCH).
   */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  blockKey?: string;

  /**
   * Legacy ChapterBlock id — still accepted for backward compatibility. At
   * least one of `blockKey`/`blockId` is required (else ANCHOR_MISSING_TARGET).
   */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  blockId?: string;

  /**
   * Source text version the user read (CC-6C). REQUIRED for a Content Core
   * write (`blockKey`) so the offsets validate against, and the quote is
   * captured from, exactly that BlockVersion — not whatever is published at
   * POST time. Omitted for a legacy `blockId`-only write.
   */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  blockVersionId?: string;

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
