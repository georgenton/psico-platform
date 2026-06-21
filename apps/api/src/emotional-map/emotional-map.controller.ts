import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { EmotionalMapService } from "./emotional-map.service";
import type { EmotionalMapResult } from "./emotional-map.service";

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
}
