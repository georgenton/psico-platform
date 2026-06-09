"use server";

import { revalidatePath } from "next/cache";
import { serverFetch } from "@/lib/api.server";
import type { TherapistFavoriteToggleResponse } from "@psico/types";

/**
 * Toggle de favorito sobre un terapeuta. Revalida el directorio + el detalle.
 */
export async function toggleTherapistFavoriteAction(
  therapistId: string,
): Promise<TherapistFavoriteToggleResponse> {
  const res = await serverFetch<TherapistFavoriteToggleResponse>(
    `/terapia/therapists/${therapistId}/favorite`,
    { method: "POST", body: {} },
  );
  revalidatePath("/dashboard/terapia/terapeutas");
  revalidatePath(`/dashboard/terapia/terapeutas/${therapistId}`);
  return res;
}

/**
 * Cancelar una sesión SCHEDULED.
 */
export async function cancelSessionAction(
  sessionId: string,
  reason: string,
  refundRequested: boolean,
): Promise<{ ok: true; cancelledAt: string }> {
  const res = await serverFetch<{ ok: true; cancelledAt: string }>(
    `/terapia/sessions/${sessionId}/cancel`,
    { method: "POST", body: { reason, refundRequested } },
  );
  revalidatePath("/dashboard/terapia/sesiones");
  return res;
}
