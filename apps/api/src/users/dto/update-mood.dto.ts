import { IsIn } from "class-validator";
import { WELLNESS_MOOD_IDS } from "@psico/types";
import type { WellnessMoodId } from "@psico/types";

/**
 * Body for `PATCH /api/user/mood` — quick wellness ping from the Home
 * screen.
 *
 * Vocabulary lives in `@psico/types` (`WELLNESS_MOOD_IDS`) — distinct from
 * `DIARY_MOODS` (journaling) and `THERAPY_MOODS` (post-session check-in).
 * The plugin CLI surfaces the enum in OpenAPI from the `@IsIn`.
 *
 * Persists to `User.mood` + `User.moodUpdatedAt` for the Home greeting
 * and the streak-engine. No prior write history is retained — the table
 * keeps only the latest ping per user.
 */
export class UpdateMoodDto {
  /**
   * Wellness mood token (`great` / `good` / `meh` / `bad` / …). One of
   * `WELLNESS_MOOD_IDS`. Unknown tokens are rejected with 400 by `@IsIn`.
   */
  @IsIn(WELLNESS_MOOD_IDS as unknown as string[])
  mood!: WellnessMoodId;
}
