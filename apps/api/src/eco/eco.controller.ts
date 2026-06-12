import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { Throttle } from "@nestjs/throttler";
import type { Observable } from "rxjs";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EcoService } from "./eco.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ReportEcoMessageDto } from "./dto/report-message.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { SendEcoMessageDto } from "./dto/send-message.dto";

/**
 * EcoController — Sprint S10.
 *
 * Six endpoints per docs/design/handoff/08-eco.md. The `/messages` endpoint
 * streams Server-Sent Events; the rest are conventional JSON.
 *
 * Rate limiting:
 *   - `/messages` throttled at 30/min/user — Eco messages cost both tokens
 *     and latency; a user that hits this is either bot-driven or stuck in a
 *     panicked re-send loop. The 30/min ceiling is comfortable for typing.
 *   - The other endpoints use the global default (60/min).
 */
@ApiTags("Eco")
@ApiBearerAuth("bearer")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiTooManyRequestsResponse({ type: ErrorEnvelopeDto })
@Controller("eco")
@UseGuards(JwtAuthGuard)
export class EcoController {
  constructor(private readonly ecoService: EcoService) {}

  // ─── Persona ─────────────────────────────────────────────────────────────

  @Get("caps")
  getCaps() {
    return this.ecoService.getCaps();
  }

  // ─── Threads ─────────────────────────────────────────────────────────────

  @Get("threads")
  listThreads(@CurrentUser() user: AuthenticatedUser) {
    return this.ecoService.listThreads(user.userId);
  }

  @Post("threads")
  @HttpCode(HttpStatus.CREATED)
  createThread(@CurrentUser() user: AuthenticatedUser) {
    return this.ecoService.createThread(user.userId);
  }

  @Get("threads/:id")
  getThread(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.ecoService.getThread(user.userId, id, cursor);
  }

  @Delete("threads/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteThread(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    await this.ecoService.deleteThread(user.userId, id);
  }

  // ─── Messages ────────────────────────────────────────────────────────────

  /**
   * Sends a user message and streams Eco's reply via SSE.
   *
   * NestJS @Sse() handles the protocol framing: each emitted item becomes
   * an `event:` + `data:` chunk. The service returns an Observable that
   * completes after the `done` event.
   *
   * Why we use POST + @Sse() rather than the design's "POST then stream"
   * pattern: @Sse() requires GET in some browser implementations, but
   * NestJS uses it as a Response decorator — the underlying HTTP verb is
   * whatever we put on the route. POST is correct because the request body
   * carries side-effecting data.
   */
  @Post("messages")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Sse()
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendEcoMessageDto,
  ): Observable<unknown> {
    return this.ecoService.sendMessage(user.userId, dto);
  }

  @Post("messages/:id/report")
  @HttpCode(HttpStatus.CREATED)
  reportMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ReportEcoMessageDto,
  ) {
    return this.ecoService.reportMessage(
      user.userId,
      id,
      dto.reason,
      dto.comment,
    );
  }
}
