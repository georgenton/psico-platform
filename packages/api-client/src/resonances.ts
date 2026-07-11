import type {
  ConfirmResonanceRequest,
  ConfirmResonanceResponse,
  ResonanceListResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * resonancesApi — Fase E (V2, ARC cycle).
 *
 * A resonance is an EXPLICIT confirmation ("me resonó este tema") — the only
 * content-side signal allowed into the emotional map. Confirm is idempotent
 * per (user, conceptKey); remove deletes the row for real.
 */
export const resonancesApi = {
  list: () => apiClient.get<ResonanceListResponse>("/resonances"),

  confirm: (body: ConfirmResonanceRequest) =>
    apiClient.post<ConfirmResonanceResponse>("/resonances", body),

  remove: (id: string) => apiClient.delete<{ ok: true }>(`/resonances/${id}`),
};
