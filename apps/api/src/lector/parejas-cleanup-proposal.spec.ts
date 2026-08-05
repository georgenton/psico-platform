import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PAREJAS_READER_ANCHOR } from "@psico/types";

/**
 * The Parejas chapter-1 cleanup PROPOSAL, pinned.
 *
 * Nothing here applies anything: the candidate is a draft and production is
 * untouched. What these tests protect is the proposal's internal honesty — that
 * every block is accounted for, that nothing disappears without a reason, that
 * no prose was invented, and that the Guide anchor still resolves against the
 * text the candidate would leave behind.
 *
 * The last one is the reason this file lives in the API workspace rather than
 * next to the docs: `PAREJAS_READER_ANCHOR` is code, the chapter is content,
 * and the whole point is that the two must not drift apart.
 */

const DOCS = join(__dirname, "..", "..", "..", "..", "docs", "operations");
const read = (name: string) =>
  JSON.parse(readFileSync(join(DOCS, name), "utf8"));

const mapping = read("parejas-demo-chapter-1-block-mapping.json") as Record<
  string,
  {
    action: "preserved" | "merged" | "removed";
    newBlockId: string | null;
    reason: string;
  }
>;

const candidate = read("parejas-demo-chapter-1-candidate.json") as {
  bookSlug: string;
  chapterOrder: number;
  candidateId: string;
  currentStorageModel: string;
  contentCoreRevisionCreated: boolean;
  candidatePublished: boolean;
  partialCleanup: boolean;
  sourceNonEmptyLines: number;
  sourceTitleLines: number;
  publishedSourceBlocks: number;
  candidateBlocks: number;
  status: string;
  applyStrategy: string;
  blocks: {
    blockId: string;
    order: number;
    kind: string;
    sourceLine: number;
    classification: string;
    changed: boolean;
    content: string;
  }[];
};

const text = candidate.blocks.map((b) => b.content).join("\n");

describe("Parejas cleanup — the proposal accounts for every block", () => {
  it("88 source lines − 1 title = 87 published blocks, one mapping entry each", () => {
    expect(candidate.sourceNonEmptyLines).toBe(88);
    expect(candidate.sourceTitleLines).toBe(1);
    expect(candidate.publishedSourceBlocks).toBe(87);
    expect(Object.keys(mapping)).toHaveLength(87);
  });

  it("every mapping entry carries an action and a reason", () => {
    for (const [id, entry] of Object.entries(mapping)) {
      expect(["preserved", "merged", "removed"], id).toContain(entry.action);
      expect(entry.reason.length, id).toBeGreaterThan(10);
      if (entry.action === "preserved") expect(entry.newBlockId, id).toBe(id);
      if (entry.action === "merged")
        expect(entry.newBlockId, id).not.toBeNull();
      if (entry.action === "removed") expect(entry.newBlockId, id).toBeNull();
    }
  });

  it("BLOCK_IDS_PRESERVED=62 · MERGED=2 · REMOVED=23", () => {
    const by = (a: string) =>
      Object.values(mapping).filter((e) => e.action === a).length;
    expect([by("preserved"), by("merged"), by("removed")]).toEqual([62, 2, 23]);
    expect(candidate.blocks).toHaveLength(62);
  });

  it("the candidate keeps the ids it says it keeps, in reading order", () => {
    const preserved = Object.entries(mapping)
      .filter(([, e]) => e.action === "preserved")
      .map(([id]) => id);
    expect(candidate.blocks.map((b) => b.blockId).sort()).toEqual(
      preserved.sort(),
    );
    const orders = candidate.blocks.map((b) => b.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("a merged block points at a surviving block, never at a removed one", () => {
    for (const [id, e] of Object.entries(mapping)) {
      if (e.action !== "merged") continue;
      expect(mapping[e.newBlockId!]?.action, id).toBe("preserved");
    }
  });
});

describe("Parejas cleanup — what the reader would stop seeing", () => {
  it("INGEST_NOTE_VISIBLE_AFTER=false", () => {
    // Our own note about the scan, published inside the chapter.
    expect(text).not.toContain("sin texto legible");
    expect(text).not.toContain("conviene re-escanear");
  });

  it("DUPLICATE_HEADING_VISIBLE_AFTER=false", () => {
    const heading = "Un testimonio personal: Mireya y yo";
    expect(text.split(heading).length - 1).toBe(1);
  });

  it("the duplicated page is gone once, not twice", () => {
    // L117–L135 repeated L97–L115. One copy survives.
    const sentence = "su sistema nervioso registra";
    expect(text.split(sentence).length - 1).toBe(1);
  });

  it("no raw cover-page noise survives", () => {
    for (const junk of ["MES A", "r FE", ", PIES vel", "O a PA +", "\nMrs\n"]) {
      expect(text, junk).not.toContain(junk);
    }
  });
});

describe("Parejas cleanup — nothing was invented", () => {
  it("only 5 blocks change, and each one is a source-verified repair", () => {
    const changed = candidate.blocks.filter((b) => b.changed);
    expect(changed).toHaveLength(5);
    for (const b of changed) {
      expect(
        ["CORRECT_OCR_SOURCE_VERIFIED", "JOIN_ORPHAN_LINES"],
        `line ${b.sourceLine}`,
      ).toContain(b.classification);
    }
  });

  it("every UNRESOLVED block is left exactly as it is", () => {
    const unresolved = candidate.blocks.filter(
      (b) => b.classification === "UNRESOLVED_SOURCE_AMBIGUITY",
    );
    expect(unresolved.length).toBe(13);
    // The chapter does not come out clean, and the candidate says so.
    expect(candidate.partialCleanup).toBe(true);
    // Damaged and untouched: this is what "we did not write prose for David"
    // looks like as an assertion.
    for (const b of unresolved)
      expect(b.changed, `line ${b.sourceLine}`).toBe(false);
  });

  it("no technical placeholder reaches the candidate", () => {
    for (const marker of ["TODO", "FIXME", "XXX", "<placeholder", "LOREM"]) {
      expect(text.toUpperCase(), marker).not.toContain(marker.toUpperCase());
    }
  });
});

describe("Parejas cleanup — the mark inventory is on the record", () => {
  it("carries the read-only counts and the honest gates", () => {
    const proposal = readFileSync(
      join(DOCS, "parejas-demo-chapter-1-cleanup-proposal.md"),
      "utf8",
    );
    for (const line of [
      "HIGHLIGHTS_ON_CORRECTED_BLOCKS=0",
      "ANNOTATIONS_ON_REMOVED_BLOCKS=0",
      "READING_SESSIONS_ON_REMOVED_BLOCKS=1",
      "PRODUCTION_TEST_MARK_CREATED=false",
      "MARKS_VISIBILITY_VERIFIED=false",
      "EDITORIAL_CORRECTNESS_VERIFIED=false",
      "NO_UNIQUE_EDITORIAL_CONTENT_IDENTIFIED_IN_REMOVALS=true",
      "READING_SESSION_LAST_BLOCK_REMAP_REQUIRED=true",
      // CC-6C changed these from CASCADE to SET NULL and added the anchor
      // CHECK. Verified against the live database, not just the schema file:
      // getting this backwards changes what a re-ingest does to real marks.
      "Highlight.blockId    → ChapterBlock.id · ON DELETE SET NULL",
      "Annotation.blockId   → ChapterBlock.id · ON DELETE SET NULL",
      "ReadingSession.lastBlockId → String nullable · SIN clave foránea",
    ]) {
      expect(proposal, line).toContain(line);
    }
    // What these tests prove, and what they do not.
    expect(proposal).toContain("PROPOSAL_INTERNAL_CONSISTENCY_VERIFIED=true");
  });
});

describe("Parejas cleanup — the Guide anchor still resolves", () => {
  it("GUIDE_ANCHOR_BLOCKS_CHANGED=0", () => {
    expect(PAREJAS_READER_ANCHOR.bookSlug).toBe(candidate.bookSlug);
    expect(PAREJAS_READER_ANCHOR.chapterOrder).toBe(candidate.chapterOrder);

    // The anchor's heading is one of the unreadable OCR blocks. Removing or
    // repairing it would silently break the guide, so the candidate keeps it —
    // and this test is what would fail if a later pass forgot.
    const heading = candidate.blocks.filter(
      (b) => b.content.trim() === PAREJAS_READER_ANCHOR.sourceHeading,
    );
    expect(heading).toHaveLength(PAREJAS_READER_ANCHOR.expectedMatchCount);
    expect(heading[0]!.changed).toBe(false);

    const passage = candidate.blocks.filter((b) =>
      b.content.includes(PAREJAS_READER_ANCHOR.passageLastSentence),
    );
    expect(passage).toHaveLength(PAREJAS_READER_ANCHOR.expectedMatchCount);
  });
});

describe("Parejas cleanup — it is a proposal, not an apply", () => {
  it("CANDIDATE_PUBLISHED=false and the apply preserves ids", () => {
    // A named draft, not "revision 2": the chapter is served from the legacy
    // `ChapterBlock` table, which has no revision numbering to speak of.
    // Claiming one would invent a semantics the storage does not have.
    expect(candidate.candidateId).toBe("parejas-ch1-ocr-cleanup-draft-1");
    expect(candidate).not.toHaveProperty("candidateRevision");
    expect(candidate.currentStorageModel).toBe("LEGACY_CHAPTER_BLOCK");
    expect(candidate.contentCoreRevisionCreated).toBe(false);
    expect(candidate.candidatePublished).toBe(false);
    expect(candidate.status).toBe("DRAFT_NOT_PUBLISHED");
    // Re-ingesting would delete every block row and orphan every mark, so the
    // strategy is an in-place update. See the proposal §4.
    expect(candidate.applyStrategy).toBe(
      "IN_PLACE_UPDATE_PRESERVING_BLOCK_IDS",
    );
  });
});
