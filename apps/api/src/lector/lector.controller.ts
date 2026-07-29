import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import type {
  ChapterMediaAccessResponse,
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
import { LectorService } from "./lector.service";
import { ChapterMediaService } from "./media/chapter-media.service";

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
  @ApiForbiddenResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
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
  @ApiForbiddenResponse({ type: ErrorEnvelopeDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  async completeMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param("mediaKey") mediaKey: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ created: boolean; replayed: boolean }> {
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
  ): Promise<LectorCompleteResponse> {
    return this.lector.completeChapter(user.userId, bookId, chapterOrder);
  }
}
