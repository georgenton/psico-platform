import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * CC-7.5 / PR #596 / CC-7.R1 — the player mount reads the actor scope AND the
 * pilot availability from context.
 *
 * The Guide page is identity-free: the layout resolves the scope once and
 * publishes it through `GuideActorScopeProvider`, and the Exploraciones
 * template publishes the pilot boolean through `GuideAvailabilityProvider`. The
 * mount reads both and fails closed on either — never mounting the player,
 * never touching storage — availability first.
 */

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const playerScopes: (string | undefined)[] = [];
vi.mock("./GuidePlayer", () => ({
  GuidePlayer: ({ actorScope }: { actorScope: string }) => {
    playerScopes.push(actorScope);
    return <div data-testid="guide-player" data-scope={actorScope} />;
  },
}));

// If the mount ever read recovery for a null scope, this spy would fire.
const recoveryRead = vi.fn(() => "empty" as const);
vi.mock("./guide-recovery", () => ({
  guideRecoveryState: recoveryRead,
}));

import { GuidePlayerMount } from "./GuidePlayerMount";
import { GuideActorScopeProvider } from "./guide-actor-scope";
import { GuideAvailabilityProvider } from "./guide-availability";

const SCOPE = "S".repeat(43);

/** Both providers — availability defaults to `true` unless overridden. */
function mount(scope: string | null, available = true): ReactNode {
  return (
    <GuideAvailabilityProvider available={available}>
      <GuideActorScopeProvider scope={scope}>
        <GuidePlayerMount />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>
  );
}

describe("GuidePlayerMount", () => {
  it("mounts the player with the scope from context when available", () => {
    render(mount(SCOPE));

    const player = screen.getByTestId("guide-player");
    expect(player).toHaveAttribute("data-scope", SCOPE);
    expect(playerScopes.at(-1)).toBe(SCOPE);
  });

  it("fails closed with no scope: no player, no storage read", () => {
    recoveryRead.mockClear();
    render(mount(null));

    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/no pudimos preparar tu guía/i),
    ).toBeInTheDocument();
    // The player never mounts, so recovery is never read for an unknown actor.
    expect(recoveryRead).not.toHaveBeenCalled();
  });

  it("shows the not-available card (with a way back) when the pilot gate is closed", () => {
    recoveryRead.mockClear();
    // Availability is checked BEFORE the scope — even with a valid scope, a
    // closed gate never mounts the player.
    render(mount(SCOPE, false));

    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/esta guía no está disponible por ahora/i),
    ).toBeInTheDocument();
    const back = screen.getByText(/volver a exploraciones/i);
    expect(back).toHaveAttribute("href", "/dashboard/exploraciones");
    expect(recoveryRead).not.toHaveBeenCalled();
  });

  it("fails closed when there is no provider at all", () => {
    // Both contexts default: availability false → the not-available card.
    render(<GuidePlayerMount />);
    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/esta guía no está disponible por ahora/i),
    ).toBeInTheDocument();
  });
});
