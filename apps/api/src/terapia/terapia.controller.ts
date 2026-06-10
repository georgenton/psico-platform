// S69 deploy trigger 2026-06-10
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type {
  CreateBookingResponse,
  CrisisResponse,
  RetryCheckoutResponse,
  SessionFeedbackResponse,
  SessionJoinResponse,
  SessionPrepResponse,
  TechnicalReportResponse,
  TherapistAvailabilityResponse,
  TherapistDetail,
  TherapistFavoriteToggleResponse,
  TherapistListResponse,
  TherapistReviewsResponse,
  TherapyFilters,
  TherapyHubResponse,
  TherapyNotificationsListResponse,
  TherapyPrescriptionItem,
  TherapySessionListItem,
  TherapySessionsListResponse,
} from "@psico/types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../shared";
import { TerapiaService } from "./terapia.service";
import { CrisisLogDto } from "./dto/crisis-log.dto";
import { ListTherapistsDto } from "./dto/list-therapists.dto";
import { ListReviewsDto } from "./dto/list-reviews.dto";
import { AvailabilityDto } from "./dto/availability.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { UpdateSessionPrepDto } from "./dto/update-prep.dto";
import { SessionFeedbackDto } from "./dto/feedback.dto";
import { TechnicalReportDto } from "./dto/technical-report.dto";
import { ListSessionsDto } from "./dto/list-sessions.dto";
import { ListNotificationsDto } from "./dto/list-notifications.dto";
import { UpdatePrescriptionDto } from "./dto/update-prescription.dto";
import { RescheduleSessionDto } from "./dto/reschedule-session.dto";
import { CancelSessionDto } from "./dto/cancel-session.dto";
import { RetryCheckoutDto } from "./dto/retry-checkout.dto";

/**
 * Terapia controller — Sprint S62 + S63.
 *
 * Routes:
 *  - PÚBLICOS:
 *      GET  /api/terapia/crisis
 *      POST /api/terapia/crisis/log
 *  - AUTH:
 *      GET  /api/terapia/hub
 *      GET  /api/terapia/therapists/filters         — catálogo de filtros
 *      GET  /api/terapia/therapists                 — listado paginado
 *      GET  /api/terapia/therapists/:id             — detalle
 *      GET  /api/terapia/therapists/:id/reviews     — reviews paginado
 *      POST /api/terapia/therapists/:id/favorite    — toggle
 *
 * Pantallas pendientes: Reserva (S64), Sala video + Post-sesión (S65),
 * Mis sesiones / prescripciones / notifs (S66).
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
  @ApiOperation({ summary: "Landing del usuario en Terapia." })
  async getHub(
    @CurrentUser() user: { sub: string },
  ): Promise<TherapyHubResponse> {
    return this.service.getHub(user.sub);
  }

  // S63 — directorio. /filters va ANTES de /:id para que el path matcher
  // no caiga en el segmento dinámico.
  @Get("therapists/filters")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Opciones disponibles para los filtros del directorio.",
  })
  async getFilters(): Promise<TherapyFilters> {
    return this.service.getFilters();
  }

  @Get("therapists")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Directorio paginado de terapeutas activos. Soporta filtros + sort.",
  })
  async listTherapists(
    @CurrentUser() user: { sub: string },
    @Query() query: ListTherapistsDto,
  ): Promise<TherapistListResponse> {
    return this.service.listTherapists(user.sub, query);
  }

  @Get("therapists/:id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Detalle de un terapeuta." })
  async getTherapist(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
  ): Promise<TherapistDetail> {
    return this.service.getTherapist(user.sub, id);
  }

  @Get("therapists/:id/reviews")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Reseñas paginadas de un terapeuta." })
  async listReviews(
    @Param("id") id: string,
    @Query() query: ListReviewsDto,
  ): Promise<TherapistReviewsResponse> {
    return this.service.listReviews(
      id,
      query.page ?? 1,
      query.pageSize ?? 10,
    );
  }

  @Post("therapists/:id/favorite")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Toggle de favorito sobre un terapeuta." })
  @HttpCode(HttpStatus.OK)
  async toggleFavorite(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
  ): Promise<TherapistFavoriteToggleResponse> {
    return this.service.toggleFavorite(user.sub, id);
  }

  // ── Reserva + Pre-sesión (Sprint S64) ──────────────────────────────────

  @Get("therapists/:id/availability")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Slots disponibles del terapeuta proyectados sobre los próximos 14 días.",
  })
  async getAvailability(
    @Param("id") id: string,
    @Query() query: AvailabilityDto,
  ): Promise<TherapistAvailabilityResponse> {
    return this.service.getAvailability(id, query.days ?? 14);
  }

  @Post("bookings")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Reservar una sesión. v1: crea la session en SCHEDULED + PENDING; Stripe wiring llega en S65.",
  })
  @HttpCode(HttpStatus.CREATED)
  async createBooking(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateBookingDto,
  ): Promise<CreateBookingResponse> {
    return this.service.createBooking(user.sub, dto);
  }

  @Get("sessions/:id/prep")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Estado de pre-sesión." })
  async getSessionPrep(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
  ): Promise<SessionPrepResponse> {
    return this.service.getSessionPrep(user.sub, id);
  }

  @Patch("sessions/:id/prep")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Actualizar pre-sesión (intentionCiphertext E2E, mood, entradas compartidas).",
  })
  async updateSessionPrep(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() dto: UpdateSessionPrepDto,
  ): Promise<SessionPrepResponse> {
    return this.service.updateSessionPrep(user.sub, id, dto);
  }

  // ── Sala video + Post-sesión + Technical (Sprint S65) ──────────────────

  @Post("sessions/:id/join")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Emite token de sala. Solo válido en window [-5min, +duration+15min].",
  })
  @HttpCode(HttpStatus.OK)
  async joinSession(
    @CurrentUser() user: { sub: string; email: string },
    @Param("id") id: string,
  ): Promise<SessionJoinResponse> {
    return this.service.joinSession(user.sub, id, user.email);
  }

  @Post("sessions/:id/feedback")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Cierra sesión con feedback. rating 1-5 + tags categóricos + noteCiphertext E2E opcional.",
  })
  @HttpCode(HttpStatus.OK)
  async submitFeedback(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() dto: SessionFeedbackDto,
  ): Promise<SessionFeedbackResponse> {
    return this.service.submitFeedback(user.sub, id, dto);
  }

  @Post("sessions/:id/technical-report")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Reportar un problema técnico durante (o después) de la sesión.",
  })
  @HttpCode(HttpStatus.CREATED)
  async reportTechnical(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() dto: TechnicalReportDto,
  ): Promise<TechnicalReportResponse> {
    return this.service.reportTechnical(user.sub, id, dto);
  }

  // ── Lifecycle (Sprint S66.B) ───────────────────────────────────────────

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Mis sesiones — envelope {upcoming, past}. Filtro opcional por status.",
  })
  async listSessions(
    @CurrentUser() user: { sub: string },
    @Query() query: ListSessionsDto,
  ): Promise<TherapySessionsListResponse> {
    return this.service.listSessions(user.sub, query.status);
  }

  @Get("prescriptions")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Mis recetas activas (lo que sugirió el terapeuta)." })
  async listPrescriptions(
    @CurrentUser() user: { sub: string },
  ): Promise<TherapyPrescriptionItem[]> {
    return this.service.listPrescriptions(user.sub);
  }

  @Patch("prescriptions/:id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Marcar receta como completada / incompleta." })
  async updatePrescription(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() dto: UpdatePrescriptionDto,
  ): Promise<TherapyPrescriptionItem> {
    return this.service.updatePrescription(user.sub, id, dto.completed);
  }

  @Get("notifications")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Notificaciones del usuario en Terapia." })
  async listNotifications(
    @CurrentUser() user: { sub: string },
    @Query() query: ListNotificationsDto,
  ): Promise<TherapyNotificationsListResponse> {
    return this.service.listNotifications(
      user.sub,
      query.unread,
      query.limit ?? 20,
    );
  }

  @Patch("notifications/:id/read")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Marcar una notificación como leída. Idempotente." })
  @HttpCode(HttpStatus.OK)
  async markNotificationRead(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    return this.service.markNotificationRead(user.sub, id);
  }

  @Post("notifications/read-all")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Marcar todas las notificaciones como leídas." })
  @HttpCode(HttpStatus.OK)
  async markAllNotificationsRead(
    @CurrentUser() user: { sub: string },
  ): Promise<{ ok: true; updated: number }> {
    return this.service.markAllNotificationsRead(user.sub);
  }

  @Patch("sessions/:id/reschedule")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Re-agendar sesión a un slot libre del mismo terapeuta. Solo SCHEDULED.",
  })
  async rescheduleSession(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() dto: RescheduleSessionDto,
  ): Promise<TherapySessionListItem> {
    return this.service.rescheduleSession(user.sub, id, dto.newSlotIso);
  }

  @Post("sessions/:id/cancel")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Cancelar sesión SCHEDULED. Refund pedido al ops." })
  @HttpCode(HttpStatus.OK)
  async cancelSession(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() dto: CancelSessionDto,
  ): Promise<{ ok: true; cancelledAt: string }> {
    return this.service.cancelSession(
      user.sub,
      id,
      dto.reason,
      dto.refundRequested,
    );
  }

  @Post("bookings/:id/retry-checkout")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Emitir un nuevo Stripe Checkout para una session PENDING. Útil tras fallo o cierre del tab.",
  })
  @HttpCode(HttpStatus.OK)
  async retryCheckout(
    @CurrentUser() user: { sub: string },
    @Param("id") id: string,
    @Body() dto: RetryCheckoutDto,
  ): Promise<RetryCheckoutResponse> {
    return this.service.retryCheckout(
      user.sub,
      id,
      dto.successUrl,
      dto.cancelUrl,
    );
  }
}
