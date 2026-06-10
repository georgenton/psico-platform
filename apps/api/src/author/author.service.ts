import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type { CreateAuthorBookDto } from "./dto/create-book.dto";
import type { UpdateAuthorBookDto } from "./dto/update-book.dto";
import type { UpdateChapterDto } from "./dto/update-chapter.dto";
import type { UpdateStructureDto } from "./dto/update-structure.dto";

/**
 * AuthorService — backend del Editor de autor (B2B).
 *
 * Lifecycle del libro:
 *   DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED (one-way)
 *           ↑                      ↑
 *           └──── admin rejects ───┘
 *
 * Cuando un libro pasa a PUBLISHED, este servicio realiza un copy-on-publish
 * a la tabla `Book` + `ChapterBlock` para que el catálogo público y el lector
 * consuman desde ahí. v1 no implementa el copy-on-publish completo — solo
 * marca el AuthorBook con `publishedAt` y delega al admin la promoción real
 * (cierra en sprint posterior).
 *
 * Ownership: cada endpoint hace ownership check explícito porque el
 * RolesGuard solo valida que `req.user.role === "AUTHOR"`. Un autor no puede
 * tocar libros de otro autor.
 */
@Injectable()
export class AuthorService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(userId: string) {
    const [author, books] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          firstName: true,
          email: true,
          role: true,
        },
      }),
      this.prisma.authorBook.findMany({
        where: { authorUserId: userId },
        orderBy: [{ updatedAt: "desc" }],
        include: {
          _count: { select: { chapters: true } },
        },
      }),
    ]);

    if (!author) throw new NotFoundException("USER_NOT_FOUND");

    return {
      author: {
        id: author.id,
        name: author.firstName ?? author.name,
        title: "Autor", // catálogo de títulos llega en S71.B
        verified: false, // license verification pending
        tier: "free" as const,
      },
      books: books.map((b) => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        status: b.status,
        cover: b.cover,
        chapters: b._count.chapters,
        lastEditedAt: b.updatedAt,
        publishedAt: b.publishedAt,
        archivedAt: b.archivedAt,
      })),
      templates: [],
      aiHelpers: [
        { id: "revisar", label: "Revisar tono" },
        { id: "ejemplo", label: "Sugerir ejemplo" },
        { id: "tono", label: "Cambiar tono" },
        { id: "simplificar", label: "Simplificar" },
      ],
      publicationSteps: [
        { id: "cover", label: "Portada definida", blocker: true },
        { id: "min-chapters", label: "Al menos 3 capítulos", blocker: true },
        { id: "summary", label: "Resumen del libro completo", blocker: true },
        { id: "terms", label: "Aceptación de términos", blocker: true },
      ],
    };
  }

  // ── Books CRUD ────────────────────────────────────────────────────────────

  async createBook(userId: string, dto: CreateAuthorBookDto) {
    const book = await this.prisma.authorBook.create({
      data: {
        authorUserId: userId,
        title: dto.title,
        status: "DRAFT",
      },
    });
    // Crear un capítulo placeholder vacío para que el editor tenga algo que abrir.
    await this.prisma.authorBookChapter.create({
      data: {
        bookId: book.id,
        n: 1,
        title: "Capítulo 1",
        blocks: [{ kind: "paragraph", content: "" }],
      },
    });
    return { ok: true as const, bookId: book.id };
  }

  async getBook(userId: string, bookId: string) {
    const book = await this.findOwnedBookOr404(userId, bookId);
    const chapters = await this.prisma.authorBookChapter.findMany({
      where: { bookId },
      orderBy: { n: "asc" },
      select: {
        id: true,
        n: true,
        title: true,
        subtitle: true,
        isLocked: true,
        isHidden: true,
        version: true,
        updatedAt: true,
      },
    });
    return {
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      summary: book.summary,
      status: book.status,
      cover: book.cover,
      coverArtUrl: book.coverArtUrl,
      categoryId: book.categoryId,
      language: book.language,
      publishedAt: book.publishedAt,
      archivedAt: book.archivedAt,
      submittedAt: book.submittedAt,
      structure: chapters,
    };
  }

  async updateBook(userId: string, bookId: string, dto: UpdateAuthorBookDto) {
    await this.findOwnedBookOr404(userId, bookId);
    const updated = await this.prisma.authorBook.update({
      where: { id: bookId },
      data: dto,
    });
    return { ok: true as const, updatedAt: updated.updatedAt };
  }

  async archiveBook(userId: string, bookId: string) {
    const book = await this.findOwnedBookOr404(userId, bookId);
    if (book.status === "ARCHIVED") {
      return { ok: true as const, alreadyArchived: true as const };
    }
    await this.prisma.authorBook.update({
      where: { id: bookId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return { ok: true as const };
  }

  // ── Chapters ─────────────────────────────────────────────────────────────

  async getChapter(userId: string, bookId: string, n: number) {
    await this.findOwnedBookOr404(userId, bookId);
    const chapter = await this.prisma.authorBookChapter.findUnique({
      where: { bookId_n: { bookId, n } },
    });
    if (!chapter) throw new NotFoundException("CHAPTER_NOT_FOUND");
    return {
      id: chapter.id,
      n: chapter.n,
      title: chapter.title,
      subtitle: chapter.subtitle,
      blocks: chapter.blocks,
      isLocked: chapter.isLocked,
      isHidden: chapter.isHidden,
      version: chapter.version,
      updatedAt: chapter.updatedAt,
    };
  }

  async updateChapter(
    userId: string,
    bookId: string,
    n: number,
    dto: UpdateChapterDto,
  ) {
    await this.findOwnedBookOr404(userId, bookId);
    const existing = await this.prisma.authorBookChapter.findUnique({
      where: { bookId_n: { bookId, n } },
      select: { id: true, version: true },
    });
    if (!existing) throw new NotFoundException("CHAPTER_NOT_FOUND");

    if (dto.expectedVersion && dto.expectedVersion !== existing.version) {
      throw new ConflictException({
        code: "CHAPTER_VERSION_CONFLICT",
        currentVersion: existing.version,
        sentVersion: dto.expectedVersion,
      });
    }

    const data: Record<string, unknown> = {
      version: existing.version + 1,
    };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle;
    if (dto.blocks !== undefined) data.blocks = dto.blocks;
    if (dto.isLocked !== undefined) data.isLocked = dto.isLocked;
    if (dto.isHidden !== undefined) data.isHidden = dto.isHidden;

    const updated = await this.prisma.authorBookChapter.update({
      where: { id: existing.id },
      data,
    });
    return { ok: true as const, version: updated.version };
  }

  // ── Structure (reordenar / añadir / eliminar) ────────────────────────────

  async updateStructure(userId: string, bookId: string, dto: UpdateStructureDto) {
    await this.findOwnedBookOr404(userId, bookId);

    // Verify all n's are unique and contiguous from 1.
    const ns = dto.chapters.map((c) => c.n).sort((a, b) => a - b);
    for (let i = 0; i < ns.length; i++) {
      if (ns[i] !== i + 1) {
        throw new BadRequestException({
          code: "STRUCTURE_NUMBERING_INVALID",
          message: "Los capítulos deben numerarse consecutivamente desde 1.",
          expected: i + 1,
          got: ns[i],
        });
      }
    }

    const existing = await this.prisma.authorBookChapter.findMany({
      where: { bookId },
      select: { id: true, n: true },
    });
    const existingNs = new Set(existing.map((c) => c.n));
    const requestedNs = new Set(dto.chapters.map((c) => c.n));

    // Delete chapters whose n is no longer in the structure.
    const toDelete = existing.filter((c) => !requestedNs.has(c.n));
    if (toDelete.length > 0) {
      await this.prisma.authorBookChapter.deleteMany({
        where: { id: { in: toDelete.map((c) => c.id) } },
      });
    }

    // Upsert each requested chapter. Two-phase to avoid unique-key collisions
    // when reordering: move all to negative n, then move into final positions.
    await this.prisma.$transaction(async (tx) => {
      // Phase 1: negative ns for all kept rows.
      for (const c of existing.filter((c) => requestedNs.has(c.n))) {
        await tx.authorBookChapter.update({
          where: { id: c.id },
          data: { n: -c.n },
        });
      }
      // Phase 2: assign final n + metadata for each requested chapter.
      for (const c of dto.chapters) {
        if (existingNs.has(c.n)) {
          const row = existing.find((e) => e.n === c.n);
          await tx.authorBookChapter.update({
            where: { id: row!.id },
            data: {
              n: c.n,
              title: c.title,
              subtitle: c.subtitle,
              isLocked: c.isLocked,
              isHidden: c.isHidden,
            },
          });
        } else {
          // New chapter at this n.
          await tx.authorBookChapter.create({
            data: {
              bookId,
              n: c.n,
              title: c.title ?? `Capítulo ${c.n}`,
              subtitle: c.subtitle,
              isLocked: c.isLocked ?? false,
              isHidden: c.isHidden ?? false,
              blocks: [{ kind: "paragraph", content: "" }],
            },
          });
        }
      }
    });

    return { ok: true as const, count: dto.chapters.length };
  }

  // ── Publication ──────────────────────────────────────────────────────────

  async getPublicationState(userId: string, bookId: string) {
    const book = await this.findOwnedBookOr404(userId, bookId);
    const chapters = await this.prisma.authorBookChapter.count({
      where: { bookId, isHidden: false },
    });

    const steps = [
      {
        id: "cover",
        label: "Portada definida",
        done: book.cover !== "warm" || !!book.coverArtUrl,
        blocker: true,
      },
      {
        id: "min-chapters",
        label: "Al menos 3 capítulos publicables",
        done: chapters >= 3,
        blocker: true,
      },
      {
        id: "summary",
        label: "Resumen del libro",
        done: !!book.summary && book.summary.length >= 50,
        blocker: true,
      },
      {
        id: "terms",
        label: "Aceptación de términos",
        done: false, // Hooked by client-side checkbox; v2 persists this
        blocker: true,
      },
    ];

    const lastRequest = await this.prisma.authorPublicationRequest.findFirst({
      where: { bookId },
      orderBy: { submittedAt: "desc" },
    });

    return {
      bookId,
      status: book.status,
      steps,
      reviewState: lastRequest?.reviewState ?? null,
      submittedAt: book.submittedAt,
      feedback: lastRequest?.feedback ?? null,
    };
  }

  async submitForReview(userId: string, bookId: string) {
    const book = await this.findOwnedBookOr404(userId, bookId);
    if (book.status === "PUBLISHED" || book.status === "IN_REVIEW") {
      throw new ConflictException({
        code: "BOOK_NOT_DRAFT",
        currentStatus: book.status,
      });
    }
    const chapters = await this.prisma.authorBookChapter.count({
      where: { bookId, isHidden: false },
    });
    if (chapters < 3) {
      throw new BadRequestException({
        code: "MIN_CHAPTERS_NOT_MET",
        required: 3,
        current: chapters,
      });
    }
    if (!book.summary || book.summary.length < 50) {
      throw new BadRequestException({ code: "SUMMARY_MISSING" });
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authorBook.update({
        where: { id: bookId },
        data: { status: "IN_REVIEW", submittedAt: now },
      }),
      this.prisma.authorPublicationRequest.create({
        data: { bookId, reviewState: "PENDING", submittedAt: now },
      }),
    ]);

    return { ok: true as const, submittedAt: now };
  }

  async unpublish(userId: string, bookId: string) {
    const book = await this.findOwnedBookOr404(userId, bookId);
    if (book.status !== "PUBLISHED") {
      throw new ConflictException({
        code: "BOOK_NOT_PUBLISHED",
        currentStatus: book.status,
      });
    }
    await this.prisma.authorBook.update({
      where: { id: bookId },
      data: { status: "DRAFT" },
    });
    return { ok: true as const };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findOwnedBookOr404(userId: string, bookId: string) {
    const book = await this.prisma.authorBook.findUnique({
      where: { id: bookId },
    });
    if (!book || book.authorUserId !== userId) {
      throw new NotFoundException("BOOK_NOT_FOUND");
    }
    return book;
  }
}
