import { IsInt, Max, Min } from "class-validator";

export class OnboardingTourCompleteDto {
  /** Number of tour steps the user actually saw. 0 = skipped after opening. */
  @IsInt()
  @Min(0)
  @Max(20)
  stepsCompleted!: number;
}
