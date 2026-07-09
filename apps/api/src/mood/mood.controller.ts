import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import type { AuthenticatedUser } from "../auth";
import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MoodService } from "./mood.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LogMoodDto } from "./dto/log-mood.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LogCheckinDto } from "./dto/log-checkin.dto";

/**
 * MoodController — Sprint B1 single endpoint.
 *
 * `POST /api/mood` appends a `MoodLog` row + syncs `User.mood` for the global
 * MoodChip in the new dashboard Topbar. The PATCH /api/user/mood from
 * HomeController stays (legacy) so older clients keep working; both wire
 * through the same denormalized cache.
 */
@ApiTags("Mood")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiNotFoundResponse({ type: ErrorEnvelopeDto })
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("mood")
export class MoodController {
  constructor(private readonly moodService: MoodService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  log(@CurrentUser() user: AuthenticatedUser, @Body() dto: LogMoodDto) {
    return this.moodService.log(user.userId, dto.mood);
  }

  /**
   * Which micro-checkin question to ask next (Mapa Emocional · Etapa 2).
   * `item: null` when today's question was already answered.
   */
  @Get("checkin/next")
  nextCheckin(@CurrentUser() user: AuthenticatedUser) {
    return this.moodService.nextCheckin(user.userId);
  }

  /** Persist one 0–4 checkin answer. Plain ordinal, no text (ADR 0007). */
  @Post("checkin")
  @HttpCode(HttpStatus.CREATED)
  logCheckin(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogCheckinDto,
  ) {
    return this.moodService.logCheckin(user.userId, dto.itemKey, dto.score);
  }
}
