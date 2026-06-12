import { IsIn } from "class-validator";
import { WELLNESS_MOOD_IDS } from "@psico/types";
import type { WellnessMoodId } from "@psico/types";

/**
 * Body for `PATCH /api/user/mood` — quick wellness ping.
 *
 * Vocabulary lives in `@psico/types` (`WELLNESS_MOOD_IDS`) — distinct from
 * DIARY_MOODS (journaling) and THERAPY_MOODS (post-session check-in).
 * The plugin CLI surfaces el enum en OpenAPI desde el @IsIn.
 */
export class UpdateMoodDto {
  @IsIn(WELLNESS_MOOD_IDS as unknown as string[])
  mood!: WellnessMoodId;
}
