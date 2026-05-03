import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
<<<<<<< HEAD
import type { ChaptersService } from "./chapters.service";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ChaptersService } from "./chapters.service";
>>>>>>> origin/main
import type { AuthenticatedUser } from "../../auth";
import { JwtAuthGuard } from "../../auth";
import { PlanGuard } from "../guards/plan.guard";
import { RolesGuard } from "../guards/roles.guard";
import { RequiredRole } from "../guards/required-role.decorator";
import { CurrentUser } from "../guards/current-user.decorator";
import type { CreateChapterDto } from "../dto/create-chapter.dto";
import type { UploadAudioDto } from "../dto/upload-audio.dto";

@Controller("content/books")
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  // PlanGuard passes through (no @RequiredPlan); dynamic check runs inside the service
  @Get(":slug/chapters/:order")
  @UseGuards(JwtAuthGuard, PlanGuard)
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
  createChapter(@Param("slug") slug: string, @Body() dto: CreateChapterDto) {
    return this.chaptersService.create(slug, dto);
  }

  @Post(":slug/chapters/:order/audio")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RequiredRole("ADMIN")
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
