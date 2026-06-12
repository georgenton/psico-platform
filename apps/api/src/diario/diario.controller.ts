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
import { DiarioService } from "./diario.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateDiaryEntryDto } from "./dto/create-entry.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateDiaryEntryDto } from "./dto/update-entry.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ListDiaryEntriesQueryDto } from "./dto/list-entries-query.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ShareDiaryEntryDto } from "./dto/share-entry.dto";

/**
 * DiarioController — Sprint S6.
 *
 * All endpoints require auth. Bodies that carry encrypted material run
 * through validators in dto/ciphertext-validators.ts before reaching the
 * service. The controller is intentionally thin so the privacy guarantees
 * are easy to audit — every endpoint can be read top-to-bottom in under
 * 10 seconds.
 */
@ApiTags("Diario")
@ApiBearerAuth("bearer")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@Controller("diario")
@UseGuards(JwtAuthGuard)
export class DiarioController {
  constructor(private readonly diarioService: DiarioService) {}

  @Get("entries")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDiaryEntriesQueryDto,
  ) {
    return this.diarioService.list(user.userId, query);
  }

  @Get("prompt-of-the-day")
  getPromptOfTheDay() {
    return this.diarioService.getPromptOfTheDay();
  }

  // Declared BEFORE `entries/:id` so NestJS' route matcher resolves
  // `/diario/entries/raw-ciphers` to this handler instead of treating
  // "raw-ciphers" as an entry ID.
  @Get("entries/raw-ciphers")
  listRawCiphers(@CurrentUser() user: AuthenticatedUser) {
    return this.diarioService.listRawCiphers(user.userId);
  }

  @Get("entries/:id")
  getDetail(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.diarioService.getDetail(user.userId, id);
  }

  @Post("entries")
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDiaryEntryDto,
  ) {
    return this.diarioService.create(user.userId, dto);
  }

  @Patch("entries/:id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateDiaryEntryDto,
  ) {
    return this.diarioService.update(user.userId, id, dto);
  }

  @Delete("entries/:id")
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.diarioService.remove(user.userId, id);
  }

  @Post("entries/:id/share")
  @HttpCode(HttpStatus.OK)
  share(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ShareDiaryEntryDto,
  ) {
    return this.diarioService.share(user.userId, id, dto);
  }
}
