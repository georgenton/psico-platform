import { IsBoolean, IsOptional } from "class-validator";

/**
 * Body for PATCH /api/terapia/prescriptions/:id — Sprint S66.B.
 *
 * Marca como completada/incompleta. El terapeuta es quien CREA recetas
 * (S19+ Author dashboard); el usuario solo puede marcarlas.
 */
export class UpdatePrescriptionDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
