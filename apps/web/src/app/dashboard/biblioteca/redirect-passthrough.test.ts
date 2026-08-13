// `api.server.ts` is marked `server-only`, which throws on import outside a
// Server Component. The guard under test is a pure predicate; stubbing the
// marker lets it be exercised without a Next server runtime.
vi.mock("server-only", () => ({}));

import { isNextThrow } from "@/lib/api.server";

/**
 * A rejected session must reach the reader as a redirect, not as an empty shelf.
 *
 * `serverFetch` signals "log in again" by throwing Next's redirect exception,
 * which is an ordinary throw and lands in any `catch`. The Biblioteca page had
 * a blanket one that turned every failure into `books: []` — so an expired
 * session looked exactly like a catalogue with nothing in it, and somebody
 * would sit there wondering where their books went instead of being sent to
 * sign in.
 *
 * The page's own guard is `isNextThrow`; this pins that it tells the two kinds
 * of failure apart, which is the whole basis of the re-throw.
 */
describe("BIBLIOTECA_NEXT_REDIRECT_SWALLOWED", () => {
  it("recognises a Next redirect throw", () => {
    expect(isNextThrow({ digest: "NEXT_REDIRECT;replace;/login;307;" })).toBe(
      true,
    );
    expect(isNextThrow({ digest: "NEXT_NOT_FOUND" })).toBe(true);
  });

  it("does not mistake an ordinary failure for one", () => {
    // These must keep falling through to the empty-catalogue fallback.
    expect(isNextThrow(new Error("fetch failed"))).toBe(false);
    expect(isNextThrow({ statusCode: 500 })).toBe(false);
    expect(isNextThrow(null)).toBe(false);
    expect(isNextThrow("boom")).toBe(false);
  });
});
