import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * CC-7.5 / PR #596 — the player mount reads the actor scope from context.
 *
 * The Guide page is now identity-free: the layout resolves the scope once and
 * publishes it through `GuideActorScopeProvider`. The mount reads it and fails
 * closed when it is absent — never mounting the player, never touching storage.
 */

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

const SCOPE = "S".repeat(43);

describe("GuidePlayerMount", () => {
  it("mounts the player with the scope from context", () => {
    render(
      <GuideActorScopeProvider scope={SCOPE}>
        <GuidePlayerMount />
      </GuideActorScopeProvider>,
    );

    const player = screen.getByTestId("guide-player");
    expect(player).toHaveAttribute("data-scope", SCOPE);
    expect(playerScopes.at(-1)).toBe(SCOPE);
  });

  it("fails closed with no scope: no player, no storage read", () => {
    recoveryRead.mockClear();
    render(
      <GuideActorScopeProvider scope={null}>
        <GuidePlayerMount />
      </GuideActorScopeProvider>,
    );

    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/no pudimos preparar tu guía/i),
    ).toBeInTheDocument();
    // The player never mounts, so recovery is never read for an unknown actor.
    expect(recoveryRead).not.toHaveBeenCalled();
  });

  it("fails closed when there is no provider at all", () => {
    render(<GuidePlayerMount />);
    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/vuelve a intentarlo en un momento/i),
    ).toBeInTheDocument();
  });
});
