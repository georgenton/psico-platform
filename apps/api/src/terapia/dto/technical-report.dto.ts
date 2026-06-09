import { IsIn, IsString, Length } from "class-validator";

/**
 * Body for POST /api/terapia/sessions/:id/technical-report — Sprint S65.
 *
 * `issue` is categorical (curated enum) so analytics can group. The free-
 * text `description` is plaintext but capped at 500 chars. No screenshots
 * or logs — ops follows up via email out of band if needed.
 */
export class TechnicalReportDto {
  @IsIn([
    "AUDIO_FAILED",
    "VIDEO_FAILED",
    "CONNECTION_DROPPED",
    "THERAPIST_NO_SHOW",
    "OTHER",
  ])
  issue!:
    | "AUDIO_FAILED"
    | "VIDEO_FAILED"
    | "CONNECTION_DROPPED"
    | "THERAPIST_NO_SHOW"
    | "OTHER";

  @IsString()
  @Length(1, 500)
  description!: string;
}
