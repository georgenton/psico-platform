import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../shared";
import { LiveActivitiesService } from "./live-activities.service";
import { RegisterLiveActivityDto } from "./dto/register-live-activity.dto";

/**
 * Live Activities controller — Sprint E.5.
 *
 * Routes mirror the design spec in `docs/design/handoff/14-dynamic-island.md`:
 *   POST   /api/push/live-activity         — register / refresh per-activity APNs token
 *   DELETE /api/push/live-activity/:id     — dismiss
 *   GET    /api/push/live-activity/active  — list active activities for the current user
 *
 * Privacy: this controller never accepts or returns plaintext from Diario
 * or Eco. Activity IDs are opaque references to existing rows (EcoThread,
 * BookChapter, TherapySession) that the mobile widget renders locally.
 */
@ApiTags("LiveActivities")
@Controller("push/live-activity")
@UseGuards(JwtAuthGuard)
export class LiveActivitiesController {
  constructor(private readonly service: LiveActivitiesService) {}

  @Post()
  @ApiOperation({
    summary:
      "Register a per-activity APNs push token from iOS ActivityKit. Idempotent on (userId, activityId).",
  })
  @HttpCode(HttpStatus.CREATED)
  async register(
    @CurrentUser() user: { userId: string },
    @Body() dto: RegisterLiveActivityDto,
  ): Promise<{ id: string; isProviderConfigured: boolean }> {
    return this.service.register(user.userId, dto);
  }

  @Get("active")
  @ApiOperation({ summary: "List currently-active Live Activities." })
  async listActive(@CurrentUser() user: { userId: string }) {
    return { items: await this.service.listActive(user.userId) };
  }

  @Delete(":activityId")
  @ApiOperation({
    summary:
      "Mark a Live Activity as dismissed. Sends APNs 'end' event if configured.",
  })
  @HttpCode(HttpStatus.OK)
  async dismiss(
    @CurrentUser() user: { userId: string },
    @Param("activityId") activityId: string,
  ): Promise<{ ok: true }> {
    return this.service.dismiss(user.userId, activityId);
  }
}
