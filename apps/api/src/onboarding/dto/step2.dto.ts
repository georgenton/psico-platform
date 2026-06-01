import { IsString } from "class-validator";

export class OnboardingStep2Dto {
  @IsString()
  moodId!: string;
}
