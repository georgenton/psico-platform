import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth";
import { CurrentUser } from "../shared";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { ActivityService } from "./activity.service";
import type { ActivityFeedResponse } from "./activity.service";

@ApiTags("Activity")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("activity")
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Get()
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Items to return. 1–20. Default 5.",
  })
  feed(
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limit?: string,
  ): Promise<ActivityFeedResponse> {
    const parsed = limit ? Number.parseInt(limit, 10) : undefined;
    return this.service.feed(user.userId, parsed);
  }
}
