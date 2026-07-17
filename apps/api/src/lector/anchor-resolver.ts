import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

/**
 * CC-6B anchor bridge (pure). Resolve a mark target from `{ blockKey?, blockId? }`
 * to the storage anchor `{ blockId, contentBlockId }`, fail-closed:
 *  - `blockKey` present → the ContentBlock's legacy binding is the anchor; if a
 *    `blockId` is ALSO given it must correspond, else ANCHOR_IDENTITY_MISMATCH;
 *  - `blockKey` for a pure Content Core block (no legacy binding) → not yet
 *    anchorable (ANCHOR_UNSUPPORTED_CORE_BLOCK);
 *  - only `blockId` → legacy path (dual-writes contentBlockId when it exists);
 *  - neither → ANCHOR_MISSING_TARGET.
 * `contentBlockId` is stored for the dual-read bridge; it is NEVER a public id.
 */
export async function resolveAnchorTarget(
  prisma: Pick<PrismaClient, "contentBlock">,
  input: { blockKey?: string; blockId?: string },
): Promise<{ blockId: string; contentBlockId: string | null }> {
  if (input.blockKey) {
    const cb = await prisma.contentBlock.findUnique({
      where: { blockKey: input.blockKey },
      select: { id: true, legacyBlockId: true },
    });
    if (!cb) throw new NotFoundException("BLOCK_NOT_FOUND");
    if (!cb.legacyBlockId) {
      throw new BadRequestException("ANCHOR_UNSUPPORTED_CORE_BLOCK");
    }
    if (input.blockId && input.blockId !== cb.legacyBlockId) {
      throw new BadRequestException("ANCHOR_IDENTITY_MISMATCH");
    }
    return { blockId: cb.legacyBlockId, contentBlockId: cb.id };
  }

  if (input.blockId) {
    const cb = await prisma.contentBlock.findUnique({
      where: { legacyBlockId: input.blockId },
      select: { id: true },
    });
    return { blockId: input.blockId, contentBlockId: cb?.id ?? null };
  }

  throw new BadRequestException("ANCHOR_MISSING_TARGET");
}
