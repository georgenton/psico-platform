import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from "class-validator";

/**
 * Body for `POST /api/onboarding/step1` — save the user's motivations
 * for using the app.
 *
 * This is the first guided step. The user picks 1–5 motives from the
 * `OnboardingMotivo` catalog (e.g. anxiety, sleep, couples). The picks
 * are persisted to `OnboardingState.motivosIds` for audit and feed the
 * book recommendation algorithm at step 4.
 *
 * Idempotent — calling again overwrites the previous picks. After
 * `complete` or `skip`, this endpoint returns 400 (lifecycle guard).
 */
export class OnboardingStep1Dto {
  /**
   * Catalog IDs of the chosen motives. At least one required, max 5 —
   * picking everything is signal for "I don't know" which we treat the
   * same as default.
   *
   * The service validates each id exists in the `OnboardingMotivo`
   * table and returns 400 `MOTIVOS_NOT_FOUND` with the bad IDs.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  motivosIds!: string[];
}
