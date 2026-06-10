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
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, RequiredRole, RolesGuard } from "../shared";
import { JwtAuthGuard } from "../auth";
import { AuthorService } from "./author.service";
import { CreateAuthorBookDto } from "./dto/create-book.dto";
import { UpdateAuthorBookDto } from "./dto/update-book.dto";
import { UpdateChapterDto } from "./dto/update-chapter.dto";
import { UpdateStructureDto } from "./dto/update-structure.dto";

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
  constructor(private readonly service: AuthorService) {}

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
}
