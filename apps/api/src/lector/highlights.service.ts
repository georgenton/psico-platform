import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CreateHighlightResponse, HighlightSummary } from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
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
    // Service-level validation: the block exists AND the offsets are sane.
    // Doing this here (not in the DTO) because both checks need DB access.
    await this.lector.validateHighlightOffsets(
      dto.blockId,
      dto.startOffset,
      dto.endOffset,
    );

    const created = await this.prisma.highlight.create({
      data: {
        userId,
        blockId: dto.blockId,
        startOffset: dto.startOffset,
        endOffset: dto.endOffset,
        color: dto.color ?? "YELLOW",
        note: dto.note ?? null,
      },
    });

    return {
      ok: true,
      highlight: this.serialise(created),
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
  ): HighlightSummary {
    return {
      id: h.id,
      blockId: h.blockId,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
      color: h.color,
      note: h.note,
      createdAt: h.createdAt,
    };
  }
}
