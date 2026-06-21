import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString } from "class-validator";
import { DIARY_MOOD_IDS } from "@psico/types";

/**
 * Body of POST /api/mood — Sprint B1.
 *
 * The mood token is validated against the shared `DIARY_MOOD_IDS` catalog so
 * adding a mood there propagates automatically to this validator (no schema
 * migration needed, since the DB stores raw strings).
 */
export class LogMoodDto {
  @ApiProperty({
    description: "Mood token from the shared catalog.",
    enum: DIARY_MOOD_IDS,
    example: "good",
  })
  @IsString()
  @IsIn(DIARY_MOOD_IDS as readonly string[])
  mood!: string;
}
