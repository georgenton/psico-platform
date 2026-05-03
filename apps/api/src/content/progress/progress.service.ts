import { Injectable, NotFoundException } from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
import type { MarkProgressDto } from "../dto/mark-progress.dto";

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async markCompleted(userId: string, chapterId: string, dto: MarkProgressDto) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true },
    });
    if (!chapter) throw new NotFoundException(`Chapter not found`);

    return this.prisma.userProgress.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      create: { userId, chapterId, score: dto.score ?? null },
      update: { completedAt: new Date(), score: dto.score ?? null },
    });
  }

  getUserProgress(userId: string) {
    return this.prisma.userProgress.findMany({
      where: { userId },
      include: {
        chapter: {
          select: {
            id: true,
            bookId: true,
            order: true,
            title: true,
            book: { select: { slug: true, title: true } },
          },
        },
      },
      orderBy: { completedAt: "desc" },
    });
  }
}
