import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import type { AuthenticatedUser } from "../auth";
import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { HomeService } from "./home.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateUserMoodBodyDto } from "./dto/update-mood.dto";

/**
 * HomeController — three endpoints designed in 02-inicio.md:
 *
 *   - GET    /home                            — dashboard aggregator
 *   - PATCH  /user/mood                       — update current mood
 *   - POST   /reflection-prompts/:id/dismiss  — hide a prompt for 7 days
 *
 * The three are colocated because they share the same domain (Home dashboard)
 * even though they target different URL roots. Cohesion > URL grouping when
 * the alternative is a HomeModule that only owns `/home`.
 */
@ApiTags("Home")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller()
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get("home")
  getHome(@CurrentUser() user: AuthenticatedUser) {
    return this.homeService.getHome(user.userId);
  }

  @Patch("user/mood")
  @HttpCode(HttpStatus.OK)
  updateMood(
    @Body() dto: UpdateUserMoodBodyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeService.updateMood(user.userId, dto.moodId);
  }

  @Post("reflection-prompts/:id/dismiss")
  @HttpCode(HttpStatus.OK)
  dismissPrompt(
    @Param("id") promptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.homeService.dismissPrompt(user.userId, promptId);
  }
}
