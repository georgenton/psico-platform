import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * CC-7.3 — DOCUMENTATION-ONLY DTOs.
 *
 * The runtime authority for every learning body is the CC-7.1 pure parser
 * (learning-command-parser.ts): closed whitelists, mandatory canonical
 * idempotencyKey, exclusive recall union, extra fields rejected. These
 * classes exist so Swagger/OpenAPI documents the wire — they are wired via
 * `@ApiBody`/`@ApiOkResponse` only, NEVER as handler parameter types, so no
 * ValidationPipe coercion ever runs before (or instead of) the parser.
 */

export class LearningIdempotentBodyDto {
  @ApiProperty({
    description: "Mandatory client idempotency key (UUID, any casing).",
    example: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  })
  idempotencyKey!: string;
}

export class SubmitRecallAttemptBodyDto {
  @ApiProperty({
    description: "Mandatory client idempotency key (UUID, any casing).",
    example: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  })
  idempotencyKey!: string;

  @ApiProperty({ description: "Catalog key of the recall item." })
  itemKey!: string;

  @ApiPropertyOptional({
    description:
      "Objective items ONLY: the chosen option's catalog key. The SERVER " +
      "grades it — `result`/`evaluationSource` are never accepted from the " +
      "client. Mutually exclusive with `selfResult`.",
  })
  selectedOptionKey?: string;

  @ApiPropertyOptional({
    enum: ["correct", "incorrect", "skipped"],
    description:
      "Self-assessed items ONLY (the catalog must declare that mode): the " +
      "user's own categorical assessment. Mutually exclusive with " +
      "`selectedOptionKey`.",
  })
  selfResult?: "correct" | "incorrect" | "skipped";
}

class LearningEventRecordDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: [1] })
  schemaVersion!: 1;

  @ApiProperty({ description: "Server clock, ISO-8601." })
  occurredAt!: string;

  @ApiProperty({
    enum: [
      "unit_opened",
      "unit_completed",
      "concept_explored",
      "guide_session_started",
      "guide_session_completed",
      "active_recall_attempted",
      "practice_completed",
    ],
  })
  type!: string;

  @ApiProperty({
    description: "Server-constructed payload, exactly typed per `type`.",
    type: "object",
    additionalProperties: true,
  })
  payload!: Record<string, unknown>;

  @ApiProperty({ nullable: true, type: String })
  editionId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  unitId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  conceptId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  guideSessionId!: string | null;
}

export class LearningCommandResponseDto {
  @ApiProperty({ description: "True when this call created the event (201)." })
  created!: boolean;

  @ApiProperty({ description: "True on an exact idempotent replay (200)." })
  replayed!: boolean;

  @ApiProperty({ type: LearningEventRecordDto })
  event!: LearningEventRecordDto;
}

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
