import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StorageService } from "../storage/storage.service";
import { randomBytes } from "node:crypto";

const COVER_MIME_ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const COVER_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const AUDIO_MIME_ALLOWED = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
]);
const AUDIO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

function fileExtension(mime: string, fallback: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return fallback;
}

/**
 * AuthorUploadsService — Sprint S71.C-uploads.
 *
 * Maneja los uploads multipart del editor de autor:
 *  - Portada del libro → R2, key autor-books/<bookId>/cover-<random>.<ext>
 *  - Audio del capítulo → R2, key autor-books/<bookId>/audio/<chapterId>-<random>.<ext>
 *
 * No reemplazamos AuthorService.updateBook — este servicio escribe
 * directamente `coverArtUrl` y `blocks` (append). El servicio de R2
 * retorna URL pública estable; no necesitamos signed URLs aquí porque
 * los assets de portada y audio del autor son públicos al catálogo.
 *
 * Validación de ownership: chequeo explícito vía Prisma. Si el libro no
 * pertenece al autor, 404 (mismo patrón que el resto del módulo).
 */
@Injectable()
export class AuthorUploadsService {
  private readonly logger = new Logger("AuthorUploadsService");

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async uploadCoverImage(
    userId: string,
    bookId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException("FILE_REQUIRED");
    if (!COVER_MIME_ALLOWED.has(file.mimetype)) {
      throw new BadRequestException({
        code: "INVALID_IMAGE_TYPE",
        allowed: Array.from(COVER_MIME_ALLOWED),
        got: file.mimetype,
      });
    }
    if (file.size > COVER_MAX_BYTES) {
      throw new BadRequestException({
        code: "FILE_TOO_LARGE",
        maxBytes: COVER_MAX_BYTES,
        got: file.size,
      });
    }

    const book = await this.findOwnedBookOr404(userId, bookId);
    const ext = fileExtension(file.mimetype, "jpg");
    const random = randomBytes(8).toString("hex");
    const key = `autor-books/${book.id}/cover-${random}.${ext}`;

    const url = await this.storage.uploadFile(file.buffer, key, file.mimetype);

    await this.prisma.authorBook.update({
      where: { id: book.id },
      data: { coverArtUrl: url },
    });

    this.logger.log(
      `[author-uploads] cover uploaded book=${book.id} key=${key} size=${file.size}`,
    );

    return {
      ok: true as const,
      coverArtUrl: url,
    };
  }

  async uploadChapterAudio(
    userId: string,
    bookId: string,
    chapterN: number,
    file: Express.Multer.File | undefined,
    title: string | undefined,
  ) {
    if (!file) throw new BadRequestException("FILE_REQUIRED");
    if (!AUDIO_MIME_ALLOWED.has(file.mimetype)) {
      throw new BadRequestException({
        code: "INVALID_AUDIO_TYPE",
        allowed: Array.from(AUDIO_MIME_ALLOWED),
        got: file.mimetype,
      });
    }
    if (file.size > AUDIO_MAX_BYTES) {
      throw new BadRequestException({
        code: "FILE_TOO_LARGE",
        maxBytes: AUDIO_MAX_BYTES,
        got: file.size,
      });
    }

    const book = await this.findOwnedBookOr404(userId, bookId);
    const chapter = await this.prisma.authorBookChapter.findUnique({
      where: { bookId_n: { bookId: book.id, n: chapterN } },
      select: { id: true, version: true, blocks: true },
    });
    if (!chapter) throw new NotFoundException("CHAPTER_NOT_FOUND");

    const ext = fileExtension(file.mimetype, "mp3");
    const random = randomBytes(8).toString("hex");
    const key = `autor-books/${book.id}/audio/${chapter.id}-${random}.${ext}`;

    const url = await this.storage.uploadFile(file.buffer, key, file.mimetype);

    // Append an AUDIO block to the chapter's blocks JSON.
    const existing = Array.isArray(chapter.blocks) ? chapter.blocks : [];
    const audioBlock = {
      kind: "audio",
      content: title?.trim() || "Audio del capítulo",
      meta: {
        url,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    };
    const nextBlocks = [...(existing as unknown[]), audioBlock];

    const updated = await this.prisma.authorBookChapter.update({
      where: { id: chapter.id },
      data: {
        blocks: nextBlocks as never,
        version: chapter.version + 1,
      },
    });

    this.logger.log(
      `[author-uploads] audio uploaded book=${book.id} chapter=${chapter.id} key=${key} size=${file.size}`,
    );

    return {
      ok: true as const,
      url,
      version: updated.version,
      block: audioBlock,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findOwnedBookOr404(userId: string, bookId: string) {
    const book = await this.prisma.authorBook.findUnique({
      where: { id: bookId },
      select: { id: true, authorUserId: true, status: true },
    });
    if (!book || book.authorUserId !== userId) {
      throw new NotFoundException("BOOK_NOT_FOUND");
    }
    if (book.status === "IN_REVIEW" || book.status === "ARCHIVED") {
      throw new BadRequestException({
        code: "BOOK_LOCKED",
        currentStatus: book.status,
      });
    }
    return book;
  }
}
