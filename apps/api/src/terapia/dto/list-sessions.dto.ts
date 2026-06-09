import { IsIn, IsOptional } from "class-validator";

/**
 * Query for GET /api/terapia/sessions — Sprint S66.B.
 *
 * Default (no `status` filter) returns both upcoming + past in one
 * envelope. The design Pantalla 6 keeps a 2-tab UI; the front can also
 * narrow via querystring if it wants.
 */
export class ListSessionsDto {
  @IsOptional()
  @IsIn(["upcoming", "past", "all"])
  status?: "upcoming" | "past" | "all";
}
