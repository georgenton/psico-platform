import { describe, expect, it } from "vitest";
import {
  contentAssetKeyFrom,
  contentAssetPath,
  isAllowedAssetKey,
  resolveStoredCoverUrl,
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

/**
 * Malformed percent-encoding must fail closed.
 *
 * These values arrive from two places nobody validates for us: a row written
 * long ago, and a URL segment a caller typed. `decodeURIComponent` throws on
 * every one of them, and an exception here turns reading a chapter into a 500.
 */
describe("input that cannot be decoded", () => {
  const MALFORMED = [
    "%",
    "%2",
    "%ZZ",
    "%E0%A4%A",
    "content/libro/chapter-1/images/%ZZ.png",
    "/api/content-assets/%ZZ",
    "/api/content-assets/%",
    `${R2_BASE}/%ZZ`,
  ];

  it.each(MALFORMED)("returns null instead of throwing · %s", (value) => {
    expect(() => contentAssetKeyFrom(value, R2_BASE)).not.toThrow();
    expect(contentAssetKeyFrom(value, R2_BASE)).toBeNull();
  });

  it("never throws from the read-surface rewriter either", () => {
    const blocks = [{ kind: "IMAGE", meta: { imageUrl: "%ZZ", alt: "a" } }];
    expect(() => withResolvedImageUrls(blocks, R2_BASE)).not.toThrow();
    expect(
      (
        withResolvedImageUrls(blocks, R2_BASE)[0]!.meta as Record<
          string,
          unknown
        >
      ).imageUrl,
    ).toBeUndefined();
  });

  it("refuses undecodable input rather than falling back to the raw string", () => {
    // Falling back would hand `%2e%2e` to the shape check undecoded, which is
    // exactly how encoded traversal gets past a validator.
    expect(
      contentAssetKeyFrom(
        "/api/content-assets/%2e%2e%2faudio%2fx.m4a",
        R2_BASE,
      ),
    ).toBeNull();
    expect(
      contentAssetKeyFrom("/api/content-assets/%2E%2E/audio/x.m4a", R2_BASE),
    ).toBeNull();
  });
});

/**
 * The cover branch, and the third uploader nobody would think to look for.
 *
 * Approving an author's book copies `AuthorBook.coverArtUrl` onto
 * `Book.coverArtUrl`, so a catalog cover can be a key an author's uploader
 * minted. Leaving that shape out would make every approved author book lose its
 * cover the moment reads resolved through here.
 */
describe("cover keys", () => {
  const AUTHOR_COVER =
    "autor-books/clxyz123abc456def789/cover-0123456789abcdef.jpg";

  it("accepts a Content Studio cover", () => {
    expect(isAllowedAssetKey(COVER)).toBe(true);
    expect(resolveStoredImageUrl(COVER, R2_BASE)).toBe(
      `/api/content-assets/${COVER}`,
    );
  });

  it("accepts an author cover, which approval copies onto the catalog book", () => {
    expect(isAllowedAssetKey(AUTHOR_COVER)).toBe(true);
  });

  it("rescues an author cover still stored as an absolute R2 URL", () => {
    // The author uploader has not been converted, so this is what production
    // holds today — and it is unreadable by a browser for the same reason.
    expect(contentAssetKeyFrom(`${R2_BASE}/${AUTHOR_COVER}`, R2_BASE)).toBe(
      AUTHOR_COVER,
    );
  });

  it("does not let the author prefix widen into the rest of the bucket", () => {
    expect(isAllowedAssetKey("autor-books/../audio/cap-1.m4a")).toBe(false);
    expect(isAllowedAssetKey("autor-books/x/cover-0123456789abcdef.jpg")).toBe(
      false, // book id too short to be one of ours
    );
    expect(
      isAllowedAssetKey("autor-books/clxyz123abc456def789/master.m4a"),
    ).toBe(false);
    expect(
      isAllowedAssetKey("autor-books/clxyz123abc456def789/cover-nothex.jpg"),
    ).toBe(false);
  });
});

/**
 * Covers have a looser history than block images.
 *
 * `PATCH /autor/libros/:id` accepts any string for `coverArtUrl`, so a book can
 * legitimately carry a cover hosted somewhere we do not control — and it has
 * always loaded, because it was directly fetchable. Enforcing the bucket rule on
 * it would break a working cover to fix an unrelated one.
 */
describe("resolveStoredCoverUrl", () => {
  it("resolves our own storage like any other image", () => {
    expect(resolveStoredCoverUrl(COVER, R2_BASE)).toBe(
      `/api/content-assets/${COVER}`,
    );
    expect(resolveStoredCoverUrl(`${R2_BASE}/${COVER}`, R2_BASE)).toBe(
      `/api/content-assets/${COVER}`,
    );
  });

  it("leaves a third-party cover exactly as it was", () => {
    expect(
      resolveStoredCoverUrl("https://cdn.example.com/cover.png", R2_BASE),
    ).toBe("https://cdn.example.com/cover.png");
  });

  it("still drops a bare key we would not sign", () => {
    // Never a URL anybody could have loaded, so there is nothing to preserve.
    expect(resolveStoredCoverUrl("audio/libro/cap-1.m4a", R2_BASE)).toBeNull();
    expect(resolveStoredCoverUrl("%ZZ", R2_BASE)).toBeNull();
  });

  it("never signs a protected key just because it arrived as our URL", () => {
    // Falls through to the passthrough branch as an opaque URL rather than
    // becoming an asset path: it is not resolved, and it is not signed.
    const value = `${R2_BASE}/media/libro/podcast.m4a`;
    expect(resolveStoredCoverUrl(value, R2_BASE)).toBe(value);
    expect(contentAssetKeyFrom(value, R2_BASE)).toBeNull();
  });
});
