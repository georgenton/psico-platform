import type {
  EmotionalMapResult,
  LogTextFeaturesRequest,
  LogTextFeaturesResponse,
} from "@psico/types";
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
  /**
   * Etapa 6 — upload the NUMERIC features the device computed from a
   * decrypted reflection. The text itself never goes on the wire.
   */
  logTextFeatures: (body: LogTextFeaturesRequest) =>
    apiClient.post<LogTextFeaturesResponse>(
      "/emotional-map/text-features",
      body,
    ),
};
