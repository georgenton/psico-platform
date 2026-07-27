import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { apiClient, guideApi } from "@psico/api-client";

import { GuideApiClientBoundary } from "./GuideApiClientBoundary";
import { GUIDE_KEY, GUIDE_VERSION } from "./guide-presentation";

/**
 * PR #596 — end-to-end proof through the REAL `@psico/api-client` singleton.
 *
 * This mocks the NETWORK (`fetch`), never a domain seam, and reproduces the
 * exact stale-token bug: the layout configures the singleton with token A, the
 * middleware rotates A → B, and the first `createGuideSession` must carry B.
 */

let capturedAuth: string[] = [];

function mockFetch() {
  const fn = vi.fn((_url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    capturedAuth.push(headers.get("authorization") ?? "");
    return Promise.resolve(
      new Response(JSON.stringify({ outcome: "created", session: {} }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Stands in for GuidePlayer: fires a Guide command on mount. */
function CommandOnMount() {
  useEffect(() => {
    void guideApi
      .createGuideSession({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        guideKey: GUIDE_KEY,
        guideVersion: GUIDE_VERSION,
      })
      .catch(() => {});
  }, []);
  return null;
}

/** The layout's initial configuration: token A. */
function configureWith(token: string) {
  apiClient.configure("https://api.test", {
    getAccessToken: () => token,
    getRefreshToken: () => null,
    onTokensRefreshed: () => {},
    onUnauthenticated: () => {},
  });
}

beforeEach(() => {
  capturedAuth = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Guide token resync (real apiClient)", () => {
  it("REPRODUCTION: without the boundary the command carries the stale token A", async () => {
    mockFetch();
    configureWith("token-A"); // layout config, never refreshed on soft nav

    render(<CommandOnMount />);

    await waitFor(() => expect(capturedAuth.length).toBe(1));
    // The bug: the first Guide command goes out on the OLD token.
    expect(capturedAuth[0]).toBe("Bearer token-A");
  });

  it("the boundary re-syncs the singleton so the command carries the rotated token B", async () => {
    mockFetch();
    configureWith("token-A"); // stale layout config

    render(
      <GuideApiClientBoundary apiBase="https://api.test" accessToken="token-B">
        <CommandOnMount />
      </GuideApiClientBoundary>,
    );

    await waitFor(() => expect(capturedAuth.length).toBe(1));
    // GUIDE_FIRST_COMMAND_USES_ROTATED_ACCESS=true
    expect(capturedAuth[0]).toBe("Bearer token-B");
    // GUIDE_OLD_ACCESS_TOKEN_REFERENCES=0
    expect(capturedAuth.some((a) => a.includes("token-A"))).toBe(false);
  });
});
