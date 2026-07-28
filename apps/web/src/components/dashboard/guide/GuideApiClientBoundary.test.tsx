import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";

/**
 * PR #596 — the boundary configures the singleton BEFORE any child mounts.
 *
 * A mocked `apiClient` records the order of `configure` vs a child's mount, and
 * lets us read back the token the boundary installed.
 */

const order: string[] = [];
let installedGetter: (() => string | null) | null = null;
let installedRefresh: (() => string | null) | null = null;

vi.mock("@psico/api-client", () => ({
  apiClient: {
    configure: (
      _base: string,
      store: {
        getAccessToken: () => string | null;
        getRefreshToken: () => string | null;
      },
    ) => {
      order.push("configure");
      installedGetter = store.getAccessToken;
      installedRefresh = store.getRefreshToken;
    },
  },
}));

import { GuideApiClientBoundary } from "./GuideApiClientBoundary";

/** A child that stands in for GuidePlayer: it fires a command on mount. */
function CommandOnMount() {
  useEffect(() => {
    order.push("child-mount");
  }, []);
  return <div data-testid="child" />;
}

beforeEach(() => {
  order.length = 0;
  installedGetter = null;
  installedRefresh = null;
});

describe("GuideApiClientBoundary", () => {
  it("configures the singleton with THIS navigation's token", () => {
    render(
      <GuideApiClientBoundary apiBase="https://api.test" accessToken="token-B">
        <CommandOnMount />
      </GuideApiClientBoundary>,
    );

    expect(installedGetter?.()).toBe("token-B");
    // The refresh cookie is HttpOnly — never handed to the client.
    expect(installedRefresh?.()).toBeNull();
  });

  it("configures BEFORE the child mounts (no command on a stale token)", () => {
    render(
      <GuideApiClientBoundary apiBase="https://api.test" accessToken="token-B">
        <CommandOnMount />
      </GuideApiClientBoundary>,
    );

    // GUIDE_API_CLIENT_CONFIGURED_BEFORE_PLAYER_MOUNT=true
    // GUIDE_COMMANDS_BEFORE_CLIENT_CONFIGURATION=0
    expect(order).toEqual(["configure", "child-mount"]);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("passes a null token through as null, never a guess", () => {
    render(
      <GuideApiClientBoundary apiBase="https://api.test" accessToken={null}>
        <div />
      </GuideApiClientBoundary>,
    );
    expect(installedGetter?.()).toBeNull();
  });
});
