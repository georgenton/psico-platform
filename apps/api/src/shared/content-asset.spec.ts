import { describe, expect, it } from "vitest";
import {
  contentAssetKeyFrom,
  contentAssetPath,
  isAllowedAssetKey,
  resolveStoredImageUrl,
  withResolvedImageUrls,
} from "./content-asset";

/**
 * What the asset route will and will not sign.
 *
 * This is the security boundary of the private-bucket fix. The route mints
 * signed GETs, and the same bucket holds audiobook and podcast masters — so a
 * key it accepts that it should not is a way to read protected media. Every
 * refusal below is a thing somebody could otherwise fetch.
 */

const R2_BASE = "https://acct.r2.cloudflarestorage.com/psico-dev";
const COVER =
  "catalog-books/emociones-en-construccion/cover/a1b2c3d4e5f60718.jpg";
const ILLUSTRATION =
  "content/emociones-en-construccion/chapter-3/images/0123456789abcdef.png";

describe("which keys may be signed", () => {
  it("accepts the two shapes our own uploaders mint", () => {
    expect(isAllowedAssetKey(COVER)).toBe(true);
    expect(isAllowedAssetKey(ILLUSTRATION)).toBe(true);
    expect(isAllowedAssetKey(ILLUSTRATION.replace(".png", ".webp"))).toBe(true);
  });

  it("refuses protected media", () => {
    // These are the objects the whole private bucket exists to protect. An
    // audiobook master reachable through an image route would be the product
    // given away.
    expect(isAllowedAssetKey("audio/emociones-en-construccion/cap-1.m4a")).toBe(
      false,
    );
    expect(isAllowedAssetKey("media/eec/c1/podcast-v1.m4a")).toBe(false);
    expect(isAllowedAssetKey("media/fixture-book/transcript-1.md")).toBe(false);
    expect(isAllowedAssetKey("media/x.mp4")).toBe(false);
  });

  it("refuses path traversal, however it is spelled", () => {
    expect(isAllowedAssetKey("content/../audio/cap-1.m4a")).toBe(false);
    expect(
      isAllowedAssetKey("content/libro/chapter-1/images/../../../audio/x.m4a"),
    ).toBe(false);
    expect(isAllowedAssetKey("..%2Faudio%2Fcap-1.m4a")).toBe(false);
    expect(isAllowedAssetKey("content\\libro\\chapter-1\\images\\a.png")).toBe(
      false,
    );
    expect(isAllowedAssetKey("/content/libro/chapter-1/images/abc.png")).toBe(
      false,
    );
  });

  it("refuses anything that is not the exact minted shape", () => {
    // The filename is a 16-hex name the server chose. Anything else was not
    // minted here, whatever it looks like.
    expect(
      isAllowedAssetKey("content/libro/chapter-1/images/not-a-hash.png"),
    ).toBe(false);
    expect(isAllowedAssetKey("content/libro/chapter-1/images/abc.png")).toBe(
      false,
    );
    // A real key with something appended.
    expect(isAllowedAssetKey(`${ILLUSTRATION}.m4a`)).toBe(false);
    expect(isAllowedAssetKey("catalog-books/libro/cover/")).toBe(false);
    expect(isAllowedAssetKey("")).toBe(false);
    // Right prefix, wrong file type.
    expect(
      isAllowedAssetKey("content/libro/chapter-1/images/0123456789abcdef.mp3"),
    ).toBe(false);
  });
});

describe("recovering the key from what was stored", () => {
  it("reads a bare key", () => {
    expect(contentAssetKeyFrom(ILLUSTRATION, R2_BASE)).toBe(ILLUSTRATION);
  });

  it("reads our own asset path", () => {
    expect(contentAssetKeyFrom(contentAssetPath(COVER), R2_BASE)).toBe(COVER);
  });

  it("reads an absolute URL on our R2 base — the images uploaded before the fix", () => {
    // The canary's JPG persisted exactly this shape. Recovering its key is what
    // makes the existing image work again instead of asking for a re-upload.
    expect(contentAssetKeyFrom(`${R2_BASE}/${ILLUSTRATION}`, R2_BASE)).toBe(
      ILLUSTRATION,
    );
  });

  it("refuses a URL on a host we do not control", () => {
    expect(
      contentAssetKeyFrom(`https://evil.example.com/${ILLUSTRATION}`, R2_BASE),
    ).toBeNull();
    // Same path, same shape, different origin — the shape is not the authority.
    expect(
      contentAssetKeyFrom(
        `https://acct.r2.cloudflarestorage.com.evil.com/${ILLUSTRATION}`,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("refuses our own origin but another bucket", () => {
    expect(
      contentAssetKeyFrom(
        `https://acct.r2.cloudflarestorage.com/other-bucket/${ILLUSTRATION}`,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("refuses a protected key even when it arrives as our own URL", () => {
    expect(
      contentAssetKeyFrom(`${R2_BASE}/audio/libro/cap-1.m4a`, R2_BASE),
    ).toBeNull();
  });

  it("refuses everything when no base is configured", () => {
    // Nothing to compare against is not permission to trust.
    expect(
      contentAssetKeyFrom(`${R2_BASE}/${ILLUSTRATION}`, undefined),
    ).toBeNull();
    // A bare key still works: it needs no origin to be judged.
    expect(contentAssetKeyFrom(ILLUSTRATION, undefined)).toBe(ILLUSTRATION);
  });
});

describe("what read surfaces hand to a client", () => {
  const image = (imageUrl: unknown) => ({
    kind: "IMAGE",
    meta: { imageUrl, alt: "un diagrama", credit: "Marina" },
  });

  it("turns a stored key into the stable asset path", () => {
    const [block] = withResolvedImageUrls([image(ILLUSTRATION)], R2_BASE);
    expect((block!.meta as { imageUrl: string }).imageUrl).toBe(
      `/api/content-assets/${ILLUSTRATION}`,
    );
  });

  it("rescues a pre-fix absolute R2 URL", () => {
    const [block] = withResolvedImageUrls(
      [image(`${R2_BASE}/${ILLUSTRATION}`)],
      R2_BASE,
    );
    expect((block!.meta as { imageUrl: string }).imageUrl).toBe(
      `/api/content-assets/${ILLUSTRATION}`,
    );
  });

  it("keeps every other meta key untouched", () => {
    const [block] = withResolvedImageUrls([image(ILLUSTRATION)], R2_BASE);
    const meta = block!.meta as Record<string, unknown>;
    expect(meta.alt).toBe("un diagrama");
    expect(meta.credit).toBe("Marina");
  });

  it("drops a URL it will not serve rather than passing it through", () => {
    // `imageBlockInfo` returns null without a URL, so every renderer falls back
    // to its normal block instead of emitting an <img> that cannot load.
    const [block] = withResolvedImageUrls(
      [image("https://evil.example.com/x.png")],
      R2_BASE,
    );
    expect((block!.meta as Record<string, unknown>).imageUrl).toBeUndefined();
  });

  it("leaves non-image blocks completely alone", () => {
    const blocks = [
      { kind: "PARAGRAPH", content: "texto", meta: null },
      { kind: "AUDIO", meta: { mediaKey: "audio/libro/cap-1.m4a" } },
    ];
    expect(withResolvedImageUrls(blocks, R2_BASE)).toEqual(blocks);
  });

  it("resolves nothing for a block with no stored URL", () => {
    const blocks = [{ kind: "IMAGE", meta: { alt: "sin url" } }];
    expect(withResolvedImageUrls(blocks, R2_BASE)).toEqual(blocks);
  });
});

describe("resolveStoredImageUrl", () => {
  it("is the path for anything servable, and null otherwise", () => {
    expect(resolveStoredImageUrl(COVER, R2_BASE)).toBe(
      `/api/content-assets/${COVER}`,
    );
    expect(resolveStoredImageUrl("audio/libro/cap-1.m4a", R2_BASE)).toBeNull();
  });
});
