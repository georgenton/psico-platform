import { IsBoolean, IsOptional } from "class-validator";

export class UpdatePrivacyDto {
  // The next three are stored, returned by `/user/me` and included in the data
  // export, and nothing reads them to decide anything. No screen offers them
  // any more: `apps/web/src/privacy-controls.contract.test.ts` keeps it that
  // way until something does. They stay accepted because installed clients
  // still send them, and the values already stored are left alone.
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
