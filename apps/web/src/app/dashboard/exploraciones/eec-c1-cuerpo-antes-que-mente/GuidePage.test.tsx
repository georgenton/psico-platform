import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
// PR5 — the page now resolves Dúo eligibility, which is a `server-only`
// module. That import is a pure in-memory catalog lookup: no fetch, no
// identity, no await. The "no server fetch" guarantee this file exists to hold
// is asserted directly below instead of being inferred from `server-only`
// throwing, which could no longer tell those two kinds of import apart.
vi.mock("server-only", () => ({}));

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
    expect(el).not.toBeInstanceOf(Promise);
    const mod = await import("./page");
    expect(mod.default).toBe(GuidePage);
  });

  it("performs no server fetch and reads no identity", () => {
    // The guarantee, stated against the source rather than inferred from a
    // module throwing. `api.server` is where every authenticated read in this
    // app lives, so naming it is naming the thing that must stay out.
    const src = readFileSync(join(__dirname, "page.tsx"), "utf8");
    for (const forbidden of [
      "api.server",
      "serverFetch",
      "getSessionUser",
      "getAccessToken",
      "next/headers",
    ]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
    // And it stays synchronous: an `async` page would be one awaiting
    // something.
    expect(src).not.toMatch(/export default async function/);
  });
});
