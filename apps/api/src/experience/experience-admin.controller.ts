/**
 * CMS V1 (#637) — the admin write surface for chapter experiences.
 *
 * Mounted under the EXISTING back-office namespace and guarded by the EXISTING
 * role mechanism (`RolesGuard` + `@RequiredRole("ADMIN")`, exactly as Pulso
 * does). No new RBAC, no second namespace.
 *
 * ADMIN and not AUTHOR on purpose: `/autor` is a B2B workspace scoped to the
 * `AuthorBook` rows a writer owns, and chapter experiences are platform
 * editorial content on catalog books that no author owns. Letting any author
 * publish onto *Emociones en Construcción* would be an authorization hole, not
 * a convenience.
 *
 * Reads for books, chapters and media are NOT duplicated here — the editor is
 * an authenticated user and calls the catalog endpoints that already exist.
 * The only thing this controller adds is what nothing else can answer:
 * experiences, drafts, and their lifecycle.
 */

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
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import type { ChapterExperienceDefinition } from "@psico/types";
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser, RequiredRole, RolesGuard } from "../shared";
import type { AuthenticatedUser } from "../auth";
import { ExperienceAdminService } from "./experience-admin.service";
import {
  ListChapterExperiencesQueryDto,
  SaveExperienceDefinitionDto,
} from "./dto/experience-admin.dto";

@ApiTags("Pulso")
@Controller("pulso/experiences")
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiredRole("ADMIN")
export class ExperienceAdminController {
  constructor(private readonly admin: ExperienceAdminService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "listChapterExperiencesForAdmin",
    summary:
      "Experiencias publicadas y borradores de un capítulo, más la guía a la que pueden vincularse.",
  })
  @ApiOkResponse({ description: "Vista de administración del capítulo." })
  listForChapter(@Query() query: ListChapterExperiencesQueryDto) {
    return this.admin.listForChapter(query.bookSlug, query.chapterOrder);
  }

  @Get("drafts/:id")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getExperienceDraftForAdmin",
    summary: "Una definición guardada, para editarla.",
  })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  getDraft(@Param("id") id: string) {
    return this.admin.getDraft(id);
  }

  @Post("drafts")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "createExperienceDraft",
    summary: "Crea una experiencia nueva en versión 1, siempre como borrador.",
  })
  @ApiUnprocessableEntityResponse({ type: ErrorEnvelopeDto })
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveExperienceDefinitionDto,
  ) {
    return this.admin.createDraft(
      user.userId,
      dto.definition as unknown as ChapterExperienceDefinition,
    );
  }

  /**
   * The migration path: clone a published version — database OR code-owned —
   * forward as the next version, as a draft. The source stays untouched.
   */
  @Post(":experienceKey/:experienceVersion/draft")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "createNextExperienceDraft",
    summary:
      "Clona una versión publicada como el siguiente borrador. La original no se toca.",
  })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  createNextDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param("experienceKey") experienceKey: string,
    @Param("experienceVersion", ParseIntPipe) experienceVersion: number,
  ) {
    return this.admin.createNextDraft(
      user.userId,
      experienceKey,
      experienceVersion,
    );
  }

  @Put("drafts/:id")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "saveExperienceDraft",
    summary:
      "Guarda el borrador completo. No hay patch por campo: una escritura parcial deja estados que ningún validador vio.",
  })
  @ApiConflictResponse({
    type: ErrorEnvelopeDto,
    description: "La versión ya está publicada y es inmutable.",
  })
  @ApiUnprocessableEntityResponse({ type: ErrorEnvelopeDto })
  saveDraft(@Param("id") id: string, @Body() dto: SaveExperienceDefinitionDto) {
    return this.admin.saveDraft(
      id,
      dto.definition as unknown as ChapterExperienceDefinition,
    );
  }

  @Post("drafts/:id/publish")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "publishExperienceDraft",
    summary:
      "Publica el borrador. Revalida contra la guía exacta del registro del servidor y lo vuelve inmutable.",
  })
  @ApiConflictResponse({ type: ErrorEnvelopeDto })
  @ApiUnprocessableEntityResponse({ type: ErrorEnvelopeDto })
  publish(@Param("id") id: string) {
    return this.admin.publish(id);
  }
}
