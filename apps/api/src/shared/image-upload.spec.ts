import { describe, expect, it } from "vitest";
import { isTrustedImageUrl } from "./image-upload";

/**
 * Which image URLs a published chapter may point at.
 *
 * Content Studio has no "paste a URL" field, so every legitimate image is one we
 * uploaded. The attack this closes is an ADMIN with curl aiming the reader at a
 * host we do not control — which hands that host a log of who read what.
 */

const BASE = "https://assets.example.com";

describe("isTrustedImageUrl", () => {
  it("accepts an asset from the configured origin", () => {
    expect(
      isTrustedImageUrl(`${BASE}/content/libro/chapter-1/images/ab.png`, BASE),
    ).toBe(true);
  });

  it("rejects a lookalike host that merely STARTS with ours", () => {
    // The whole reason this compares parsed origins: a naive
    // startsWith(base) accepts every one of these.
    for (const evil of [
      "https://assets.example.com.attacker.test/x.png",
      "https://assets.example.com.evil/x.png",
      "https://assets.example.commercial/x.png",
    ]) {
      expect(isTrustedImageUrl(evil, BASE)).toBe(false);
    }
  });

  it("rejects a different host entirely", () => {
    expect(isTrustedImageUrl("https://untrusted.example/x.png", BASE)).toBe(
      false,
    );
  });

  it("rejects plain http, even from our own host", () => {
    expect(isTrustedImageUrl("http://assets.example.com/x.png", BASE)).toBe(
      false,
    );
  });

  it("rejects a userinfo trick pointing elsewhere", () => {
    // Parses as host `attacker.test`, with our domain only as credentials.
    expect(
      isTrustedImageUrl("https://assets.example.com@attacker.test/x.png", BASE),
    ).toBe(false);
  });

  it("rejects non-http schemes", () => {
    for (const evil of [
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "file:///etc/passwd",
    ]) {
      expect(isTrustedImageUrl(evil, BASE)).toBe(false);
    }
  });

  it("rejects a different port on the same host", () => {
    expect(
      isTrustedImageUrl("https://assets.example.com:8443/x.png", BASE),
    ).toBe(false);
  });

  it("rejects unparseable input instead of throwing", () => {
    expect(isTrustedImageUrl("", BASE)).toBe(false);
    expect(isTrustedImageUrl("not a url", BASE)).toBe(false);
    expect(isTrustedImageUrl(`${BASE}/x.png`, "not a url")).toBe(false);
  });

  describe("when the configured base carries a path prefix", () => {
    const PREFIXED = "https://assets.example.com/media";

    it("accepts something under the prefix", () => {
      expect(isTrustedImageUrl(`${PREFIXED}/content/x.png`, PREFIXED)).toBe(
        true,
      );
    });

    it("rejects a sibling prefix that merely starts the same", () => {
      // `/media` must not also authorise `/media-public`.
      expect(
        isTrustedImageUrl(
          "https://assets.example.com/media-public/x.png",
          PREFIXED,
        ),
      ).toBe(false);
    });

    it("tolerates a trailing slash in configuration", () => {
      expect(isTrustedImageUrl(`${PREFIXED}/x.png`, `${PREFIXED}/`)).toBe(true);
    });
  });
});
