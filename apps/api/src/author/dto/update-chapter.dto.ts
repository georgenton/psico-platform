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

/**
 * One block inside the chapter editor — paragraph, heading, quote,
 * pause, or exercise. Stored verbatim into `AuthorBookChapterBlock`
 * when the chapter saves.
 *
 * The editor swaps the entire block array on every save (not a diff)
 * — this is a deliberate decision: it keeps the wire shape simple and
 * the server doesn't need to reconcile partial edits. The
 * `expectedVersion` concurrency check on `UpdateChapterDto` guards
 * against blind overwrites.
 */
export class ChapterBlockDto {
  /**
   * Block kind: `paragraph` (body text), `heading` (section anchor),
   * `quote` (offset quote), `pause` (mindful pause), `exercise`
   * (interactive prompt). Max 32 chars to allow future variants
   * without breaking the schema.
   */
  @IsString()
  @MaxLength(32)
  kind!: string;

  /**
   * Block plain-text content. Max 8000 chars per block — long
   * paragraphs should be split into multiple blocks for better
   * reading rhythm.
   */
  @IsString()
  @MaxLength(8000)
  content!: string;

  /**
   * Optional kind-specific metadata. Examples:
   * - `exercise`: `{ promptId, type: "scale" }`
   * - `pause`: `{ durationSec: 30 }`
   *
   * Server does not validate the shape — it's the editor's
   * responsibility. Stored as Prisma `Json`.
   */
  @IsOptional()
  meta?: Record<string, unknown>;
}

/**
 * Body for `PATCH /api/autor/libros/:id/capitulos/:n` — edit a
 * chapter in the Editor de autor.
 *
 * Optimistic concurrency: client sends `expectedVersion` (the version
 * it loaded with). If the server sees a newer version (someone else
 * saved in the meantime, or another tab), it returns 409
 * `CHAPTER_VERSION_CONFLICT` with the latest version so the editor
 * can show a conflict modal. Without `expectedVersion`, the save goes
 * through unconditionally (last-write-wins).
 */
export class UpdateChapterDto {
  /**
   * New chapter title (up to 200 chars). Shown in the reader header
   * and the chapters list.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  /**
   * Optional subtitle (up to 300 chars). Shown below the title.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  /**
   * Full block list. The server REPLACES the existing block array
   * entirely (not a diff). Max 500 blocks per chapter — well above
   * any organic content.
   *
   * If you only want to update meta (title/locked/hidden) without
   * touching the body, omit this field.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ChapterBlockDto)
  blocks?: ChapterBlockDto[];

  /**
   * Whether the chapter is locked behind the book's plan tier. `true`
   * = Pro readers only. `false` = all readers (default for chapter 1
   * of each book per the funnel design).
   */
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  /**
   * Whether the chapter is hidden from the public reader. Used during
   * editorial work-in-progress — author can edit without exposing
   * half-done content. `false` = visible.
   */
  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  /**
   * Optimistic concurrency: the chapter version the client loaded
   * with. If a save happened in between, the server returns 409
   * `CHAPTER_VERSION_CONFLICT` with the current version + the most
   * recent saved blocks so the editor can render a diff modal.
   *
   * Omit to opt out of conflict detection (last-write-wins).
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
