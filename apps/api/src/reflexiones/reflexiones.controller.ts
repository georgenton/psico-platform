import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import type { AuthenticatedUser } from "../auth";
import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ReflexionesService } from "./reflexiones.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateDiaryEntryDto } from "./dto/create-entry.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateDiaryEntryDto } from "./dto/update-entry.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ListDiaryEntriesQueryDto } from "./dto/list-entries-query.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ShareDiaryEntryDto } from "./dto/share-entry.dto";

/**
 * ReflexionesController — Sprint S6 + Sprint B1 redesign rename.
 *
 * Hard renamed from `DiarioController` (`/diario`) to `ReflexionesController`
 * (`/reflexiones`) in Sprint B1. The DTO + service class names internally keep
 * the `Diary*` prefix because the Prisma model is still `DiaryEntry` — only
 * the controller path and module name flip, so the privacy guarantees and the
 * cipher pipeline stay byte-identical.
 *
 * All endpoints require auth. Bodies that carry encrypted material run
 * through validators in dto/ciphertext-validators.ts before reaching the
 * service. The controller is intentionally thin so the privacy guarantees
 * are easy to audit — every endpoint can be read top-to-bottom in under
 * 10 seconds.
 */
@ApiTags("Reflexiones")
@ApiBearerAuth("bearer")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@Controller("reflexiones")
@UseGuards(JwtAuthGuard)
export class ReflexionesController {
  constructor(private readonly reflexionesService: ReflexionesService) {}

  @Get("entries")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDiaryEntriesQueryDto,
  ) {
    return this.reflexionesService.list(user.userId, query);
  }

  @Get("prompt-of-the-day")
  getPromptOfTheDay() {
    return this.reflexionesService.getPromptOfTheDay();
  }

  // Declared BEFORE `entries/:id` so NestJS' route matcher resolves
  // `/reflexiones/entries/raw-ciphers` to this handler instead of treating
  // "raw-ciphers" as an entry ID.
  @Get("entries/raw-ciphers")
  listRawCiphers(@CurrentUser() user: AuthenticatedUser) {
    return this.reflexionesService.listRawCiphers(user.userId);
  }

  @Get("entries/:id")
  getDetail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reflexionesService.getDetail(user.userId, id);
  }

  @Post("entries")
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDiaryEntryDto,
  ) {
    return this.reflexionesService.create(user.userId, dto);
  }

  @Patch("entries/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateDiaryEntryDto,
  ) {
    return this.reflexionesService.update(user.userId, id, dto);
  }

  @Delete("entries/:id")
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.reflexionesService.remove(user.userId, id);
  }

  @Post("entries/:id/share")
  @HttpCode(HttpStatus.OK)
  share(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ShareDiaryEntryDto,
  ) {
    return this.reflexionesService.share(user.userId, id, dto);
  }
}
