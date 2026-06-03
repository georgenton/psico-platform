import type {
  PatronesPeriod,
  PatronesRegenerateResponse,
  PatronesResponse,
  PatronesShareWithTherapistRequest,
  PatronesShareWithTherapistResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * patronesApi — Sprint S10 client.
 *
 * Pro-gated. FREE callers still get a 200 response with `locked: true`
 * (soft-lock pattern) so the UI can render a paywall preview. Hard
 * rejections (403) only show up on the `regenerate` endpoint.
 */
export const patronesApi = {
  get: (period: PatronesPeriod = "30d") =>
    apiClient.get<PatronesResponse>(
      `/patrones?period=${encodeURIComponent(period)}`,
    ),

  regenerateWeeklySummary: () =>
    apiClient.post<PatronesRegenerateResponse>(
      "/patrones/weekly-summary/regenerate",
      {},
    ),

  shareWithTherapist: (payload: PatronesShareWithTherapistRequest) =>
    apiClient.post<PatronesShareWithTherapistResponse>(
      "/patrones/share-with-therapist",
      payload,
    ),
};
