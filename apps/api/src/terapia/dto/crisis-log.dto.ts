import { IsIn, IsOptional, IsString, Length } from "class-validator";
import type { CrisisTrigger } from "@psico/types";

/**
 * Body for POST /api/terapia/crisis/log — Sprint S62.
 *
 * Auditoría sin contenido sensible. NO recibe ni texto del usuario ni
 * estado emocional — solo el trigger categórico y, si aplica, qué línea
 * de la lista contactó. Sirve a ops para entender qué caminos llevan a
 * crisis sin invadir la privacidad.
 */
export class CrisisLogDto {
  @IsIn([
    "ECO_SAFETY_LAYER",
    "HOME_BUTTON",
    "PROFILE_LINK",
    "THERAPIST_SUGGESTION",
  ])
  trigger!: CrisisTrigger;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  contactedLineId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}
