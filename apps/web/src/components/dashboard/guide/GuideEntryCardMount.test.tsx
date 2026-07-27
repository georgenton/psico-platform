import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * CC-7.5 / PR #596 — the entry-card mount reads the scope from context.
 *
 * With a resumable record for THIS account the CTA says "Continuar"; with no
 * scope (identity unresolved) it fails closed to "Empezar" — it never promises
 * to resume a run it cannot attribute.
 */

const recoveryState = vi.fn();
vi.mock("./guide-recovery", () => ({
  guideRecoveryState: (scope: string) => recoveryState(scope),
}));

import { GuideEntryCardMount } from "./GuideEntryCardMount";
import { GuideActorScopeProvider } from "./guide-actor-scope";
import { GUIDE_PRESENTATION } from "./guide-presentation";

const SCOPE = "E".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  recoveryState.mockReturnValue("empty");
});

describe("GuideEntryCardMount", () => {
  it("says Continuar for a resumable record under this scope", () => {
    recoveryState.mockReturnValue("valid");
    render(
      <GuideActorScopeProvider scope={SCOPE}>
        <GuideEntryCardMount />
      </GuideActorScopeProvider>,
    );

    expect(recoveryState).toHaveBeenCalledWith(SCOPE);
    expect(
      screen.getByText(GUIDE_PRESENTATION.labels.resume),
    ).toBeInTheDocument();
  });

  it("fails closed to Empezar with no scope, never reading storage", () => {
    render(
      <GuideActorScopeProvider scope={null}>
        <GuideEntryCardMount />
      </GuideActorScopeProvider>,
    );

    // A null scope is treated as "empty" WITHOUT a storage read.
    expect(recoveryState).not.toHaveBeenCalled();
    expect(
      screen.getByText(GUIDE_PRESENTATION.labels.start),
    ).toBeInTheDocument();
  });
});
