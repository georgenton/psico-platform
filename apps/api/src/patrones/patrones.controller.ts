import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { Plan } from "@prisma/client";
import type {
  PatronesRegenerateResponse,
  PatronesResponse,
  PatronesShareWithTherapistResponse,
} from "@psico/types";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CurrentUser } from "../shared/decorators/current-user.decorator";
import { GetPatronesQuery } from "./dto/get-patrones.dto";
import { ShareWithTherapistDto } from "./dto/share-with-therapist.dto";
import { PatronesService } from "./patrones.service";

@ApiTags("Patrones")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@Controller("patrones")
@UseGuards(JwtAuthGuard)
export class PatronesController {
  constructor(private readonly patrones: PatronesService) {}

  @Get()
  getPatrones(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetPatronesQuery,
  ): Promise<PatronesResponse> {
    return this.patrones.getPatrones(
      user.userId,
      user.plan as Plan,
      query.period ?? "30d",
    );
  }

  @Post("weekly-summary/regenerate")
  @HttpCode(HttpStatus.OK)
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PatronesRegenerateResponse> {
    try {
      const summary = await this.patrones.regenerateWeeklySummary(
        user.userId,
        user.plan as Plan,
      );
      return { ok: true, weeklySummary: summary };
    } catch (err) {
      // The service throws a string "NOT_ENOUGH_ENTRIES" when the user has
      // less than the threshold for the current week. Translate to 422 so
      // the UI can render the empty state instead of a generic 500.
      if (err instanceof Error && err.message === "NOT_ENOUGH_ENTRIES") {
        throw new UnprocessableEntityException("NOT_ENOUGH_ENTRIES");
      }
      throw err;
    }
  }

  @Post("share-with-therapist")
  @HttpCode(HttpStatus.OK)
  shareWithTherapist(
    @Body() _dto: ShareWithTherapistDto,
  ): PatronesShareWithTherapistResponse {
    return this.patrones.shareWithTherapist();
  }
}
