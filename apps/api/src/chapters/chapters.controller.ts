import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { FileInterceptor } from "@nestjs/platform-express";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ChaptersService } from "./chapters.service";
import type { AuthenticatedUser } from "../auth";
import { JwtAuthGuard } from "../auth";
import { CurrentUser, PlanGuard, RequiredRole, RolesGuard } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateChapterDto } from "./dto/create-chapter.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UploadAudioDto } from "./dto/upload-audio.dto";

/**
 * ChaptersController — read access to chapter content + admin authoring.
 *
 * S5 rename: /content/books/:slug/chapters → /books/:slug/chapters to mirror
 * the new BooksModule top-level URL space. Behaviour unchanged.
 */
@ApiTags("Chapters")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@Controller("books")
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  // PlanGuard passes through (no @RequiredPlan); dynamic plan check runs in
  // the service against the book's own plan.
  @Get(":slug/chapters/:order")
  @UseGuards(JwtAuthGuard, PlanGuard)
  @ApiBearerAuth("bearer")
  findOne(
    @Param("slug") slug: string,
    @Param("order", ParseIntPipe) order: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaptersService.findOne(slug, order, user.plan);
  }

  @Post(":slug/chapters")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
  @ApiBearerAuth("bearer")
  createChapter(@Param("slug") slug: string, @Body() dto: CreateChapterDto) {
    return this.chaptersService.create(slug, dto);
  }

  @Post(":slug/chapters/:order/audio")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
  @ApiBearerAuth("bearer")
  @UseInterceptors(FileInterceptor("file"))
  uploadAudio(
    @Param("slug") slug: string,
    @Param("order", ParseIntPipe) order: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadAudioDto,
  ) {
    return this.chaptersService.uploadAudio(slug, order, file, dto);
  }
}
