import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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

/**
 * GR-6 — the mount now renders the ONE canonical player. `GuidePlayer` is gone;
 * the reader panel and this standalone page mount the same `ExperiencePlayer`,
 * which is the property this file protects when it asserts the scope reaches it.
 *
 * Both spies are `vi.hoisted` because the real player pulls `guide-recovery`
 * through its own import graph: a plain `const` would be read by the hoisted
 * mock factory before it is initialised.
 */
const { playerScopes, recoveryRead, experience } = vi.hoisted(() => ({
  playerScopes: [] as (string | undefined)[],
  // If the mount ever read recovery for a null scope, this spy would fire.
  recoveryRead: vi.fn(() => "empty" as const),
  experience: vi.fn(),
}));

vi.mock("../experience/ExperiencePlayer", () => ({
  ExperiencePlayer: ({ actorScope }: { actorScope: string }) => {
    playerScopes.push(actorScope);
    return <div data-testid="guide-player" data-scope={actorScope} />;
  },
}));

vi.mock("./guide-recovery", () => ({
  guideRecoveryState: recoveryRead,
}));

// GR-6 — the journey is SERVER-owned: the mount asks discovery for it and can
// only play what comes back. Faking the hook here is faking the API response.
vi.mock("../experience/use-chapter-experience", () => ({
  useChapterExperience: (input: { enabled: boolean }) => experience(input),
}));

import { GuidePlayerMount } from "./GuidePlayerMount";
import { GuideActorScopeProvider } from "./guide-actor-scope";
import { GuideAvailabilityProvider } from "./guide-availability";
import { EEC_EXPERIENCE } from "./guide-test-fixtures";

const SCOPE = "S".repeat(43);

beforeEach(() => {
  playerScopes.length = 0;
  recoveryRead.mockClear();
  experience.mockReset();
  experience.mockReturnValue({ status: "ready", definition: EEC_EXPERIENCE });
});

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
    render(mount(null));

    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/no pudimos preparar tu guía/i),
    ).toBeInTheDocument();
    // The player never mounts, so recovery is never read for an unknown actor.
    expect(recoveryRead).not.toHaveBeenCalled();
  });

  it("shows the not-available card (with a way back) when the pilot gate is closed", () => {
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

  it("shows no stale content while discovery is still loading", () => {
    experience.mockReturnValue({ status: "loading", definition: null });
    render(mount(SCOPE));

    // Not a player, and not the previous reader's journey either: with no
    // definition there is nothing this build may legitimately draw.
    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(screen.queryByText(EEC_EXPERIENCE.title)).toBeNull();
  });

  it("fails closed when discovery answers with no experience for this pin", () => {
    experience.mockReturnValue({ status: "ready", definition: null });
    render(mount(SCOPE));

    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/no pudimos preparar tu guía/i),
    ).toBeInTheDocument();
  });

  it("does not even ask discovery when a gate is closed", () => {
    render(mount(SCOPE, false));
    expect(experience).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );

    cleanup();
    experience.mockClear();
    render(mount(null));
    expect(experience).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
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
