"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * OnboardingShell — wraps each step with shared chrome:
 *   - top: progress dots (5 steps total: welcome + 4 questions) + skip
 *   - bottom: nothing — primary CTA lives inside each step component
 *
 * `currentStep` is 0-indexed; 0 = welcome, 1 = motivos, …, 4 = recommendation.
 * `onSkip` is optional; when omitted (e.g. after step 3 when the user is
 * almost done), the skip button is hidden.
 */
export function OnboardingShell({
  currentStep,
  totalSteps = 5,
  onSkip,
  children,
}: {
  currentStep: number;
  totalSteps?: number;
  onSkip?: () => void | Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 pb-10 pt-8 sm:pt-12">
      <header className="mb-8 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-[12px] font-semibold"
          style={{ color: "var(--color-lavender-700)" }}
          aria-label="Saltar al dashboard"
        >
          Psico Platform
        </Link>
        <div className="flex items-center gap-3">
          <div
            className="flex gap-1.5"
            aria-label={`Paso ${currentStep + 1} de ${totalSteps}`}
          >
            {Array.from({ length: totalSteps }).map((_, i) => {
              const filled = i <= currentStep;
              return (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: filled ? 20 : 8,
                    background: filled
                      ? "var(--color-lavender-500)"
                      : "var(--color-warm-200)",
                  }}
                />
              );
            })}
          </div>
          {onSkip ? (
            <button
              type="button"
              onClick={() => void onSkip()}
              className="text-[12px] font-semibold underline-offset-2 hover:underline"
              style={{ color: "var(--color-warm-500)" }}
            >
              Saltar
            </button>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
