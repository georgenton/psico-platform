import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * PR #596 — the Exploraciones template re-syncs the token, and nothing else.
 *
 * It reads the CURRENT access cookie (post-middleware) and hands it to the
 * client boundary. It resolves no identity: no `/user/me`, no actorScope, no
 * refresh token.
 */

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn() }));
vi.mock("@/lib/api.server", () => ({ getAccessToken }));

const boundaryProps = vi.fn();
vi.mock("@/components/dashboard/guide/GuideApiClientBoundary", () => ({
  GuideApiClientBoundary: ({
    apiBase,
    accessToken,
    children,
  }: {
    apiBase: string;
    accessToken: string | null;
    children: React.ReactNode;
  }) => {
    boundaryProps({ apiBase, accessToken });
    return <div data-testid="boundary">{children}</div>;
  },
}));

import ExploracionesTemplate from "./template";

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockReturnValue("token-current");
});

describe("ExploracionesTemplate", () => {
  it("reads the current access token and passes it to the boundary", () => {
    render(
      <ExploracionesTemplate>
        {<div data-testid="page" />}
      </ExploracionesTemplate>,
    );

    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const props = boundaryProps.mock.calls[0]![0] as {
      apiBase: string;
      accessToken: string | null;
    };
    expect(props.accessToken).toBe("token-current");
    expect(props.apiBase).toMatch(/^https?:\/\//);
    // The template wraps its children, which stay reachable.
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("passes a null token through when there is none", () => {
    getAccessToken.mockReturnValue(null);
    render(<ExploracionesTemplate>{<div />}</ExploracionesTemplate>);
    const props = boundaryProps.mock.calls[0]![0] as {
      accessToken: string | null;
    };
    expect(props.accessToken).toBeNull();
  });
});
