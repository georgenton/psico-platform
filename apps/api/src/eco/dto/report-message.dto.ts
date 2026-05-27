import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

const REPORT_REASONS = [
  "HALLUCINATION",
  "OFF_TONE",
  "SENSITIVE_CONTENT",
  "CRISIS_MISHANDLED",
  "OTHER",
] as const;

export type EcoReportReason = (typeof REPORT_REASONS)[number];

export class ReportEcoMessageDto {
  @IsEnum(REPORT_REASONS)
  reason!: EcoReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
