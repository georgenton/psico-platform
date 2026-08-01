import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type {
  GuideAvailabilityResponse,
  GuideCommandResponse,
  GuideDiscoveryResponse,
  SubmitGuideStepRecallResponse,
} from "@psico/types";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideLifecycleService } from "./guide-lifecycle.service";
import type {
  GuideCommandResult,
  GuideRecallCommandResult,
} from "./guide-lifecycle.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideRolloutService } from "./guide-rollout.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideDiscoveryService } from "./guide-discovery.service";
import {
  GUIDE_DISCOVERY_PARAMS_INVALID,
  parseGuideDiscoveryParams,
} from "./guide-discovery-params";
import { GuideRolloutGuard } from "./guide-rollout.guard";
import {
  parseCancelGuideSessionCommand,
  parseCompleteGuideSessionCommand,
  parseCompleteGuideSessionStepCommand,
  parseStartGuideSessionCommand,
  parseSubmitGuideStepRecallCommand,
  type GuideParseResult,
} from "./guide-command-parser";
import {
  mapGuideLifecycleErrors,
  mapGuideParserError,
} from "./guide-http-errors";
import {
  GUIDE_AVAILABILITY_RESPONSE,
  GUIDE_DISCOVERY_RESPONSE,
  GUIDE_COMMAND_RESPONSE,
  GUIDE_RECALL_BODY,
  GUIDE_RECALL_COMMAND_RESPONSE,
  IDEMPOTENT_GUIDE_BODY,
  START_GUIDE_SESSION_BODY,
} from "./dto/guide.openapi";

/**
 * CC-7.4D — the five Guide V1 COMMANDS over HTTP (ADR 0019).
 *
 * There is deliberately NO generic `POST /api/guide/events`, no progress
 * endpoint and no PATCH: the client invokes a named command, and the ledger
 * row, the projection and the LearningEvent are internal effects of a
 * server-side transition.
 *
 * The pure parsers are the RUNTIME authority on every body — handler bodies
 * are read as `unknown` from the raw request so the global ValidationPipe
 * never coerces or strips anything before the parser sees the exact wire (the
 * Swagger schemas document, they do not validate).
 *
 * The actor is ALWAYS the JWT (`@CurrentUser`): no route accepts a userId in
 * body, params, query or headers, and no route accepts editorial context —
 * the server derives it from the pinned `guideKey@guideVersion`.
 */
@ApiTags("Guide")
@ApiBearerAuth("bearer")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@ApiNotFoundResponse({ type: ErrorEnvelopeDto })
@ApiConflictResponse({ type: ErrorEnvelopeDto })
@ApiUnprocessableEntityResponse({ type: ErrorEnvelopeDto })
@ApiInternalServerErrorResponse({ type: ErrorEnvelopeDto })
@UseGuards(JwtAuthGuard)
@Controller("guide")
export class GuideController {
  constructor(
    private readonly lifecycle: GuideLifecycleService,
    private readonly rollout: GuideRolloutService,
    private readonly discovery: GuideDiscoveryService,
  ) {}

  /**
   * CC-7.R1 — the pilot availability check.
   *
   * A single opaque boolean, gated only by JWT (never by the rollout guard, so
   * it can honestly answer `false`). It NEVER creates a session, step, receipt
   * or LearningEvent, and never reveals the mode, the allowlist or the reason.
   * `private, no-store` because the decision is per-actor and can change on an
   * env flip.
   */
  @Get("availability")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getGuideAvailability",
    summary:
      "Si la guía está habilitada para el actor autenticado ahora mismo. " +
      "No revela el modo, la allowlist ni la razón.",
  })
  @ApiOkResponse({ schema: GUIDE_AVAILABILITY_RESPONSE })
  getGuideAvailability(
    @CurrentUser() user: AuthenticatedUser,
  ): GuideAvailabilityResponse {
    return { available: this.rollout.isAvailable(user.userId) };
  }

  /**
   * GR-4 — "standing in this chapter, is there a guided reading for me?".
   *
   * READ-ONLY: it creates no session, step, receipt, learning event or
   * resonance. Asking must never be the act that starts something.
   *
   * NOT behind the rollout guard, deliberately — the guard answers 503, and
   * this endpoint has to be able to say `available:false` honestly. The
   * negative is opaque: rollout off, no catalog entry, missing or divergent
   * targets, a chapter that disagrees with them, or a plan that cannot read the
   * unit all look identical from outside, so the surface cannot be used to
   * enumerate the catalog or to learn one sits outside the pilot.
   *
   * A syntactically impossible parameter is a 400 — "chapter zero" is not a
   * place a reader can stand, and answering `false` there would be a different
   * claim than the one the caller made.
   */
  @Get("discovery/:bookSlug/:chapterOrder")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getGuideDiscovery",
    summary:
      "Si hay una guía para el contexto de lectura pedido. No revela el " +
      "motivo de un negativo, ni objetivos, ni identificadores internos.",
  })
  @ApiOkResponse({ schema: GUIDE_DISCOVERY_RESPONSE })
  async getGuideDiscovery(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookSlug") bookSlug: string,
    @Param("chapterOrder") chapterOrder: string,
  ): Promise<GuideDiscoveryResponse> {
    let params;
    try {
      params = parseGuideDiscoveryParams(bookSlug, chapterOrder);
    } catch {
      throw new BadRequestException({
        code: GUIDE_DISCOVERY_PARAMS_INVALID,
        message: GUIDE_DISCOVERY_PARAMS_INVALID,
      });
    }
    // The actor is passed THROUGH, never restated here: the public surface
    // must not contain an actor field the client could imagine supplying.
    return this.discovery.discover(user, params);
  }

  /** Parser verdict → typed command, or the mapped 400. */
  private unwrap<T>(result: GuideParseResult<T>): T {
    if (!result.ok) throw mapGuideParserError(result.error);
    return result.command;
  }

  /**
   * 201 when this call applied the transition, 200 on an exact replay — the
   * status comes from the lifecycle's own verdict, never from the route.
   * The body is the same closed shape either way.
   */
  private toResponse(
    res: Response,
    result: GuideCommandResult,
  ): GuideCommandResponse {
    res.status(result.created ? 201 : 200);
    return {
      created: result.created,
      replayed: result.replayed,
      session: {
        sessionId: result.sessionId,
        guideKey: result.guideKey,
        guideVersion: result.guideVersion,
        status: result.status,
        stepsCompleted: result.projection.stepsCompleted,
        totalSteps: result.projection.totalSteps,
        currentStepKey: result.projection.currentStepKey,
      },
    };
  }

  /**
   * GR-3 — the recall response. Same closed session shape as every other
   * command, plus the outcome the lifecycle read back from the ledger. The
   * chosen option is not echoed and the correct one is not in this object.
   */
  private toRecallResponse(
    res: Response,
    result: GuideRecallCommandResult,
  ): SubmitGuideStepRecallResponse {
    return {
      ...this.toResponse(res, result),
      feedback: { outcome: result.feedback.outcome },
    };
  }

  @Post("sessions")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(GuideRolloutGuard)
  @ApiServiceUnavailableResponse({ type: ErrorEnvelopeDto })
  @ApiOperation({
    operationId: "createGuideSession",
    summary:
      "Abre una sesión de un guideKey@guideVersion exacto; el contexto " +
      "editorial lo deriva el servidor.",
  })
  @ApiBody({ schema: START_GUIDE_SESSION_BODY })
  @ApiCreatedResponse({ schema: GUIDE_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: GUIDE_COMMAND_RESPONSE })
  async createGuideSession(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuideCommandResponse> {
    const command = this.unwrap(parseStartGuideSessionCommand(req.body));
    const result = await mapGuideLifecycleErrors(() =>
      this.lifecycle.start(user, command),
    );
    return this.toResponse(res, result);
  }

  @Post("sessions/:sessionId/steps/:stepKey/complete")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(GuideRolloutGuard)
  @ApiServiceUnavailableResponse({ type: ErrorEnvelopeDto })
  @ApiOperation({
    operationId: "completeGuideSessionStep",
    summary:
      "Acepta el paso actual de tipo concepto / práctica / confirmación.",
  })
  @ApiBody({ schema: IDEMPOTENT_GUIDE_BODY })
  @ApiCreatedResponse({ schema: GUIDE_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: GUIDE_COMMAND_RESPONSE })
  async completeGuideSessionStep(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
    @Param("stepKey") stepKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuideCommandResponse> {
    const command = this.unwrap(
      parseCompleteGuideSessionStepCommand({ sessionId, stepKey }, req.body),
    );
    const result = await mapGuideLifecycleErrors(() =>
      this.lifecycle.completeStep(user, command),
    );
    return this.toResponse(res, result);
  }

  @Post("sessions/:sessionId/steps/:stepKey/recall")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(GuideRolloutGuard)
  @ApiServiceUnavailableResponse({ type: ErrorEnvelopeDto })
  @ApiOperation({
    operationId: "submitGuideStepRecall",
    summary:
      "Acepta el paso de recall objetivo; el SERVIDOR califica la opción " +
      "elegida y nunca devuelve la respuesta correcta.",
  })
  @ApiBody({ schema: GUIDE_RECALL_BODY })
  @ApiCreatedResponse({ schema: GUIDE_RECALL_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: GUIDE_RECALL_COMMAND_RESPONSE })
  async submitGuideStepRecall(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
    @Param("stepKey") stepKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SubmitGuideStepRecallResponse> {
    const command = this.unwrap(
      parseSubmitGuideStepRecallCommand({ sessionId, stepKey }, req.body),
    );
    const result = await mapGuideLifecycleErrors(() =>
      this.lifecycle.completeRecallStep(user, command),
    );
    return this.toRecallResponse(res, result);
  }

  @Post("sessions/:sessionId/cancel")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(GuideRolloutGuard)
  @ApiServiceUnavailableResponse({ type: ErrorEnvelopeDto })
  @ApiOperation({
    operationId: "cancelGuideSession",
    summary: "Cierra la sesión como CANCELLED. No emite evento educativo.",
  })
  @ApiBody({ schema: IDEMPOTENT_GUIDE_BODY })
  @ApiCreatedResponse({ schema: GUIDE_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: GUIDE_COMMAND_RESPONSE })
  async cancelGuideSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuideCommandResponse> {
    const command = this.unwrap(
      parseCancelGuideSessionCommand({ sessionId }, req.body),
    );
    const result = await mapGuideLifecycleErrors(() =>
      this.lifecycle.cancel(user, command),
    );
    return this.toResponse(res, result);
  }

  @Post("sessions/:sessionId/complete")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(GuideRolloutGuard)
  @ApiServiceUnavailableResponse({ type: ErrorEnvelopeDto })
  @ApiOperation({
    operationId: "completeGuideSession",
    summary:
      "Cierra la sesión como COMPLETED; exige el ledger completo de la " +
      "versión fijada.",
  })
  @ApiBody({ schema: IDEMPOTENT_GUIDE_BODY })
  @ApiCreatedResponse({ schema: GUIDE_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: GUIDE_COMMAND_RESPONSE })
  async completeGuideSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuideCommandResponse> {
    const command = this.unwrap(
      parseCompleteGuideSessionCommand({ sessionId }, req.body),
    );
    const result = await mapGuideLifecycleErrors(() =>
      this.lifecycle.completeSession(user, command),
    );
    return this.toResponse(res, result);
  }
}
