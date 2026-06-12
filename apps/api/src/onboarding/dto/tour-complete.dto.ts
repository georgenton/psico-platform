import { IsInt, Max, Min } from "class-validator";

/**
 * Body for `POST /api/onboarding/tour/complete` — record that the user
 * finished (or skipped) the post-onboarding spotlight tour.
 *
 * Sets `OnboardingState.tourCompletedAt = now()` regardless of whether
 * the user finished all steps or hit Saltar. `stepsCompleted` captures
 * how many spotlights they actually saw, fueling a future funnel panel
 * in Pulso (Sprint S37 deuda).
 *
 * The tour only fires for users with `completedAt && !skippedAt &&
 * !tourCompletedAt` — i.e. they fully onboarded but haven't seen the
 * tour yet. After this POST, the tour never fires again.
 */
export class OnboardingTourCompleteDto {
  /**
   * Number of tour steps the user actually saw before closing. `0` =
   * skipped right after opening; the catalog max is 5 today but the
   * upper bound is 20 to allow future growth without a contract bump.
   *
   * "Terminar" (clicked through all) sends `stepsCompleted = N` (total
   * catalog size); "Saltar" sends the current step index.
   */
  @IsInt()
  @Min(0)
  @Max(20)
  stepsCompleted!: number;
}
