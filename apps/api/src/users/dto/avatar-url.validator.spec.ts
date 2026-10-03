import { describe, expect, it } from "vitest";
import { isAcceptableAvatarValue } from "./avatar-url.validator";

/**
 * What may be written into `User.avatarUrl`.
 *
 * This value becomes the `src` of an `<img>` rendered beside a person's name,
 * including to OTHER users (a book review shows its author's avatar). So what
 * this accepts is what somebody else's browser will fetch, and every refusal
 * below is a request we are declining to make on their behalf.
 */

const ID = "cmql4vasx0000abcdefghijkl";
const OUR_PATH = `/api/content-assets/avatars/${ID}/0123456789abcdef.png`;

describe("avatarUrl · accepted", () => {
  it("accepts a path this API issued", () => {
    expect(isAcceptableAvatarValue(OUR_PATH)).toBe(true);
    expect(isAcceptableAvatarValue(OUR_PATH.replace(".png", ".jpg"))).toBe(
      true,
    );
    expect(isAcceptableAvatarValue(OUR_PATH.replace(".png", ".webp"))).toBe(
      true,
    );
  });

  it("accepts an absolute https URL, which is what OAuth stores", () => {
    // Google sign-in writes `claims.picture` into this same column, so refusing
    // absolute URLs would make a Google user's own profile unsaveable.
    expect(
      isAcceptableAvatarValue("https://lh3.googleusercontent.com/a/abc123"),
    ).toBe(true);
    expect(isAcceptableAvatarValue("http://cdn.example.test/me.png")).toBe(
      true,
    );
  });

  it("tolerates surrounding whitespace", () => {
    expect(isAcceptableAvatarValue(`  ${OUR_PATH}  `)).toBe(true);
  });
});

describe("avatarUrl · refused", () => {
  it("refuses a scheme that is not http(s)", () => {
    // Parsed, not pattern-matched: these are valid URLs whose protocol is the
    // problem, and a regex over the string is where that slips through.
    expect(isAcceptableAvatarValue("javascript:alert(1)")).toBe(false);
    expect(isAcceptableAvatarValue("data:text/html;base64,PHNjcmlwdD4=")).toBe(
      false,
    );
    expect(isAcceptableAvatarValue("file:///etc/passwd")).toBe(false);
    expect(isAcceptableAvatarValue("ftp://example.test/x.png")).toBe(false);
  });

  it("refuses a bare host with no protocol — which the old @IsUrl accepted", () => {
    // Measured, not assumed: `@IsUrl({ require_tld: false })` returned true for
    // both of these. Stored, they render as a relative `src` resolving against
    // whatever origin draws the page.
    expect(isAcceptableAvatarValue("evil.com")).toBe(false);
    expect(isAcceptableAvatarValue("foo")).toBe(false);
  });

  it("refuses a protocol-relative URL", () => {
    expect(isAcceptableAvatarValue("//evil.test/x.png")).toBe(false);
  });

  it("refuses arbitrary relative paths", () => {
    // The point of a shape check rather than "any string starting with /".
    expect(isAcceptableAvatarValue("/x.png")).toBe(false);
    expect(isAcceptableAvatarValue("../../etc/passwd")).toBe(false);
    expect(isAcceptableAvatarValue("/api/user/me")).toBe(false);
    expect(isAcceptableAvatarValue("/api/content-assets/")).toBe(false);
  });

  it("refuses a signable asset key from another category", () => {
    // A cover and an illustration are perfectly legitimate assets that the
    // public route WILL sign. Neither belongs in somebody's avatar field.
    expect(
      isAcceptableAvatarValue(
        "/api/content-assets/catalog-books/emociones-en-construccion/cover/a1b2c3d4e5f60718.jpg",
      ),
    ).toBe(false);
    expect(
      isAcceptableAvatarValue(
        "/api/content-assets/content/libro/chapter-1/images/0123456789abcdef.png",
      ),
    ).toBe(false);
  });

  it("refuses protected media, however it is dressed up", () => {
    expect(
      isAcceptableAvatarValue("/api/content-assets/audio/libro/1/x.m4a"),
    ).toBe(false);
    expect(
      isAcceptableAvatarValue(
        "/api/content-assets/media/eec/c1/audiobook/0123456789abcdef.m4a",
      ),
    ).toBe(false);
  });

  it("refuses traversal out of the avatars prefix, encoded or not", () => {
    expect(
      isAcceptableAvatarValue(
        "/api/content-assets/avatars/../media/eec/c1/audiobook/x.m4a",
      ),
    ).toBe(false);
    expect(
      isAcceptableAvatarValue("/api/content-assets/avatars%2F..%2Fx.m4a"),
    ).toBe(false);
    expect(
      isAcceptableAvatarValue(`/api/content-assets/avatars/${ID}/..%2Fx.png`),
    ).toBe(false);
  });

  it("refuses an avatar path that is not the exact minted shape", () => {
    // The legacy uploader's `<timestamp>.<ext from filename>` keys land here.
    // They were never loadable, so nothing working is being refused.
    expect(
      isAcceptableAvatarValue(
        `/api/content-assets/avatars/${ID}/1759300000000.png`,
      ),
    ).toBe(false);
    expect(
      isAcceptableAvatarValue(
        "/api/content-assets/avatars/u1/0123456789abcdef.png",
      ),
    ).toBe(false);
    expect(
      isAcceptableAvatarValue(
        `/api/content-assets/avatars/${ID}/0123456789abcdef.svg`,
      ),
    ).toBe(false);
  });

  it("refuses non-strings and blanks", () => {
    expect(isAcceptableAvatarValue(undefined)).toBe(false);
    expect(isAcceptableAvatarValue(null)).toBe(false);
    expect(isAcceptableAvatarValue(42)).toBe(false);
    expect(isAcceptableAvatarValue({})).toBe(false);
    expect(isAcceptableAvatarValue("")).toBe(false);
    expect(isAcceptableAvatarValue("   ")).toBe(false);
  });
});
