import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ErrorEnvelopeDto } from "../shared/dto/error-envelope.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser, RequiredRole, RolesGuard } from "../shared";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PulsoService } from "./pulso.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthorReviewService } from "./author-review.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AdminUsersService } from "./admin-users.service";
import {
  ListEcoReportsQueryDto,
  MarkResolvedDto,
} from "./dto/list-reports.dto";
import { RejectAuthorRequestDto } from "./dto/reject-author-request.dto";
import { ListUsersQueryDto } from "./dto/list-users.dto";
import { ChangeRoleDto } from "./dto/change-role.dto";

/**
 * PulsoController — Sprint S42 (reports inbox) + S48 (overview) + S49 (resolution).
 *
 * Admin-only surface (RolesGuard + @RequiredRole("ADMIN")). PSYCHOLOGIST
 * is NOT enough — Pulso is operational back-office, not clinical access.
 */
@ApiTags("Pulso")
@ApiBadRequestResponse({ type: ErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ErrorEnvelopeDto })
@Controller("pulso")
@UseGuards(JwtAuthGuard, RolesGuard)
@RequiredRole("ADMIN")
export class PulsoController {
  constructor(
    private readonly pulso: PulsoService,
    private readonly authorReview: AuthorReviewService,
    private readonly adminUsers: AdminUsersService,
  ) {}

  @Get("reports/eco/summary")
  @ApiOperation({
    summary:
      "Counts of Eco message reports grouped by reason. Default scope: open reports only.",
  })
  getSummary(@Query("status") status?: "open" | "resolved" | "all") {
    return this.pulso.getEcoReportSummary(status ?? "open");
  }

  @Get("reports/eco")
  @ApiOperation({
    summary:
      "List Eco message reports, newest-first. Supports cursor pagination, reason filter, and status (open|resolved|all).",
  })
  list(@Query() query: ListEcoReportsQueryDto) {
    return this.pulso.listEcoReports({
      reason: query.reason,
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  // Sprint S49 — resolution flow ─────────────────────────────────────

  @Post("reports/eco/:id/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Mark an Eco report as triaged. Idempotent: re-resolving overwrites the timestamp and admin/note.",
  })
  resolve(
    @CurrentUser() admin: { userId: string },
    @Param("id") id: string,
    @Body() body: MarkResolvedDto,
  ) {
    return this.pulso.markResolved(id, admin.userId, body.note ?? null);
  }

  @Post("reports/eco/:id/unresolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reopen a previously-resolved report. Clears resolvedAt/By/Note.",
  })
  unresolve(@Param("id") id: string) {
    return this.pulso.markUnresolved(id);
  }

  // ── Sprint S48 — overview KPIs ──────────────────────────────────────

  @Get("overview")
  @ApiOperation({
    summary:
      "Platform overview — KPIs aggregated across users, engagement, content, and business. Cached 5min.",
  })
  getOverview() {
    return this.pulso.getOverview();
  }

  // ── Sprint S51 — cohort retention triangle ──────────────────────────

  @Get("cohorts")
  @ApiOperation({
    summary:
      "Cohort retention triangle. Materialised by the Monday 03:00 UTC cron; cached 5min.",
  })
  getCohorts() {
    return this.pulso.getCohortRetention();
  }

  // ── Sprint S71.B — Author publication review ────────────────────────

  @Get("author-requests")
  @ApiOperation({
    summary: "List author publication requests. Default scope: PENDING only.",
  })
  listAuthorRequests(
    @Query("status") status?: "PENDING" | "ALL",
    @Query("limit") limit?: string,
  ) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.authorReview.listRequests(status ?? "PENDING", lim);
  }

  @Post("author-requests/:id/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Approve a pending author publication request. Triggers copy-on-publish AuthorBook → Book + Chapter + ChapterBlock.",
  })
  approveAuthorRequest(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.authorReview.approve(id, user.userId);
  }

  @Post("author-requests/:id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Reject a pending author publication request with optional editorial feedback. Sets AuthorBook back to DRAFT.",
  })
  rejectAuthorRequest(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: RejectAuthorRequestDto,
  ) {
    return this.authorReview.reject(id, user.userId, dto.feedback);
  }

  // ── Sprint S72 — Admin users (search + role promotion) ──────────────

  @Get("users")
  @ApiOperation({
    summary: "Search users by email/name + optional role filter.",
  })
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminUsers.listUsers(query);
  }

  @Get("users/:id/role-changes")
  @ApiOperation({ summary: "Last 20 role changes for a user (audit trail)." })
  getRoleChanges(@Param("id") id: string) {
    return this.adminUsers.getRecentRoleChanges(id);
  }

  @Post("users/:id/role")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Change a user's role. Logged in RoleChangeLog for audit.",
  })
  changeRole(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangeRoleDto,
  ) {
    return this.adminUsers.changeRole(id, user.userId, dto.role, dto.reason);
  }
}
