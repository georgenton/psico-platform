import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import {
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../../shared/dto/error-envelope.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CurrentUser } from "../../shared/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/strategies/jwt.strategy";
import { JwtAuthGuard } from "../../auth";
import type { ReadUnit } from "./content-read";
import type { BookManifest } from "./content-manifest";
import type { ContentUnitMarks } from "./content-marks";
import { ContentReadService } from "./content-read.service";
import { ContentAccessService } from "../access/content-access.service";
import { ContentUnitReadDto } from "./dto/content-unit-read.dto";
import { BookManifestDto } from "./dto/book-manifest.dto";
import { ContentUnitMarksDto } from "./dto/content-unit-marks.dto";

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
@ApiForbiddenResponse({ type: ErrorEnvelopeDto }) // PRO_REQUIRED (CC-6E)
@Controller("content")
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(
    private readonly content: ContentReadService,
    private readonly access: ContentAccessService,
  ) {}

  // CC-6E — the same FREE/PRO entitlement as /api/lector. Knowing an editionKey +
  // unitKey grants nothing: the keys are resolved to their book/chapter and the
  // shared policy decides. A FREE user on a PRO chapter gets 403 PRO_REQUIRED.
  @Get("editions/:editionKey/units/:unitKey")
  @ApiOkResponse({ type: ContentUnitReadDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto })
  // CONTENT_CORE_INTEGRITY_ERROR — core present but malformed (never masked).
  @ApiInternalServerErrorResponse({ type: ErrorEnvelopeDto })
  async readUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("editionKey") editionKey: string,
    @Param("unitKey") unitKey: string,
  ): Promise<ReadUnit> {
    await this.access.assertCanReadUnit({
      userId: user.userId,
      userPlan: user.plan,
      editionKey,
      unitKey,
    });
    return this.content.readUnit(editionKey, unitKey);
  }

  // CC-6C — the current user's marks for a unit, keyed by the stable blockKey.
  // CC-6E — reading marks requires access to the unit; a blockKey is not a key
  // to the content.
  @Get("editions/:editionKey/units/:unitKey/marks")
  @ApiOkResponse({ type: ContentUnitMarksDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto }) // EDITION_NOT_FOUND / UNIT_NOT_FOUND
  async readUnitMarks(
    @CurrentUser() user: AuthenticatedUser,
    @Param("editionKey") editionKey: string,
    @Param("unitKey") unitKey: string,
  ): Promise<ContentUnitMarks> {
    await this.access.assertCanReadUnit({
      userId: user.userId,
      userPlan: user.plan,
      editionKey,
      unitKey,
    });
    return this.content.readUnitMarks(user.userId, editionKey, unitKey);
  }

  // CC-6A.1 — discovery: bookSlug → editionKey + ordered units. CC-6E — the
  // manifest is product-visible metadata (chapter 1 is a free preview), but its
  // unitKeys can never bypass the read endpoint above, which re-checks per unit.
  @Get("books/:bookSlug/manifest")
  @ApiOkResponse({ type: BookManifestDto })
  @ApiNotFoundResponse({ type: ErrorEnvelopeDto }) // BOOK_NOT_FOUND
  @ApiInternalServerErrorResponse({ type: ErrorEnvelopeDto }) // CONTENT_CORE_INTEGRITY_ERROR
  async readManifest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("bookSlug") bookSlug: string,
  ): Promise<BookManifest> {
    await this.access.assertCanSeeBook({
      userId: user.userId,
      userPlan: user.plan,
      bookSlug,
    });
    return this.content.readManifest(bookSlug);
  }
}
