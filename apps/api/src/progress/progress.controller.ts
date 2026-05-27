import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProgressService } from "./progress.service";
import type { AuthenticatedUser } from "../auth";
import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MarkProgressDto } from "./dto/mark-progress.dto";

/**
 * ProgressController — S5 rename from /content/progress to /progress.
 * The path simplification matches the broader URL rebrand: every module
 * lives at /<module>/* rather than /content/<sub>/*.
 */
@ApiTags("Progress")
@ApiBearerAuth("bearer")
@Controller("progress")
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Post(":chapterId")
  @HttpCode(HttpStatus.OK)
  markCompleted(
    @Param("chapterId") chapterId: string,
    @Body() dto: MarkProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progressService.markCompleted(user.userId, chapterId, dto);
  }

  @Get()
  getUserProgress(@CurrentUser() user: AuthenticatedUser) {
    return this.progressService.getUserProgress(user.userId);
  }
}
