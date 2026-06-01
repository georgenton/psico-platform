import { IsOptional, IsString, ValidateIf } from "class-validator";

export class OnboardingCompleteDto {
  /**
   * Book the user picked to start with. `null` is valid → user finished
   * onboarding without committing to a book ("terminar" button).
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  chosenBookId?: string | null;
}
