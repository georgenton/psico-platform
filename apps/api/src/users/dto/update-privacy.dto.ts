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

  /**
   * Fase D (V2, decision L4) — consent for the on-device reflection text
   * analysis (TXT-L1). Setting it to false also deletes every derived
   * numeric row the user uploaded (consent cascade).
   */
  @IsOptional()
  @IsBoolean()
  localTextAnalysis?: boolean;
}
