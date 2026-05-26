import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from "class-validator";

export class OnboardingStep1Dto {
  /**
   * Motivos chosen by the user. At least one is required. Max 5 keeps the
   * recommendation algorithm focused — picking everything is signal for
   * "I don't know" which we treat the same as default.
   *
   * The service validates each id exists in the OnboardingMotivo table.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  motivosIds!: string[];
}
