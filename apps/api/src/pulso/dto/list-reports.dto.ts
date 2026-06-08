import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Query params for GET /api/pulso/reports/eco — Sprint S42.
 *
 * `reason` is the EcoMessageReportReason enum; we accept its string form as
 * a filter. Default behavior (no filter) lists all.
 *
 * `limit` capped at 100 — admin tooling, not a paged user-facing surface.
 * `cursor` is the `id` of the last report from the previous page.
 */
export class ListEcoReportsQueryDto {
  @IsOptional()
  @IsIn([
    "HALLUCINATION",
    "OFF_TONE",
    "SENSITIVE_CONTENT",
    "CRISIS_MISHANDLED",
    "OTHER",
  ])
  reason?:
    | "HALLUCINATION"
    | "OFF_TONE"
    | "SENSITIVE_CONTENT"
    | "CRISIS_MISHANDLED"
    | "OTHER";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  cursor?: string;

  // Sprint S49 — filter by resolution state. Defaults to "open" so the
  // admin lands on the actionable inbox.
  @IsOptional()
  @IsIn(["open", "resolved", "all"])
  status?: "open" | "resolved" | "all" = "open";
}

/**
 * Body for POST /api/pulso/reports/eco/:id/resolve — Sprint S49.
 *
 * `note` is an optional short editorial, capped at 500 chars (same as the
 * user-submitted report comment), saved in `EcoMessageReport.resolutionNote`.
 */
export class MarkResolvedDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}
