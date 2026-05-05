import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
<<<<<<< HEAD
<<<<<<< HEAD
import type { ProgressService } from "./progress.service";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProgressService } from "./progress.service";
>>>>>>> origin/main
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProgressService } from "./progress.service";
>>>>>>> origin/main
import type { AuthenticatedUser } from "../../auth";
import { JwtAuthGuard } from "../../auth";
import { CurrentUser } from "../guards/current-user.decorator";
import type { MarkProgressDto } from "../dto/mark-progress.dto";

@Controller("content/progress")
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
