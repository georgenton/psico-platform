import type { EmotionalMapResult } from "@psico/types";
import { apiClient } from "./client";

/**
 * emotionalMapApi — Sprint D.
 *
 * One endpoint. Cached server-side 24h per user. The dashboard layout
 * usually consumes `home.emotionalMap` from `/api/home` instead of calling
 * this directly — this client is the escape hatch for screens that only
 * need the radar (e.g. /dashboard/mapa).
 */
export const emotionalMapApi = {
  get: () => apiClient.get<EmotionalMapResult>("/emotional-map"),
};
