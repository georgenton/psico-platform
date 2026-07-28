import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * PR #596 — the singleton is NEVER mutated during render.
 *
 * Client Components still prerender on the server, and concurrent React can
 * repeat or abandon a render — so configuring the singleton has to live in an
 * effect, not in render. A server render must therefore call `configure` zero
 * times, mount no children, and leak no token into the HTML.
 *
 * This test FAILS against a boundary that configures in a `useState`
 * initializer (which runs during `renderToString`).
 */

const configureCalls: unknown[] = [];
vi.mock("@psico/api-client", () => ({
  apiClient: {
    configure: (...args: unknown[]) => {
      configureCalls.push(args);
    },
  },
}));

import { GuideApiClientBoundary } from "./GuideApiClientBoundary";

function TokenLeakingChild() {
  // If this ever mounted on the server, "CHILD" would appear in the HTML.
  return <div data-testid="child">CHILD</div>;
}

beforeEach(() => {
  configureCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GuideApiClientBoundary — server render", () => {
  it("does not configure, mount children, or emit the token on the server", () => {
    const html = renderToString(
      <GuideApiClientBoundary
        apiBase="https://api.example.test"
        accessToken="token-b"
      >
        <TokenLeakingChild />
      </GuideApiClientBoundary>,
    );

    // GUIDE_SERVER_RENDER_CONFIGURE_CALLS=0
    expect(configureCalls).toHaveLength(0);
    // GUIDE_SERVER_RENDER_CHILD_MOUNTS=0
    expect(html).not.toContain("CHILD");
    // GUIDE_SERVER_RENDER_TOKEN_OUTPUT=false
    expect(html).not.toContain("token-b");
    expect(html).not.toContain("Authorization");
    expect(html).not.toContain("Bearer");
    // It renders the closed loading state instead.
    expect(html).toContain("Preparando tu guía");
  });
});
