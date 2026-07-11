import { IsBoolean } from "class-validator";

/**
 * Fase H (ARC-P1) — payload of `PATCH /api/resonances/:id`. Toggles whether
 * the user considers this confirmed theme important to them right now.
 * Distinct important themes feed the Propósito axis under the V2 contract.
 */
export class UpdateResonanceDto {
  @IsBoolean()
  important!: boolean;
}
