import { ApiProperty } from "@nestjs/swagger";

/** One highlight, anchored by the stable blockKey (CC-6C). */
export class MarkHighlightDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: "Stable public block identity (uuidv5)." })
  blockKey!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "Legacy ChapterBlock id — null for a pure Content Core block.",
  })
  blockId!: string | null;

  @ApiProperty()
  startOffset!: number;

  @ApiProperty()
  endOffset!: number;

  @ApiProperty({ enum: ["YELLOW", "BLUE", "PINK"] })
  color!: string;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;
}

/** One annotation, anchored by the stable blockKey (CC-6C). */
export class MarkAnnotationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: "Stable public block identity (uuidv5)." })
  blockKey!: string;

  @ApiProperty({ nullable: true, type: String })
  blockId!: string | null;

  @ApiProperty()
  text!: string;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: Date;
}

/** The current user's marks for one unit (CC-6C), keyed by blockKey. */
export class ContentUnitMarksDto {
  @ApiProperty()
  editionKey!: string;

  @ApiProperty()
  unitKey!: string;

  @ApiProperty({ type: [MarkHighlightDto] })
  highlights!: MarkHighlightDto[];

  @ApiProperty({ type: [MarkAnnotationDto] })
  annotations!: MarkAnnotationDto[];
}
