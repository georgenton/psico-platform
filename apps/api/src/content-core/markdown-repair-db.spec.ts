import { describe, expect, it } from "vitest";

import { INLINE_MARKS_META_KEY } from "@psico/types";

import {
  blockVersionDrifts,
  expectedBlockVersionFields,
} from "./backfill-inspect";
import { contentHash } from "./lib/content-hash";
import {
  applyOp,
  CONCURRENT_CHANGE,
  MISSING_ROW,
  WRITE_LOST,
  type Preimage,
} from "./markdown-repair-db";
import { planEmphasisRepair, type EmphasisOp } from "./markdown-repair";

const TEXT = "Un **modelo generativo** explica";
const REPAIRED = "Un modelo generativo explica";

interface Row {
  id: string;
  startOffset: number;
  endOffset: number;
  quote: string | null;
}

/**
 * A fake that HONOURS its filters.
 *
 * The previous version of this double ignored `where` and answered every
 * `findMany` with its whole fixture. That made a test named "never writes a
 * highlight the plan did not account for" pass against an implementation that
 * queried `id IN (planned ids)` — a query which, with an empty plan, is
 * `id IN ()` and therefore finds nothing and reassures about nothing. The test
 * proved the fixture, not the code.
 *
 * So the filters are implemented, narrowly and only in the shapes this module
 * uses. The concurrency cases that need a real server — a row changing between
 * the check and the write, a highlight inserted by another session — live in
 * `markdown-repair.pg-spec.ts`, against PostgreSQL.
 */
function fakeClient(
  over: {
    content?: string;
    meta?: unknown;
    versionContent?: string;
    versionMeta?: unknown;
    highlights?: Row[];
    dropBlock?: boolean;
    dropVersion?: boolean;
  } = {},
) {
  const content = over.content ?? TEXT;
  const writes: { table: string; id: string; data: Record<string, unknown> }[] =
    [];
  const highlights: Row[] = [...(over.highlights ?? [])];
  const state = { content, meta: over.meta ?? null };

  const client = {
    chapterBlock: {
      findMany: async (args: { where: { id: string } }) =>
        over.dropBlock || args.where.id !== "cb-1"
          ? []
          : [
              {
                id: "cb-1",
                order: 7,
                kind: "PARAGRAPH",
                content: state.content,
                meta: state.meta,
                chapter: { order: 1 },
              },
            ],
    },
    blockVersion: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        over.dropVersion || !args.where.id.in.includes("bv-1")
          ? []
          : [
              {
                id: "bv-1",
                contentBlockId: "ccb-1",
                unitVersionId: "uv-1",
                order: 7,
                kind: "PARAGRAPH",
                content: over.versionContent ?? content,
                contentHash: contentHash(over.versionContent ?? content),
                meta: over.versionMeta ?? over.meta ?? null,
              },
            ],
    },
    highlight: {
      // The real query is by ANCHOR, and the fake answers by anchor.
      findMany: async (args: {
        where: { OR: { blockId?: string; contentBlockId?: string }[] };
      }) => {
        const wanted = args.where.OR.some(
          (c) => c.blockId === "cb-1" || c.contentBlockId === "ccb-1",
        );
        return wanted
          ? highlights.map((h) => ({
              ...h,
              blockId: "cb-1",
              contentBlockId: "ccb-1",
              blockVersionId: "bv-1",
            }))
          : [];
      },
      updateMany: async (args: {
        where: { id: string; startOffset: number; endOffset: number };
        data: Record<string, unknown>;
      }) => {
        const i = highlights.findIndex(
          (h) =>
            h.id === args.where.id &&
            h.startOffset === args.where.startOffset &&
            h.endOffset === args.where.endOffset,
        );
        if (i < 0) return { count: 0 };
        writes.push({
          table: "Highlight",
          id: args.where.id,
          data: args.data,
        });
        return { count: 1 };
      },
    },
    contentBlock: { findMany: async () => [] },
    annotation: { findMany: async () => [] },
    readingSession: { findMany: async () => [] },
    // The conditional update, honouring its own conditions.
    $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('"ChapterBlock"')) {
        const [newContent, newMeta, id, oldContent, oldMeta] = params as [
          string,
          string,
          string,
          string,
          string | null,
        ];
        const metaNow = state.meta === null ? null : JSON.stringify(state.meta);
        if (
          id !== "cb-1" ||
          state.content !== oldContent ||
          metaNow !== oldMeta
        ) {
          return 0;
        }
        state.content = newContent;
        state.meta = JSON.parse(newMeta);
        writes.push({
          table: "ChapterBlock",
          id,
          data: { content: newContent, meta: JSON.parse(newMeta) },
        });
        return 1;
      }
      const [newContent, newHash, newMeta, id] = params as [
        string,
        string,
        string,
        string,
      ];
      writes.push({
        table: "BlockVersion",
        id,
        data: {
          content: newContent,
          contentHash: newHash,
          meta: JSON.parse(newMeta),
        },
      });
      return 1;
    },
  };

  return { client, writes, highlights };
}

function opFor(over: Parameters<typeof fakeClient>[0] = {}): EmphasisOp {
  const content = over.content ?? TEXT;
  const plan = planEmphasisRepair({
    bookSlug: "emociones-en-construccion",
    blocks: [
      {
        chapterBlockId: "cb-1",
        chapterOrder: 1,
        order: 7,
        kind: "PARAGRAPH",
        content,
        meta: over.meta ?? null,
        contentBlockId: "ccb-1",
        blockKey: "key-1",
        versions: [
          {
            id: "bv-1",
            unitVersionId: "uv-1",
            order: 7,
            kind: "PARAGRAPH",
            content,
            contentHash: contentHash(content),
            meta: over.meta ?? null,
          },
        ],
        highlights: (over.highlights ?? []).map((h) => ({
          ...h,
          blockVersionId: "bv-1",
        })),
        annotations: 0,
        readingSessions: 0,
      },
    ],
  });
  const op = plan.ops[0];
  if (!op) throw new Error(`no op planned: ${JSON.stringify(plan.blockers)}`);
  return op;
}

describe("applyOp · what it writes", () => {
  it("writes the same text and the same meta to both representations", async () => {
    const { client, writes } = fakeClient();
    await applyOp(client as never, opFor(), () => undefined);

    const legacy = writes.find((w) => w.table === "ChapterBlock")!;
    const native = writes.find((w) => w.table === "BlockVersion")!;
    expect(legacy.data.content).toBe(REPAIRED);
    expect(native.data.content).toBe(REPAIRED);
    expect(native.data.contentHash).toBe(contentHash(REPAIRED));
    expect(JSON.stringify(native.data.meta)).toBe(
      JSON.stringify(legacy.data.meta),
    );
    expect(
      (legacy.data.meta as Record<string, unknown>)[INLINE_MARKS_META_KEY],
    ).toEqual([{ type: "BOLD", startOffset: 3, endOffset: 20 }]);
  });

  it("leaves the two representations with no drift, by the inspector's own test", async () => {
    const { client, writes } = fakeClient();
    await applyOp(client as never, opFor(), () => undefined);
    const legacy = writes.find((w) => w.table === "ChapterBlock")!.data;
    const native = writes.find((w) => w.table === "BlockVersion")!.data;

    const drifts = blockVersionDrifts(
      {
        order: 7,
        kind: "PARAGRAPH" as never,
        content: native.content as string,
        contentHash: native.contentHash as string,
        meta: native.meta as never,
      },
      expectedBlockVersionFields({
        order: 7,
        kind: "PARAGRAPH",
        content: legacy.content as string,
        meta: legacy.meta as never,
      }),
    );
    expect(drifts).toBe(false);
  });

  it("records the preimage BEFORE it writes anything", async () => {
    const seen: { preimages: number; writes: number }[] = [];
    const { client, writes } = fakeClient();
    const taken: Preimage[] = [];
    await applyOp(client as never, opFor(), (pre) => {
      taken.push(pre);
      seen.push({ preimages: taken.length, writes: writes.length });
    });
    expect(seen).toEqual([{ preimages: 1, writes: 0 }]);
    expect(taken[0]!.contentDigest).toMatch(/^sha256:/);
    expect(taken[0]!.versions.map((v) => v.id)).toEqual(["bv-1"]);
  });

  it("moves a highlight and rewrites the quote the delimiters had polluted", async () => {
    const highlights = [
      {
        id: "h-1",
        startOffset: 0,
        endOffset: 24,
        quote: "Un **modelo generativo**",
      },
    ];
    const { client, writes } = fakeClient({ highlights });
    await applyOp(client as never, opFor({ highlights }), () => undefined);
    const h = writes.find((w) => w.table === "Highlight")!;
    expect(h.data).toEqual({
      startOffset: 0,
      endOffset: 20,
      quote: "Un modelo generativo",
    });
  });

  it("takes the preimage from the anchors, so a revert can put it back", async () => {
    const highlights = [
      { id: "h-1", startOffset: 5, endOffset: 11, quote: "modelo" },
    ];
    const { client } = fakeClient({ highlights });
    const taken: Preimage[] = [];
    await applyOp(client as never, opFor({ highlights }), (p) => taken.push(p));
    expect(taken[0]!.highlights).toEqual([
      { id: "h-1", startOffset: 5, endOffset: 11, quote: "modelo" },
    ]);
  });
});

describe("applyOp · what it refuses", () => {
  it("refuses when the legacy text moved since the plan", async () => {
    const { client, writes } = fakeClient({ content: "Otro **texto** ya" });
    await expect(
      applyOp(client as never, opFor(), () => undefined),
    ).rejects.toThrow(CONCURRENT_CHANGE);
    expect(writes).toHaveLength(0);
  });

  it("refuses when the legacy METADATA moved since the plan", async () => {
    // Not the text, and not the marks this repair writes — some other key in
    // the same JSON. Conditioning on text alone would overwrite it.
    const { client, writes } = fakeClient({ meta: { audioId: "a-9" } });
    await expect(
      applyOp(client as never, opFor(), () => undefined),
    ).rejects.toThrow(CONCURRENT_CHANGE);
    expect(writes).toHaveLength(0);
  });

  it("refuses when only the native side moved", async () => {
    const { client, writes } = fakeClient({
      versionContent: "Un **modelo generativo** explica más",
    });
    await expect(
      applyOp(client as never, opFor(), () => undefined),
    ).rejects.toThrow(CONCURRENT_CHANGE);
    expect(writes).toHaveLength(0);
  });

  it("refuses when a highlight moved since the plan", async () => {
    const planned = [
      { id: "h-1", startOffset: 5, endOffset: 11, quote: "modelo" },
    ];
    const op = opFor({ highlights: planned });
    const { client, writes } = fakeClient({
      highlights: [{ id: "h-1", startOffset: 0, endOffset: 2, quote: null }],
    });
    await expect(applyOp(client as never, op, () => undefined)).rejects.toThrow(
      CONCURRENT_CHANGE,
    );
    expect(writes).toHaveLength(0);
  });

  it("refuses when a row the plan named is gone", async () => {
    for (const gone of [{ dropBlock: true }, { dropVersion: true }]) {
      const { client, writes } = fakeClient(gone);
      await expect(
        applyOp(client as never, opFor(), () => undefined),
      ).rejects.toThrow(MISSING_ROW);
      expect(writes).toHaveLength(0);
    }
  });

  it("refuses when the conditional write matches nothing", async () => {
    // Every read-time check passes and then the row changes. The conditional
    // update answers 0, exactly as PostgreSQL would.
    const { client } = fakeClient();
    const sabotaged = { ...client, $executeRawUnsafe: async () => 0 };
    await expect(
      applyOp(sabotaged as never, opFor(), () => undefined),
    ).rejects.toThrow(WRITE_LOST);
  });
});
