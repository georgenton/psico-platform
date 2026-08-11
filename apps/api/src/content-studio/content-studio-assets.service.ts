import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import {
  assertUploadableImage,
  imageObjectKey,
  type UploadedImageFile,
} from "../shared/image-upload";
import { resolveEditorialChapter } from "./native-authoring";
import { contentAssetPath, isAllowedAssetKey } from "../shared/content-asset";

/**
 * Content Studio — uploading image bytes.
 *
 * Two kinds of image, and they are not the same thing:
 *
 *   a book COVER is catalog metadata. Changing it is immediate; there is no
 *   draft to accumulate it into and no revision it belongs to.
 *
 *   a chapter ILLUSTRATION is editorial content. The bytes land here, but the
 *   block that points at them only becomes real through the normal draft →
 *   publish lifecycle. This service never touches a Revision.
 *
 * That separation is why the UI can honestly say "Actualizar portada" for one
 * and "Guardar borrador" for the other.
 *
 * Both routes carry a book slug and, for illustrations, a chapter number. The
 * browser never names a book id or an object key — the key is minted here, from
 * the resolved identities, so an upload cannot be aimed anywhere else.
 */
@Injectable()
export class ContentStudioAssetsService {
  private readonly logger = new Logger("ContentStudioAssets");

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Refuse to store bytes under a key we could never serve.
   *
   * The asset route signs only keys matching the shapes our uploaders mint, and
   * the book slug is the one part of a key that comes from data rather than from
   * this code. Every slug the platform generates satisfies the grammar — the
   * generator is a kebab-case function — but "every slug today" is not a
   * guarantee about every slug ever.
   *
   * Without this, an out-of-grammar slug would produce an upload that succeeds
   * and an image that can never load: exactly the failure this whole change
   * exists to remove, reintroduced one row at a time. Better to refuse at the
   * only moment somebody is present to be told.
   */
  private assertServable(key: string): void {
    if (isAllowedAssetKey(key)) return;
    this.logger.error(`refusing to store an unservable asset key: ${key}`);
    throw new BadRequestException({
      code: "ASSET_KEY_NOT_SERVABLE",
      message:
        "No podemos almacenar una imagen para este libro. Avisa al equipo.",
    });
  }

  /** Replace the catalog cover. Immediate — no draft, no revision. */
  async uploadCover(bookSlug: string, file: UploadedImageFile | undefined) {
    assertUploadableImage(file);

    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true, slug: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    const key = imageObjectKey(
      `catalog-books/${book.slug}/cover`,
      file.mimetype,
    );
    this.assertServable(key);
    // `putObject`, not `uploadFile`: the bucket is private, so the URL
    // `uploadFile` returns points at an endpoint no browser can read. What we
    // persist is the stable asset path, which resolves to a signed GET when it
    // is actually fetched.
    await this.storage.putObject(file.buffer, key, file.mimetype);
    const coverArtUrl = contentAssetPath(key);

    await this.prisma.book.update({
      where: { id: book.id },
      data: { coverArtUrl },
    });
    // Key and size only. Never the bytes, never the uploader.
    this.logger.log(`cover uploaded book=${book.slug} key=${key}`);

    return { coverArtUrl };
  }

  /**
   * Store an illustration's bytes for a chapter.
   *
   * Returns a URL and nothing else. No block is created, no draft is opened and
   * `Edition.publishedRevisionId` does not move: the editor decides where the
   * image goes and saves it like any other edit.
   */
  async uploadChapterImage(
    bookSlug: string,
    chapterOrder: number,
    file: UploadedImageFile | undefined,
  ) {
    assertUploadableImage(file);

    const book = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { id: true, slug: true },
    });
    if (!book) throw new NotFoundException({ code: "BOOK_NOT_FOUND" });

    // The chapter must belong to THIS book — an order alone is not an identity.
    // Asked of the revision being edited, not of `Chapter`: a chapter created
    // in Content Studio has no legacy row, and an editor who cannot illustrate
    // the chapter they just wrote would be looking at an arbitrary limit.
    const chapter = await resolveEditorialChapter(this.prisma, {
      bookId: book.id,
      bookSlug: book.slug,
      order: chapterOrder,
    });
    if (!chapter) throw new NotFoundException({ code: "CHAPTER_NOT_FOUND" });

    const key = imageObjectKey(
      `content/${book.slug}/chapter-${chapter.order}/images`,
      file.mimetype,
    );
    this.assertServable(key);
    await this.storage.putObject(file.buffer, key, file.mimetype);
    const imageUrl = contentAssetPath(key);

    this.logger.log(
      `chapter image uploaded book=${book.slug} chapter=${chapter.order} key=${key}`,
    );

    return { imageUrl };
  }
}
