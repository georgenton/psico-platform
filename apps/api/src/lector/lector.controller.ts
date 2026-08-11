import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import type {
  ChapterMediaAccessResponse,
  ChapterMediaCommandResponse,
  ChapterMediaManifestResponse,
  LectorAudioResponse,
  LectorChapterResponse,
  LectorCompleteResponse,
  LectorSessionHeartbeatResponse,
} from "@psico/types";
import { Plan } from "@prisma/client";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CurrentUser } from "../shared/decorators/current-user.decorator";
import { LectorSessionHeartbeatDto } from "./dto/heartbeat.dto";
import { CompleteChapterDto } from "./dto/complete-chapter.dto";
import { LectorService } from "./lector.service";
import {
  MEDIA_INVALID_PAYLOAD,
  parseChapterMediaCompleteBody,
} from "./media/chapter-media-command-body";
import {
  CHAPTER_MEDIA_ACCESS_RESPONSE,
  CHAPTER_MEDIA_COMMAND_RESPONSE,
  CHAPTER_MEDIA_COMPLETE_BODY,
  CHAPTER_MEDIA_MANIFEST_RESPONSE,
} from "./media/chapter-media.openapi";
import { ChapterMediaService } from "./media/chapter-media.service";
import { readerRefFromSegments } from "@psico/types";
import type { ReaderChapterRef } from "@psico/types";

@ApiTags("Lector")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@Controller("lector")
@UseGuards(JwtAuthGuard)
export class LectorController {
  constructor(
    private readonly lector: LectorService,
    private readonly media: ChapterMediaService,
  ) {}

  // ─── GR-2 · chapter media ───────────────────────────────────────────────
  //
  // Declared BEFORE the `:bookId/:chapterOrder` routes: a literal segment must
  // win over a parameter, or `/lector/media/<key>/access` would be matched as
  // book `media`, chapter `<key>`.

  /**
   * What this chapter offers, and whether each format exists yet. Signs
   * nothing: a signed URL in a manifest is a bearer token in every page load.
   */
  @Get("media/:mediaKey/access")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getChapterMediaAccess",
    summary:
      "URL firmada de corta vida para un medio disponible y autorizado. " +
      "Nunca se devuelve en SSR ni se cachea.",
  })
  @ApiOkResponse({ schema: CHAPTER_MEDIA_ACCESS_RESPONSE })
  @ApiForbiddenResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  // The video provider is unreachable — infrastructure, never an editorial or
  // entitlement verdict.
  @ApiServiceUnavailableResponse({ type: ErrorEnvelopeDto })
  getMediaAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param("mediaKey") mediaKey: string,
  ): Promise<ChapterMediaAccessResponse> {
    return this.media.getAccess(user.userId, user.plan as Plan, mediaKey);
  }

  /**
   * The completion command. Takes no body: the media kind, its version, the
   * editorial unit and the idempotency key are all derived from `mediaKey` and
   * the authenticated actor.
   *
   * 201 the first time, 200 on any replay — reload, double `ended`, second
   * device, network retry.
   */
  @Post("media/:mediaKey/complete")
  @ApiOperation({
    operationId: "completeChapterMedia",
    summary:
      "Registra que el reproductor llegó a su final. No significa comprensión, " +
      "atención ni efecto emocional: la actividad va a Mi Evolución.",
  })
  @ApiBody({ required: false, schema: CHAPTER_MEDIA_COMPLETE_BODY })
  // Both statuses carry the SAME shape: 201 the first time, 200 on a replay.
  @ApiCreatedResponse({ schema: CHAPTER_MEDIA_COMMAND_RESPONSE })
  @ApiOkResponse({ schema: CHAPTER_MEDIA_COMMAND_RESPONSE })
  @ApiForbiddenResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  async completeMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param("mediaKey") mediaKey: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ChapterMediaCommandResponse> {
    // A field the client sends is a claim about state the server owns. Rejected
    // before anything runs, with the code alone — the value never comes back.
    if (!parseChapterMediaCompleteBody(body).ok) {
      throw new HttpException(
        { code: MEDIA_INVALID_PAYLOAD, message: MEDIA_INVALID_PAYLOAD },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.media.complete(
      user.userId,
      user.plan as Plan,
      mediaKey,
    );
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Get(":bookId/:chapterOrder/media")
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getChapterMediaManifest",
    summary:
      "Formatos del capítulo con su disponibilidad. Solo metadata: sin URLs.",
  })
  @ApiOkResponse({ schema: CHAPTER_MEDIA_MANIFEST_RESPONSE })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  getMediaManifest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ): Promise<ChapterMediaManifestResponse> {
    return this.media.getManifest(
      user.userId,
      user.plan as Plan,
      bookId,
      chapterOrder,
    );
  }

  /**
   * The chapter by its STABLE identity (Phase B.A).
   *
   * Declared BEFORE `:bookId/:chapterOrder` because Express matches in order and
   * `ref` would otherwise be read as a chapter number — the same reason
   * `media/:mediaKey/access` sits above the parameterised routes.
   *
   * `kind` is constrained to the two identities the reader actually has; this is
   * not a generic resource-by-id endpoint, and anything else is a 404 before a
   * single row is read.
   */
  /**
   * The stable identity of whatever is at a position — for redirecting.
   *
   * Deliberately not the reader: it returns an identity and nothing else, and
   * writes nothing. Declared above `:bookId/:chapterOrder` for the same
   * match-order reason as the ref route.
   */
  @Get(":bookId/locator/:chapterOrder")
  getLocator(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ): Promise<{ readerRef: ReaderChapterRef }> {
    return this.lector.getLocator(
      user.userId,
      user.plan as Plan,
      bookId,
      chapterOrder,
    );
  }

  @Get(":bookId/ref/:kind/:id")
  getChapterByRef(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("kind") kind: string,
    @Param("id") id: string,
  ): Promise<LectorChapterResponse> {
    const ref = readerRefFromSegments(kind, id);
    if (!ref) throw new NotFoundException("CHAPTER_NOT_FOUND");
    return this.lector.getChapterByRef(
      user.userId,
      user.plan as Plan,
      bookId,
      ref,
    );
  }

  /**
   * The chapter by POSITION — a locator, not an identity.
   *
   * Kept working for existing links. Clients navigate by the stable ref now.
   */
  @Get(":bookId/:chapterOrder")
  getChapter(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ): Promise<LectorChapterResponse> {
    return this.lector.getChapter(
      user.userId,
      user.plan as Plan,
      bookId,
      chapterOrder,
    );
  }

  @Get(":bookId/:chapterOrder/audio")
  getAudio(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
  ): Promise<LectorAudioResponse> {
    return this.lector.getAudio(user.plan as Plan, bookId, chapterOrder);
  }

  @Patch("session")
  @HttpCode(HttpStatus.OK)
  heartbeat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LectorSessionHeartbeatDto,
  ): Promise<LectorSessionHeartbeatResponse> {
    return this.lector.heartbeat(user.userId, dto);
  }

  @Post(":bookId/:chapterOrder/complete")
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookId") bookId: string,
    @Param("chapterOrder", ParseIntPipe) chapterOrder: number,
    @Body() dto: CompleteChapterDto,
  ): Promise<LectorCompleteResponse> {
    return this.lector.completeChapter(
      user.userId,
      bookId,
      chapterOrder,
      dto?.contentUnitId,
    );
  }
}
