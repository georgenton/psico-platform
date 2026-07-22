import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * CC-7.5 — the guide route resolves its actor, and nothing else.
 *
 * The page has exactly one responsibility worth pinning: turning the
 * AUTHENTICATED user into an opaque scope, without ever letting the raw
 * identity reach the rendered markup.
 *
 * `/user/me` is the source rather than the decoded access cookie because the
 * access token expires in 15 minutes while the session lives 30 days — the
 * fetcher refreshes across that gap, a cookie read cannot.
 */

const { serverFetch, deriveGuideRecoveryActorScope } = vi.hoisted(() => ({
  serverFetch: vi.fn(),
  deriveGuideRecoveryActorScope: vi.fn(),
}));

vi.mock("@/lib/api.server", () => ({ serverFetch }));
vi.mock("@/lib/guide-recovery-scope.server", () => ({
  deriveGuideRecoveryActorScope,
}));

// The player owns the whole lifecycle and has its own suite; here we only care
// about the single prop it receives.
const playerProps = vi.fn();
vi.mock("@/components/dashboard/guide/GuidePlayer", () => ({
  GuidePlayer: (props: Record<string, unknown>) => {
    playerProps(props);
    return <div data-testid="guide-player" />;
  },
}));

import GuidePage from "./page";

const SCOPE_A = "A".repeat(43);
const USER_ID = "cmb0alphaid001";
const EMAIL = "alpha@example.test";
const ACCESS = "header.payload.signature";

beforeEach(() => {
  vi.clearAllMocks();
  deriveGuideRecoveryActorScope.mockReturnValue(SCOPE_A);
  serverFetch.mockResolvedValue({
    user: { id: USER_ID, email: EMAIL },
    // Real `/user/me` carries more than the id; none of it may leak either.
    cryptoSalt: "c2FsdHNhbHRzYWx0c2E",
    accessToken: ACCESS,
  });
});

describe("GuidePage", () => {
  it("derives the scope from the authenticated user", async () => {
    render(await GuidePage());

    expect(serverFetch).toHaveBeenCalledTimes(1);
    expect(serverFetch).toHaveBeenCalledWith("/user/me");
    expect(deriveGuideRecoveryActorScope).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByTestId("guide-player")).toBeInTheDocument();
  });

  it("hands the player the scope and nothing else", async () => {
    render(await GuidePage());

    expect(playerProps).toHaveBeenCalledTimes(1);
    const props = playerProps.mock.calls[0]![0] as Record<string, unknown>;
    expect(props).toEqual({ actorScope: SCOPE_A });
  });

  it("never renders the raw identity or a token", async () => {
    render(await GuidePage());

    const markup = document.body.innerHTML;
    for (const secret of [USER_ID, EMAIL, ACCESS]) {
      expect(markup).not.toContain(secret);
    }
  });

  it("renders without a cookie decoder in reach", async () => {
    // The mocked `@/lib/api.server` exposes ONLY `serverFetch`, so a page that
    // still called `getSessionUser()` would throw here rather than pass. A
    // refresh-only session (access cookie expired, refresh alive) must reach
    // the guide: `serverFetch` refreshes, and applies the global logout
    // convention when it truly cannot. Sending it to /login instead would
    // bounce off the middleware straight back to /dashboard.
    // The source-level ban on the import lives in the ratchet.
    await expect(GuidePage()).resolves.toBeDefined();
  });
});
