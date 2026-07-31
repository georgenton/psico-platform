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
    productionChapterMediaRegistry,
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

    const summary = toSummary(def);

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
    const podcast =
      productionChapterMediaRegistry.getExact("eec-c1-podcast-v1");
    expect(toSummary(podcast).availability).toBe("COMING_SOON");
    expect(toSummary(podcast).hasCaptions).toBe(false);
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
      service.getAccess("u", "PRO", "eec-c1-podcast-v1"),
    ).rejects.toMatchObject({ message: "MEDIA_NOT_AVAILABLE" });
    expect(access.assertCanReadContent).not.toHaveBeenCalled();
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
