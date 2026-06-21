import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { EvolucionService } from "./evolucion.service";
import type { EvolucionResponse } from "./evolucion.service";

@ApiTags("Evolucion")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("evolucion")
export class EvolucionController {
  constructor(private readonly service: EvolucionService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<EvolucionResponse> {
    return this.service.getForUser(user.userId);
  }
}
