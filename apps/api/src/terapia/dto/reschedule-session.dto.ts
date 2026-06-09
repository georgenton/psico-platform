import { IsDateString } from "class-validator";

/**
 * Body for PATCH /api/terapia/sessions/:id/reschedule — Sprint S66.B.
 */
export class RescheduleSessionDto {
  @IsDateString()
  newSlotIso!: string;
}
