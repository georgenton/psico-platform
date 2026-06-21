import type { JourneyListResponse } from "@psico/types";
import { apiClient } from "./client";

/**
 * journeysApi — Sprint B5.
 *
 * Single read endpoint for the Exploraciones catalog. Auth-required.
 */
export const journeysApi = {
  list: () => apiClient.get<JourneyListResponse>("/journeys"),
};
