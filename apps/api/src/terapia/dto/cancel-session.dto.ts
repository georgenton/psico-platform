import { IsBoolean, IsOptional, IsString, Length } from "class-validator";

/**
 * Body for POST /api/terapia/sessions/:id/cancel — Sprint S66.B.
 */
export class CancelSessionDto {
  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  refundRequested?: boolean;
}
