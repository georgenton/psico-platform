import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ingestUnitV2 } from "./ingest-v2";

/**
 * CC-6A: the ingest input boundary rejects an invalid block kind explicitly,
 * BEFORE opening a transaction — an invalid string never reaches Prisma as
 * `undefined`.
 */

describe("Content Core · ingest-v2 input boundary", () => {
  function trackingPrisma(): { prisma: PrismaClient; touched: () => boolean } {
    let hit = false;
    const prisma = new Proxy(
      {},
      {
        get() {
          hit = true;
          throw new Error("PRISMA_TOUCHED");
        },
      },
    ) as unknown as PrismaClient;
    return { prisma, touched: () => hit };
  }

  const baseParams = {
    editionId: "e",
    unitKey: "u",
    title: "t",
    placement: { order: 1, partNumber: null, partTitle: null },
  };

  it("rejects an invalid block kind with INGEST_INVALID_BLOCK_KIND (no DB touched)", async () => {
    const { prisma, touched } = trackingPrisma();
    await expect(
      ingestUnitV2(prisma, {
        ...baseParams,
        blocks: [
          { kind: "PARAGRAPH", content: "ok" },
          { kind: "BOGUS", content: "x" },
        ],
      }),
    ).rejects.toThrow(/INGEST_INVALID_BLOCK_KIND/);
    expect(touched()).toBe(false);
  });

  it("rejects an empty unit with INGEST_EMPTY_UNIT (no DB touched)", async () => {
    const { prisma, touched } = trackingPrisma();
    await expect(
      ingestUnitV2(prisma, { ...baseParams, blocks: [] }),
    ).rejects.toThrow(/INGEST_EMPTY_UNIT/);
    expect(touched()).toBe(false);
  });
});
