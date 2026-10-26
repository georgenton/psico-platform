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
  type Preimage,
} from "./markdown-repair-db";
import { planEmphasisRepair, type EmphasisOp } from "./markdown-repair";

const TEXT = "Un **modelo generativo** explica";
const REPAIRED = "Un modelo generativo explica";

/**
 * A client that records what it was asked to write.
 *
 * Deliberately a fake and not a real PostgreSQL: what these cases exercise is
 * the REFUSAL logic — rows that moved, rows that vanished — and each of those
 * states is easier to construct here, exactly once, than to provoke in a
 * database. The shape of the writes is then checked against
 * `blockVersionDrifts`, which is the same function the backfill inspector uses,
 * so "no drift afterwards" is asserted with the real comparator rather than a
 * restatement of it.
 */
function fakeClient(
  over: {
    content?: string;
    meta?: unknown;
    versionContent?: string;
    highlights?: {
      id: string;
      startOffset: number;
      endOffset: number;
      quote: string | null;
    }[];
    dropBlock?: boolean;
    dropVersion?: boolean;
  } = {},
) {
  const content = over.content ?? TEXT;
  const writes: { table: string; id: string; data: Record<string, unknown> }[] =
    [];
  const highlights = over.highlights ?? [];

  const client = {
    chapterBlock: {
      findMany: async () =>
        over.dropBlock
          ? []
          : [
              {
                id: "cb-1",
                order: 7,
                kind: "PARAGRAPH",
                content,
                meta: over.meta ?? null,
                chapter: { order: 1 },
              },
            ],
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        writes.push({
          table: "ChapterBlock",
          id: args.where.id,
          data: args.data,
        });
        return {};
      },
    },
    blockVersion: {
      findMany: async () =>
        over.dropVersion
          ? []
          : [
              {
                id: "bv-1",
                contentBlockId: "ccb-1",
                unitVersionId: "uv-1",
                content: over.versionContent ?? content,
                contentHash: contentHash(over.versionContent ?? content),
                meta: over.meta ?? null,
              },
            ],
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        writes.push({
          table: "BlockVersion",
          id: args.where.id,
          data: args.data,
        });
        return {};
      },
    },
    highlight: {
      findMany: async () =>
        highlights.map((h) => ({
          ...h,
          blockId: "cb-1",
          contentBlockId: "ccb-1",
          blockVersionId: "bv-1",
        })),
      update: async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        writes.push({ table: "Highlight", id: args.where.id, data: args.data });
        return {};
      },
    },
    contentBlock: { findMany: async () => [] },
    annotation: { findMany: async () => [] },
    readingSession: { findMany: async () => [] },
  };

  return { client, writes };
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
    // This is the condition that makes the repair whole rather than half: the
    // backfill inspector must not be able to tell the two sides apart.
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
    // One preimage, taken when nothing had been written yet — so a reversal
    // exists even if the process dies between statements.
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
      // The quote is the durable re-anchor fallback: one with asterisks in it
      // would stop matching the repaired text, which is the opposite of durable.
      quote: "Un modelo generativo",
    });
  });
});

describe("applyOp · what it refuses", () => {
  it("refuses when the legacy text moved since the plan", async () => {
    const { client, writes } = fakeClient({ content: "Otro **texto** ya" });
    await expect(
      applyOp(client as never, opFor(), () => undefined),
    ).rejects.toThrow(CONCURRENT_CHANGE);
    // And nothing was written: the editor's save is not discarded.
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
    // The same highlight, now selecting something else.
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

  it("never writes a highlight the plan did not account for", async () => {
    // The plan has no highlights; the database has one. Applying would leave an
    // offset pointing into text that just got shorter.
    const { client, writes } = fakeClient({
      highlights: [
        { id: "h-ghost", startOffset: 0, endOffset: 2, quote: null },
      ],
    });
    await expect(
      applyOp(client as never, opFor(), () => undefined),
    ).rejects.toThrow(MISSING_ROW);
    expect(writes).toHaveLength(0);
  });
});
