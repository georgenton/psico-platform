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

  it("PODCAST_N — every episode survives the merge", async () => {
    // `ChapterMediaListen` filters EVERY podcast, and it used to `.find()` the
    // first and hide the rest until that was fixed. Deduplicating by kind here
    // would put that bug back one layer lower, where the surface cannot see it.
    const ep1 = def({ mediaKey: "eec-c1-podcast-v1", title: "Episodio 1" });
    const ep2 = def({ mediaKey: "eec-c1-podcast-ep2", title: "Episodio 2" });
    const ep3 = def({ mediaKey: "eec-c1-podcast-ep3", title: "Episodio 3" });
    const hybrid = new HybridChapterMediaRepository(
      stub([ep3]),
      codeRepo([ep1, ep2]),
    );

    const list = await hybrid.listPublicForChapter("eec", 1);
    expect(list.map((d) => d.mediaKey)).toEqual([
      "eec-c1-podcast-v1",
      "eec-c1-podcast-ep2",
      "eec-c1-podcast-ep3",
    ]);
  });

  it("PODCAST_1 — a single episode is untouched", async () => {
    const hybrid = new HybridChapterMediaRepository(
      stub([]),
      codeRepo([def()]),
    );
    expect(await hybrid.listPublicForChapter("eec", 1)).toHaveLength(1);
  });

  it("PODCAST_0 — a chapter with none stays empty", async () => {
    const hybrid = new HybridChapterMediaRepository(stub([]), codeRepo([]));
    expect(await hybrid.listPublicForChapter("eec", 1)).toHaveLength(0);
  });

  it("VIDEO is 0..N too — the picker is keyed on mediaKey", async () => {
    const asVideo = (mediaKey: string) =>
      def({
        mediaKey,
        kind: "VIDEO",
        status: "DRAFT",
        source: null,
        accessPolicy: null,
        durationSec: null,
      });
    const v1 = asVideo("eec-c1-video-a");
    const v2 = asVideo("eec-c1-video-b");
    const hybrid = new HybridChapterMediaRepository(
      stub([]),
      codeRepo([v1, v2]),
    );

    expect(
      (await hybrid.listPublicForChapter("eec", 1)).map((d) => d.mediaKey),
    ).toEqual(["eec-c1-video-a", "eec-c1-video-b"]);
  });

  it("does not supersede a version — a chapter carrying two shows both", async () => {
    // Superseding is a decision the catalog has never expressed. Inventing it
    // would silently remove content nobody asked to remove.
    const v1 = def();
    const v2 = def({ mediaKey: "eec-c1-podcast-v2", mediaVersion: 2 });
    const hybrid = new HybridChapterMediaRepository(stub([v2]), codeRepo([v1]));

    const list = await hybrid.listPublicForChapter("eec", 1);
    expect(list.map((d) => d.mediaVersion)).toEqual([1, 2]);
  });

  it("PODCAST_ORDER — adopting a definition does not move its card", async () => {
    const ep1 = def({ mediaKey: "eec-c1-podcast-v1", title: "Uno" });
    const ep2 = def({ mediaKey: "eec-c1-podcast-ep2", title: "Dos" });
    const hybrid = new HybridChapterMediaRepository(
      // The SECOND episode was adopted; it must stay second.
      stub([def({ mediaKey: "eec-c1-podcast-ep2", title: "Dos (CMS)" })]),
      codeRepo([ep1, ep2]),
    );

    const list = await hybrid.listPublicForChapter("eec", 1);
    expect(list.map((d) => d.title)).toEqual(["Uno", "Dos (CMS)"]);
  });

  it("orders CMS-only entries by kind, after the code catalog's own order", async () => {
    // Code declaration order is presentation order and is preserved; entries the
    // code catalog never knew about are appended deterministically.
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
      codeRepo([audiobook, def()]),
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
