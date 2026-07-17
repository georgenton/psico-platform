import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  resolveAnnotationWriteAnchor,
  resolveHighlightWriteAnchor,
} from "./mark-anchor";

/**
 * CC-6D — write-anchor error semantics (unit-level, no Postgres).
 *
 * The durable end-to-end behaviour is covered by content-core-marks.pg-spec.ts
 * on a real PG18; these fast tests pin the fail-closed classification the P0
 * rollout depends on: a legacy blockId-only write stays compatible, a Content
 * Core write without a source version is rejected, and a broken publish pointer
 * is a 500 integrity fault (never a 404).
 */

type Row = Record<string, unknown>;

// A tiny stub of the Prisma surface the resolver needs. Each table's findUnique
// returns the single row a scenario wires (MarkDb is module-private, hence the
// cast). Sufficient because each test drives one linear path.
function db(rows: {
  contentBlock?: Row | null;
  chapterBlock?: Row | null;
  contentUnit?: Row | null;
  edition?: Row | null;
  revision?: Row | null;
  revisionUnit?: Row | null;
  blockVersion?: Row | null;
}) {
  const one = (v: Row | null | undefined) => ({
    findUnique: async () => v ?? null,
  });
  return {
    contentBlock: one(rows.contentBlock),
    chapterBlock: one(rows.chapterBlock),
    contentUnit: one(rows.contentUnit),
    edition: one(rows.edition),
    revision: one(rows.revision),
    revisionUnit: one(rows.revisionUnit),
    blockVersion: one(rows.blockVersion),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const CB = {
  id: "cb-1",
  legacyBlockId: "legacy-1",
  blockKey: "bk-1",
  unitId: "u-1",
};

describe("resolveHighlightWriteAnchor (CC-6D)", () => {
  it("legacy blockId-only write stays compatible — no ContentBlock, no version", async () => {
    const anchor = await resolveHighlightWriteAnchor(
      db({ chapterBlock: { content: "Hola mundo" } }),
      { blockId: "legacy-1", startOffset: 0, endOffset: 4 },
    );
    expect(anchor).toMatchObject({
      source: "legacy",
      contentBlockId: null,
      blockId: "legacy-1",
      blockVersionId: null,
      quote: "Hola",
    });
  });

  it("a Content Core write (blockKey) without a source version is rejected (400)", async () => {
    await expect(
      resolveHighlightWriteAnchor(db({ contentBlock: CB }), {
        blockKey: "bk-1",
        startOffset: 0,
        endOffset: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolveHighlightWriteAnchor(db({ contentBlock: CB }), {
        blockKey: "bk-1",
        startOffset: 0,
        endOffset: 3,
      }),
    ).rejects.toThrow(/SOURCE_BLOCK_VERSION_REQUIRED/);
  });
});

describe("resolveAnnotationWriteAnchor (CC-6D) — integrity vs retired content", () => {
  it("a broken publish pointer (no published revision) is a 500 integrity fault", async () => {
    const broken = db({
      contentBlock: CB,
      contentUnit: { editionId: "e-1" },
      edition: { publishedRevisionId: null },
    });
    await expect(
      resolveAnnotationWriteAnchor(broken, { blockKey: "bk-1" }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      resolveAnnotationWriteAnchor(broken, { blockKey: "bk-1" }),
    ).rejects.toThrow(/CONTENT_CORE_INTEGRITY_ERROR/);
  });

  it("a DRAFT published pointer is a 500 integrity fault", async () => {
    const draft = db({
      contentBlock: CB,
      contentUnit: { editionId: "e-1" },
      edition: { publishedRevisionId: "r-1" },
      revision: { status: "DRAFT" },
    });
    await expect(
      resolveAnnotationWriteAnchor(draft, { blockKey: "bk-1" }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("a retired unit is legitimate content state → 404, not 500", async () => {
    const retired = db({
      contentBlock: CB,
      contentUnit: { editionId: "e-1" },
      edition: { publishedRevisionId: "r-1" },
      revision: { status: "PUBLISHED" },
      revisionUnit: null, // unit not in the published manifest
    });
    await expect(
      resolveAnnotationWriteAnchor(retired, { blockKey: "bk-1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
