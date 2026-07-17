import { ApiProperty } from "@nestjs/swagger";

/** One content block of a unit, from Content Core or the legacy fallback. */
export class ContentReadBlockDto {
  @ApiProperty({ description: "Stable block identity (uuidv5)." })
  blockKey!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "Legacy ChapterBlock id (anchor-compat bridge); null for a pure Content Core block.",
  })
  legacyBlockId!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "Source text version served (CC-6C). Core: BlockVersion.id; legacy: null. Echoed back when creating a highlight.",
  })
  blockVersionId!: string | null;

  @ApiProperty({ description: "Block kind (PARAGRAPH, HEADING, …)." })
  kind!: string;

  @ApiProperty({ description: "0-based position within the unit." })
  order!: number;

  @ApiProperty()
  content!: string;

  @ApiProperty({
    nullable: true,
    type: Object,
    description: "Structured metadata by kind (audioUrl, videoUrl, …).",
  })
  meta!: unknown | null;
}

/** A single content unit resolved by the CC-6A read adapter. */
export class ContentUnitReadDto {
  @ApiProperty()
  editionKey!: string;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Published revision number, or null when served from legacy.",
  })
  revisionNumber!: number | null;

  @ApiProperty()
  unitKey!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  summary!: string | null;

  @ApiProperty()
  order!: number;

  @ApiProperty({ nullable: true, type: Number })
  partNumber!: number | null;

  @ApiProperty({ nullable: true, type: String })
  partTitle!: string | null;

  @ApiProperty({
    enum: ["content-core", "legacy"],
    description: "Which store served this unit.",
  })
  source!: "content-core" | "legacy";

  @ApiProperty({ type: [ContentReadBlockDto] })
  blocks!: ContentReadBlockDto[];
}
