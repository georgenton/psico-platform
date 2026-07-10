import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { EmotionalMapService } from "./emotional-map.service";
import type { EmotionalMapResult } from "./emotional-map.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LogTextFeaturesDto } from "./dto/log-text-features.dto";

@ApiTags("EmotionalMap")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("emotional-map")
export class EmotionalMapController {
  constructor(private readonly service: EmotionalMapService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<EmotionalMapResult> {
    return this.service.getForUser(user.userId);
  }

  /**
   * Etapa 6 — receive the NUMERIC text features the client computed on-device
   * from a decrypted reflection. The body has no text field by design; the
   * whitelist ValidationPipe strips anything extra (ADR 0007).
   */
  @Post("text-features")
  @HttpCode(HttpStatus.CREATED)
  logTextFeatures(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogTextFeaturesDto,
  ) {
    return this.service.logTextFeatures(user.userId, dto);
  }
}
