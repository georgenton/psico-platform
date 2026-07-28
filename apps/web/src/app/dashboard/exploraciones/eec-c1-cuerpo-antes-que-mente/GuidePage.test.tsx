import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * CC-7.5 / PR #596 — the guide route is identity-free.
 *
 * The page renders only the client mount; the actor scope comes from the
 * dashboard layout's context. There is NO server fetch and NO cookie decode
 * here — a refresh-only session reaches the guide because the middleware
 * already renewed the pair before this render.
 */

vi.mock("@/components/dashboard/guide/GuidePlayerMount", () => ({
  GuidePlayerMount: () => <div data-testid="guide-player-mount" />,
}));

import GuidePage from "./page";

describe("GuidePage", () => {
  it("renders the player mount and nothing else", () => {
    render(GuidePage());
    expect(screen.getByTestId("guide-player-mount")).toBeInTheDocument();
  });

  it("is a synchronous, identity-free page", async () => {
    // No await, no fetch: calling it returns the element directly.
    const el = GuidePage();
    expect(el).toBeDefined();
    // `api.server` (serverFetch / getSessionUser) is never imported here — if
    // it were, this `server-only` module would throw on import in the test env.
    const mod = await import("./page");
    expect(mod.default).toBe(GuidePage);
  });
});
