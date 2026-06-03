import type {
  OnboardingCompleteRequest,
  OnboardingCompleteResponse,
  OnboardingIntro,
  OnboardingMood,
  OnboardingMotivo,
  OnboardingRecommendationResponse,
  OnboardingStep1Request,
  OnboardingStep2Request,
  OnboardingStep3Request,
  OnboardingStepResponse,
  OnboardingTourCompleteRequest,
  OnboardingTourStep,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * onboardingApi — Sprint S4-front.
 *
 * Consumes the 11 endpoints under /api/onboarding/* (Sesión 16 backend).
 * Every method requires auth — the user is redirected to /onboarding by
 * the web middleware right after register/login when their
 * `UserMeResponse.onboardingState.completedAt` and `.skippedAt` are both
 * null.
 */
export const onboardingApi = {
  // Step 0 — Welcome
  getIntro: () => apiClient.get<OnboardingIntro>("/onboarding/intro"),

  skip: () => apiClient.post<{ ok: true }>("/onboarding/skip", {}),

  // Step 1 — Motivos
  getMotivos: () =>
    apiClient.get<{ motivos: OnboardingMotivo[] }>("/onboarding/motivos"),

  saveStep1: (payload: OnboardingStep1Request) =>
    apiClient.post<OnboardingStepResponse>("/onboarding/step1", payload),

  // Step 2 — Mood
  getMoods: () =>
    apiClient.get<{ moods: OnboardingMood[] }>("/onboarding/moods"),

  saveStep2: (payload: OnboardingStep2Request) =>
    apiClient.post<OnboardingStepResponse>("/onboarding/step2", payload),

  // Step 3 — Profile (name + voice preference)
  saveStep3: (payload: OnboardingStep3Request) =>
    apiClient.post<OnboardingStepResponse>("/onboarding/step3", payload),

  // Step 4 — Recommendation
  getRecommendation: () =>
    apiClient.get<OnboardingRecommendationResponse>(
      "/onboarding/recommendation",
    ),

  complete: (payload: OnboardingCompleteRequest) =>
    apiClient.post<OnboardingCompleteResponse>("/onboarding/complete", payload),

  // Post-onboarding tour
  getTour: () =>
    apiClient.get<{ steps: OnboardingTourStep[] }>("/onboarding/tour"),

  completeTour: (payload: OnboardingTourCompleteRequest) =>
    apiClient.post<{ ok: true }>("/onboarding/tour/complete", payload),
};
