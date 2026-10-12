import type { Metadata } from "next";
import type { UserMeResponse } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { ProfileForm } from "@/components/onboarding/ProfileForm";
import { skipOnboarding } from "@/actions/onboarding";

export const metadata: Metadata = { title: "Tu nombre" };
export const dynamic = "force-dynamic";

/**
 * Registration already asked for a name, so this step confirms rather than
 * asks again. `/user/me` resolves `firstName` from the account itself, and
 * the field stays editable: the name somebody signs up with is not always
 * the one they want read back to them.
 */
function firstNameFrom(me: UserMeResponse | null): string {
  return (me?.user?.firstName ?? "").trim();
}

export default async function ProfileStep() {
  let me: UserMeResponse | null = null;
  try {
    me = await serverFetch<UserMeResponse>("/user/me");
  } catch (err) {
    if (isNextThrow(err)) throw err;
    // An unreachable profile is not a reason to block the step: the field
    // simply starts empty, exactly as it did before.
    me = null;
  }

  return (
    <OnboardingShell currentStep={3} onSkip={skipOnboarding}>
      <ProfileForm initialName={firstNameFrom(me)} />
    </OnboardingShell>
  );
}
