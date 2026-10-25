import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The GR-2 evidence fixture, pinned.
 *
 * Captures 01 and 06 show the audiobook player. The chapter master is not in
 * local storage, so the capture harness stubs the audio response with
 * `apps/web/e2e/fixtures/gr2-audio.json`. That makes the fixture part of the
 * evidence: whatever it says lands in a screenshot a reviewer will read as the
 * product. So it is checked here, in CI, against the same authority the product
 * uses — not against a second copy of the string.
 *
 * Two things are pinned:
 *
 *   1. The chapter title. The authority is the ingestion manifest
 *      `apps/api/content/emociones-en-construccion/titles.json`, which is where
 *      the real chapter titles come from. A screenshot must never show a title
 *      that the content pipeline does not produce.
 *
 *   2. The author. The repository contains no editorial record of who wrote this
 *      book: the content directory carries no attribution, the chapter markdown
 *      has no front matter, and the names that do appear ("Marina Quintana" as a
 *      seeded BookAuthor and, separately, as a seeded therapist; "Dra. Marina
 *      Salazar" in a design prototype) contradict each other. Authorship is not
 *      something to infer, so the fixture carries the audio contract's own
 *      no-author fallback — `null` since 2026-10-25 — and the evidence shows
 *      no name at all, not even the platform's own.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../../..");

const fixture = JSON.parse(
  readFileSync(
    resolve(repoRoot, "apps/web/e2e/fixtures/gr2-audio.json"),
    "utf8",
  ),
) as {
  metadata: { title: string; subtitle: string; artist: string | null };
};

const titles = JSON.parse(
  readFileSync(
    resolve(repoRoot, "apps/api/content/emociones-en-construccion/titles.json"),
    "utf8",
  ),
) as Record<string, string>;

describe("GR-2 evidence fixture", () => {
  it("carries the canonical chapter title from the content manifest", () => {
    const canonical = titles["1"];

    expect(canonical).toBe("¿Realmente sabemos qué es una emoción?");
    expect(fixture.metadata.title).toBe(`Cap. 1 · ${canonical}`);
  });

  it("shows no unverified author", () => {
    // The documented fallback in LectorAudioMetadata when a book has no
    // author. It used to be the product's own name, which attributed the book
    // to the platform — an unsourced claim of exactly the kind the authorship
    // repair withdraws. Absence is the honest answer.
    expect(fixture.metadata.artist).toBeNull();

    // What the player actually renders: the subtitle alone, with no dangling
    // separator and no name of any kind.
    const line = fixture.metadata.artist
      ? `${fixture.metadata.subtitle} · ${fixture.metadata.artist}`
      : fixture.metadata.subtitle;
    expect(line).toBe("Emociones en Construcción");
    expect(line).not.toMatch(/marina/i);
    expect(line).not.toMatch(/quintana|salazar/i);
  });
});
