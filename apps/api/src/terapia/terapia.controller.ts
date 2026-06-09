import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type {
  CrisisResponse,
  TherapyHubResponse,
} from "@psico/types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../shared";
import { TerapiaService } from "./terapia.service";
import { CrisisLogDto } from "./dto/crisis-log.dto";

/**
 * Terapia controller — Sprint S62 (boundary v1: Crisis + Hub).
 *
 * Routes split:
 *  - PÚBLICOS (no JwtAuthGuard):
 *      GET  /api/terapia/crisis           — líneas de crisis por país
 *      POST /api/terapia/crisis/log       — auditoría anónima
 *  - AUTH:
 *      GET  /api/terapia/hub              — landing del usuario
 *
 * Las siguientes pantallas (directorio, perfil terapeuta, reserva,
 * pre-sesión, mis sesiones, post-sesión, video room, prescriptions,
 * notifications, intake) aterrizan en sprints S63–S66 según
 * docs/design/handoff/11-terapia.md.
 */
@ApiTags("Terapia")
@Controller("terapia")
export class TerapiaController {
  constructor(private readonly service: TerapiaService) {}

  // ── PÚBLICOS ──────────────────────────────────────────────────────────

  @Get("crisis")
  @ApiOperation({
    summary:
      "Líneas de crisis por país. PÚBLICO sin auth (decisión ética del diseño).",
  })
  getCrisis(@Query("country") country?: string): CrisisResponse {
    return this.service.getCrisis(country);
  }

  @Post("crisis/log")
  @ApiOperation({
    summary:
      "Auditoría de uso del flujo de crisis. Sin contenido sensible. Auth opcional.",
  })
  @HttpCode(HttpStatus.CREATED)
  async logCrisis(
    @Req() req: Request,
    @Body() dto: CrisisLogDto,
  ): Promise<{ ok: true }> {
    // Si el cliente envió un Bearer válido, el JwtStrategy lo habrá puesto
    // en req.user; pero como NO usamos guard, puede ser undefined.
    const userId =
      (req.user as { sub?: string } | undefined)?.sub ?? null;
    return this.service.logCrisis(
      userId,
      dto.trigger,
      dto.contactedLineId,
      dto.country,
    );
  }

  // ── AUTH ──────────────────────────────────────────────────────────────

  @Get("hub")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Landing del usuario en Terapia. Devuelve intro + activeTherapist + nextSession + recentPrescriptions.",
  })
  async getHub(
    @CurrentUser() user: { sub: string },
  ): Promise<TherapyHubResponse> {
    return this.service.getHub(user.sub);
  }
}
