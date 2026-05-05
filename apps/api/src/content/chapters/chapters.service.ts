import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StorageService } from "../../storage";
import type { CreateChapterDto } from "../dto/create-chapter.dto";
import type { UploadAudioDto } from "../dto/upload-audio.dto";

const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  ANNUAL: 2,
  B2B: 3,
};

@Injectable()
export class ChaptersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findOne(slug: string, order: number, userPlan: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        order,
        isPublished: true,
        book: { slug, isPublished: true },
      },
      include: {
        book: { select: { plan: true, slug: true } },
        audios: true,
        exercises: { orderBy: { order: "asc" } },
      },
    });

    if (!chapter) {
      throw new NotFoundException(
        `Chapter ${order} not found in book '${slug}'`,
      );
    }

    if ((PLAN_RANK[chapter.book.plan] ?? 0) > (PLAN_RANK[userPlan] ?? 0)) {
      throw new ForbiddenException(
        `Este contenido requiere plan ${chapter.book.plan}. Actualiza tu plan.`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { book: _book, ...chapterData } = chapter;
    return chapterData;
  }

  async create(slug: string, dto: CreateChapterDto) {
    const book = await this.prisma.book.findUnique({
      where: { slug },
      select: { id: true, totalChapters: true },
    });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);

    const conflict = await this.prisma.chapter.findUnique({
      where: { bookId_order: { bookId: book.id, order: dto.order } },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException(
        `Chapter with order ${dto.order} already exists in book '${slug}'`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const chapter = await tx.chapter.create({
        data: {
          bookId: book.id,
          order: dto.order,
          title: dto.title,
          description: dto.description ?? null,
          durationMinutes: dto.durationMinutes ?? null,
        },
      });
      await tx.book.update({
        where: { id: book.id },
        data: { totalChapters: book.totalChapters + 1 },
      });
      return chapter;
    });
  }

  async uploadAudio(
    slug: string,
    order: number,
    file: Express.Multer.File,
    dto: UploadAudioDto,
  ) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { order, book: { slug } },
      select: { id: true },
    });
    if (!chapter) {
      throw new NotFoundException(
        `Chapter ${order} not found in book '${slug}'`,
      );
    }

    const ext = file.originalname.split(".").pop() ?? "mp3";
    const key = `audio/${slug}/${order}/${Date.now()}.${ext}`;
    const fileUrl = await this.storage.uploadFile(
      file.buffer,
      key,
      file.mimetype,
    );

    return this.prisma.audio.create({
      data: {
        chapterId: chapter.id,
        title: dto.title,
        fileUrl,
        durationSeconds: dto.durationSeconds,
      },
    });
  }
}
