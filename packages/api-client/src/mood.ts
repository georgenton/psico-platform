import type {
  CheckinNextResponse,
  LogCheckinRequest,
  LogCheckinResponse,
  LogMoodRequest,
  LogMoodResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * moodApi — Sprint B1 + Mapa Emocional Etapa 2 (micro-checkins).
 *
 * Global mood time series (Topbar MoodChip, Patrones IA, WeeklyDigest) plus
 * the daily micro-checkin: `nextCheckin` returns today's question (or null if
 * already answered) and `logCheckin` posts the 0–4 answer.
 */
export const moodApi = {
  log: (body: LogMoodRequest) => apiClient.post<LogMoodResponse>("/mood", body),
  nextCheckin: () => apiClient.get<CheckinNextResponse>("/mood/checkin/next"),
  logCheckin: (body: LogCheckinRequest) =>
    apiClient.post<LogCheckinResponse>("/mood/checkin", body),
};
