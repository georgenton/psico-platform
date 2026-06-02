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
    await this.lector.assertBlockExists(dto.blockId);
    const created = await this.prisma.annotation.create({
      data: { userId, blockId: dto.blockId, text: dto.text },
    });
    return { ok: true, annotation: this.serialise(created) };
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
    return { ok: true, annotation: this.serialise(updated) };
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
  ): AnnotationSummary {
    return {
      id: a.id,
      blockId: a.blockId,
      text: a.text,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
