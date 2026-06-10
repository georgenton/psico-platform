import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import type { ChapterBlockKind } from "@prisma/client";

type ListStatus = "PENDING" | "ALL";

/**
 * AuthorReviewService — ops surface para aprobar/rechazar libros que
 * autores enviaron a revisión. Vive dentro de PulsoModule porque comparte
 * la audiencia (ADMIN role) con los reports de Eco y el overview.
 *
 * Approve es donde ocurre el copy-on-publish:
 *   1. AuthorBook → Book (catálogo público).
 *   2. AuthorBookChapter → Chapter + ChapterBlock (lector).
 *   3. AuthorBook.status = PUBLISHED, publishedBookId set, publishedAt = now.
 *   4. AuthorPublicationRequest.reviewState = APPROVED.
 *
 * Slug generation: kebab-case(title) + opcional `-2`, `-3` si hay colisión.
 */
@Injectable()
export class AuthorReviewService {
  private readonly logger = new Logger("AuthorReviewService");

  constructor(private readonly prisma: PrismaService) {}

  // ── List ─────────────────────────────────────────────────────────────────

  async listRequests(status: ListStatus, limit: number) {
    const where =
      status === "PENDING" ? { reviewState: "PENDING" as const } : {};
    const items = await this.prisma.authorPublicationRequest.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      take: limit,
      include: {
        book: {
          select: {
            id: true,
            title: true,
            subtitle: true,
            summary: true,
            cover: true,
            coverArtUrl: true,
            status: true,
            authorUserId: true,
            language: true,
            categoryId: true,
            author: {
              select: { id: true, email: true, name: true, firstName: true },
            },
            _count: { select: { chapters: true } },
          },
        },
      },
    });

    return {
      total: items.length,
      items: items.map((r) => ({
        id: r.id,
        bookId: r.bookId,
        reviewState: r.reviewState,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt,
        feedback: r.feedback,
        book: {
          id: r.book.id,
          title: r.book.title,
          subtitle: r.book.subtitle,
          summary: r.book.summary,
          cover: r.book.cover,
          coverArtUrl: r.book.coverArtUrl,
          status: r.book.status,
          language: r.book.language,
          categoryId: r.book.categoryId,
          chapters: r.book._count.chapters,
          author: {
            id: r.book.author.id,
            email: r.book.author.email,
            name: r.book.author.firstName ?? r.book.author.name,
          },
        },
      })),
    };
  }

  // ── Approve ──────────────────────────────────────────────────────────────

  async approve(requestId: string, adminUserId: string) {
    const request = await this.prisma.authorPublicationRequest.findUnique({
      where: { id: requestId },
      include: { book: { include: { chapters: { orderBy: { n: "asc" } } } } },
    });
    if (!request) throw new NotFoundException("REQUEST_NOT_FOUND");
    if (request.reviewState !== "PENDING") {
      throw new ConflictException({
        code: "REQUEST_ALREADY_DECIDED",
        current: request.reviewState,
      });
    }
    const authorBook = request.book;
    if (authorBook.status !== "IN_REVIEW") {
      throw new ConflictException({
        code: "BOOK_NOT_IN_REVIEW",
        currentStatus: authorBook.status,
      });
    }
    // Cargar info del autor para BookAuthor lookup/create.
    const authorUser = await this.prisma.user.findUnique({
      where: { id: authorBook.authorUserId },
      select: { id: true, name: true, firstName: true, email: true },
    });
    if (!authorUser) throw new NotFoundException("AUTHOR_NOT_FOUND");

    const visibleChapters = authorBook.chapters.filter((c) => !c.isHidden);
    if (visibleChapters.length < 3) {
      throw new BadRequestException({
        code: "MIN_CHAPTERS_NOT_MET",
        required: 3,
        current: visibleChapters.length,
      });
    }

    const now = new Date();
    const targetSlug = await this.uniqueSlug(authorBook.title);
    const targetCategoryId = authorBook.categoryId ?? "emociones";

    // Find or create BookAuthor for this user. Naming convention: derive
    // slug from email local-part if no firstName.
    const authorName =
      authorUser.firstName ?? authorUser.name ?? authorUser.email.split("@")[0];
    const authorSlug = await this.uniqueAuthorSlug(authorName);
    const bookAuthor = await this.prisma.bookAuthor.upsert({
      where: { slug: authorSlug },
      create: { slug: authorSlug, name: authorName, cover: "cool" },
      update: {},
    });

    // Copy-on-publish in one transaction.
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create / upsert Book.
      const book = authorBook.publishedBookId
        ? await tx.book.update({
            where: { id: authorBook.publishedBookId },
            data: {
              title: authorBook.title,
              subtitle: authorBook.subtitle,
              summary: authorBook.summary,
              cover: authorBook.cover,
              coverArtUrl: authorBook.coverArtUrl,
              authorId: bookAuthor.id,
              categoryId: targetCategoryId,
              totalChapters: visibleChapters.length,
            },
          })
        : await tx.book.create({
            data: {
              slug: targetSlug,
              title: authorBook.title,
              subtitle: authorBook.subtitle,
              summary: authorBook.summary,
              cover: authorBook.cover,
              coverArtUrl: authorBook.coverArtUrl,
              isPublished: true,
              plan: "FREE", // Default tier; admin can shift via /api/admin/books
              authorId: bookAuthor.id,
              categoryId: targetCategoryId,
              totalChapters: visibleChapters.length,
            },
          });

      // 2. Replace chapters: wipe existing + recreate from AuthorBookChapter.
      await tx.chapter.deleteMany({ where: { bookId: book.id } });
      for (const ac of visibleChapters) {
        const chapter = await tx.chapter.create({
          data: {
            bookId: book.id,
            order: ac.n,
            title: ac.title || `Capítulo ${ac.n}`,
            description: ac.subtitle,
            isPublished: true,
          },
        });
        // 3. Create ChapterBlock rows from JSON.
        const blocks = Array.isArray(ac.blocks) ? ac.blocks : [];
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i] as {
            kind?: string;
            content?: string;
            meta?: unknown;
          };
          await tx.chapterBlock.create({
            data: {
              chapterId: chapter.id,
              order: i,
              kind: mapBlockKind(b.kind),
              content: typeof b.content === "string" ? b.content : "",
              meta:
                b.meta !== undefined
                  ? (b.meta as never)
                  : (undefined as unknown as never),
            },
          });
        }
      }

      // 4. Update AuthorBook + request audit row.
      await tx.authorBook.update({
        where: { id: authorBook.id },
        data: {
          status: "PUBLISHED",
          publishedBookId: book.id,
          publishedAt: now,
        },
      });
      await tx.authorPublicationRequest.update({
        where: { id: requestId },
        data: {
          reviewState: "APPROVED",
          reviewedAt: now,
          reviewedBy: adminUserId,
        },
      });

      return book;
    });

    this.logger.log(
      `[author-review] approved request=${requestId} → book=${result.id} slug=${result.slug}`,
    );
    return {
      ok: true as const,
      bookId: result.id,
      slug: result.slug,
      chapters: visibleChapters.length,
    };
  }

  // ── Reject ───────────────────────────────────────────────────────────────

  async reject(
    requestId: string,
    adminUserId: string,
    feedback: string | undefined,
  ) {
    const request = await this.prisma.authorPublicationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException("REQUEST_NOT_FOUND");
    if (request.reviewState !== "PENDING") {
      throw new ConflictException({
        code: "REQUEST_ALREADY_DECIDED",
        current: request.reviewState,
      });
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authorPublicationRequest.update({
        where: { id: requestId },
        data: {
          reviewState: "REJECTED",
          reviewedAt: now,
          reviewedBy: adminUserId,
          feedback: feedback ?? null,
        },
      }),
      this.prisma.authorBook.update({
        where: { id: request.bookId },
        data: { status: "DRAFT" },
      }),
    ]);
    return { ok: true as const };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async uniqueSlug(title: string): Promise<string> {
    const base = kebabize(title) || "libro";
    const existing = await this.prisma.book.findUnique({
      where: { slug: base },
      select: { id: true },
    });
    if (!existing) return base;
    // Try -2, -3, ...
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}-${i}`;
      const conflict = await this.prisma.book.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!conflict) return candidate;
    }
    // Extreme fallback — use cuid suffix
    return `${base}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async uniqueAuthorSlug(name: string): Promise<string> {
    const base = kebabize(name) || "autor";
    const existing = await this.prisma.bookAuthor.findUnique({
      where: { slug: base },
      select: { id: true },
    });
    if (!existing) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}-${i}`;
      const conflict = await this.prisma.bookAuthor.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!conflict) return candidate;
    }
    return `${base}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function kebabize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function mapBlockKind(raw: string | undefined): ChapterBlockKind {
  const k = (raw ?? "PARAGRAPH").toUpperCase();
  if (k === "HEADING") return "HEADING" as ChapterBlockKind;
  if (k === "QUOTE") return "QUOTE" as ChapterBlockKind;
  if (k === "PAUSE") return "PAUSE" as ChapterBlockKind;
  if (k === "EXERCISE") return "EXERCISE" as ChapterBlockKind;
  return "PARAGRAPH" as ChapterBlockKind;
}
