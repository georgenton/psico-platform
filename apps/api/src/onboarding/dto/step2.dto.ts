import { IsString } from "class-validator";

/**
 * Body for `POST /api/onboarding/step2` — capture the user's initial
 * mood from the `OnboardingMood` catalog.
 *
 * Step 2 of the 5-step guided onboarding. Persisted to
 * `OnboardingState.initialMoodId` (audit) and copied to
 * `User.mood` + `User.moodUpdatedAt` (canonical) so the home greeting
 * has a baseline mood to render. Idempotent; after `complete` or
 * `skip` returns 400.
 */
export class OnboardingStep2Dto {
  /**
   * Catalog ID from `OnboardingMood` (separate vocabulary from
   * `WELLNESS_MOODS` and `DIARY_MOODS`). Service validates the ID
   * exists; unknown IDs return 400 `MOOD_NOT_FOUND` with the bad
   * value echoed back for actionable error display.
   */
  @IsString()
  moodId!: string;
}
