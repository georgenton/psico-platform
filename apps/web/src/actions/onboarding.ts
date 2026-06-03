"use server";

import { redirect } from "next/navigation";
import { serverFetch } from "@/lib/api.server";
import type {
  OnboardingCompleteRequest,
  OnboardingCompleteResponse,
  OnboardingStep1Request,
  OnboardingStep2Request,
  OnboardingStep3Request,
  OnboardingStepResponse,
  OnboardingTourCompleteRequest,
} from "@psico/types";

/**
 * Server actions for the onboarding flow.
 *
 * Each action calls the corresponding /api/onboarding/* endpoint and then
 * uses Next.js `redirect()` to advance the user to the next step. We do
 * this server-side so the page is never in a "saved-but-still-on-old-step"
 * limbo state.
 */

export async function skipOnboarding() {
  await serverFetch<{ ok: true }>("/onboarding/skip", {
    method: "POST",
    body: {},
  });
  redirect("/dashboard");
}

export async function saveStep1(payload: OnboardingStep1Request) {
  await serverFetch<OnboardingStepResponse>("/onboarding/step1", {
    method: "POST",
    body: payload,
  });
  redirect("/onboarding/mood");
}

export async function saveStep2(payload: OnboardingStep2Request) {
  await serverFetch<OnboardingStepResponse>("/onboarding/step2", {
    method: "POST",
    body: payload,
  });
  redirect("/onboarding/perfil");
}

export async function saveStep3(payload: OnboardingStep3Request) {
  await serverFetch<OnboardingStepResponse>("/onboarding/step3", {
    method: "POST",
    body: payload,
  });
  redirect("/onboarding/recomendacion");
}

export async function completeOnboarding(payload: OnboardingCompleteRequest) {
  const res = await serverFetch<OnboardingCompleteResponse>(
    "/onboarding/complete",
    {
      method: "POST",
      body: payload,
    },
  );
  // The backend tells us where to go — `/dashboard?tour=1` if the tour is
  // pending, the chosen book reader if they picked one, etc.
  redirect(res.redirectTo);
}

export async function markTourComplete(payload: OnboardingTourCompleteRequest) {
  await serverFetch<{ ok: true }>("/onboarding/tour/complete", {
    method: "POST",
    body: payload,
  });
}
