import type { Metadata } from "next";

import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { ProfileForm } from "@/components/onboarding/ProfileForm";
import { skipOnboarding } from "@/actions/onboarding";

export const metadata: Metadata = { title: "Tu nombre" };
export const dynamic = "force-dynamic";

export default function ProfileStep() {
  return (
    <OnboardingShell currentStep={3} onSkip={skipOnboarding}>
      <ProfileForm />
    </OnboardingShell>
  );
}
