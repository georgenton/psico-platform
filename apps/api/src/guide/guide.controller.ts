import {
  BadRequestException,
  Body,
  Query,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
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
import type {
  GuideExperienceCardStatesResponse,
  GuideExperienceStateResponse,
  RecoverableGuideSessionResponse,
} from "@psico/types";
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GuideLifecycleService } from "./guide-lifecycle.service";
import {
  GUIDE_INVALID_RECOVERY_QUERY,
  parseGuideRecoveryQuery,
  type GuideRecoveryQuery,
} from "./guide-recovery-params";
import {
  GUIDE_INVALID_STATE_QUERY,
  parseGuideStateQuery,
  type GuideStateQuery,
} from "./guide-state-params";
import {
  GUIDE_INVALID_CARD_STATES_BODY,
  parseGuideCardStatesBody,
} from "./guide-card-states-params";
import { GuideReaderContextStaleError } from "./guide-reader-applicability.service";
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
  GUIDE_CARD_STATES_BODY,
  GUIDE_CARD_STATES_RESPONSE,
  GUIDE_EXPERIENCE_STATE_RESPONSE,
  GUIDE_RECOVERABLE_SESSION_RESPONSE,
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
// Every route here is behind `JwtAuthGuard`, so 401 is reachable on all of
// them; documenting it on only the newest one would have the contract say two
// different things about identical behaviour.
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
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
   * GR-5 — "am I already in the middle of this guide?", answered by the server.
   *
   * This is what makes resume work across devices. V1 could only recover what
   * the same browser had kept, so starting on a laptop and opening the phone
   * looked like starting over; the checkpoint was always in the ledger, it just
   * had no way out.
   *
   * READ-ONLY and actor-scoped: the lookup filters on the JWT's user, so
   * another actor's session is not denied — it is not found. A session pinned
   * to a DIFFERENT guide is equally invisible, and neither case is
   * distinguishable from "you have none", which is the point: this surface
   * cannot be used to learn what somebody else is doing.
   *
   * A malformed pin is a 400, not a negative answer — "guide version zero" is
   * not a question about a real guide, and replying `recoverable:false` there
   * would answer something the caller never asked.
   */
  /**
   * GR-7 — "where do I stand in this experience?".
   *
   * The gap it closes: `/sessions/recoverable` sees ACTIVE runs only, so a
   * finished journey read as never-started the next time the reader opened
   * the chapter. Keeping that memory in the browser was the tempting fix and
   * the wrong one — a client asserting "I completed this" is a claim about
   * the ledger it has no standing to make.
   *
   * READ-ONLY and actor-scoped by construction. A foreign session is not
   * denied, it is invisible: the answer is byte-identical to "no session".
   */
  @Get("sessions/state")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getGuideExperienceState",
    summary:
      "Dónde está el actor en un pin exacto: NOT_STARTED, ACTIVE o " +
      "COMPLETED con su resumen. No revela sesiones ajenas y no crea nada.",
  })
  @ApiQuery({ name: "guideKey", required: true, schema: { type: "string" } })
  @ApiQuery({
    name: "guideVersion",
    required: true,
    schema: { type: "integer", minimum: 1 },
  })
  @ApiOkResponse({ schema: GUIDE_EXPERIENCE_STATE_RESPONSE })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
  async getGuideExperienceState(
    @CurrentUser() user: AuthenticatedUser,
    @Query("guideKey") guideKey?: string,
    @Query("guideVersion") guideVersion?: string,
  ): Promise<GuideExperienceStateResponse> {
    let pin: GuideStateQuery;
    try {
      pin = parseGuideStateQuery(guideKey, guideVersion);
    } catch {
      throw new BadRequestException({ code: GUIDE_INVALID_STATE_QUERY });
    }
    return this.lifecycle.findExperienceState(user.userId, pin);
  }

  /**
   * C.1 — where the reader stands in EACH experience of a chapter, at once.
   *
   * `/sessions/state` answers about ONE exact pin, which is why a chapter with
   * two journeys ended up asking once and colouring both cards with the same
   * answer (#639). This route takes the published pin of every card and
   * returns a verdict per card, computed server-side.
   *
   * A POST for a read, deliberately: a list of pins does not belong in a query
   * string, and the alternative — one GET per card — is the N+1 this exists to
   * remove. It creates nothing, stores nothing and is marked `no-store`.
   *
   * READ-ONLY and actor-scoped by construction: every lookup filters on the
   * JWT's user, so another actor's session is not denied, it is invisible.
   */
  @Post("experiences/state")
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getGuideExperienceCardStates",
    summary:
      "Estado por experiencia para una lista de pines publicados: START, " +
      "CONTINUE (sesión ACTIVE del mismo guideKey, en su propio pin) o " +
      "COMPLETED (solo del pin exacto). No revela sesiones ajenas ni crea nada.",
  })
  @ApiBody({ schema: GUIDE_CARD_STATES_BODY })
  @ApiOkResponse({ schema: GUIDE_CARD_STATES_RESPONSE })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
  async getGuideExperienceCardStates(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<GuideExperienceCardStatesResponse> {
    let parsed: ReturnType<typeof parseGuideCardStatesBody>;
    try {
      parsed = parseGuideCardStatesBody(body);
    } catch {
      throw new BadRequestException({ code: GUIDE_INVALID_CARD_STATES_BODY });
    }
    // A reader context the server cannot confirm fails the WHOLE chunk. It is
    // not a verdict: "I cannot tell where you are" and "this guide is not for
    // here" are different facts, and a stale render must not read as a chapter
    // full of inapplicable cards.
    try {
      const items = await this.lifecycle.resolveExperienceCardStates(
        user.userId,
        parsed.pins,
        parsed.reader,
      );
      return { items };
    } catch (error) {
      if (error instanceof GuideReaderContextStaleError) {
        throw new BadRequestException({ code: error.code });
      }
      throw error;
    }
  }

  @Get("sessions/recoverable")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getRecoverableGuideSession",
    summary:
      "La sesión activa del actor para un pin exacto, si existe. No revela " +
      "sesiones ajenas ni de otro pin, y nunca crea nada.",
  })
  @ApiQuery({ name: "guideKey", required: true, schema: { type: "string" } })
  @ApiQuery({
    name: "guideVersion",
    required: true,
    schema: { type: "integer", minimum: 1 },
  })
  @ApiOkResponse({ schema: GUIDE_RECOVERABLE_SESSION_RESPONSE })
  @ApiBadRequestResponse({ type: ErrorEnvelopeDto })
  @ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
  async getRecoverableGuideSession(
    @CurrentUser() user: AuthenticatedUser,
    @Query("guideKey") guideKey?: string,
    @Query("guideVersion") guideVersion?: string,
  ): Promise<RecoverableGuideSessionResponse> {
    let pin: GuideRecoveryQuery;
    try {
      pin = parseGuideRecoveryQuery(guideKey, guideVersion);
    } catch {
      throw new BadRequestException({ code: GUIDE_INVALID_RECOVERY_QUERY });
    }

    const session = await this.lifecycle.findRecoverableSession(
      user.userId,
      pin,
    );
    return session === null
      ? { recoverable: false, session: null }
      : { recoverable: true, session };
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
   *
   * An INFRASTRUCTURE failure is neither: it goes through the same lifecycle
   * mapper as the five commands and comes back as a sanitized 500, so the
   * client retries instead of caching a negative it was never told.
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
  // Declared explicitly: the generator infers only `type: string` from the
  // `@Param`s, which would document a contract this route does not accept —
  // the order is a positive integer and the slug is canonical kebab-case.
  @ApiParam({
    name: "bookSlug",
    required: true,
    schema: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    description: "Slug canónico del libro (kebab-case, minúsculas).",
  })
  @ApiParam({
    name: "chapterOrder",
    required: true,
    schema: { type: "integer", minimum: 1 },
    description:
      "Orden del capítulo EN LA PLATAFORMA, que no siempre coincide con la " +
      "numeración impresa del libro.",
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
    return mapGuideLifecycleErrors(() => this.discovery.discover(user, params));
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
