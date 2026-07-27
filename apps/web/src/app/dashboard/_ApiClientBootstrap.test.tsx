import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

/**
 * PR #596 — the client uses the ROTATED access token.
 *
 * After the middleware refresh handoff, the layout reads the fresh access
 * token from the request cookie and passes it here as a prop. This proves the
 * singleton is configured with a getter that returns exactly that token, so the
 * first Guide/Eco/Tour command after a refresh-only render is authenticated
 * with the rotated token — not the stale one.
 */

const configure = vi.fn();
vi.mock("@psico/api-client", () => ({
  apiClient: {
    configure: (base: string, opts: unknown) => configure(base, opts),
  },
}));

import { ApiClientBootstrap } from "./_ApiClientBootstrap";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ApiClientBootstrap", () => {
  it("configures the client to return the rotated access token", () => {
    render(
      <ApiClientBootstrap
        apiBase="https://api.example.test"
        accessToken="rotated-access-token"
      />,
    );

    expect(configure).toHaveBeenCalledTimes(1);
    const [base, opts] = configure.mock.calls[0]! as [
      string,
      { getAccessToken: () => string | null; getRefreshToken: () => null },
    ];
    expect(base).toBe("https://api.example.test");
    expect(opts.getAccessToken()).toBe("rotated-access-token");
    // The refresh token is HttpOnly and never reaches the bootstrap.
    expect(opts.getRefreshToken()).toBeNull();
  });

  it("surfaces the absence of a token as null, not a guess", () => {
    render(
      <ApiClientBootstrap
        apiBase="https://api.example.test"
        accessToken={null}
      />,
    );
    const [, opts] = configure.mock.calls[0]! as [
      string,
      { getAccessToken: () => string | null },
    ];
    expect(opts.getAccessToken()).toBeNull();
  });
});
