import {
  Controller,
  Get,
  Param,
  Post,
  Query,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type {
  LearningCommandResponse,
  LearningProgressResponse,
} from "@psico/types";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LearningCommandService } from "./learning-command.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LearningProgressService } from "./learning-progress.service";
import {
  parseCompletePracticeCommand,
  parseCompleteUnitCommand,
  parseExploreConceptCommand,
  parseOpenUnitCommand,
  parseSubmitRecallAttemptCommand,
  type ParseResult,
} from "./learning-command-parser";
import { learningException, mapParserError } from "./learning-errors";
import { LearningProgressResponseDto } from "./dto/learning.dtos";
import {
  IDEMPOTENT_COMMAND_BODY,
  LEARNING_COMMAND_RESPONSE,
  RECALL_ATTEMPT_BODY,
} from "./dto/learning.openapi";

/**
 * CC-7.3 — the five learning DOMAIN COMMANDS + derived progress (ADR 0017).
 *
 * There is deliberately NO generic `POST /api/learning/events`: the client
 * invokes commands; the persisted event is an internal effect of a
 * server-side transition. The CC-7.1 pure parsers are the RUNTIME authority
 * on every body — handler bodies are typed `unknown` so the global
 * ValidationPipe never coerces or strips anything before the parser sees the
 * exact wire (the Swagger DTOs document, they do not validate).
 *
 * The actor is ALWAYS the JWT (`@CurrentUser`) — no route accepts a userId in
 * body, params, query or headers.
 */
@ApiTags("Learning")
@ApiBearerAuth("bearer")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@ApiNotFoundResponse({ type: ErrorEnvelopeDto })
@ApiConflictResponse({ type: ErrorEnvelopeDto })
@ApiUnprocessableEntityResponse({ type: ErrorEnvelopeDto })
@UseGuards(JwtAuthGuard)
@Controller("learning")
export class LearningController {
  constructor(
    private readonly commands: LearningCommandService,
    private readonly progress: LearningProgressService,
  ) {}

  /** Parser verdict → typed command, or the mapped 400. */
  private unwrap<T>(result: ParseResult<T>): T {
    if (!result.ok) throw mapParserError(result.error);
    return result.command;
  }

  /** 201 on create, 200 on exact replay — same closed body either way. */
  private withStatus(
    res: Response,
    result: LearningCommandResponse,
  ): LearningCommandResponse {
    res.status(result.created ? 201 : 200);
    return result;
  }

  @Post("units/:unitKey/open")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Registra una apertura real de la unidad (repetible con keys distintas).",
  })
  @ApiBody({ schema: IDEMPOTENT_COMMAND_BODY })
  @ApiCreatedResponse({ schema: LEARNING_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: LEARNING_COMMAND_RESPONSE })
  async openUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("unitKey") unitKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LearningCommandResponse> {
    const command = this.unwrap(parseOpenUnitCommand({ unitKey }, req.body));
    return this.withStatus(res, await this.commands.openUnit(user, command));
  }

  @Post("units/:unitKey/complete")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Transición server-side: requiere apertura previa; una sola completion por unidad.",
  })
  @ApiBody({ schema: IDEMPOTENT_COMMAND_BODY })
  @ApiCreatedResponse({ schema: LEARNING_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: LEARNING_COMMAND_RESPONSE })
  async completeUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("unitKey") unitKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LearningCommandResponse> {
    const command = this.unwrap(
      parseCompleteUnitCommand({ unitKey }, req.body),
    );
    return this.withStatus(
      res,
      await this.commands.completeUnit(user, command),
    );
  }

  @Post("concepts/:conceptKey/explore")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Registra la exploración de un concepto del catálogo. Jamás crea una Resonance.",
  })
  @ApiBody({ schema: IDEMPOTENT_COMMAND_BODY })
  @ApiCreatedResponse({ schema: LEARNING_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: LEARNING_COMMAND_RESPONSE })
  async exploreConcept(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conceptKey") conceptKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LearningCommandResponse> {
    const command = this.unwrap(
      parseExploreConceptCommand({ conceptKey }, req.body),
    );
    return this.withStatus(
      res,
      await this.commands.exploreConcept(user, command),
    );
  }

  @Post("recall-attempts")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Intento de recall. Los ítems objetivos los califica el SERVIDOR contra el catálogo.",
  })
  @ApiBody({ schema: RECALL_ATTEMPT_BODY })
  @ApiCreatedResponse({ schema: LEARNING_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: LEARNING_COMMAND_RESPONSE })
  async submitRecallAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LearningCommandResponse> {
    const command = this.unwrap(parseSubmitRecallAttemptCommand(req.body));
    return this.withStatus(
      res,
      await this.commands.submitRecallAttempt(user, command),
    );
  }

  @Post("practices/:exerciseKey/complete")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Registra que la práctica fue marcada como completada (sin métricas, sin emoción).",
  })
  @ApiBody({ schema: IDEMPOTENT_COMMAND_BODY })
  @ApiCreatedResponse({ schema: LEARNING_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: LEARNING_COMMAND_RESPONSE })
  async completePractice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("exerciseKey") exerciseKey: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LearningCommandResponse> {
    const command = this.unwrap(
      parseCompletePracticeCommand({ exerciseKey }, req.body),
    );
    return this.withStatus(
      res,
      await this.commands.completePractice(user, command),
    );
  }

  @Get("progress")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      "Progreso derivado exclusivamente de LearningEvents V1 sobre la revisión publicada.",
  })
  @ApiQuery({ name: "bookSlug", required: true, type: String })
  @ApiOkResponse({ type: LearningProgressResponseDto })
  async getProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Query("bookSlug") bookSlug: unknown,
  ): Promise<LearningProgressResponse> {
    // Same shape discipline as the catalog keys: a mandatory, single,
    // whitespace-free string — anything else is a payload error.
    if (
      typeof bookSlug !== "string" ||
      bookSlug.length === 0 ||
      bookSlug.length > 200 ||
      /\s/.test(bookSlug) ||
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1f\x7f]/.test(bookSlug)
    ) {
      throw learningException("LEARNING_EVENT_INVALID_PAYLOAD");
    }
    return this.progress.getProgress(user, bookSlug);
  }
}
