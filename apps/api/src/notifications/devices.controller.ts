import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../prisma";
import { RegisterDeviceDto } from "./dto/register-device.dto";

/**
 * Device-token CRUD for push notifications — Sprint S43.
 *
 * Idempotency: registering the same `token` twice is a no-op (upsert on
 * the unique `token` index). We also bump `lastSeenAt` on every register
 * so the cleanup job can prune stale tokens.
 */
@ApiTags("Notifications")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@Controller("notifications/devices")
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiOperation({
    summary:
      "Register an Expo push token for the current user. Idempotent on (token).",
  })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @CurrentUser() user: { userId: string },
    @Body() dto: RegisterDeviceDto,
  ): Promise<{ id: string }> {
    const row = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: {
        userId: user.userId,
        platform: dto.platform,
        token: dto.token,
        deviceLabel: dto.deviceLabel,
        lastSeenAt: new Date(),
      },
      update: {
        // If the same token is re-registered by a DIFFERENT user (account
        // switch on the same device), reassign it. Mobile expo tokens can
        // be reused across accounts on one device.
        userId: user.userId,
        platform: dto.platform,
        deviceLabel: dto.deviceLabel,
        lastSeenAt: new Date(),
      },
    });
    return { id: row.id };
  }

  @Delete(":id")
  @ApiOperation({ summary: "Revoke a push token. No-op if id doesn't exist." })
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
  ): Promise<void> {
    await this.prisma.deviceToken.deleteMany({
      where: { id, userId: user.userId },
    });
  }
}
