"use server";

import { serverFetch } from "@/lib/api.server";

/**
 * Sprint G-polish — opt-in tour re-trigger.
 *
 * Calls the backend `POST /api/onboarding/tour/reset` which clears
 * `OnboardingState.tourCompletedAt`. Next time the dashboard layout
 * mounts, the `_TourOverlay` predicate (`completedAt && !tourCompletedAt`)
 * is true again, so the tour fires.
 *
 * Discriminated result so the client can show a precise error message
 * instead of a generic one.
 */
export async function replayTourAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await serverFetch<{ ok: true }>("/onboarding/tour/reset", {
      method: "POST",
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No pudimos reiniciar el tour. Reintenta en un momento.",
    };
  }
}
