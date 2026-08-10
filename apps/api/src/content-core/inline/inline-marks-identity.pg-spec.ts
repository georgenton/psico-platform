import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillContentCore } from "../backfill";
import { backfillAnchors } from "../anchors";
import { saveUnitDraft, publishDraftRevision } from "../content-draft";
import { unitKeyFromLegacyChapterId } from "../lib/block-key";

/**
 * The invariant Rich Text V1 rests on.
 *
 * A formatting-only edit changes `meta` and nothing else. Because Content Core
 * derives block identity from the TEXT, that edit must leave the same
 * `ContentBlock` in place — and therefore leave every Highlight and Annotation
 * anchored to it exactly where the reader put them.
 *
 * This is proven against a real PostgreSQL rather than argued from reading the
 * code, because the whole feature is only safe if it is true. If storing
 * formatting ever re-keyed a block, an editor bolding one word would silently
 * detach every mark a reader had made on that paragraph.
 */

const DB = "rich_text_identity_db";
// The suite always runs from the workspace root, as its siblings assume.
const API_DIR = process.cwd();

const ORIGINAL = "La mente también aprende del cuerpo.";

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

const base = process.env.TEST_DATABASE_URL;
const run = base ? describe : describe.skip;

run("a formatting-only revision keeps block identity", () => {
  let pool: Pool;
  let prisma: PrismaClient;
  let editionId: string;
  let unitKey: string;
  let highlightId: string;
  let annotationId: string;
  let anchoredBlockId: string;
  let anchoredBlockKey: string;

  const placement = { order: 1, partNumber: null, partTitle: null };

  /** The published block rows a reader would receive. */
  async function publishedBlocks() {
    const ed = await prisma.edition.findUnique({ where: { id: editionId } });
    const ru = await prisma.revisionUnit.findFirst({
      where: {
        revisionId: ed!.publishedRevisionId!,
        unit: { unitKey },
      },
    });
    return prisma.blockVersion.findMany({
      where: { unitVersionId: ru!.unitVersionId },
      orderBy: { order: "asc" },
    });
  }

  async function currentBase(): Promise<string> {
    const draft = await prisma.revision.findFirst({
      where: { editionId, status: "DRAFT" },
      orderBy: { number: "desc" },
      select: { id: true },
    });
    if (draft) return draft.id;
    const ed = await prisma.edition.findUnique({ where: { id: editionId } });
    return ed!.publishedRevisionId!;
  }

  beforeAll(async () => {
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB}"`);
    await admin.end();

    const url = withDatabase(base as string, DB);
    execSync("pnpm exec prisma migrate deploy", {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: url, PRISMA_SKIP_SEED: "1" },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    const user = await prisma.user.create({
      data: { email: "rich@test.local", name: "Rich" },
    });
    const book = await prisma.book.create({
      data: { slug: "rich-book", title: "Rich" },
    });
    const ch = await prisma.chapter.create({
      data: { bookId: book.id, order: 1, title: "C1" },
    });
    unitKey = unitKeyFromLegacyChapterId(ch.id);

    const legacy = await prisma.chapterBlock.create({
      data: {
        chapterId: ch.id,
        order: 0,
        kind: "PARAGRAPH",
        content: ORIGINAL,
      },
    });

    // A reader who marked this paragraph BEFORE anyone thought about formatting.
    const h = await prisma.highlight.create({
      data: {
        userId: user.id,
        blockId: legacy.id,
        startOffset: 9,
        endOffset: 16,
        color: "YELLOW",
      },
    });
    highlightId = h.id;
    const a = await prisma.annotation.create({
      data: { userId: user.id, blockId: legacy.id, text: "una nota" },
    });
    annotationId = a.id;

    await backfillContentCore(prisma);
    await backfillAnchors(prisma);

    const edition = await prisma.edition.findUnique({
      where: { editionKey: "rich-book-1e" },
    });
    editionId = edition!.id;

    const anchored = await prisma.highlight.findUnique({
      where: { id: highlightId },
    });
    anchoredBlockId = anchored!.contentBlockId!;
    const cb = await prisma.contentBlock.findUnique({
      where: { id: anchoredBlockId },
    });
    anchoredBlockKey = cb!.blockKey;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
    const admin = new Pool({ connectionString: base });
    await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    await admin.end();
  });

  it("starts from a paragraph with a real reader mark on it", async () => {
    const blocks = await publishedBlocks();
    expect(blocks[0]!.content).toBe(ORIGINAL);
    // No formatting yet, and the mark is anchored.
    expect(blocks[0]!.meta).toBeNull();
    expect(anchoredBlockKey.length).toBeGreaterThan(0);
  });

  it("publishes formatting without touching the text or the identity", async () => {
    // Exactly what an editor does: same words, one phrase underlined.
    const saved = await saveUnitDraft(prisma, {
      editionId,
      expectedRevisionId: await currentBase(),
      unitKey,
      title: "C1",
      placement,
      blocks: [
        {
          kind: "PARAGRAPH",
          content: ORIGINAL,
          meta: {
            inlineMarks: [{ type: "UNDERLINE", startOffset: 9, endOffset: 16 }],
          },
        },
      ],
    });
    await publishDraftRevision(prisma, editionId, saved.revisionId);

    const blocks = await publishedBlocks();
    expect(blocks).toHaveLength(1);

    // 1. The text a reader receives is byte-identical — no markup, no syntax.
    expect(blocks[0]!.content).toBe(ORIGINAL);
    expect(blocks[0]!.content).not.toContain("<u>");
    expect(blocks[0]!.content).not.toContain("__");

    // 2. The formatting is there, as structured metadata.
    expect(blocks[0]!.meta).toEqual({
      inlineMarks: [{ type: "UNDERLINE", startOffset: 9, endOffset: 16 }],
    });

    // 3. Same ContentBlock, same key. This is the claim the feature rests on:
    //    identity comes from the text, and the text did not change.
    const cb = await prisma.contentBlock.findUnique({
      where: { id: anchoredBlockId },
    });
    expect(cb).not.toBeNull();
    expect(cb!.blockKey).toBe(anchoredBlockKey);
  });

  it("leaves the highlight exactly where the reader put it", async () => {
    const h = await prisma.highlight.findUnique({ where: { id: highlightId } });

    expect(h).not.toBeNull();
    expect(h!.contentBlockId).toBe(anchoredBlockId);
    // Offsets untouched: formatting may never move a reader's mark.
    expect(h!.startOffset).toBe(9);
    expect(h!.endOffset).toBe(16);
  });

  it("leaves the annotation anchored", async () => {
    const a = await prisma.annotation.findUnique({
      where: { id: annotationId },
    });
    expect(a).not.toBeNull();
    expect(a!.contentBlockId).toBe(anchoredBlockId);
  });

  it("stores no formatting syntax when the text itself is edited", async () => {
    // The production canary's actual shape: change some words AND underline a
    // phrase. The stored text must be the plain sentence, nothing more.
    const edited = "El cerebro también aprende.";
    const saved = await saveUnitDraft(prisma, {
      editionId,
      expectedRevisionId: await currentBase(),
      unitKey,
      title: "C1",
      placement,
      blocks: [
        {
          kind: "PARAGRAPH",
          content: edited,
          meta: {
            inlineMarks: [
              { type: "UNDERLINE", startOffset: 11, endOffset: 18 },
            ],
          },
        },
      ],
    });
    await publishDraftRevision(prisma, editionId, saved.revisionId);

    const blocks = await publishedBlocks();
    expect(blocks[0]!.content).toBe(edited);
    expect(edited.slice(11, 18)).toBe("también");
    // No markup of any kind reached storage.
    expect(blocks[0]!.content).not.toMatch(/[<>_*]/);
  });

  it("keeps a draft's formatting invisible until it is published", async () => {
    // Rich text does not get its own lifecycle. It rides the one the canary
    // already proved.
    const publishedBefore = await publishedBlocks();
    const metaBefore = publishedBefore[0]!.meta;

    await saveUnitDraft(prisma, {
      editionId,
      expectedRevisionId: await currentBase(),
      unitKey,
      title: "C1",
      placement,
      blocks: [
        {
          kind: "PARAGRAPH",
          content: "El cerebro también aprende.",
          meta: {
            inlineMarks: [{ type: "BOLD", startOffset: 0, endOffset: 10 }],
          },
        },
      ],
    });

    // The reader still receives the previously published formatting.
    const publishedAfterSave = await publishedBlocks();
    expect(publishedAfterSave[0]!.meta).toEqual(metaBefore);
  });
});
