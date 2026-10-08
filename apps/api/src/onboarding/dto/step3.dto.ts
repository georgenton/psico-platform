import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

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
   * Preferred narrator voice. OPTIONAL since the onboarding stopped asking.
   *
   * The previous docstring here said "the audio file URL the Lector serves
   * picks the right track based on this preference". It does not. Traced
   * across the API, the web and the shared packages, this value is only
   * ever WRITTEN and then read back to display itself in the preferences
   * card: no audio player, no narration, no transcription and no Eco
   * persona reads it. Asking somebody to choose a voice during their first
   * two minutes, and then changing nothing, is a promise the product does
   * not keep — so the question was removed from the onboarding.
   *
   * The field is NOT removed, and nothing is written in its place. When it
   * is absent the service skips the write entirely: a previously chosen
   * preference stays exactly as it was, and a person who was never asked
   * does not get a silent default invented for them. Existing clients that
   * still send it keep working unchanged.
   *
   * When there is a real listener for it, the question can come back where
   * it belongs — next to the audio.
   */
  @IsOptional()
  @IsIn(["marina", "tomas", "none"])
  voicePreference?: "marina" | "tomas" | "none";
}
