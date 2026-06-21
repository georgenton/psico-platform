import type { ActivityFeedResponse } from "@psico/types";
import { apiClient } from "./client";

/**
 * activityApi — Sprint D.
 *
 * Interleaved feed of recent user actions (Reflexiones + Lectura + Eco +
 * Voz). Default 5 items, capped at 20.
 */
export const activityApi = {
  feed: (opts?: { limit?: number }) => {
    const limit = opts?.limit;
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
    return apiClient.get<ActivityFeedResponse>(`/activity${qs}`);
  },
};
