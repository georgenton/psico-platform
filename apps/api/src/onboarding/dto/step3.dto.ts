import { IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";

/**
 * Body for `POST /api/onboarding/step3` — capture the user's display
 * name and reader-voice preference.
 *
 * After this step the recommendation engine has everything it needs to
 * surface a personalized book recommendation at step 4. Idempotent;
 * after `complete` or `skip` returns 400.
 */
export class OnboardingStep3Dto {
  /**
   * Display first name shown in the home greeting and the inactive-nudge
   * push (e.g. "Hola María, ¿cómo estás?"). 2–40 chars. Disallows emoji,
   * symbols, control chars, and leading/trailing whitespace; permissive
   * about accented characters so `"María José"` works.
   *
   * Persisted to both `OnboardingState.firstName` (audit) and
   * `User.firstName` (canonical).
   */
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[\p{L}\p{M}\s'.-]+$/u, {
    message: "firstName contains invalid characters (no emoji, no symbols)",
  })
  firstName!: string;

  /**
   * Preferred narrator voice for audio playback:
   * - `"marina"` — Marina Quintana voice (the anchor author's own)
   * - `"tomas"` — Tomás voice (paired contributor)
   * - `"none"` — opt out of audio entirely
   *
   * Persisted to `UserPreferences.voicePreference`. The audio file URL
   * the Lector serves picks the right track based on this preference.
   * Plugin emits the enum in OpenAPI.
   */
  @IsIn(["marina", "tomas", "none"])
  voicePreference!: "marina" | "tomas" | "none";
}
