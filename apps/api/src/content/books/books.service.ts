import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../../prisma";
import type { CreateBookDto } from "../dto/create-book.dto";
import type { UpdateBookDto } from "../dto/update-book.dto";

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  findAllPublished() {
    return this.prisma.book.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        coverUrl: true,
        totalChapters: true,
        plan: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findBySlug(slug: string) {
    const book = await this.prisma.book.findUnique({
      where: { slug, isPublished: true },
      include: {
        chapters: {
          where: { isPublished: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
    return book;
  }

  async create(dto: CreateBookDto) {
    const exists = await this.prisma.book.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (exists)
      throw new ConflictException(`Slug '${dto.slug}' is already taken`);

    return this.prisma.book.create({
      data: {
        slug: dto.slug,
        title: dto.title,
        description: dto.description,
        coverUrl: dto.coverUrl,
        plan: dto.plan,
      },
    });
  }

  async update(slug: string, dto: UpdateBookDto) {
    await this.ensureExists(slug);
    return this.prisma.book.update({
      where: { slug },
      data: dto,
    });
  }

  private async ensureExists(slug: string): Promise<void> {
    const book = await this.prisma.book.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!book) throw new NotFoundException(`Book '${slug}' not found`);
  }
}
