import type { Metadata } from "next";
import type { OnboardingMood } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { MoodPicker } from "@/components/onboarding/MoodPicker";
import { skipOnboarding } from "@/actions/onboarding";

export const metadata: Metadata = { title: "¿Cómo te sientes?" };
export const dynamic = "force-dynamic";

export default async function MoodStep() {
  let moods: OnboardingMood[] = [];
  try {
    const res = await serverFetch<{ moods: OnboardingMood[] }>(
      "/onboarding/moods",
    );
    moods = res.moods;
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  return (
    <OnboardingShell currentStep={2} onSkip={skipOnboarding}>
      <MoodPicker moods={moods} />
    </OnboardingShell>
  );
}
