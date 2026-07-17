import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ingestUnitV2 } from "./ingest-v2";

/**
 * CC-6A: the ingest input boundary rejects an invalid block kind explicitly,
 * BEFORE opening a transaction — an invalid string never reaches Prisma as
 * `undefined`.
 */

describe("Content Core · ingest-v2 input boundary", () => {
  it("rejects an invalid block kind with INGEST_INVALID_BLOCK_KIND (no DB touched)", async () => {
    let touched = false;
    const fakePrisma = new Proxy(
      {},
      {
        get() {
          touched = true;
          throw new Error("PRISMA_TOUCHED");
        },
      },
    ) as unknown as PrismaClient;

    await expect(
      ingestUnitV2(fakePrisma, {
        editionId: "e",
        unitKey: "u",
        title: "t",
        placement: { order: 1, partNumber: null, partTitle: null },
        blocks: [
          { kind: "PARAGRAPH", content: "ok" },
          { kind: "BOGUS", content: "x" },
        ],
      }),
    ).rejects.toThrow(/INGEST_INVALID_BLOCK_KIND/);

    // The guard runs before `prisma.$transaction` → Prisma is never accessed.
    expect(touched).toBe(false);
  });
});
