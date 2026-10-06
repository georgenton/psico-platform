/**
 * `assetUrl` absolutizes a stored reference against the ONE configured API
 * origin — §4's requirement that private content never acquire a second origin.
 *
 * The origin is mocked rather than taken from the environment so these assert
 * the helper's contract, not the machine's configuration. `environment.test.ts`
 * is where the origin's own validation lives.
 */
jest.mock("@/config/environment", () => ({
  apiOrigin: () => "https://api-staging.feelverse.app",
}));

import { assetUrl } from "./asset-url";

describe("assetUrl", () => {
  it("absolutizes a relative asset path against the configured API origin", () => {
    // The private-bucket contract: the API returns a path on itself and the
    // client, which knows where the API lives, makes it fetchable.
    expect(assetUrl("/api/content-assets/avatars/abc.png")).toBe(
      "https://api-staging.feelverse.app/api/content-assets/avatars/abc.png",
    );
  });

  it("leaves an absolute third-party URL untouched", () => {
    for (const url of [
      "https://cdn.example.com/cover.png",
      "http://cdn.example.com/cover.png",
      "data:image/png;base64,iVBORw0KGgo=",
    ]) {
      expect(assetUrl(url)).toBe(url);
    }
  });

  it("produces exactly one slash at the join", () => {
    // The old implementation stripped a trailing slash itself. The origin is
    // now normalized upstream, so there is nothing here that could double it —
    // and this is the assertion that would catch a regression to concatenating
    // an unnormalized value.
    const out = assetUrl("/api/content-assets/x.png");
    expect(out).not.toContain("//api/content-assets");
    expect(out.startsWith("https://")).toBe(true);
    expect(out.split("://")[1]!.includes("//")).toBe(false);
  });

  it("never yields a relative URI", () => {
    // What the `?? ""` default used to produce, which React Native cannot
    // resolve: `<Image>` was handed "/api/content-assets/..." and failed.
    expect(assetUrl("/api/content-assets/x.png").startsWith("/")).toBe(false);
  });

  it("passes a non-slash-prefixed value through unchanged", () => {
    expect(assetUrl("cover-token-warm")).toBe("cover-token-warm");
    expect(assetUrl("")).toBe("");
  });
});
