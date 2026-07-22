import { Controller, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
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
  ApiTags,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { GuideCommandResponse } from "@psico/types";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideLifecycleService } from "./guide-lifecycle.service";
import type { GuideCommandResult } from "./guide-lifecycle.service";
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
  GUIDE_COMMAND_RESPONSE,
  GUIDE_RECALL_BODY,
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
  constructor(private readonly lifecycle: GuideLifecycleService) {}

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

  @Post("sessions")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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
  @ApiOperation({
    operationId: "submitGuideStepRecall",
    summary:
      "Acepta el paso de recall objetivo; el SERVIDOR califica la opción " +
      "elegida y nunca devuelve la respuesta correcta.",
  })
  @ApiBody({ schema: GUIDE_RECALL_BODY })
  @ApiCreatedResponse({ schema: GUIDE_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: GUIDE_COMMAND_RESPONSE })
  async submitGuideStepRecall(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
    @Param("stepKey") stepKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuideCommandResponse> {
    const command = this.unwrap(
      parseSubmitGuideStepRecallCommand({ sessionId, stepKey }, req.body),
    );
    const result = await mapGuideLifecycleErrors(() =>
      this.lifecycle.completeRecallStep(user, command),
    );
    return this.toResponse(res, result);
  }

  @Post("sessions/:sessionId/cancel")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
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
