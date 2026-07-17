import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CreateHighlightResponse, HighlightSummary } from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { blockKeyFromLegacyId } from "../content-core/lib/block-key";
import { resolveHighlightWriteAnchor } from "../content-core/marks/mark-anchor";
import type { CreateHighlightDto } from "./dto/create-highlight.dto";
import { LectorService } from "./lector.service";

@Injectable()
export class HighlightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lector: LectorService,
  ) {}

  async create(
    userId: string,
    dto: CreateHighlightDto,
  ): Promise<CreateHighlightResponse> {
    // CC-6C: resolve the durable anchor + validate the offsets against the
    // CURRENT published BlockVersion (never the legacy ChapterBlock) and capture
    // the exact quote snapshot. Pure Content Core blocks are allowed.
    const anchor = await resolveHighlightWriteAnchor(this.prisma, {
      blockKey: dto.blockKey,
      blockId: dto.blockId,
      startOffset: dto.startOffset,
      endOffset: dto.endOffset,
    });

    const created = await this.prisma.highlight.create({
      data: {
        userId,
        blockId: anchor.blockId,
        contentBlockId: anchor.contentBlockId,
        blockVersionId: anchor.blockVersionId,
        quote: anchor.quote,
        startOffset: dto.startOffset,
        endOffset: dto.endOffset,
        color: dto.color ?? "YELLOW",
        note: dto.note ?? null,
      },
    });

    return {
      ok: true,
      highlight: this.serialise(created, anchor.blockKey),
    };
  }

  async delete(userId: string, highlightId: string): Promise<void> {
    const existing = await this.prisma.highlight.findUnique({
      where: { id: highlightId },
      select: { userId: true },
    });
    if (!existing) throw new NotFoundException("HIGHLIGHT_NOT_FOUND");
    // Ownership check — strict. A user cannot delete a highlight on a
    // chapter they share with someone else.
    if (existing.userId !== userId) throw new ForbiddenException("FORBIDDEN");
    await this.prisma.highlight.delete({ where: { id: highlightId } });
  }

  private serialise(
    h: Awaited<ReturnType<PrismaService["highlight"]["create"]>>,
    // Public identity: the resolver's blockKey (create), or derived from the
    // legacy anchor for legacy-anchored rows. A pure-core row has no blockId.
    blockKey = h.blockId ? blockKeyFromLegacyId(h.blockId) : "",
  ): HighlightSummary {
    return {
      id: h.id,
      blockKey,
      blockId: h.blockId,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
      color: h.color,
      note: h.note,
      createdAt: h.createdAt,
    };
  }
}
