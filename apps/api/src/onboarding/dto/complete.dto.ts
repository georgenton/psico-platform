import { IsOptional, IsString, ValidateIf } from "class-validator";

/**
 * Body for `POST /api/onboarding/complete` — close the guided
 * onboarding.
 *
 * Sets `OnboardingState.completedAt = now()`. After this, the lifecycle
 * guard rejects further `saveStep1/2/3` calls with 400. The home
 * greeting + nav unlock immediately on the next `getMe` poll.
 *
 * A separate `POST /api/onboarding/skip` sets `skippedAt` (without
 * `completedAt`) for users who bail mid-flow — same lifecycle effect
 * but distinguishable in analytics.
 */
export class OnboardingCompleteDto {
  /**
   * ID of the book the user chose to start with. `null` is valid — the
   * user finished onboarding without committing to a specific book
   * (the "terminar" / skip-book option in step 4). When set, the
   * choice is mirrored to `OnboardingState.chosenBookId` for audit and
   * the front auto-starts that book on the next dashboard visit.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  chosenBookId?: string | null;
}
