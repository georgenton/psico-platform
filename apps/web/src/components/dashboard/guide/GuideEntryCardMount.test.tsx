import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * CC-7.5 / PR #596 / CC-7.R1 — the entry-card mount reads the scope AND the
 * pilot availability from context.
 *
 * With a resumable record for THIS account the CTA says "Continuar"; with no
 * scope (identity unresolved) it fails closed to "Empezar" — it never promises
 * to resume a run it cannot attribute. And when the server-owned pilot gate is
 * closed, the card is hidden entirely.
 */

const recoveryState = vi.fn();
vi.mock("./guide-recovery", () => ({
  guideRecoveryState: (scope: string) => recoveryState(scope),
}));

/**
 * B3 — la tarjeta pregunta al servidor si todavía se puede empezar. Aquí se
 * fija la respuesta en «sí», que es el mundo que estas pruebas describían
 * cuando se escribieron; el «no» tiene las suyas en `GuideEntryCard.test`.
 */
/**
 * B4 — el rótulo lo decide el servidor. El doble respeta `enabled` porque el
 * real lo hace: sin identidad no se pregunta, y entonces no hay respuesta que
 * pueda prometer «Continuar».
 */
vi.mock("./use-guide-own-state", () => ({
  useGuideOwnState: (_pin: unknown, enabled: boolean) =>
    enabled
      ? { status: "ready", state: "ACTIVE", session: null }
      : { status: "loading", state: null, session: null },
}));

vi.mock("../experience/use-chapter-experience", async () => {
  const { EEC_EXPERIENCE } = await import("./guide-test-fixtures");
  return {
    useChapterExperience: () => ({
      status: "ready",
      definition: { ...EEC_EXPERIENCE, startable: true },
      items: [],
    }),
  };
});

import { GuideEntryCardMount } from "./GuideEntryCardMount";
import { GuideActorScopeProvider } from "./guide-actor-scope";
import { GuideAvailabilityProvider } from "./guide-availability";
import { EEC_PRESENTATION as GUIDE_PRESENTATION } from "./guide-test-fixtures";

const SCOPE = "E".repeat(43);

/** Both providers — availability defaults to `true` unless a test overrides it. */
function mount(scope: string | null, available = true): ReactNode {
  return (
    <GuideAvailabilityProvider available={available}>
      <GuideActorScopeProvider scope={scope}>
        <GuideEntryCardMount />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  recoveryState.mockReturnValue("empty");
});

describe("GuideEntryCardMount", () => {
  it("says Continuar for a resumable record under this scope", () => {
    recoveryState.mockReturnValue("valid");
    render(mount(SCOPE));

    expect(recoveryState).toHaveBeenCalledWith(SCOPE);
    expect(
      screen.getByText(GUIDE_PRESENTATION.labels.resume),
    ).toBeInTheDocument();
  });

  it("fails closed to Empezar with no scope, never reading storage", () => {
    render(mount(null));

    // A null scope is treated as "empty" WITHOUT a storage read.
    expect(recoveryState).not.toHaveBeenCalled();
    expect(
      screen.getByText(GUIDE_PRESENTATION.labels.start),
    ).toBeInTheDocument();
  });

  it("renders NOTHING when the pilot gate is closed", () => {
    const { container } = render(mount(SCOPE, false));

    // No card, and no storage read — the guide is simply not offered.
    expect(container).toBeEmptyDOMElement();
    expect(recoveryState).not.toHaveBeenCalled();
    expect(
      screen.queryByText(GUIDE_PRESENTATION.labels.resume),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(GUIDE_PRESENTATION.labels.start),
    ).not.toBeInTheDocument();
  });
});
