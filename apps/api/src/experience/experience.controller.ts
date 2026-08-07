/**
 * GR-6 — the one read a browser makes before it can render a journey.
 *
 * This route is what stops the web from compiling a catalog into its bundle.
 * The definitions live on the server, get validated on the server, and travel
 * over the wire; the client renders what it is handed. That is the whole
 * reason for the ADR 0021 repository boundary, and it is what will let a CMS
 * publish a change without a deploy.
 *
 * It is a READ, and the strongest thing said about it is what it does not do:
 * it creates no session, no receipt, no learning event and no row of any kind.
 * Opening a chapter must be free.
 */

import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { ChapterExperienceDiscoveryResponse } from "@psico/types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import {
  normalizeBookSlug,
  normalizeChapterOrder,
} from "../guide/guide-discovery-catalog";
import { ExperienceDiscoveryService } from "./experience-discovery.service";
import { EXPERIENCE_DISCOVERY_RESPONSE } from "./dto/experience.openapi";

/** The one code a malformed reading context reports. */
export const EXPERIENCE_DISCOVERY_PARAMS_INVALID =
  "EXPERIENCE_DISCOVERY_PARAMS_INVALID";

@ApiTags("Experience")
@ApiBearerAuth("bearer")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@UseGuards(JwtAuthGuard)
@Controller("experiences")
export class ExperienceController {
  constructor(private readonly discovery: ExperienceDiscoveryService) {}

  @Get("discovery/:bookSlug/:chapterOrder")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  // A journey the server may have republished must not be served from a cache
  // the reader cannot see. That is the point of moving definitions here.
  @Header("Cache-Control", "private, no-store")
  @ApiOperation({
    operationId: "getChapterExperiences",
    summary:
      "Las experiencias PUBLICADAS de un capítulo, en versiones exactas. " +
      "Cero a varias; no crea nada.",
  })
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
  @ApiOkResponse({ schema: EXPERIENCE_DISCOVERY_RESPONSE })
  async getChapterExperiences(
    @Param("bookSlug") rawBookSlug: string,
    @Param("chapterOrder") rawChapterOrder: string,
  ): Promise<ChapterExperienceDiscoveryResponse> {
    // Same grammar the Guide's discovery enforces, and the same distinction:
    // "chapter zero" is a bad request, while a canonical chapter with no
    // journey is a fine request with an empty answer.
    const bookSlug = normalizeBookSlug(rawBookSlug);
    const chapterOrder = normalizeChapterOrder(rawChapterOrder);
    if (bookSlug === null || chapterOrder === null) {
      // The rejected segment is never echoed: a path parameter is untrusted
      // input, and reflecting it is how it ends up in an error surface.
      throw new BadRequestException({
        code: EXPERIENCE_DISCOVERY_PARAMS_INVALID,
        message: EXPERIENCE_DISCOVERY_PARAMS_INVALID,
      });
    }
    const items = await this.discovery.listPublishedForChapter({
      bookSlug,
      chapterOrder,
    });
    return { items };
  }
}
