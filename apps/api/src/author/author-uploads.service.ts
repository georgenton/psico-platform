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
import { assertUploadableImage, imageExtension } from "../shared/image-upload";
import { contentAssetPath } from "../shared/content-asset";
import {
  AUTHOR_AUDIO_SIGNED_TTL_SEC,
  authorAudioPrefix,
} from "./author-audio-asset";
import { randomBytes } from "node:crypto";

// The image rules live in one place now — `/autor` and Content Studio accept
// exactly the same thing, so neither can drift into accepting more.
//
// The AUDIO rules stay local on purpose. `shared/audio-upload.ts` exists, but it
// is the CATALOG's rule and is deliberately narrower — it drops wav, webm and
// ogg for reasons about Safari and file size. Adopting it here would quietly
// stop accepting three formats `/autor` has always taken, which is a product
// decision and not part of moving bytes to a private bucket.
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
    // Kept verbatim: `/autor` has always answered a missing file with this
    // exact shape, and the shared helper's envelope form would change the wire
    // response for an existing client. The MIME and size rules — the part worth
    // sharing — come from the helper below.
    if (!file) throw new BadRequestException("FILE_REQUIRED");
    assertUploadableImage(file);

    const book = await this.findOwnedBookOr404(userId, bookId);
    const ext = imageExtension(file.mimetype);
    const random = randomBytes(8).toString("hex");
    const key = `autor-books/${book.id}/cover-${random}.${ext}`;

    // `putObject`, not `uploadFile`: the bucket is private, so the URL
    // `uploadFile` returns points at the authenticated S3 endpoint and no
    // browser can load it. What we persist is a stable path on our own API,
    // which redirects to a short-lived signed GET. This key shape is already in
    // `content-asset.ts`'s allowlist — it had to be, because approving a book
    // copies this value onto `Book.coverArtUrl`.
    await this.storage.putObject(file.buffer, key, file.mimetype);
    const url = contentAssetPath(key);

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

    // Same prefix and shape as before — `authorAudioPrefix` is the single
    // definition the read-side resolver checks against, so the two cannot drift.
    const ext = fileExtension(file.mimetype, "mp3");
    const random = randomBytes(8).toString("hex");
    const key = `${authorAudioPrefix(book.id)}${chapter.id}-${random}.${ext}`;

    // `putObject` and a KEY in the block, not a URL. Audio is protected media:
    // it is never served through the unauthenticated `/api/content-assets`
    // route, only signed on the way out of `AuthorService.getChapter`, which has
    // already checked that this author owns this book.
    await this.storage.putObject(file.buffer, key, file.mimetype);

    // Append an AUDIO block to the chapter's blocks JSON.
    const existing = Array.isArray(chapter.blocks) ? chapter.blocks : [];
    const persistedBlock = {
      kind: "audio",
      content: title?.trim() || "Audio del capítulo",
      meta: {
        key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    };
    const nextBlocks = [...(existing as unknown[]), persistedBlock];

    const updated = await this.prisma.authorBookChapter.update({
      where: { id: chapter.id },
      data: {
        blocks: nextBlocks as never,
        version: chapter.version + 1,
      },
    });

    // The response carries a playable URL so the editor can hear what it just
    // uploaded without a round-trip, but that URL is minted here and stored
    // nowhere. Only the key was persisted.
    const url = await this.storage.getSignedUrl(
      key,
      AUTHOR_AUDIO_SIGNED_TTL_SEC,
    );

    this.logger.log(
      `[author-uploads] audio uploaded book=${book.id} chapter=${chapter.id} key=${key} size=${file.size}`,
    );

    return {
      ok: true as const,
      url,
      version: updated.version,
      block: { ...persistedBlock, meta: { ...persistedBlock.meta, url } },
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
