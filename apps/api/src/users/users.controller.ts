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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth";
import type { AuthenticatedUser } from "../auth";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { UsersService } from "./users.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import type { UpdatePreferencesDto } from "./dto/update-preferences.dto";
import type { UpdateReaderPreferencesDto } from "./dto/update-reader-preferences.dto";
import type { UpdateNotificationsDto } from "./dto/update-notifications.dto";
import type { UpdatePrivacyDto } from "./dto/update-privacy.dto";
import type { UpdateMoodDto } from "./dto/update-mood.dto";
import type { EmailChangeRequestDto } from "./dto/email-change-request.dto";
import type { PasswordChangeDto } from "./dto/password-change.dto";
import type { DeleteRequestDto } from "./dto/delete-request.dto";

@ApiTags("Users")
@ApiBearerAuth("bearer")
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
