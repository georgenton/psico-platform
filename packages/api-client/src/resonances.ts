import type {
  ConfirmResonanceRequest,
  ConfirmResonanceResponse,
  ResonanceListResponse,
  UpdateResonanceRequest,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * resonancesApi — Fase E (V2, ARC cycle) + Fase H (important themes).
 *
 * A resonance is an EXPLICIT confirmation ("me resonó este tema") — the only
 * content-side signal allowed into the emotional map. Confirm is idempotent
 * per (user, conceptKey); `setImportant` toggles the ARC-P1 flag that feeds
 * the Propósito axis; remove deletes the row for real.
 */
export const resonancesApi = {
  list: () => apiClient.get<ResonanceListResponse>("/resonances"),

  confirm: (body: ConfirmResonanceRequest) =>
    apiClient.post<ConfirmResonanceResponse>("/resonances", body),

  setImportant: (id: string, body: UpdateResonanceRequest) =>
    apiClient.patch<ConfirmResonanceResponse>(`/resonances/${id}`, body),

  remove: (id: string) => apiClient.delete<{ ok: true }>(`/resonances/${id}`),
};
