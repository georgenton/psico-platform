import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

const REPORT_REASONS = [
  "HALLUCINATION",
  "OFF_TONE",
  "SENSITIVE_CONTENT",
  "CRISIS_MISHANDLED",
  "OTHER",
] as const;

export type EcoReportReason = (typeof REPORT_REASONS)[number];

/**
 * Body for `POST /api/eco/messages/:id/report` — flag an Eco assistant
 * reply for admin review. Persisted in `EcoMessageReport`; ADMIN-only
 * surface in `/api/pulso/reports/eco/*` lets ops triage.
 *
 * Only assistant turns are reportable (user turns are ciphertext —
 * server can't surface their content for review). The privacy invariant
 * still holds: the report row stores the message ID and never copies
 * any ciphertext.
 */
export class ReportEcoMessageDto {
  /**
   * Category of the issue. One of:
   * - `HALLUCINATION` — Eco invented facts or sources
   * - `OFF_TONE` — wrong register (too clinical, too casual, etc)
   * - `SENSITIVE_CONTENT` — produced content that crosses safety lines
   * - `CRISIS_MISHANDLED` — failed to detect or respond appropriately to a crisis signal
   * - `OTHER` — falls outside the above (description in `comment`)
   *
   * Plugin emits the enum in OpenAPI from `@IsEnum`.
   */
  @IsEnum(REPORT_REASONS)
  reason!: EcoReportReason;

  /**
   * Optional free-text explanation, up to 500 chars. Recommended when
   * `reason === "OTHER"`. Stored as-is — the user is signaling intent,
   * not entering encrypted content.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
