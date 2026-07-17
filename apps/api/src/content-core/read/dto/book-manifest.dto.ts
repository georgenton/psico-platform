import { ApiProperty } from "@nestjs/swagger";

/** One published unit in a book manifest (CC-6A.1). */
export class ManifestUnitDto {
  @ApiProperty({ description: "Stable unit identity (uuidv5)." })
  unitKey!: string;

  @ApiProperty({ description: "1-based reading order within the book." })
  order!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  summary!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  partNumber!: number | null;

  @ApiProperty({ nullable: true, type: String })
  partTitle!: string | null;
}

/** The ordered manifest of a book's published units (CC-6A.1). */
export class BookManifestDto {
  @ApiProperty()
  bookSlug!: string;

  @ApiProperty({
    enum: ["content-core", "legacy"],
    description: "Which store served this manifest.",
  })
  source!: "content-core" | "legacy";

  @ApiProperty({
    description: "Server-owned edition key — clients never fabricate it.",
  })
  editionKey!: string;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Published revision number, or null when served from legacy.",
  })
  revisionNumber!: number | null;

  @ApiProperty({ type: [ManifestUnitDto] })
  units!: ManifestUnitDto[];
}
