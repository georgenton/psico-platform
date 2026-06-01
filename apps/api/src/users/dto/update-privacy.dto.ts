import { IsBoolean, IsOptional } from "class-validator";

export class UpdatePrivacyDto {
  @IsOptional()
  @IsBoolean()
  shareDiaryWithTherapist?: boolean;

  @IsOptional()
  @IsBoolean()
  anonymizedAnalytics?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingEmail?: boolean;
}
