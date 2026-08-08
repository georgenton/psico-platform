import { describe, expect, it, vi } from "vitest";
import {
  ChapterMediaCatalogRegistry,
  validateChapterMediaDefinition,
  type ChapterMediaDefinition,
} from "./chapter-media.catalog";
import { CodeChapterMediaDefinitionRepository } from "./chapter-media-definition.repository";
import { HybridChapterMediaRepository } from "./hybrid-chapter-media.repository";
import type { ChapterMediaDefinitionRepository } from "./chapter-media-definition.repository";

/**
 * Which definition answers: the one in reviewed code, or the one an editor
 * published.
 *
 * The property that carries the most weight is the TIE. Adoption clones a code
 * definition at the same key and the same version, so "database wins on equal
 * version" is what lets ownership move without identity moving with it — and
 * completion identity is exactly `mediaKey + mediaVersion`.
 */

function def(
  over: Partial<Record<string, unknown>> = {},
): ChapterMediaDefinition {
  return validateChapterMediaDefinition({
    mediaKey: "eec-c1-podcast-v1",
    mediaVersion: 1,
    bookSlug: "eec",
    chapterOrder: 1,
    kind: "PODCAST",
    status: "PUBLISHED",
    title: "Un episodio",
    description: "Una descripción editorial.",
    durationSec: 600,
    accessPolicy: "PRO_ONLY",
    source: { kind: "R2", objectKey: "media/eec/c1/podcast-v1.m4a" },
    posterObjectKey: null,
    transcriptObjectKey: null,
    chapters: [],
    ...over,
  });
}

function stub(
  defs: ChapterMediaDefinition[],
): ChapterMediaDefinitionRepository {
  return {
    getExact: vi.fn(
      async (k: string) => defs.find((d) => d.mediaKey === k) ?? null,
    ),
    listPublicForChapter: vi.fn(async () => defs),
  };
}

const codeRepo = (defs: unknown[]) =>
  new CodeChapterMediaDefinitionRepository(
    new ChapterMediaCatalogRegistry(defs),
  );

describe("HybridChapterMediaRepository — exact lookup", () => {
  it("prefers the database, so an adopted definition takes over its own key", async () => {
    const fromCode = def({ title: "Título en código" });
    const fromDb = def({ title: "Título editado en el CMS" });
    const hybrid = new HybridChapterMediaRepository(
      stub([fromDb]),
      codeRepo([fromCode]),
    );

    const got = await hybrid.getExact("eec-c1-podcast-v1");

    expect(got?.title).toBe("Título editado en el CMS");
    // Identity is untouched — this is the same master, not a new one.
    expect(got?.mediaKey).toBe("eec-c1-podcast-v1");
    expect(got?.mediaVersion).toBe(1);
  });

  it("falls back to code for a key nobody adopted", async () => {
    const hybrid = new HybridChapterMediaRepository(
      stub([]),
      codeRepo([def()]),
    );

    expect((await hybrid.getExact("eec-c1-podcast-v1"))?.title).toBe(
      "Un episodio",
    );
  });

  it("keeps a superseded version resolvable", async () => {
    // A listener pinned to v1 must keep resolving v1 forever, even once v2 is
    // the one being advertised.
    const v1 = def();
    const v2 = def({ mediaKey: "eec-c1-podcast-v2", mediaVersion: 2 });
    const hybrid = new HybridChapterMediaRepository(stub([v2]), codeRepo([v1]));

    expect((await hybrid.getExact("eec-c1-podcast-v1"))?.mediaVersion).toBe(1);
    expect((await hybrid.getExact("eec-c1-podcast-v2"))?.mediaVersion).toBe(2);
  });

  it("returns null for a key that exists nowhere", async () => {
    const hybrid = new HybridChapterMediaRepository(stub([]), codeRepo([]));
    expect(await hybrid.getExact("nope-v1")).toBeNull();
  });
});

describe("HybridChapterMediaRepository — the chapter's offer", () => {
  it("shows the code definition when nothing is adopted", async () => {
    const hybrid = new HybridChapterMediaRepository(
      stub([]),
      codeRepo([def()]),
    );

    const list = await hybrid.listPublicForChapter("eec", 1);
    expect(list.map((d) => d.mediaKey)).toEqual(["eec-c1-podcast-v1"]);
  });

  it("lets the database win an equal version — the adoption case", async () => {
    const hybrid = new HybridChapterMediaRepository(
      stub([def({ title: "Editado" })]),
      codeRepo([def({ title: "En código" })]),
    );

    const list = await hybrid.listPublicForChapter("eec", 1);
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("Editado");
    expect(list[0]!.mediaVersion).toBe(1);
  });

  it("advertises the highest version per kind", async () => {
    const hybrid = new HybridChapterMediaRepository(
      stub([def({ mediaKey: "eec-c1-podcast-v2", mediaVersion: 2 })]),
      codeRepo([def()]),
    );

    const list = await hybrid.listPublicForChapter("eec", 1);
    expect(list).toHaveLength(1);
    expect(list[0]!.mediaVersion).toBe(2);
  });

  it("never lets code outrank a newer database version", async () => {
    const hybrid = new HybridChapterMediaRepository(
      stub([def()]),
      codeRepo([def({ mediaKey: "eec-c1-podcast-v2", mediaVersion: 2 })]),
    );

    expect((await hybrid.listPublicForChapter("eec", 1))[0]!.mediaVersion).toBe(
      2,
    );
  });

  it("keeps audiobook, podcast, video in that order", async () => {
    // Alphabetical would put the podcast first; presentation order is a product
    // decision, not a sort.
    const video = def({
      mediaKey: "eec-c1-video-v1",
      kind: "VIDEO",
      status: "DRAFT",
      source: null,
      accessPolicy: null,
      durationSec: null,
    });
    const audiobook = def({
      mediaKey: "eec-c1-audiobook-v1",
      kind: "AUDIOBOOK",
      source: { kind: "CHAPTER_AUDIO" },
    });
    const hybrid = new HybridChapterMediaRepository(
      stub([video]),
      codeRepo([def(), audiobook]),
    );

    expect(
      (await hybrid.listPublicForChapter("eec", 1)).map((d) => d.kind),
    ).toEqual(["AUDIOBOOK", "PODCAST", "VIDEO"]);
  });

  it("keeps a runtime DRAFT visible — that is the Coming Soon card", async () => {
    // Unlike the Experience CMS, a runtime DRAFT here is a deliberate public
    // state: the chapter advertises a format before its master exists.
    const comingSoon = def({
      mediaKey: "eec-c1-video-v1",
      kind: "VIDEO",
      status: "DRAFT",
      source: null,
      accessPolicy: null,
      durationSec: null,
    });
    const hybrid = new HybridChapterMediaRepository(
      stub([]),
      codeRepo([comingSoon]),
    );

    const list = await hybrid.listPublicForChapter("eec", 1);
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("DRAFT");
  });
});
