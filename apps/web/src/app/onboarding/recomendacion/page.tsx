import type { Metadata } from "next";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { RecommendationCard } from "@/components/onboarding/RecommendationCard";
import type { IncomingRecommendation } from "@/lib/onboarding/book-access";

export const metadata: Metadata = { title: "Tu primera lectura" };
export const dynamic = "force-dynamic";

/**
 * What arrives, not what the contract promises.
 *
 * `serverFetch<T>` is a cast over an HTTP body: it states an expectation and
 * checks nothing. Naming the expected type `OnboardingRecommendationResponse`
 * here would tell TypeScript that `tierRequired` is always present, which is
 * true of the API in this repository and not true of every API this build can
 * be pointed at — the promotion plan for this change deploys the API first and
 * the Web second, so a Web newer than the API is a state we pass through on
 * purpose. `IncomingRecommendation` leaves the field `unknown`, which is what
 * it is until `resolveBookAccess` looks at it.
 */
interface IncomingRecommendationResponse {
  recommendation: IncomingRecommendation;
  alternatives?: IncomingRecommendation[];
}

export default async function RecommendationStep() {
  let payload: IncomingRecommendationResponse | null = null;
  try {
    payload = await serverFetch<IncomingRecommendationResponse>(
      "/onboarding/recommendation",
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  if (!payload?.recommendation) {
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
        alternatives={payload.alternatives ?? []}
      />
    </OnboardingShell>
  );
}
