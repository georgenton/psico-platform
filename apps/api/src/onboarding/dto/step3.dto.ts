import { IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class OnboardingStep3Dto {
  /**
   * Display name. 2-40 chars. Disallow emoji + control chars + leading/trailing
   * whitespace. The regex is permissive about accented characters so "María
   * José" works.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[\p{L}\p{M}\s'.-]+$/u, {
    message: "firstName contains invalid characters (no emoji, no symbols)",
  })
  firstName!: string;

  @IsIn(["marina", "tomas", "none"])
  voicePreference!: "marina" | "tomas" | "none";
}
