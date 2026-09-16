import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  CIRCLE_FEEDBACK_MAX_TOPICS,
  CIRCLE_FEEDBACK_TOPIC_KEYS,
  CIRCLE_FEEDBACK_USEFULNESS,
} from "@psico/types";

/**
 * What a browser may send about an activity it just finished.
 *
 * Every field is a closed set or a small integer. There is no string anybody
 * can write into: not a topic, not a comment, not an "otro, ¿cuál?". The
 * whitelist pipe drops unknown keys and `forbidNonWhitelisted` refuses them, so
 * a payload carrying an answer, a name or a `participantId` is rejected rather
 * than trimmed — and the actor, the seat and the template are never read from
 * here at all.
 */
export class CircleHelpOpenDto {
  @ApiProperty({ description: "Which question's help was opened." })
  @IsString()
  fieldKey!: string;

  @ApiProperty({ enum: ["explanation", "example"] })
  @IsIn(["explanation", "example"])
  piece!: "explanation" | "example";

  @ApiProperty({
    description: "How many times, counted in the browser's memory.",
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  // A cap, because a counter with no ceiling is a channel: 2^31 distinct values
  // is room to encode something in a number nobody reads closely.
  @Max(100)
  opens!: number;
}

export class CircleFeedbackDto {
  @ApiProperty({
    description: "Closed keys. At most two. Empty means no topic was given.",
    isArray: true,
    enum: CIRCLE_FEEDBACK_TOPIC_KEYS as string[],
  })
  @IsArray()
  @ArrayMaxSize(CIRCLE_FEEDBACK_MAX_TOPICS)
  @IsIn(CIRCLE_FEEDBACK_TOPIC_KEYS as string[], { each: true })
  topics!: string[];

  @ApiPropertyOptional({ enum: CIRCLE_FEEDBACK_USEFULNESS as string[] })
  @IsOptional()
  @IsIn(CIRCLE_FEEDBACK_USEFULNESS as string[])
  usefulness?: "YES" | "SOME" | "NO";

  @ApiProperty({ description: "Which wording of the notice was agreed to." })
  @IsString()
  noticeVersion!: string;

  @ApiPropertyOptional({ type: [CircleHelpOpenDto] })
  @IsOptional()
  @IsArray()
  // Two pieces per question and a handful of questions. A list longer than
  // this is not a template anybody wrote.
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => CircleHelpOpenDto)
  helpOpens?: CircleHelpOpenDto[];
}
