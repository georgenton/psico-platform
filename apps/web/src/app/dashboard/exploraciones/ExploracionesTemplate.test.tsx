import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * PR #596 / CC-7.R1 — the Exploraciones template re-syncs the token AND
 * resolves the pilot availability, and nothing else.
 *
 * It reads the CURRENT access cookie (post-middleware) and hands it to the
 * client boundary, and it fetches `GET /api/guide/availability` with the actor's
 * token to publish the opaque boolean. It resolves no identity: no `/user/me`,
 * no actorScope, no refresh token. Any availability failure fails CLOSED.
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
    children: ReactNode;
  }) => {
    boundaryProps({ apiBase, accessToken });
    return <div data-testid="boundary">{children}</div>;
  },
}));

const availabilityProps = vi.fn();
vi.mock("@/components/dashboard/guide/guide-availability", () => ({
  GuideAvailabilityProvider: ({
    available,
    children,
  }: {
    available: boolean;
    children: ReactNode;
  }) => {
    availabilityProps({ available });
    return <div data-testid="availability">{children}</div>;
  },
}));

import ExploracionesTemplate from "./template";

/** The template is an async Server Component: resolve it, then render the tree. */
async function renderTemplate(children: ReactNode) {
  const element = await ExploracionesTemplate({ children });
  return render(element);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockReturnValue("token-current");
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ available: true }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExploracionesTemplate", () => {
  it("reads the current access token and passes it to the boundary", async () => {
    await renderTemplate(<div data-testid="page" />);

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

  it("resolves availability with a no-store bearer fetch and publishes it", async () => {
    await renderTemplate(<div />);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toMatch(/\/api\/guide\/availability$/);
    expect(init.cache).toBe("no-store");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-current",
    );
    expect(availabilityProps.mock.calls[0]![0]).toEqual({ available: true });
  });

  it("fails closed to available:false when the fetch is not ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await renderTemplate(<div />);
    expect(availabilityProps.mock.calls[0]![0]).toEqual({ available: false });
  });

  it("fails closed and does NOT fetch when there is no token", async () => {
    getAccessToken.mockReturnValue(null);
    await renderTemplate(<div />);

    const props = boundaryProps.mock.calls[0]![0] as {
      accessToken: string | null;
    };
    expect(props.accessToken).toBeNull();
    // No token → no availability probe, and the gate is closed.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(availabilityProps.mock.calls[0]![0]).toEqual({ available: false });
  });

  it("fails closed when the fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    await renderTemplate(<div />);
    expect(availabilityProps.mock.calls[0]![0]).toEqual({ available: false });
  });
});
