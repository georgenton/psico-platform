"use client";

import { useCallback, useEffect, useState } from "react";
import { onboardingApi } from "@psico/api-client";
import type { OnboardingTourStep } from "@psico/types";

/**
 * TourOverlay — Sprint S37 (web).
 *
 * Post-onboarding overlay that points at the sidebar items so the user
 * can find Diario, Eco, Patrones in their first session. Mounts on top
 * of the dashboard when `me.onboardingState.completedAt !== null &&
 * tourCompletedAt === null` (decided at the layout level).
 *
 * Design (`docs/design/handoff/01-onboarding.md` §Tour):
 * - Steps are fetched from `GET /api/onboarding/tour` (server-owned catalog).
 * - Each step has a semantic `target` ("inicio"/"biblioteca"/"diario"/"eco"/
 *   "patrones") matching the `data-tour-target` attribute on each sidebar
 *   `<Link>`.
 * - "Saltar" + "Terminar" both POST `/api/onboarding/tour/complete` with
 *   the count of steps the user actually saw. We persist this count for
 *   funnel analytics (see Pulso v2).
 *
 * UX choices:
 * - Backdrop dims everything except the target nav item (clip-path window).
 * - Coachmark card floats next to the target (right side on desktop, below
 *   on mobile when sidebar is hidden — we fall back to a centered modal).
 * - Failure to fetch / failure to find target: silent dismiss. Tour is
 *   optional (per design §Estados).
 */
export function TourOverlay() {
  const [steps, setSteps] = useState<OnboardingTourStep[] | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Fetch the catalog once on mount. The server already sorts by `order`.
  useEffect(() => {
    let cancelled = false;
    onboardingApi
      .getTour()
      .then((res) => {
        if (!cancelled && res.steps.length > 0) {
          setSteps(res.steps);
        } else if (!cancelled) {
          setDismissed(true);
        }
      })
      .catch(() => {
        // Tour is non-critical; design says "Error: ignorable".
        if (!cancelled) setDismissed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Locate the target nav item in the DOM whenever the step changes or the
  // viewport resizes. We re-measure on resize because the sidebar layout
  // shifts at the `lg` breakpoint.
  const recomputeTarget = useCallback(() => {
    if (!steps) return;
    const step = steps[stepIdx];
    if (!step) return;
    const el = document.querySelector<HTMLElement>(
      `[data-tour-target="${step.target}"]`,
    );
    setTargetRect(el ? el.getBoundingClientRect() : null);
  }, [steps, stepIdx]);

  useEffect(() => {
    recomputeTarget();
  }, [recomputeTarget]);

  useEffect(() => {
    window.addEventListener("resize", recomputeTarget);
    return () => window.removeEventListener("resize", recomputeTarget);
  }, [recomputeTarget]);

  const close = useCallback(
    async (completedFully: boolean) => {
      setDismissed(true);
      try {
        await onboardingApi.completeTour({
          stepsCompleted: completedFully ? (steps?.length ?? 0) : stepIdx,
        });
      } catch {
        // Network failure is OK — onboardingState is best-effort.
      }
    },
    [steps, stepIdx],
  );

  if (dismissed || !steps) return null;
  const step = steps[stepIdx];
  if (!step) return null;

  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;

  // Coachmark positioning: right of the sidebar (which is fixed-width 240px
  // at the `lg` breakpoint). If we found the target, anchor vertically to
  // its top; otherwise center on screen.
  const coachStyle: React.CSSProperties = targetRect
    ? {
        position: "fixed",
        top: Math.max(
          16,
          Math.min(targetRect.top - 8, window.innerHeight - 280),
        ),
        left: 256,
        maxWidth: 360,
        zIndex: 60,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: 360,
        zIndex: 60,
      };

  return (
    <>
      {/* Backdrop. We don't `pointer-events: none` it — clicking outside
          counts as a dismissal-with-skip just like the Saltar button. */}
      <div
        className="fixed inset-0 z-40 bg-black/55 transition-opacity"
        onClick={() => void close(false)}
        aria-hidden
      />

      {/* Spotlight ring around the target nav item, if found. Pointer
          events go through so a determined user can still click the item. */}
      {targetRect ? (
        <div
          className="fixed z-50 rounded-xl"
          aria-hidden
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow:
              "0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px var(--color-lavender-400)",
            pointerEvents: "none",
            background: "transparent",
          }}
        />
      ) : null}

      {/* Coachmark card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        className="rounded-2xl bg-white p-5 shadow-2xl"
        style={coachStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-500)" }}
        >
          Paso {stepIdx + 1} de {steps.length}
        </p>
        <h3
          id="tour-step-title"
          className="mt-1 text-[18px] font-bold leading-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {step.title}
        </h3>
        <p
          className="mt-2 text-[13.5px] leading-relaxed"
          style={{ color: "var(--color-warm-600)" }}
        >
          {step.body}
        </p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void close(false)}
            className="text-[12px] font-semibold underline-offset-4 hover:underline"
            style={{ color: "var(--color-warm-500)" }}
          >
            Saltar tour
          </button>

          <div className="flex items-center gap-1.5">
            {!isFirst ? (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  borderColor: "var(--color-warm-200)",
                  color: "var(--color-warm-700)",
                }}
              >
                Anterior
              </button>
            ) : null}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStepIdx((i) => i + 1)}
                className="rounded-xl px-3.5 py-1.5 text-[12px] font-semibold text-white"
                style={{ background: "var(--color-lavender-500)" }}
              >
                Siguiente
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void close(true)}
                className="rounded-xl px-3.5 py-1.5 text-[12px] font-semibold text-white"
                style={{ background: "var(--color-lavender-500)" }}
              >
                Terminar
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
