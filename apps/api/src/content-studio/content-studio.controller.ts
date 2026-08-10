import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IMAGE_MAX_BYTES } from "../shared/image-upload";

/**
 * The transport guard: stop an oversized body before it becomes a Buffer in
 * memory. The SERVICE still owns the rule — this only refuses to allocate for
 * something it would reject anyway.
 *
 * `+ 1` is deliberate. Multer aborts at or above `fileSize`, so passing
 * `IMAGE_MAX_BYTES` would refuse a file of exactly 5 MB while the service (and
 * the copy in the UI: "hasta 5 MB") accepts it. One byte higher makes the two
 * agree, with the service as the single authority on where the line is.
 */
export const TRANSPORT_LIMITS = { fileSize: IMAGE_MAX_BYTES + 1 };
import {
  ApiBody,
  ApiConsumes,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequiredRole, RolesGuard } from "../shared";
import { ContentStudioService } from "./content-studio.service";
import { ContentStudioAssetsService } from "./content-studio-assets.service";
import { ChapterMediaAdminService } from "./chapter-media-admin.service";
import { MediaUploadService } from "./media-upload.service";
import { AUDIO_TRANSPORT_LIMIT } from "../shared/audio-upload";
import { CurrentUser } from "../shared";
import type { AuthenticatedUser } from "../auth";
import {
  ContentStudioBookListResponseDto,
  ContentStudioBookStateResponseDto,
  ContentStudioChapterResponseDto,
  ContentStudioPreviewResponseDto,
  ContentStudioChapterImageResponseDto,
  ContentStudioCoverResponseDto,
  ContentStudioPublishResponseDto,
  ContentStudioChapterMediaResponseDto,
  ContentStudioMediaCardDto,
  ContentStudioMediaDraftRefDto,
  ContentStudioMediaPublishResponseDto,
  ContentStudioMediaUploadResponseDto,
  ContentStudioSaveResponseDto,
} from "./dto/content-studio-response.dto";
import {
  CreateComingSoonMediaDto,
  PreviewQueryDto,
  UploadAudiobookDto,
  UploadPodcastEpisodeDto,
  PublishBookDto,
  SaveChapterDraftDto,
  UpdateMediaDraftDto,
} from "./dto/content-studio.dto";

/**
 * Content Studio — ADMIN-only editorial surface for catalog books.
 *
 * ADMIN and not AUTHOR: `/autor` is a B2B workspace scoped to the `AuthorBook`
 * rows a writer owns, and these are platform books nobody owns. The guard is the
 * existing one; no role hierarchy was introduced.
 *
 * Routes carry only a book slug and a chapter number. Every internal identity —
 * edition, unit key, revision, block — is resolved by the service, so a request
 * cannot address content the URL does not name.
 */
@ApiTags("Pulso")
@Controller("pulso/content")
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiredRole("ADMIN")
export class ContentStudioController {
  constructor(
    private readonly studio: ContentStudioService,
    private readonly assets: ContentStudioAssetsService,
    private readonly media: ChapterMediaAdminService,
    private readonly uploads: MediaUploadService,
  ) {}

  @Get("books")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "listContentStudioBooks",
    summary: "Los libros del catálogo que un editor puede abrir.",
  })
  @ApiOkResponse({
    type: ContentStudioBookListResponseDto,
    description: "Libros con su número de capítulos.",
  })
  listBooks() {
    return this.studio.listBooks();
  }

  @Get("books/:bookSlug")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getContentStudioBook",
    summary:
      "Estado editorial del libro: revisión publicada, borrador activo y capítulos con cambios.",
  })
  @ApiOkResponse({ type: ContentStudioBookStateResponseDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  getBook(@Param("bookSlug") bookSlug: string) {
    return this.studio.getBookState(bookSlug);
  }

  @Get("books/:bookSlug/chapters/:chapterOrder")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getContentStudioChapter",
    summary:
      "El capítulo como debe editarse: el borrador activo si existe, si no lo publicado. El revisionId devuelto es el token de concurrencia.",
  })
  @ApiOkResponse({ type: ContentStudioChapterResponseDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  getChapter(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ) {
    return this.studio.getChapter(bookSlug, chapterOrder);
  }

  @Put("books/:bookSlug/chapters/:chapterOrder/draft")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "saveContentStudioChapterDraft",
    summary:
      "Guarda los BLOQUES del capítulo en el borrador del libro. No publica, y no renombra: título, resumen y duración se conservan desde la revisión base.",
  })
  @ApiOkResponse({ type: ContentStudioSaveResponseDto })
  @ApiConflictResponse({
    type: ErrorEnvelopeDto,
    description: "El borrador cambió; no se escribió nada.",
  })
  saveDraft(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
    @Body() dto: SaveChapterDraftDto,
  ) {
    return this.studio.saveChapterDraft(bookSlug, chapterOrder, {
      expectedRevisionId: dto.expectedRevisionId,
      blocks: dto.blocks,
    });
  }

  @Get("books/:bookSlug/chapters/:chapterOrder/preview")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "previewContentStudioChapter",
    summary:
      "El capítulo tal como quedaría, leído del borrador activo. Sólo lectura.",
  })
  @ApiOkResponse({ type: ContentStudioPreviewResponseDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  preview(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
    @Query() query: PreviewQueryDto,
  ) {
    return this.studio.previewChapter(bookSlug, chapterOrder, query.revisionId);
  }

  /**
   * The catalog cover. Immediate, and the UI says so.
   *
   * Not a Content Core write: a cover is metadata about the book, not a block
   * inside a chapter, so it has no revision to belong to and no draft to wait
   * in.
   */
  @Post("books/:bookSlug/cover")
  @Header("Cache-Control", "private, no-store")
  @UseInterceptors(FileInterceptor("file", { limits: TRANSPORT_LIMITS }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOperation({
    operationId: "uploadContentStudioCover",
    summary:
      "Reemplaza la portada del catálogo. Inmediato: no crea borrador ni revisión.",
  })
  @ApiOkResponse({ type: ContentStudioCoverResponseDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  uploadCover(
    @Param("bookSlug") bookSlug: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.assets.uploadCover(bookSlug, file);
  }

  /**
   * An illustration's BYTES. Nothing more.
   *
   * No block is created and no revision is minted — the editor places the image
   * and saves it through the ordinary draft lifecycle, so an upload that is
   * never saved leaves the book exactly as it was.
   */
  @Post("books/:bookSlug/chapters/:chapterOrder/images")
  @Header("Cache-Control", "private, no-store")
  @UseInterceptors(FileInterceptor("file", { limits: TRANSPORT_LIMITS }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOperation({
    operationId: "uploadContentStudioChapterImage",
    summary:
      "Sube la imagen de una ilustración. No crea bloque ni revisión: eso ocurre al guardar el borrador.",
  })
  @ApiOkResponse({ type: ContentStudioChapterImageResponseDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  uploadChapterImage(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.assets.uploadChapterImage(bookSlug, chapterOrder, file);
  }

  @Post("books/:bookSlug/publish")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "publishContentStudioBook",
    summary:
      "Publica el borrador del LIBRO. El alcance es la edición completa, no un capítulo.",
  })
  @ApiOkResponse({ type: ContentStudioPublishResponseDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  publish(@Param("bookSlug") bookSlug: string, @Body() dto: PublishBookDto) {
    return this.studio.publishBook(bookSlug, dto.expectedDraftRevisionId);
  }

  // ── Chapter media (C2A) ──────────────────────────────────────────────────
  //
  // Definitions, not bytes. Nothing below uploads, signs or asks a provider
  // anything: this moves the editorial catalog out of a deploy, and no further.

  @Get("books/:bookSlug/chapters/:chapterOrder/media")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "listContentStudioChapterMedia",
    summary:
      "Audiolibro, podcast y video del capítulo, con su procedencia y su estado editorial.",
  })
  @ApiOkResponse({ type: ContentStudioChapterMediaResponseDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  listMedia(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ) {
    return this.media.listForChapter(bookSlug, chapterOrder);
  }

  /**
   * Adopt a code-owned definition: an exact clone at the SAME key and version.
   * Public runtime does not change, because the clone starts as a CMS draft.
   */
  @Post("books/:bookSlug/chapters/:chapterOrder/media/:mediaKey/adopt")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "adoptContentStudioChapterMedia",
    summary:
      "Pasa una definición de código al CMS sin cambiar su identidad ni lo que el lector ve.",
  })
  @ApiOkResponse({ type: ContentStudioMediaDraftRefDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  adoptMedia(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
    @Param("mediaKey") mediaKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.media.adopt(bookSlug, chapterOrder, mediaKey, user.userId);
  }

  /** A format this chapter does not have yet. Starts as «En producción». */
  @Post("books/:bookSlug/chapters/:chapterOrder/media")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "createContentStudioChapterMedia",
    summary:
      "Anuncia un formato que el capítulo aún no tiene. Sin archivo: se publica como «En producción».",
  })
  @ApiOkResponse({ type: ContentStudioMediaDraftRefDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  createMedia(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
    @Body() dto: CreateComingSoonMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.media.createComingSoon(
      bookSlug,
      chapterOrder,
      dto.kind,
      dto.title,
      dto.description,
      user.userId,
    );
  }

  @Get("media/drafts/:draftId")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({ operationId: "getContentStudioMediaDraft" })
  @ApiOkResponse({ type: ContentStudioMediaCardDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  getMediaDraft(@Param("draftId") draftId: string) {
    return this.media.getDraft(draftId);
  }

  @Put("media/drafts/:draftId")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "updateContentStudioMediaDraft",
    summary:
      "Edita la copia editorial. Identidad, origen y política de acceso los conserva el servidor.",
  })
  @ApiOkResponse({ type: ContentStudioMediaCardDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  updateMediaDraft(
    @Param("draftId") draftId: string,
    @Body() dto: UpdateMediaDraftDto,
  ) {
    return this.media.updateDraft(draftId, {
      title: dto.title,
      description: dto.description,
      durationSec: dto.durationSec ?? null,
      chapters: dto.chapters,
    });
  }

  @Post("media/drafts/:draftId/publish")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "publishContentStudioMediaDraft",
    summary:
      "La definición del CMS pasa a ser la autoridad de esa pieza. Sin deploy y sin tocar el archivo.",
  })
  @ApiOkResponse({ type: ContentStudioMediaPublishResponseDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  publishMediaDraft(@Param("draftId") draftId: string) {
    return this.media.publishDraft(draftId);
  }

  // ── Media masters (C2B) ──────────────────────────────────────────────────
  //
  // Bytes only. Upload NEVER publishes: the master is staged privately and a
  // reader sees nothing until the explicit publish below.

  @Post("books/:bookSlug/chapters/:chapterOrder/media/audiobook/upload")
  @Header("Cache-Control", "private, no-store")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: AUDIO_TRANSPORT_LIMIT } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        durationSec: { type: "integer" },
      },
    },
  })
  @ApiOperation({
    operationId: "uploadContentStudioAudiobook",
    summary:
      "Sube un máster de audiolibro. Queda en borrador privado: el lector no lo oye hasta publicar.",
  })
  @ApiOkResponse({ type: ContentStudioMediaUploadResponseDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  uploadAudiobook(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadAudiobookDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.uploads.uploadAudiobook(
      bookSlug,
      chapterOrder,
      file,
      dto.durationSec,
      user.userId,
    );
  }

  @Post("books/:bookSlug/chapters/:chapterOrder/media/podcast/upload")
  @Header("Cache-Control", "private, no-store")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: AUDIO_TRANSPORT_LIMIT } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        durationSec: { type: "integer" },
        mediaKey: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
    },
  })
  @ApiOperation({
    operationId: "uploadContentStudioPodcast",
    summary:
      "Sube el máster de un episodio. Sin mediaKey crea un episodio nuevo; con mediaKey reemplaza su máster.",
  })
  @ApiOkResponse({ type: ContentStudioMediaUploadResponseDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  uploadPodcast(
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadPodcastEpisodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.uploads.uploadPodcast(
      bookSlug,
      chapterOrder,
      file,
      {
        durationSec: dto.durationSec,
        mediaKey: dto.mediaKey,
        title: dto.title,
        description: dto.description,
      },
      user.userId,
    );
  }

  /**
   * Publish a staged master. For an audiobook this also moves the `Audio`
   * pointer — after freezing the previous version to the exact bytes it already
   * resolved to, so an older version never starts playing the new recording.
   */
  @Post("media/drafts/:draftId/publish-master")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "publishContentStudioMediaMaster",
    summary:
      "Publica un máster subido. El audiolibro anterior se congela a sus bytes exactos antes de mover el puntero.",
  })
  @ApiOkResponse({ type: ContentStudioMediaPublishResponseDto })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  publishMaster(@Param("draftId") draftId: string) {
    return this.uploads.publishStagedMaster(draftId);
  }
}
