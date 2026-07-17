import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import type { CreateHighlightResponse } from "@psico/types";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CurrentUser } from "../shared/decorators/current-user.decorator";
import { CreateHighlightDto } from "./dto/create-highlight.dto";
import { HighlightsService } from "./highlights.service";

@ApiTags("Highlights")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto }) // PRO_REQUIRED (CC-6E)
@Controller("highlights")
@UseGuards(JwtAuthGuard)
export class HighlightsController {
  constructor(private readonly highlights: HighlightsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateHighlightDto,
  ): Promise<CreateHighlightResponse> {
    return this.highlights.create(user.userId, user.plan, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<void> {
    await this.highlights.delete(user.userId, id);
  }
}
