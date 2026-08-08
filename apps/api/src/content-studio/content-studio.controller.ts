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
import {
  ContentStudioBookListResponseDto,
  ContentStudioBookStateResponseDto,
  ContentStudioChapterResponseDto,
  ContentStudioPreviewResponseDto,
  ContentStudioChapterImageResponseDto,
  ContentStudioCoverResponseDto,
  ContentStudioPublishResponseDto,
  ContentStudioSaveResponseDto,
} from "./dto/content-studio-response.dto";
import {
  PreviewQueryDto,
  PublishBookDto,
  SaveChapterDraftDto,
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
  @UseInterceptors(FileInterceptor("file"))
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
  @UseInterceptors(FileInterceptor("file"))
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
}
