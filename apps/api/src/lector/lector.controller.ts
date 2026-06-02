import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type {
  LectorAudioResponse,
  LectorChapterResponse,
  LectorCompleteResponse,
  LectorSessionHeartbeatResponse,
} from "@psico/types";
import { Plan } from "@prisma/client";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CurrentUser } from "../shared/decorators/current-user.decorator";
import { LectorSessionHeartbeatDto } from "./dto/heartbeat.dto";
import { LectorService } from "./lector.service";

@ApiTags("Lector")
@Controller("lector")
@UseGuards(JwtAuthGuard)
export class LectorController {
  constructor(private readonly lector: LectorService) {}

  @Get(":bookId/:chapterOrder")
  getChapter(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ): Promise<LectorChapterResponse> {
    return this.lector.getChapter(
      user.userId,
      user.plan as Plan,
      bookId,
      chapterOrder,
    );
  }

  @Get(":bookId/:chapterOrder/audio")
  getAudio(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ): Promise<LectorAudioResponse> {
    return this.lector.getAudio(user.plan as Plan, bookId, chapterOrder);
  }

  @Patch("session")
  @HttpCode(HttpStatus.OK)
  heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LectorSessionHeartbeatDto,
  ): Promise<LectorSessionHeartbeatResponse> {
    return this.lector.heartbeat(user.userId, dto);
  }

  @Post(":bookId/:chapterOrder/complete")
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ): Promise<LectorCompleteResponse> {
    return this.lector.completeChapter(user.userId, bookId, chapterOrder);
  }
}
