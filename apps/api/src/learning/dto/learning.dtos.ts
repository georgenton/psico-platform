import { ApiProperty } from "@nestjs/swagger";

/**
 * CC-7.3 — DOCUMENTATION-ONLY DTOs for the progress response.
 *
 * The command bodies and the event record are documented with the CLOSED raw
 * schemas in `learning.openapi.ts` (additionalProperties: false, exact
 * oneOf unions). The runtime authority for every learning body remains the
 * CC-7.1 pure parser — these classes are wired via `@ApiOkResponse` only,
 * never as handler parameter types.
 */

class LearningUnitProgressItemDto {
  @ApiProperty()
  unitKey!: string;

  @ApiProperty({ enum: ["not_started", "opened", "completed"] })
  state!: string;

  @ApiProperty({ nullable: true, type: String })
  openedAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  completedAt!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  completedRevisionNumber!: number | null;
}

export class LearningProgressResponseDto {
  @ApiProperty()
  bookSlug!: string;

  @ApiProperty()
  editionKey!: string;

  @ApiProperty()
  revisionNumber!: number;

  @ApiProperty({ type: [LearningUnitProgressItemDto] })
  units!: LearningUnitProgressItemDto[];

  @ApiProperty()
  openedCount!: number;

  @ApiProperty()
  completedCount!: number;

  @ApiProperty()
  totalCount!: number;
}
