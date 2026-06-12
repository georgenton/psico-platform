import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UsersService } from "./users.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateProfileDto } from "./dto/update-profile.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateTimezoneDto } from "./dto/update-timezone.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdatePreferencesDto } from "./dto/update-preferences.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateReaderPreferencesDto } from "./dto/update-reader-preferences.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateNotificationsDto } from "./dto/update-notifications.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdatePrivacyDto } from "./dto/update-privacy.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UpdateMoodDto } from "./dto/update-mood.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EmailChangeRequestDto } from "./dto/email-change-request.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PasswordChangeDto } from "./dto/password-change.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PasswordChangeWithRekeyDto } from "./dto/password-change-with-rekey.dto";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DeleteRequestDto } from "./dto/delete-request.dto";

@ApiTags("Users")
@ApiBearerAuth("bearer")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@Controller("user")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMe(user.userId);
  }

  @Patch("profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  // Sprint S53 — auto-detected by the client right after login.
  @Patch("timezone")
  updateTimezone(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTimezoneDto,
  ) {
    return this.usersService.updateTimezone(user.userId, dto);
  }

  @Post("avatar")
  @UseInterceptors(FileInterceptor("file"))
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(user.userId, file);
  }

  @Patch("preferences")
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.userId, dto);
  }

  @Patch("reader-preferences")
  updateReaderPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateReaderPreferencesDto,
  ) {
    return this.usersService.updateReaderPreferences(user.userId, dto);
  }

  @Patch("notifications")
  updateNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationsDto,
  ) {
    return this.usersService.updateNotifications(user.userId, dto);
  }

  @Patch("privacy")
  updatePrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePrivacyDto,
  ) {
    return this.usersService.updatePrivacy(user.userId, dto);
  }

  @Patch("mood")
  updateMood(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMoodDto,
  ) {
    return this.usersService.updateMood(user.userId, dto);
  }

  @Post("email-change-request")
  @HttpCode(HttpStatus.OK)
  requestEmailChange(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EmailChangeRequestDto,
  ) {
    return this.usersService.requestEmailChange(user.userId, dto);
  }

  @Post("password-change")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PasswordChangeDto,
  ) {
    await this.usersService.changePassword(user.userId, dto);
  }

  // Sprint seed-and-password-rekey. The standard password-change endpoint
  // above is preserved for OAuth-or-legacy callers that don't have E2E
  // diary data. This new variant accepts the re-encrypted entries the
  // client produced after deriving the new master key, and rotates
  // everything atomically.
  @Post("password-change-with-rekey")
  @HttpCode(HttpStatus.OK)
  async changePasswordWithRekey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PasswordChangeWithRekeyDto,
  ) {
    return this.usersService.changePasswordWithRekey(user.userId, dto);
  }

  @Post("crypto-seed-acknowledged")
  @HttpCode(HttpStatus.OK)
  acknowledgeCryptoSeed(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.acknowledgeCryptoSeed(user.userId);
  }

  @Post("data-export")
  @HttpCode(HttpStatus.ACCEPTED)
  requestDataExport(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.requestDataExport(user.userId);
  }

  @Post("delete-request")
  @HttpCode(HttpStatus.ACCEPTED)
  requestDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteRequestDto,
  ) {
    return this.usersService.requestDelete(user.userId, dto);
  }
}
