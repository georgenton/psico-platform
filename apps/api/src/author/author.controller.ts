import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser, RequiredRole, RolesGuard } from "../shared";
import { JwtAuthGuard } from "../auth";
import { AuthorService } from "./author.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthorAiService } from "./author-ai.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthorUploadsService } from "./author-uploads.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthorRevenueService } from "./author-revenue.service";
import { CreateAuthorBookDto } from "./dto/create-book.dto";
import { UpdateAuthorBookDto } from "./dto/update-book.dto";
import { UpdateChapterDto } from "./dto/update-chapter.dto";
import { UpdateStructureDto } from "./dto/update-structure.dto";
import { AuthorAiHelpDto } from "./dto/ai-help.dto";
import { UpdatePayoutSettingsDto } from "./dto/update-payout-settings.dto";

/**
 * AuthorController — Editor de autor (B2B). Sprint S71.
 *
 * Todos los endpoints requieren auth + rol AUTHOR. El RolesGuard valida el
 * rol; el ownership se verifica dentro del service (un autor no puede
 * tocar libros de otro).
 */
@ApiTags("autor")
@Controller("autor")
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiredRole("AUTHOR")
export class AuthorController {
  constructor(
    private readonly service: AuthorService,
    private readonly ai: AuthorAiService,
    private readonly uploads: AuthorUploadsService,
    private readonly revenue: AuthorRevenueService,
  ) {}

  // ── Dashboard ────────────────────────────────────────────────────────────

  @Get("dashboard")
  @ApiOperation({ summary: "Dashboard del autor: libros, plantillas, IA." })
  async dashboard(@CurrentUser() user: { userId: string }) {
    return this.service.getDashboard(user.userId);
  }

  // ── Books CRUD ───────────────────────────────────────────────────────────

  @Post("libros")
  @ApiOperation({ summary: "Crear un libro borrador." })
  async createBook(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateAuthorBookDto,
  ) {
    return this.service.createBook(user.userId, dto);
  }

  @Get("libros/:id")
  @ApiOperation({ summary: "Meta del libro + estructura de capítulos." })
  async getBook(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
  ) {
    return this.service.getBook(user.userId, id);
  }

  @Patch("libros/:id")
  @ApiOperation({ summary: "Editar meta del libro." })
  async updateBook(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Body() dto: UpdateAuthorBookDto,
  ) {
    return this.service.updateBook(user.userId, id, dto);
  }

  @Delete("libros/:id")
  @ApiOperation({ summary: "Archivar libro (soft-delete)." })
  @HttpCode(HttpStatus.OK)
  async archiveBook(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
  ) {
    return this.service.archiveBook(user.userId, id);
  }

  // ── Chapters ─────────────────────────────────────────────────────────────

  @Get("libros/:id/capitulos/:n")
  @ApiOperation({ summary: "Obtener capítulo en edición." })
  async getChapter(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Param("n", ParseIntPipe) n: number,
  ) {
    return this.service.getChapter(user.userId, id, n);
  }

  @Patch("libros/:id/capitulos/:n")
  @ApiOperation({
    summary:
      "Editar capítulo. Concurrency: envia expectedVersion para detectar conflicts.",
  })
  async updateChapter(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Param("n", ParseIntPipe) n: number,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.service.updateChapter(user.userId, id, n, dto);
  }

  // ── Structure ────────────────────────────────────────────────────────────

  @Patch("libros/:id/estructura")
  @ApiOperation({
    summary:
      "Reordenar / renombrar / eliminar capítulos en una sola operación atómica.",
  })
  async updateStructure(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Body() dto: UpdateStructureDto,
  ) {
    return this.service.updateStructure(user.userId, id, dto);
  }

  // ── Publication ──────────────────────────────────────────────────────────

  @Get("libros/:id/publicacion")
  @ApiOperation({ summary: "Estado del checklist de publicación." })
  async getPublicationState(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
  ) {
    return this.service.getPublicationState(user.userId, id);
  }

  @Post("libros/:id/publicar")
  @ApiOperation({
    summary:
      "Enviar el libro a revisión. Valida los blockers del checklist primero.",
  })
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
  ) {
    return this.service.submitForReview(user.userId, id);
  }

  @Post("libros/:id/despublicar")
  @ApiOperation({ summary: "Quitar el libro del catálogo (vuelve a DRAFT)." })
  @HttpCode(HttpStatus.OK)
  async unpublish(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
  ) {
    return this.service.unpublish(user.userId, id);
  }

  // ── Sprint S71.C-uploads — Cover image + audio ──────────────────────────

  @Post("libros/:id/cover-image")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Sube la portada del libro (JPG/PNG/WebP, máx 5MB) al storage R2 + " +
      "guarda la URL en AuthorBook.coverArtUrl.",
  })
  async uploadCover(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.uploads.uploadCoverImage(user.userId, id, file);
  }

  @Post("libros/:id/capitulos/:n/audio")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Sube audio del capítulo (MP3/M4A/WAV/WEBM/OGG, máx 50MB) y lo " +
      "agrega como bloque AUDIO al final del capítulo.",
  })
  async uploadChapterAudio(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Param("n", ParseIntPipe) n: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("title") title?: string,
  ) {
    return this.uploads.uploadChapterAudio(user.userId, id, n, file, title);
  }

  // ── Sprint S71.C-AI — AI helpers ─────────────────────────────────────────

  @Post("libros/:id/ai-help")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "AI helpers: revisar tono, sugerir ejemplo, cambiar tono, simplificar. " +
      "Returns the suggested text as a single JSON response.",
  })
  async aiHelp(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Body() dto: AuthorAiHelpDto,
  ) {
    // Ownership check via service (404 if not owner) — same guard the editor
    // endpoints use.
    await this.service.getBook(user.userId, id);
    return this.ai.generateSuggestion(dto.intent, dto.text, dto.context);
  }

  // ── Sprint S71.C-revenue — Cobros ───────────────────────────────────────

  @Get("cobros")
  @ApiOperation({
    summary:
      "Vista del autor sobre sus ingresos: YTD / último mes / pendiente + " +
      "breakdown mensual + configuración de payout.",
  })
  async getCobros(@CurrentUser() user: { userId: string }) {
    return this.revenue.getCobros(user.userId);
  }

  @Patch("cobros/configuracion")
  @ApiOperation({
    summary:
      "Actualiza el método y datos de cobro del autor. Upsert idempotente.",
  })
  async updatePayoutSettings(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdatePayoutSettingsDto,
  ) {
    return this.revenue.updatePayoutSettings(user.userId, dto);
  }
}
