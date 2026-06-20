import type { LogMoodRequest, LogMoodResponse } from "@psico/types";
import { apiClient } from "./client";

/**
 * moodApi — Sprint B1.
 *
 * Single endpoint for the global mood time series consumed by the new
 * dashboard Topbar MoodChip + Patrones IA + WeeklyDigest narrative.
 */
export const moodApi = {
  log: (body: LogMoodRequest) => apiClient.post<LogMoodResponse>("/mood", body),
};
