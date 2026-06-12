import { IsDateString } from "class-validator";

/**
 * Body for `PATCH /api/terapia/sessions/:id/reschedule` — Sprint S66.B.
 *
 * Move an existing `SCHEDULED` session to a different slot of the same
 * therapist. Same-therapist constraint: changing therapists requires
 * cancel + rebook.
 *
 * Race condition: if another booking takes the new slot in the
 * meantime, returns 409 `SLOT_TAKEN` and the UI re-fetches
 * availability. Only SCHEDULED sessions are reschedulable — completed
 * and cancelled ones return 400.
 */
export class RescheduleSessionDto {
  /**
   * ISO-8601 UTC timestamp of the new slot start (e.g.
   * `"2026-06-20T15:00:00.000Z"`). Must be a slot that exists in the
   * therapist's published availability + isn't already taken.
   */
  @IsDateString()
  newSlotIso!: string;
}
