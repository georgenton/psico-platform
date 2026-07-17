import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import {
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../../shared/dto/error-envelope.dto";
import { JwtAuthGuard } from "../../auth";
import type { ReadUnit } from "./content-read";
import { ContentReadService } from "./content-read.service";
import { ContentUnitReadDto } from "./dto/content-unit-read.dto";

/**
 * Content Core — CC-6A parallel read endpoint.
 *
 * `GET /api/content/editions/:editionKey/units/:unitKey` serves a single content
 * unit from the published Content Core revision, falling back to the legacy tables
 * per whole unit. This runs ALONGSIDE `/api/lector/*`, which is untouched; clients
 * migrate in CC-6B.
 */
@ApiTags("Content Core")
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@Controller("content")
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly content: ContentReadService) {}

  @Get("editions/:editionKey/units/:unitKey")
  @ApiOkResponse({ type: ContentUnitReadDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  // CONTENT_CORE_INTEGRITY_ERROR — core present but malformed (never masked).
  @ApiInternalServerErrorResponse({ type: ErrorEnvelopeDto })
  readUnit(
    @Param("editionKey") editionKey: string,
    @Param("unitKey") unitKey: string,
  ): Promise<ReadUnit> {
    return this.content.readUnit(editionKey, unitKey);
  }
}
