import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AnnotationSummary,
  CreateAnnotationResponse,
  UpdateAnnotationResponse,
} from "@psico/types";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { blockKeyFromLegacyId } from "../content-core/lib/block-key";
import {
  resolveAnnotationWriteAnchor,
  resolveStoredMarkBlockKey,
} from "../content-core/marks/mark-anchor";
import type {
  CreateAnnotationDto,
  UpdateAnnotationDto,
} from "./dto/create-annotation.dto";
import { LectorService } from "./lector.service";

@Injectable()
export class AnnotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lector: LectorService,
  ) {}

  async create(
    userId: string,
    dto: CreateAnnotationDto,
  ): Promise<CreateAnnotationResponse> {
    // CC-6C: resolve the durable anchor. On the Content Core path the block must
    // still be live in the published edition; pure Content Core blocks are OK.
    const anchor = await resolveAnnotationWriteAnchor(this.prisma, {
      blockKey: dto.blockKey,
      blockId: dto.blockId,
    });
    const created = await this.prisma.annotation.create({
      data: {
        userId,
        blockId: anchor.blockId,
        contentBlockId: anchor.contentBlockId,
        text: dto.text,
      },
    });
    return { ok: true, annotation: this.serialise(created, anchor.blockKey) };
  }

  async update(
    userId: string,
    annotationId: string,
    dto: UpdateAnnotationDto,
  ): Promise<UpdateAnnotationResponse> {
    const existing = await this.prisma.annotation.findUnique({
      where: { id: annotationId },
      select: { userId: true },
    });
    if (!existing) throw new NotFoundException("ANNOTATION_NOT_FOUND");
    if (existing.userId !== userId) throw new ForbiddenException("FORBIDDEN");
    const updated = await this.prisma.annotation.update({
      where: { id: annotationId },
      data: { text: dto.text },
    });
    // CC-6C: re-resolve the stable identity so a pure-core annotation never
    // serialises blockKey="" and stays bucketed on the client after an edit.
    const blockKey = await resolveStoredMarkBlockKey(this.prisma, updated);
    return { ok: true, annotation: this.serialise(updated, blockKey) };
  }

  async delete(userId: string, annotationId: string): Promise<void> {
    const existing = await this.prisma.annotation.findUnique({
      where: { id: annotationId },
      select: { userId: true },
    });
    if (!existing) throw new NotFoundException("ANNOTATION_NOT_FOUND");
    if (existing.userId !== userId) throw new ForbiddenException("FORBIDDEN");
    await this.prisma.annotation.delete({ where: { id: annotationId } });
  }

  private serialise(
    a: Awaited<ReturnType<PrismaService["annotation"]["create"]>>,
    // Public identity: the resolver's blockKey (create), or derived from the
    // legacy anchor. A pure-core row has no blockId.
    blockKey = a.blockId ? blockKeyFromLegacyId(a.blockId) : "",
  ): AnnotationSummary {
    return {
      id: a.id,
      blockKey,
      blockId: a.blockId,
      text: a.text,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
