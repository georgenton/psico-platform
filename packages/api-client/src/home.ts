import type {
  DismissReflectionPromptResponse,
  HomeResponse,
  UpdateUserMoodRequest,
  UpdateUserMoodResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * homeApi — Sprint S5-front-mobile client surface.
 *
 * Mirrors the three endpoints in `apps/api/src/home/`. Used by mobile;
 * the web uses Next.js serverFetch with cookies instead because it runs
 * inside Server Components.
 */
export const homeApi = {
  get: () => apiClient.get<HomeResponse>("/home"),
  updateMood: (body: UpdateUserMoodRequest) =>
    apiClient.patch<UpdateUserMoodResponse>("/user/mood", body),
  dismissPrompt: (promptId: string) =>
    apiClient.post<DismissReflectionPromptResponse>(
      `/reflection-prompts/${encodeURIComponent(promptId)}/dismiss`,
    ),
};
