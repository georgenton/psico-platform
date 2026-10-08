import { describe, expect, it } from "vitest";

import { resolveOnboardingGate } from "./gate";

/**
 * The gate that decides, on every dashboard navigation, whether somebody is
 * sent back to the onboarding and whether the tour fires.
 *
 * Enumerated rather than sampled: the rule reads three nullable timestamps,
 * which is eight combinations plus the no-row case, and the interesting ones
 * are the contradictions — skipped AND completed, a tour marked done on a
 * flow that was never finished — because those are what a half-written row or
 * a replayed request actually produces.
 */

const T = "2026-10-08T12:00:00.000Z";

describe("resolveOnboardingGate", () => {
  it("usuario nuevo, sin fila todavía: al onboarding", () => {
    expect(resolveOnboardingGate(null)).toEqual({
      kind: "redirect",
      to: "/onboarding",
    });
    expect(resolveOnboardingGate(undefined)).toEqual({
      kind: "redirect",
      to: "/onboarding",
    });
  });

  it("fila a medias, sin decidir: al onboarding", () => {
    // Started the flow and left — step rows exist, no outcome yet.
    expect(
      resolveOnboardingGate({
        completedAt: null,
        skippedAt: null,
        tourCompletedAt: null,
      }),
    ).toEqual({ kind: "redirect", to: "/onboarding" });
    // An empty object is the same person.
    expect(resolveOnboardingGate({})).toEqual({
      kind: "redirect",
      to: "/onboarding",
    });
  });

  it("quien acaba de completarlo: al panel, con tour", () => {
    expect(
      resolveOnboardingGate({ completedAt: T, tourCompletedAt: null }),
    ).toEqual({ kind: "dashboard", showTour: true });
  });

  it("quien salta el onboarding: al panel, SIN tour", () => {
    // Skipping is a decision about being walked through the product. Handing
    // them a five-step walkthrough is the same interruption they declined.
    expect(
      resolveOnboardingGate({
        completedAt: null,
        skippedAt: T,
        tourCompletedAt: null,
      }),
    ).toEqual({ kind: "dashboard", showTour: false });
  });

  it("sesión reanudada tras haber visto el tour: al panel, sin repetirlo", () => {
    expect(
      resolveOnboardingGate({ completedAt: T, tourCompletedAt: T }),
    ).toEqual({ kind: "dashboard", showTour: false });
  });

  it("quien saltó y ya vio el tour alguna vez: sigue sin tour", () => {
    expect(resolveOnboardingGate({ skippedAt: T, tourCompletedAt: T })).toEqual(
      { kind: "dashboard", showTour: false },
    );
  });

  // ── contradictions, which rows really do contain ────────────────────────

  it("completado Y saltado: completar manda, así que el tour se muestra", () => {
    // Reachable by completing after an earlier skip. Treating this as "no
    // tour" would punish the stronger signal of the two.
    expect(resolveOnboardingGate({ completedAt: T, skippedAt: T })).toEqual({
      kind: "dashboard",
      showTour: true,
    });
  });

  it("tour marcado pero onboarding sin terminar: al onboarding, no al tour", () => {
    // A tour cannot have been finished on a flow that was never finished;
    // the undecided onboarding is the fact that matters.
    expect(
      resolveOnboardingGate({
        completedAt: null,
        skippedAt: null,
        tourCompletedAt: T,
      }),
    ).toEqual({ kind: "redirect", to: "/onboarding" });
  });

  it("acepta Date igual que la cadena ISO", () => {
    // `/user/me` is typed as strings, but a server-side caller may hand over
    // hydrated Dates. Both are "present".
    expect(
      resolveOnboardingGate({
        completedAt: new Date(T),
        tourCompletedAt: null,
      }),
    ).toEqual({ kind: "dashboard", showTour: true });
  });

  it("nunca muestra el tour a quien se va redirigido", () => {
    // Belt and braces over the whole truth table: the two outcomes are
    // exclusive, so no combination may both redirect and ask for the tour.
    const stamps = [null, T];
    for (const completedAt of stamps) {
      for (const skippedAt of stamps) {
        for (const tourCompletedAt of stamps) {
          const gate = resolveOnboardingGate({
            completedAt,
            skippedAt,
            tourCompletedAt,
          });
          if (gate.kind === "redirect") {
            expect(gate.to).toBe("/onboarding");
          } else {
            expect(typeof gate.showTour).toBe("boolean");
          }
        }
      }
    }
  });
});
