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
import { ApiTags } from "@nestjs/swagger";
import type { CreateHighlightResponse } from "@psico/types";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CurrentUser } from "../shared/decorators/current-user.decorator";
import { CreateHighlightDto } from "./dto/create-highlight.dto";
import { HighlightsService } from "./highlights.service";

@ApiTags("Highlights")
@Controller("highlights")
@UseGuards(JwtAuthGuard)
export class HighlightsController {
  constructor(private readonly highlights: HighlightsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateHighlightDto,
  ): Promise<CreateHighlightResponse> {
    return this.highlights.create(user.userId, dto);
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
