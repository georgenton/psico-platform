import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ResonancesService } from "./resonances.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfirmResonanceDto } from "./dto/confirm-resonance.dto";

/**
 * ResonancesController — Fase E (V2, ARC cycle).
 *
 * `GET /api/resonances`        → the user's confirmed resonances (map section).
 * `POST /api/resonances`       → explicit confirmation (idempotent upsert).
 * `DELETE /api/resonances/:id` → remove from the map for real.
 */
@ApiTags("Resonances")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiNotFoundResponse({ type: ErrorEnvelopeDto })
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("resonances")
export class ResonancesController {
  constructor(private readonly resonances: ResonancesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.resonances.list(user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmResonanceDto,
  ) {
    return this.resonances.confirm(user.userId, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.resonances.remove(user.userId, id);
  }
}
