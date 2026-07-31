import { describe, expect, it } from "vitest";

import {
  ChapterMediaCatalogError,
  ChapterMediaCatalogRegistry,
  PRODUCTION_CHAPTER_MEDIA,
  productionChapterMediaRegistry,
  validateChapterMediaDefinition,
} from "./chapter-media.catalog";

/**
 * GR-2 — catalog ratchet.
 *
 * The productive registry is small and reviewed, so the tests can pin it
 * EXACTLY: the three chapter-1 definitions, their statuses, and the fact that
 * no URL, token or secret ever appears in it. Test fixtures live here and are
 * never added to the production list.
 */

/** A valid PUBLISHED R2 definition — a fixture, never in the registry. */
const R2_FIXTURE = {
  // A catalog key, not a credential: the generic-api-key rule reads
  // `…Key: "<high-entropy>"` as a token, so the allow has to sit on the line.
  mediaKey: "fixture-r2-podcast-v1", // gitleaks:allow
  mediaVersion: 1,
  bookSlug: "fixture-book",
  chapterOrder: 1,
  kind: "PODCAST",
  status: "PUBLISHED",
  title: "Podcast de prueba",
  description: "Solo para pruebas.",
  durationSec: 600,
  accessPolicy: "PRO_ONLY",
  source: { kind: "R2", objectKey: "media/fixture-book/podcast-1.mp3" },
  posterObjectKey: null,
  transcriptObjectKey: "media/fixture-book/transcript-1.md",
  chapters: [{ startSec: 0, label: "Apertura" }],
};

/** A valid PUBLISHED Stream definition — a fixture, never in the registry. */
const STREAM_FIXTURE = {
  mediaKey: "fixture-stream-video-v1",
  mediaVersion: 2,
  bookSlug: "fixture-book",
  chapterOrder: 1,
  kind: "VIDEO",
  status: "PUBLISHED",
  title: "Video de prueba",
  description: "Solo para pruebas.",
  durationSec: 480,
  accessPolicy: "BOOK_ENTITLEMENT",
  source: {
    kind: "CLOUDFLARE_STREAM",
    videoUid: "abcdef0123456789",
    captionLanguage: "es",
  },
  posterObjectKey: "media/fixture-book/poster.webp",
  transcriptObjectKey: null,
  chapters: [
    { startSec: 0, label: "Inicio" },
    { startSec: 60, label: "Después" },
  ],
};

describe("chapter media catalog — shape", () => {
  it("accepts the two PUBLISHED fixtures and freezes what it returns", () => {
    const r2 = validateChapterMediaDefinition(R2_FIXTURE);
    const stream = validateChapterMediaDefinition(STREAM_FIXTURE);

    expect(r2.source).toEqual({
      kind: "R2",
      objectKey: "media/fixture-book/podcast-1.mp3",
    });
    expect(stream.source).toEqual({
      kind: "CLOUDFLARE_STREAM",
      videoUid: "abcdef0123456789",
      captionLanguage: "es",
    });
    expect(Object.isFrozen(r2)).toBe(true);
    expect(Object.isFrozen(stream.chapters)).toBe(true);
  });

  it("never mutates its input", () => {
    const input = structuredClone(R2_FIXTURE);
    validateChapterMediaDefinition(input);
    expect(input).toEqual(R2_FIXTURE);
  });

  it("rejects an extra key (closed grammar)", () => {
    expect(() =>
      validateChapterMediaDefinition({ ...R2_FIXTURE, note: "extra" }),
    ).toThrow(ChapterMediaCatalogError);
  });

  it("rejects a DRAFT that carries a source or a policy", () => {
    expect(() =>
      validateChapterMediaDefinition({ ...R2_FIXTURE, status: "DRAFT" }),
    ).toThrow(ChapterMediaCatalogError);
    expect(() =>
      validateChapterMediaDefinition({
        ...R2_FIXTURE,
        status: "DRAFT",
        source: null,
      }),
    ).toThrow(ChapterMediaCatalogError);
  });

  it("rejects a PUBLISHED item with no source or no policy", () => {
    expect(() =>
      validateChapterMediaDefinition({ ...R2_FIXTURE, source: null }),
    ).toThrow(ChapterMediaCatalogError);
    expect(() =>
      validateChapterMediaDefinition({ ...R2_FIXTURE, accessPolicy: null }),
    ).toThrow(ChapterMediaCatalogError);
  });

  it("refuses to hide a URL inside an object key or a title", () => {
    expect(() =>
      validateChapterMediaDefinition({
        ...R2_FIXTURE,
        source: { kind: "R2", objectKey: "https://cdn.example.com/a.mp3" },
      }),
    ).toThrow(ChapterMediaCatalogError);
    expect(() =>
      validateChapterMediaDefinition({
        ...R2_FIXTURE,
        title: "Escúchalo en https://example.com",
      }),
    ).toThrow(ChapterMediaCatalogError);
  });

  it("couples kind and source: only VIDEO may be Stream-backed", () => {
    expect(() =>
      validateChapterMediaDefinition({
        ...R2_FIXTURE,
        source: STREAM_FIXTURE.source,
      }),
    ).toThrow(ChapterMediaCatalogError);
    expect(() =>
      validateChapterMediaDefinition({
        ...STREAM_FIXTURE,
        source: { kind: "R2", objectKey: "media/x.mp4" },
      }),
    ).toThrow(ChapterMediaCatalogError);
  });

  it("reserves CHAPTER_AUDIO for the audiobook", () => {
    expect(() =>
      validateChapterMediaDefinition({
        ...R2_FIXTURE,
        source: { kind: "CHAPTER_AUDIO" },
      }),
    ).toThrow(ChapterMediaCatalogError);
  });

  it("rejects a non-positive version and an uppercase key", () => {
    expect(() =>
      validateChapterMediaDefinition({ ...R2_FIXTURE, mediaVersion: 0 }),
    ).toThrow(ChapterMediaCatalogError);
    expect(() =>
      validateChapterMediaDefinition({ ...R2_FIXTURE, mediaKey: "Fixture-R2" }),
    ).toThrow(ChapterMediaCatalogError);
  });

  it("requires chapter marks to move forward", () => {
    expect(() =>
      validateChapterMediaDefinition({
        ...STREAM_FIXTURE,
        chapters: [
          { startSec: 60, label: "Después" },
          { startSec: 60, label: "Otra vez" },
        ],
      }),
    ).toThrow(ChapterMediaCatalogError);
  });
});

describe("chapter media catalog — registry", () => {
  it("rejects duplicate keys", () => {
    expect(
      () => new ChapterMediaCatalogRegistry([R2_FIXTURE, { ...R2_FIXTURE }]),
    ).toThrow(ChapterMediaCatalogError);
  });

  it("resolves exactly, or throws for an unknown key", () => {
    const registry = new ChapterMediaCatalogRegistry([R2_FIXTURE]);
    expect(registry.getExact("fixture-r2-podcast-v1").mediaVersion).toBe(1);
    expect(() => registry.getExact("nope")).toThrow(ChapterMediaCatalogError);
    expect(registry.find("nope")).toBeNull();
  });

  it("groups by chapter in declaration order", () => {
    const registry = new ChapterMediaCatalogRegistry([
      R2_FIXTURE,
      STREAM_FIXTURE,
    ]);
    expect(registry.forChapter("fixture-book", 1).map((d) => d.kind)).toEqual([
      "PODCAST",
      "VIDEO",
    ]);
    expect(registry.forChapter("fixture-book", 2)).toEqual([]);
  });
});

describe("chapter media catalog — the production registry", () => {
  it("holds exactly the three approved chapter-1 definitions", () => {
    expect(
      PRODUCTION_CHAPTER_MEDIA.map((d) => [d.mediaKey, d.kind, d.status]),
    ).toEqual([
      ["eec-c1-audiobook-v1", "AUDIOBOOK", "PUBLISHED"],
      ["eec-c1-podcast-v1", "PODCAST", "DRAFT"],
      ["eec-c1-video-v1", "VIDEO", "DRAFT"],
    ]);
    expect(productionChapterMediaRegistry.size).toBe(3);
  });

  it("reuses the existing chapter audio for the audiobook", () => {
    const audiobook = productionChapterMediaRegistry.getExact(
      "eec-c1-audiobook-v1",
    );
    expect(audiobook.source).toEqual({ kind: "CHAPTER_AUDIO" });
    expect(audiobook.accessPolicy).toBe("PRO_ONLY");
  });

  it("invents no provider reference for the two unproduced formats", () => {
    for (const key of ["eec-c1-podcast-v1", "eec-c1-video-v1"]) {
      const def = productionChapterMediaRegistry.getExact(key);
      expect(def.source).toBeNull();
      expect(def.accessPolicy).toBeNull();
      expect(def.durationSec).toBeNull();
      expect(def.posterObjectKey).toBeNull();
      expect(def.transcriptObjectKey).toBeNull();
    }
  });

  it("contains no URL, token or secret anywhere", () => {
    const serialized = JSON.stringify(PRODUCTION_CHAPTER_MEDIA);
    expect(serialized).not.toContain("://");
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/videoUid/);
    expect(serialized).not.toMatch(/objectKey/);
    expect(serialized).not.toMatch(/userId/i);
  });

  it("does not contain the test fixtures", () => {
    expect(
      productionChapterMediaRegistry.find("fixture-r2-podcast-v1"),
    ).toBeNull();
    expect(
      productionChapterMediaRegistry.find("fixture-stream-video-v1"),
    ).toBeNull();
  });
});

export { R2_FIXTURE, STREAM_FIXTURE };
