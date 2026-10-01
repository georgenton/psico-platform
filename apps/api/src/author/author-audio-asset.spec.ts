import { describe, expect, it, vi } from "vitest";
import {
  AUTHOR_AUDIO_SIGNED_TTL_SEC,
  authorAudioKeyFrom,
  authorAudioPrefix,
  withResolvedAudioUrls,
} from "./author-audio-asset";

/**
 * What an author's chapter will and will not have signed.
 *
 * This resolver decides which object key a signature is minted for, so a value
 * it accepts that it should not is a way to read somebody else's master — or any
 * object in the bucket. Every refusal below is a thing that would otherwise be
 * fetchable by editing one row.
 */

const BOOK = "cmql4vbi0001abcdefghijkl";
const OTHER_BOOK = "cmql4zzzz0009abcdefghijkl";
const R2_BASE = "https://acct.r2.cloudflarestorage.com/psico-dev";
const KEY = `${authorAudioPrefix(BOOK)}c1-0123456789abcdef.mp3`;

const audio = (meta: Record<string, unknown>) => ({ kind: "audio", meta });

describe("which audio keys may be signed", () => {
  it("accepts a key under this book's own audio prefix", () => {
    expect(authorAudioKeyFrom(audio({ key: KEY }), BOOK, R2_BASE)).toBe(KEY);
    // The base is irrelevant for a bare key — it is only needed to decode the
    // legacy URL form.
    expect(authorAudioKeyFrom(audio({ key: KEY }), BOOK, undefined)).toBe(KEY);
  });

  it("refuses a key belonging to another book", () => {
    const foreign = `${authorAudioPrefix(OTHER_BOOK)}c1-0123456789abcdef.mp3`;
    expect(
      authorAudioKeyFrom(audio({ key: foreign }), BOOK, R2_BASE),
    ).toBeNull();
  });

  it("refuses the prefix itself, with nothing after it", () => {
    expect(
      authorAudioKeyFrom(
        audio({ key: authorAudioPrefix(BOOK) }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("refuses traversal, even when it starts inside the right prefix", () => {
    // Without this, a key that matches the prefix could still climb back out of
    // it and land on an audiobook master.
    expect(
      authorAudioKeyFrom(
        audio({
          key: `${authorAudioPrefix(BOOK)}../../../media/eec/c1/audiobook/x.m4a`,
        }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
    expect(
      authorAudioKeyFrom(
        audio({ key: `${authorAudioPrefix(BOOK)}..\\x.m4a` }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("refuses protected media under any other prefix", () => {
    expect(
      authorAudioKeyFrom(
        audio({ key: "media/eec/c1/audiobook/x.m4a" }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
    expect(
      authorAudioKeyFrom(
        audio({ key: `autor-books/${BOOK}/cover-0123456789abcdef.jpg` }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("recovers the key from a legacy absolute URL on OUR base", () => {
    // These rows exist: the uploader used to persist `${R2_PUBLIC_URL}/${key}`,
    // which the browser could never load. Their key is recoverable, so the audio
    // starts working instead of staying broken.
    expect(
      authorAudioKeyFrom(audio({ url: `${R2_BASE}/${KEY}` }), BOOK, R2_BASE),
    ).toBe(KEY);
  });

  it("refuses a legacy URL on a host that is not ours", () => {
    // Compared on the parsed origin: a prefix match on the string would accept
    // this.
    expect(
      authorAudioKeyFrom(
        audio({
          url: `https://acct.r2.cloudflarestorage.com.attacker.test/psico-dev/${KEY}`,
        }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
    expect(
      authorAudioKeyFrom(
        audio({ url: `https://evil.test/${KEY}` }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("refuses a legacy URL when no base is configured to compare against", () => {
    expect(
      authorAudioKeyFrom(audio({ url: `${R2_BASE}/${KEY}` }), BOOK, undefined),
    ).toBeNull();
  });

  it("refuses a legacy URL whose path sits outside the configured sub-prefix", () => {
    expect(
      authorAudioKeyFrom(
        audio({
          url: `https://acct.r2.cloudflarestorage.com/other-bucket/${KEY}`,
        }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("refuses malformed percent-encoding rather than falling back to the raw string", () => {
    // Falling back is how encoded traversal gets past a check.
    expect(
      authorAudioKeyFrom(
        audio({ url: `${R2_BASE}/${authorAudioPrefix(BOOK)}%2` }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("refuses a relative path, which is not a shape we ever wrote", () => {
    expect(
      authorAudioKeyFrom(
        audio({ url: `/api/content-assets/${KEY}` }),
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
  });

  it("ignores blocks that are not audio", () => {
    expect(
      authorAudioKeyFrom(
        { kind: "paragraph", meta: { key: KEY } },
        BOOK,
        R2_BASE,
      ),
    ).toBeNull();
    expect(authorAudioKeyFrom(null, BOOK, R2_BASE)).toBeNull();
    expect(authorAudioKeyFrom({ kind: "audio" }, BOOK, R2_BASE)).toBeNull();
  });
});

describe("resolving a chapter's blocks on the way out", () => {
  it("signs audio blocks and leaves everything else untouched", async () => {
    const sign = vi.fn().mockResolvedValue("https://signed.example/a?sig=1");
    const blocks = [
      { kind: "paragraph", content: "hola" },
      audio({ key: KEY, mimeType: "audio/mpeg", sizeBytes: 42 }),
    ];

    const out = (await withResolvedAudioUrls(
      blocks,
      BOOK,
      R2_BASE,
      sign,
    )) as Array<Record<string, unknown>>;

    expect(sign).toHaveBeenCalledWith(KEY);
    expect(out[0]).toEqual({ kind: "paragraph", content: "hola" });
    const meta = out[1]!.meta as Record<string, unknown>;
    expect(meta.url).toBe("https://signed.example/a?sig=1");
    // The key survives the round trip: the editor saves blocks back, and
    // replacing a stable identity with an expiring URL would persist that URL.
    expect(meta.key).toBe(KEY);
    // Everything else on the block is none of this function's business.
    expect(meta.mimeType).toBe("audio/mpeg");
    expect(meta.sizeBytes).toBe(42);
  });

  it("drops the url on a block it will not sign, rather than passing it through", async () => {
    const sign = vi.fn();
    const out = (await withResolvedAudioUrls(
      [audio({ url: "https://evil.test/x.mp3" })],
      BOOK,
      R2_BASE,
      sign,
    )) as Array<Record<string, unknown>>;

    expect(sign).not.toHaveBeenCalled();
    expect((out[0]!.meta as Record<string, unknown>).url).toBeUndefined();
  });

  it("signs for an hour — long enough to listen through a chapter", () => {
    expect(AUTHOR_AUDIO_SIGNED_TTL_SEC).toBe(3600);
  });
});
