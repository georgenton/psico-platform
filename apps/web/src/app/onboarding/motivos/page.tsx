import type { Metadata } from "next";
import type { OnboardingMotivo } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { MotivosPicker } from "@/components/onboarding/MotivosPicker";
import { skipOnboarding } from "@/actions/onboarding";

export const metadata: Metadata = { title: "¿Qué te trae aquí?" };
export const dynamic = "force-dynamic";

export default async function MotivosStep() {
  let motivos: OnboardingMotivo[] = [];
  try {
    const res = await serverFetch<{ motivos: OnboardingMotivo[] }>(
      "/onboarding/motivos",
    );
    motivos = res.motivos;
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  return (
    <OnboardingShell currentStep={1} onSkip={skipOnboarding}>
      <MotivosPicker motivos={motivos} />
    </OnboardingShell>
  );
}
