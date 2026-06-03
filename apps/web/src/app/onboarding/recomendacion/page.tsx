import type { Metadata } from "next";
import type { OnboardingRecommendationResponse } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { RecommendationCard } from "@/components/onboarding/RecommendationCard";

export const metadata: Metadata = { title: "Tu primera lectura" };
export const dynamic = "force-dynamic";

export default async function RecommendationStep() {
  let payload: OnboardingRecommendationResponse | null = null;
  try {
    payload = await serverFetch<OnboardingRecommendationResponse>(
      "/onboarding/recommendation",
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  if (!payload) {
    return (
      <OnboardingShell currentStep={4}>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-[13px]" style={{ color: "var(--color-warm-500)" }}>
            No pudimos cargar la recomendación. Reintenta más tarde desde la
            biblioteca.
          </p>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell currentStep={4}>
      <RecommendationCard
        primary={payload.recommendation}
        alternatives={payload.alternatives}
      />
    </OnboardingShell>
  );
}
