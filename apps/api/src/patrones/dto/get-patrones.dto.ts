import { IsIn, IsOptional } from "class-validator";

/**
 * Query DTO for `GET /api/patrones`. v1 accepts three preset periods.
 * Custom ranges arrive in a follow-up sprint when the Pulso admin needs
 * arbitrary slicing.
 */
export class GetPatronesQuery {
  @IsOptional()
  @IsIn(["30d", "90d", "1y"])
  period?: "30d" | "90d" | "1y";
}
