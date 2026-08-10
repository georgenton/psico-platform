import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  ChapterMediaService,
  R2_MEDIA_SIGNED_URL_TTL_SEC,
  toSummary,
} from "./chapter-media.service";
import {
  productionChapterMediaRegistry,
  validateChapterMediaDefinition,
} from "./chapter-media.catalog";
import { CodeChapterMediaDefinitionRepository } from "./chapter-media-definition.repository";
import { chapterMediaCompletionIdempotencyKey } from "./chapter-media-idempotency";
import { CHAPTER_AUDIO_SIGNED_URL_TTL_SEC } from "../lector.service";

/**
 * GR-2 — the media surface, unit level.
 *
 * The claims worth pinning here are contract claims: the manifest signs
 * nothing, the access response exposes no provider fact, the audiobook goes
 * through the EXISTING chapter-audio path rather than a second signer, and a
 * DRAFT item is never playable.
 */

function makeService(
  overrides: {
    book?: { id: string } | null;
    /** `null` = the chapter has no ingested audio master. */
    chapterAudioRow?: { id: string } | null;
    audioUrl?: string;
    getAudio?: ReturnType<typeof vi.fn>;
    getSignedUrl?: ReturnType<typeof vi.fn>;
    assertCanReadContent?: ReturnType<typeof vi.fn>;
    assertCanSeeBook?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const prisma = {
    book: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.book === undefined
            ? { id: "book-1", slug: "emociones-en-construccion" }
            : overrides.book,
        ),
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.book === undefined ? { id: "book-1" } : overrides.book,
        ),
    },
    chapter: { findUnique: vi.fn().mockResolvedValue({ id: "chapter-1" }) },
    audio: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.chapterAudioRow === undefined
            ? { id: "audio-1" }
            : overrides.chapterAudioRow,
        ),
    },
    $transaction: vi.fn(),
  };
  const storage = {
    getSignedUrl:
      overrides.getSignedUrl ??
      vi.fn().mockResolvedValue("https://signed.example/object?sig=x"),
  };
  const access = {
    assertCanReadContent:
      overrides.assertCanReadContent ?? vi.fn().mockResolvedValue(undefined),
    assertCanSeeBook:
      overrides.assertCanSeeBook ?? vi.fn().mockResolvedValue(undefined),
    assertCanReadUnit: vi.fn().mockResolvedValue(undefined),
  };
  const lector = {
    getAudio:
      overrides.getAudio ??
      vi.fn().mockResolvedValue({
        url: overrides.audioUrl ?? "https://signed.example/audio?sig=y",
        durationSec: 600,
        transcript: [],
        metadata: {
          title: "Cap. 1",
          subtitle: "Libro",
          artist: "Autora",
          artworkUrl: "warm",
        },
      }),
  };
  const stream = { createAccess: vi.fn(), isConfigured: vi.fn(() => false) };
  const catalog = { resolveUnit: vi.fn() };
  const events = { appendValidated: vi.fn() };

  const service = new ChapterMediaService(
    prisma as never,
    storage as never,
    access as never,
    lector as never,
    stream as never,
    catalog as never,
    events as never,
    // C2A — the service takes the repository port; the production
    // registry is what the code-owned half of it reads.
    new CodeChapterMediaDefinitionRepository(productionChapterMediaRegistry),
  );
  return { service, prisma, storage, access, lector, stream, catalog, events };
}

describe("toSummary — the public projection", () => {
  it("drops every provider-shaped field", () => {
    const def = validateChapterMediaDefinition({
      mediaKey: "fixture-video-v1",
      mediaVersion: 3,
      bookSlug: "fixture-book",
      chapterOrder: 2,
      kind: "VIDEO",
      status: "PUBLISHED",
      title: "Video",
      description: "Desc",
      durationSec: 400,
      accessPolicy: "PRO_ONLY",
      source: {
        kind: "CLOUDFLARE_STREAM",
        videoUid: "abcdef0123456789",
        captionLanguage: "es",
      },
      posterObjectKey: "media/poster.webp",
      transcriptObjectKey: "media/transcript.md",
      chapters: [{ startSec: 0, label: "Inicio" }],
    });

    const summary = toSummary(def, { chapterAudioPresent: false });

    expect(summary).toEqual({
      mediaKey: "fixture-video-v1",
      mediaVersion: 3,
      kind: "VIDEO",
      title: "Video",
      description: "Desc",
      durationSec: 400,
      availability: "AVAILABLE",
      hasTranscript: true,
      hasCaptions: true,
      chapters: [{ startSec: 0, label: "Inicio" }],
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("abcdef0123456789");
    expect(serialized).not.toContain("media/poster.webp");
    expect(serialized).not.toContain("PRO_ONLY");
    expect(serialized).not.toContain("CLOUDFLARE_STREAM");
    expect(serialized).not.toContain("fixture-book");
  });

  it("marks a source-less definition as COMING_SOON", () => {
    const video = productionChapterMediaRegistry.getExact("par-c2-video-v1");
    const summary = toSummary(video, { chapterAudioPresent: true });
    expect(summary.availability).toBe("COMING_SOON");
    expect(summary.hasCaptions).toBe(false);
  });

  /**
   * The two-book demo, as the manifest reports it. Availability is not a copy
   * decision: it is `PUBLISHED` + a source, and for an audiobook also the
   * chapter's `Audio` row. This pins the six answers a reader gets.
   */
  it("TWO_BOOK_MEDIA_AVAILABILITY", () => {
    const at = (key: string, chapterAudioPresent: boolean) =>
      toSummary(productionChapterMediaRegistry.getExact(key), {
        chapterAudioPresent,
      }).availability;

    // R2-backed podcasts do not depend on the chapter audio row at all.
    expect(at("eec-c1-podcast-v1", false)).toBe("AVAILABLE");
    expect(at("par-c2-podcast-v1", false)).toBe("AVAILABLE");

    expect(at("eec-c1-audiobook-v1", true)).toBe("AVAILABLE");
    expect(at("par-c2-audiobook-v1", true)).toBe("AVAILABLE");

    // Announced, not produced — Cloudflare Stream is not configured.
    expect(at("eec-c1-video-v1", true)).toBe("COMING_SOON");
    expect(at("par-c2-video-v1", true)).toBe("COMING_SOON");
  });

  it("CHAPTER_AUDIO_WITH_ROW=AVAILABLE", () => {
    const audiobook = productionChapterMediaRegistry.getExact(
      "eec-c1-audiobook-v1",
    );
    expect(
      toSummary(audiobook, { chapterAudioPresent: true }).availability,
    ).toBe("AVAILABLE");
  });

  it("CHAPTER_AUDIO_WITHOUT_ROW=COMING_SOON", () => {
    // The catalog still says PUBLISHED and still names a source. Without the
    // ingested master there is nothing to play, and saying AVAILABLE here is
    // exactly the promise the author demo caught us making.
    const audiobook = productionChapterMediaRegistry.getExact(
      "eec-c1-audiobook-v1",
    );
    expect(
      toSummary(audiobook, { chapterAudioPresent: false }).availability,
    ).toBe("COMING_SOON");
  });

  it("DRAFT_VIDEO=COMING_SOON", () => {
    const video = productionChapterMediaRegistry.getExact("eec-c1-video-v1");
    expect(video.status).toBe("DRAFT");
    for (const chapterAudioPresent of [true, false]) {
      expect(toSummary(video, { chapterAudioPresent }).availability).toBe(
        "COMING_SOON",
      );
    }
  });
});

describe("getManifest", () => {
  it("returns metadata only — never a URL — and goes through the shared gate", async () => {
    const { service, storage, access } = makeService();

    const manifest = await service.getManifest(
      "user-1",
      "PRO",
      "emociones-en-construccion",
      1,
    );

    expect(manifest.bookSlug).toBe("emociones-en-construccion");
    expect(manifest.items.map((i) => i.kind)).toEqual([
      "AUDIOBOOK",
      "PODCAST",
      "VIDEO",
    ]);
    expect(access.assertCanSeeBook).toHaveBeenCalledOnce();
    // The manifest signs nothing at all.
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(JSON.stringify(manifest)).not.toContain("://");
  });

  it("MANIFEST_SIGNS_URLS=false — the runtime check is a row lookup, not a fetch", async () => {
    const { service, storage, lector, stream } = makeService();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const manifest = await service.getManifest(
      "user-1",
      "PRO",
      "emociones-en-construccion",
      1,
    );

    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(lector.getAudio).not.toHaveBeenCalled();
    expect(stream.createAccess).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(manifest)).not.toContain("://");
    fetchSpy.mockRestore();
  });

  it("marks the audiobook AVAILABLE when the chapter has an audio row", async () => {
    const { service, prisma } = makeService();

    const manifest = await service.getManifest(
      "user-1",
      "PRO",
      "emociones-en-construccion",
      1,
    );

    expect(
      manifest.items.find((i) => i.kind === "AUDIOBOOK")!.availability,
    ).toBe("AVAILABLE");
    expect(prisma.audio.findFirst).toHaveBeenCalledWith({
      where: { chapter: { bookId: "book-1", order: 1 } },
      select: { id: true },
    });
  });

  it("marks the audiobook COMING_SOON when the master was never ingested", async () => {
    const { service } = makeService({ chapterAudioRow: null });

    const manifest = await service.getManifest(
      "user-1",
      "PRO",
      "emociones-en-construccion",
      1,
    );

    expect(
      manifest.items.find((i) => i.kind === "AUDIOBOOK")!.availability,
    ).toBe("COMING_SOON");
    // And the client is told nothing about WHY — no source, no provider.
    expect(JSON.stringify(manifest)).not.toContain("CHAPTER_AUDIO");
  });

  it("does not query the audio table for a chapter with no chapter-audio format", async () => {
    const { service, prisma } = makeService();

    // Chapter 9 has no definitions at all, so nothing depends on the row.
    const manifest = await service.getManifest(
      "user-1",
      "PRO",
      "emociones-en-construccion",
      9,
    );

    expect(manifest.items).toEqual([]);
    expect(prisma.audio.findFirst).not.toHaveBeenCalled();
  });

  it("404s an unknown book", async () => {
    const { service } = makeService({ book: null });
    await expect(
      service.getManifest("u", "PRO", "nope", 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("getAccess", () => {
  it("reuses the existing chapter-audio path for the audiobook", async () => {
    const { service, lector, storage } = makeService();

    const access = await service.getAccess(
      "user-1",
      "PRO",
      "eec-c1-audiobook-v1",
    );

    expect(lector.getAudio).toHaveBeenCalledWith(
      "PRO",
      "emociones-en-construccion",
      1,
    );
    // No second signer for audio the reader already knows how to serve.
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(access).toMatchObject({
      kind: "AUDIOBOOK",
      mediaKey: "eec-c1-audiobook-v1",
      mediaVersion: 1,
      url: "https://signed.example/audio?sig=y",
      transcriptUrl: null,
      posterUrl: null,
    });
    // The expiry reports the REAL lifetime of that signature.
    const ttlMs = Date.parse(access.expiresAt) - Date.now();
    expect(ttlMs).toBeGreaterThan(
      (CHAPTER_AUDIO_SIGNED_URL_TTL_SEC - 60) * 1000,
    );
    expect(CHAPTER_AUDIO_SIGNED_URL_TTL_SEC).toBe(21600);
    expect(R2_MEDIA_SIGNED_URL_TTL_SEC).toBe(3600);
  });

  it("never exposes the policy, the provider or the storage key", async () => {
    const { service } = makeService();
    const access = await service.getAccess("u", "PRO", "eec-c1-audiobook-v1");
    const serialized = JSON.stringify(access);
    expect(serialized).not.toContain("PRO_ONLY");
    expect(serialized).not.toContain("CHAPTER_AUDIO");
    expect(serialized).not.toContain("objectKey");
    expect(serialized).not.toContain("userId");
  });

  it("refuses a DRAFT item before touching entitlement or storage", async () => {
    const { service, access, storage } = makeService();

    await expect(
      service.getAccess("u", "PRO", "eec-c1-video-v1"),
    ).rejects.toMatchObject({ message: "MEDIA_NOT_AVAILABLE" });
    expect(access.assertCanReadContent).not.toHaveBeenCalled();
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it("PODCAST_ACCESS — signs the R2 object and names neither key nor policy", async () => {
    const { service, storage, lector } = makeService();

    const result = await service.getAccess("u", "PRO", "eec-c1-podcast-v1");

    expect(result.kind).toBe("PODCAST");
    expect(storage.getSignedUrl).toHaveBeenCalledWith(
      "media/emociones-en-construccion/c1/podcast-demo-v1.m4a",
      R2_MEDIA_SIGNED_URL_TTL_SEC,
    );
    // A podcast is its own object: it must NOT be routed through the
    // chapter-audio path, which would hand back the audiobook instead.
    expect(lector.getAudio).not.toHaveBeenCalled();

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("objectKey");
    expect(serialized).not.toContain("PRO_ONLY");
    expect(serialized).not.toContain("podcast-demo-v1.m4a");
  });

  it("PAREJAS_AUDIOBOOK_ACCESS — reuses the chapter-audio signer for its own book", async () => {
    const { service, lector, storage } = makeService();

    const result = await service.getAccess("u", "PRO", "par-c2-audiobook-v1");

    expect(result.kind).toBe("AUDIOBOOK");
    // Its own book and its own position in the sequence — not chapter 1 of the
    // other book, which is the mistake a hard-coded slug would make.
    expect(lector.getAudio).toHaveBeenCalledWith(
      "PRO",
      "parejas-que-perduran",
      2,
    );
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it("404s an unknown media key", async () => {
    const { service } = makeService();
    await expect(
      service.getAccess("u", "PRO", "nope-v9"),
    ).rejects.toMatchObject({ message: "MEDIA_NOT_FOUND" });
  });

  it("applies the format's own PRO_ONLY policy on top of the shared gate", async () => {
    const { service, access } = makeService();

    await expect(
      service.getAccess("u", "FREE", "eec-c1-audiobook-v1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The shared gate ran first — the policy is an ADDITIONAL condition.
    expect(access.assertCanReadContent).toHaveBeenCalledOnce();
  });

  it("reports a published-but-missing asset as unavailable, not as a crash", async () => {
    const { service } = makeService({
      getAudio: vi
        .fn()
        .mockRejectedValue(new NotFoundException("AUDIO_NOT_AVAILABLE")),
    });

    await expect(
      service.getAccess("u", "PRO", "eec-c1-audiobook-v1"),
    ).rejects.toMatchObject({ message: "MEDIA_NOT_AVAILABLE" });
  });
});

describe("complete — server-derived idempotency", () => {
  it("derives the same UUID for the same media and version, always", () => {
    const first = chapterMediaCompletionIdempotencyKey(
      "eec-c1-audiobook-v1",
      1,
    );
    const second = chapterMediaCompletionIdempotencyKey(
      "eec-c1-audiobook-v1",
      1,
    );

    expect(first).toBe(second);
    // Shaped exactly like the key the repository canonicaliser accepts.
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("derives a DIFFERENT key for another media or another version", () => {
    const audiobook = chapterMediaCompletionIdempotencyKey("a-v1", 1);
    expect(chapterMediaCompletionIdempotencyKey("b-v1", 1)).not.toBe(audiobook);
    expect(chapterMediaCompletionIdempotencyKey("a-v1", 2)).not.toBe(audiobook);
  });

  it("builds a server-owned event and reports created vs replayed", async () => {
    const { service, prisma, catalog, events, access } = makeService();
    const tx = {
      book: { findUnique: vi.fn().mockResolvedValue({ id: "book-1" }) },
      chapter: { findUnique: vi.fn().mockResolvedValue({ id: "chapter-1" }) },
    };
    prisma.$transaction.mockImplementation(
      async (fn: (client: unknown) => unknown) => fn(tx),
    );
    catalog.resolveUnit.mockResolvedValue({
      editionId: "ed-1",
      editionKey: "eec-1e",
      unitId: "cu-1",
      unitKey: "unit-1",
    });
    events.appendValidated.mockResolvedValue({
      created: false,
      replayed: true,
      record: {},
    });

    const result = await service.complete(
      "user-1",
      "PRO",
      "eec-c1-audiobook-v1",
    );

    expect(result).toEqual({ created: false, replayed: true });
    expect(access.assertCanReadUnit).toHaveBeenCalledWith(
      {
        userId: "user-1",
        userPlan: "PRO",
        editionKey: "eec-1e",
        unitKey: "unit-1",
      },
      tx,
    );

    const [event, passedTx] = events.appendValidated.mock.calls[0]!;
    expect(passedTx).toBe(tx);
    expect(event).toEqual({
      userId: "user-1",
      idempotencyKey: chapterMediaCompletionIdempotencyKey(
        "eec-c1-audiobook-v1",
        1,
      ),
      type: "chapter_media_completed",
      payload: {
        mediaKey: "eec-c1-audiobook-v1",
        mediaKind: "AUDIOBOOK",
        mediaVersion: 1,
        unitKey: "unit-1",
      },
      editionId: "ed-1",
      unitId: "cu-1",
    });
  });

  it("writes nothing for a DRAFT item", async () => {
    const { service, events, prisma } = makeService();

    await expect(
      service.complete("user-1", "PRO", "eec-c1-video-v1"),
    ).rejects.toMatchObject({ message: "MEDIA_NOT_AVAILABLE" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events.appendValidated).not.toHaveBeenCalled();
  });
});
