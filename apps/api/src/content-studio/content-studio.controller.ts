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
  UseGuards,
} from "@nestjs/common";
import {
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
import {
  ContentStudioBookListResponseDto,
  ContentStudioBookStateResponseDto,
  ContentStudioChapterResponseDto,
  ContentStudioPreviewResponseDto,
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
  constructor(private readonly studio: ContentStudioService) {}

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
